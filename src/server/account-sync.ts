import "server-only";
/**
 * ย้ายข้อมูล Guest ตอนล็อกอิน (เรียกจาก jwt callback ของ Auth.js หลัง resolve / verifyOtp ได้ id บัญชีแล้ว)
 * `POST /v1/me/merge-guest` — ถ้าก่อนล็อกอินผู้ใช้ถือ session ของ Guest อยู่ ย้ายผังและลิงก์แชร์เข้าบัญชีใหม่
 * (session เดิมเข้ารหัสด้วย AUTH_SECRET จึงพิสูจน์ได้ว่าผู้ใช้เป็นเจ้าของ Guest นั้นจริง)
 * โปรไฟล์ (ชื่อ/รูป) Backend บันทึกเองตอน resolve — ไม่ต้องเรียก PUT /v1/me
 */
import type { AccountRepository, MergeGuestResult } from "./account-repository";
import { isGuestId } from "./auth-config";

const GUEST_ID = /^guest-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface SignInSync {
  /** id บัญชีที่เพิ่งล็อกอิน (JWT `sub` ใหม่) */
  userId: string;
  /** `sub` ของ session ที่ผู้ใช้ถืออยู่ก่อนล็อกอิน (ถ้ามี) */
  previousUserId?: string | null;
}

/** ย้ายข้อมูลได้เฉพาะจาก Guest → บัญชีจริง และไม่ใช่คนเดิม */
export function guestToMerge(userId: string, previousUserId: string | null | undefined): string | null {
  if (!previousUserId || previousUserId === userId) return null;
  if (!GUEST_ID.test(previousUserId) || isGuestId(userId)) return null;
  return previousUserId;
}

/** ย้ายผัง Guest ไม่สำเร็จ → throw ให้การล็อกอินล้มเหลว: session Guest เดิมยังอยู่ ผังจึงไม่หายและลองใหม่ได้ */
export async function syncSignIn(repo: AccountRepository, sync: SignInSync): Promise<MergeGuestResult | null> {
  const guestId = guestToMerge(sync.userId, sync.previousUserId);
  if (!guestId) return null;
  return repo.mergeGuest(sync.userId, guestId);
}
