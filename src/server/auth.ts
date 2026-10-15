import "server-only";
/**
 * NextAuth.js (Auth.js v5) — architecture.md §4.1 (feat-031, feat-061)
 *
 * - Session แบบ JWT เข้ารหัสใน Cookie HttpOnly + SameSite=Lax (ค่าเริ่มต้นของ Auth.js, Secure เมื่อเป็น https)
 * - **id ผู้ใช้ (`sub`) มาจาก Backend เสมอ** — BFF ไม่สร้าง id เอง (สัญญา v1.3.0):
 *   - "guest": `resolve { provider: "guest" }` → `guest-<uuid>` (ผู้ใช้กำหนด id เองไม่ได้ จึงสวมรอยไม่ได้)
 *   - "email-otp": `otp/verify` → บัญชีของอีเมลนั้น (ผูกกับบัญชี Google ที่อีเมลเดียวกันได้)
 *   - Google / GitHub (เปิดเมื่อมี AUTH_GOOGLE_* / AUTH_GITHUB_*): jwt callback เรียก `resolve` ด้วย providerAccountId
 * - ทุกครั้งที่ล็อกอิน: ย้ายผังจาก session Guest เดิมเข้าบัญชี (account-sync.ts)
 */
import NextAuth, { CredentialsSignin } from "next-auth";
import { getToken } from "next-auth/jwt";
import type { Provider } from "next-auth/providers";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import { headers } from "next/headers";
import { OtpError, accountRepository } from "./account-repository";
import { syncSignIn } from "./account-sync";
import { SESSION_MAX_AGE, authSecret, googleLoginEnabled, oauthIdentity } from "./auth-config";
import { BackendError } from "./backend";
import { clientIp, clientIpFrom } from "./rate-limit";

declare module "next-auth" {
  interface Session {
    user: { id: string; name?: string | null; email?: string | null; image?: string | null };
  }
}

/** error ที่ส่งถึงหน้า /login ผ่าน `signIn(...).code` — ห้ามบอกว่าอีเมลมีบัญชีหรือไม่ */
function signInError(code: string): CredentialsSignin {
  const error = new CredentialsSignin();
  error.code = code;
  return error;
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const providers: Provider[] = [
  Credentials({
    id: "guest",
    name: "ผู้ใช้ทั่วไป",
    credentials: {},
    authorize: async (_credentials, request) => {
      try {
        const { user } = await accountRepository.resolve({ provider: "guest" }, clientIp(request));
        return { id: user.id, name: user.name ?? "ผู้ใช้ทั่วไป" };
      } catch (error) {
        if (error instanceof BackendError && error.status === 429) throw signInError("RATE_LIMITED");
        throw error;
      }
    },
  }),
  Credentials({
    id: "email-otp",
    name: "อีเมล",
    credentials: {
      email: { label: "อีเมล", type: "email" },
      code: { label: "รหัส OTP", type: "text" },
    },
    authorize: async (credentials, request) => {
      const email = String(credentials?.email ?? "").trim().toLowerCase();
      const code = String(credentials?.code ?? "").trim();
      if (!EMAIL.test(email) || email.length > 254 || !/^[0-9]{6}$/.test(code)) throw signInError("OTP_INVALID");
      try {
        const { user } = await accountRepository.verifyOtp(email, code, clientIp(request));
        return { id: user.id, name: user.name, email: user.email, image: user.image };
      } catch (error) {
        if (error instanceof OtpError) throw signInError(error.code);
        throw error;
      }
    },
  }),
];
// prompt=select_account: ให้เลือกบัญชีทุกครั้ง (เครื่องที่ล็อกอิน Google หลายบัญชีไม่เข้าผิดบัญชีเงียบ ๆ)
// client id/secret อ่านจาก AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET อัตโนมัติ (บน Workers ตั้งด้วย `wrangler secret put`)
if (googleLoginEnabled()) providers.push(Google({ authorization: { params: { prompt: "select_account" } } }));
if (process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET) providers.push(GitHub);

/** `sub` ของ session ที่ถืออยู่ก่อนล็อกอินครั้งนี้ (cookie เดิมยังอยู่ในคำขอ callback) */
async function previousSubject(): Promise<string | null> {
  const secret = authSecret();
  if (!secret) return null;
  const req = { headers: await headers() };
  for (const secureCookie of [true, false]) {
    const token = await getToken({ req, secret, secureCookie }).catch(() => null);
    if (token?.sub) return token.sub;
  }
  return null;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: authSecret(),
  trustHost: true,
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE },
  providers,
  // OAuth ผิดพลาด/ถูกยกเลิก → กลับมาที่ /login?error=… (หน้า login แสดงข้อความภาษาไทย) แทนหน้า error ภาษาอังกฤษของ Auth.js
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    async jwt({ token, user, account, profile, trigger }) {
      if (trigger !== "signIn") return token;
      // OAuth: Auth.js ไม่มี adapter จึงสุ่ม user.id ใหม่ทุกครั้ง → ขอ id จริงจาก Backend
      // Credentials: authorize ได้ id จาก Backend มาแล้ว
      const identity = oauthIdentity(account, profile, user);
      const subject = identity
        ? (await accountRepository.resolve(identity, clientIpFrom(await headers()))).user.id
        : user?.id;
      if (!subject) return token;
      token.sub = subject;
      await syncSignIn(accountRepository, { userId: subject, previousUserId: await previousSubject() });
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
});
