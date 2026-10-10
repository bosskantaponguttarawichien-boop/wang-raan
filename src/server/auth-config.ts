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
