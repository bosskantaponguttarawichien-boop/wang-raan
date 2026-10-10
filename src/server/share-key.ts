/**
 * Share key ของลิงก์แชร์ (feat-030) — สร้างที่ Backend; BFF ใช้ pattern กรองค่ามั่วก่อนเรียก Backend
 * 32 ไบต์สุ่มจาก CSPRNG (256 บิต) เข้ารหัส base64url = 43 ตัวอักษร — เดาไม่ได้
 */
export const SHARE_KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function createShareKey(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
