import "server-only";
/**
 * NextAuth.js (Auth.js v5) — architecture.md §4.1 (feat-031)
 *
 * - Session แบบ JWT เข้ารหัสใน Cookie HttpOnly + SameSite=Lax (ค่าเริ่มต้นของ Auth.js, Secure เมื่อเป็น https)
 * - Provider "guest": V1 ยังไม่มี Identity Provider — สร้างบัญชีชั่วคราวด้วย id สุ่มฝั่ง server
 *   (ผู้ใช้กำหนด id เองไม่ได้ จึงสวมรอยเป็นคนอื่นไม่ได้)
 * - GitHub: เปิดอัตโนมัติเมื่อมี AUTH_GITHUB_ID / AUTH_GITHUB_SECRET
 */
import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import { SESSION_MAX_AGE, authSecret } from "./auth-config";

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
];
if (process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET) providers.push(GitHub);

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: authSecret(),
  trustHost: true,
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE },
  providers,
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
});
