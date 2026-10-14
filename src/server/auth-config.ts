import "server-only";
/**
 * ค่าตั้งของระบบยืนยันตัวตน (feat-031) — แยกจาก auth.ts เพื่อให้ Route Handler / เทสต์อ่าน session ได้โดยไม่โหลด NextAuth ทั้งตัว
 */
import { z } from "zod";
import type { ResolveIdentityInput } from "./account-repository";

/** AUTH_SECRET จำเป็นใน production; dev/test ใช้ค่าคงที่เพื่อให้เริ่มงานได้ทันที (ห้ามใช้จริง) */
export function authSecret(): string | undefined {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  return process.env.NODE_ENV === "production" ? undefined : "wang-raan-dev-secret-do-not-use-in-production";
}

/** เปิดล็อกอิน Google เมื่อตั้ง AUTH_GOOGLE_ID + AUTH_GOOGLE_SECRET (หน้า /login ซ่อนปุ่มถ้ายังไม่ตั้ง) */
export function googleLoginEnabled(): boolean {
  return Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
}

/** Session cookie อายุ 30 วัน */
export const SESSION_MAX_AGE = 30 * 24 * 60 * 60;

export interface SessionUser {
  id: string;
  name: string | null;
}

/** id ผู้ใช้ทุกแบบที่ Backend ออก — `guest-` คือ Guest; ที่เหลือ (usr-, <provider>-… ของผู้ใช้เดิม) คือบัญชีจริง */
export const isGuestId = (userId: string) => userId.startsWith("guest-");

// ค่าจาก Identity Provider ที่ไม่ผ่านสัญญา (เช่น email ผิดรูปแบบ) → ส่ง null แทนที่จะทำให้ล็อกอินล้ม
const Email = z.string().email().max(254);
const Image = z.string().url().max(2048).regex(/^https?:\/\//i);
const OAUTH_PROVIDERS = ["google", "line", "github"] as const;
type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

/**
 * ตัวตน OAuth สำหรับ `resolve` (สัญญา ResolveOAuthRequest) — ไม่ใช่จังหวะล็อกอิน OAuth → null
 * - providerAccountId จาก Auth.js (`account.providerAccountId`) คงที่ต่อบัญชีของ provider
 * - emailVerified เชื่อเฉพาะ Google (`email_verified` ใน id token) — provider อื่นส่ง false เสมอ
 */
export function oauthIdentity(
  account: { type?: string; provider?: string; providerAccountId?: string } | null | undefined,
  profile: { email?: unknown; email_verified?: unknown } | null | undefined,
  user: { name?: string | null; email?: string | null; image?: string | null } | null | undefined,
): ResolveIdentityInput | null {
  if (!account || (account.type !== "oauth" && account.type !== "oidc")) return null;
  const provider = account.provider as OAuthProvider;
  if (!OAUTH_PROVIDERS.includes(provider) || !account.providerAccountId) return null;
  const rawEmail = typeof profile?.email === "string" ? profile.email : user?.email;
  const email = Email.safeParse(rawEmail?.trim().toLowerCase()).success ? rawEmail!.trim().toLowerCase() : null;
  return {
    provider,
    providerAccountId: account.providerAccountId.slice(0, 255),
    email,
    emailVerified: provider === "google" && email !== null && profile?.email_verified === true,
    name: user?.name?.trim().slice(0, 200) || null,
    image: Image.safeParse(user?.image).success ? user!.image! : null,
  };
}
