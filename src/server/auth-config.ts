import "server-only";
/**
 * ค่าตั้งของระบบยืนยันตัวตน (feat-031) — แยกจาก auth.ts เพื่อให้ Route Handler / เทสต์อ่าน session ได้โดยไม่โหลด NextAuth ทั้งตัว
 */

/** AUTH_SECRET จำเป็นใน production; dev/test ใช้ค่าคงที่เพื่อให้เริ่มงานได้ทันที (ห้ามใช้จริง) */
export function authSecret(): string | undefined {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  return process.env.NODE_ENV === "production" ? undefined : "wang-raan-dev-secret-do-not-use-in-production";
}

/** Session cookie อายุ 30 วัน */
export const SESSION_MAX_AGE = 30 * 24 * 60 * 60;

export interface SessionUser {
  id: string;
  name: string | null;
}

/**
 * id ผู้ใช้ที่ใช้เป็นเจ้าของผัง (JWT `sub`)
 * - OAuth (GitHub): Auth.js ที่ไม่มี adapter สุ่ม `user.id` ใหม่ทุกครั้งที่ล็อกอิน → ใช้ provider + providerAccountId ที่คงที่แทน
 * - Guest: ใช้ id ที่ authorize สร้างไว้
 * คืน null เมื่อไม่ใช่จังหวะล็อกอิน (เรียก jwt callback ซ้ำตอนอ่าน session)
 */
export function subjectFor(
  user: { id?: string | null } | null | undefined,
  account: { type?: string; provider?: string; providerAccountId?: string } | null | undefined,
): string | null {
  if (account && (account.type === "oauth" || account.type === "oidc") && account.provider && account.providerAccountId) {
    return `${account.provider}-${account.providerAccountId}`;
  }
  return user?.id ?? null;
}
