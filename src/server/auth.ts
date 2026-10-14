import "server-only";
/**
 * NextAuth.js (Auth.js v5) — architecture.md §4.1 (feat-031)
 *
 * - Session แบบ JWT เข้ารหัสใน Cookie HttpOnly + SameSite=Lax (ค่าเริ่มต้นของ Auth.js, Secure เมื่อเป็น https)
 * - Provider "guest": V1 ยังไม่มี Identity Provider — สร้างบัญชีชั่วคราวด้วย id สุ่มฝั่ง server
 *   (ผู้ใช้กำหนด id เองไม่ได้ จึงสวมรอยเป็นคนอื่นไม่ได้)
 * - GitHub: เปิดอัตโนมัติเมื่อมี AUTH_GITHUB_ID / AUTH_GITHUB_SECRET
 * - ทุกครั้งที่ล็อกอิน: ซิงก์โปรไฟล์ไป Backend และย้ายผังจาก session Guest เดิม (account-sync.ts)
 */
import NextAuth from "next-auth";
import { getToken } from "next-auth/jwt";
import type { Provider } from "next-auth/providers";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import { headers } from "next/headers";
import { accountRepository } from "./account-repository";
import { syncSignIn } from "./account-sync";
import { SESSION_MAX_AGE, authSecret, subjectFor } from "./auth-config";
import { backendClient, readBody, send } from "./backend";

declare module "next-auth" {
  interface Session {
    user: { id: string; name?: string | null; email?: string | null; image?: string | null };
  }
}

const providers: Provider[] = [
  Credentials({
    id: "guest",
    name: "ผู้ใช้ทั่วไป",
    credentials: {},
    authorize: async () => ({ id: `guest-${globalThis.crypto.randomUUID()}`, name: "ผู้ใช้ทั่วไป" }),
  }),
  Credentials({
    id: "email-otp",
    name: "อีเมล",
    credentials: {
      email: { label: "อีเมล", type: "email" },
      code: { label: "รหัส OTP", type: "text" },
    },
    authorize: async (credentials) => {
      if (!credentials?.email || !credentials?.code) return null;
      const email = String(credentials.email).trim().toLowerCase();
      const code = String(credentials.code).trim();
      if (!/^[0-9]{6}$/.test(code)) return null;
      try {
        const res = await send(
          backendClient,
          "anonymous",
          "/v1/auth/otp/verify",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email, code }),
          },
          [400, 401, 429],
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
          const errCode = body?.error?.code ?? "INVALID_OTP";
          throw new Error(errCode);
        }
        const data = await readBody<{ user: { id: string; name?: string | null; email?: string | null; image?: string | null } }>(res);
        return data.user;
      } catch (error) {
        if (error instanceof Error && (error.message.startsWith("OTP_") || error.message === "RATE_LIMITED")) {
          throw error;
        }
        return null;
      }
    },
  }),
];
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
  callbacks: {
    async jwt({ token, user, account, trigger }) {
      const subject = subjectFor(user, account);
      if (subject) token.sub = subject;
      if (trigger === "signIn" && subject) {
        await syncSignIn(accountRepository, {
          userId: subject,
          profile: { name: user?.name, email: user?.email, image: user?.image },
          previousUserId: await previousSubject(),
        });
      }
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
});
