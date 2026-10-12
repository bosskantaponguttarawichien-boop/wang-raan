import "server-only";
/**
 * ซิงก์บัญชีกับ Backend ตอนล็อกอิน (เรียกจาก jwt callback ของ Auth.js)
 * 1. `PUT /v1/me` — บันทึก/อัปเดตโปรไฟล์ทุกครั้งที่ล็อกอิน (ตามสัญญา upsertMe)
 * 2. `POST /v1/me/merge-guest` — ถ้าก่อนล็อกอินผู้ใช้ถือ session ของ Guest อยู่ ย้ายผังและลิงก์แชร์เข้าบัญชีใหม่
 *    (session เดิมเข้ารหัสด้วย AUTH_SECRET จึงพิสูจน์ได้ว่าผู้ใช้เป็นเจ้าของ Guest นั้นจริง)
 */
import { z } from "zod";
import type { AccountRepository, MergeGuestResult, ProfileInput } from "./account-repository";
import { providerOf } from "./account-repository";

const GUEST_ID = /^guest-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// ค่าจาก Identity Provider ที่ไม่ผ่านสัญญา (เช่น email ผิดรูปแบบ) → ไม่ส่ง แทนที่จะทำให้ทั้งคำขอถูกปฏิเสธ
const Email = z.string().email().max(254);
const Image = z.string().url().max(2048);

export interface SignInProfile {
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

export function profileInput(userId: string, profile: SignInProfile): ProfileInput | null {
  const provider = providerOf(userId);
  if (!provider) return null;
  return {
    provider,
    name: profile.name?.trim().slice(0, 200) || null,
    email: Email.safeParse(profile.email).success ? profile.email! : null,
    image: Image.safeParse(profile.image).success ? profile.image! : null,
  };
}

export interface SignInSync {
  /** id ผู้ใช้ใหม่ (JWT `sub`) */
  userId: string;
  profile: SignInProfile;
  /** `sub` ของ session ที่ผู้ใช้ถืออยู่ก่อนล็อกอิน (ถ้ามี) */
  previousUserId?: string | null;
}

/** ย้ายข้อมูลได้เฉพาะจาก Guest → บัญชีจริง และไม่ใช่คนเดิม */
export function guestToMerge(userId: string, previousUserId: string | null | undefined): string | null {
  if (!previousUserId || previousUserId === userId) return null;
  if (!GUEST_ID.test(previousUserId) || providerOf(userId) === null || providerOf(userId) === "guest") return null;
  return previousUserId;
}

/**
 * โปรไฟล์บันทึกไม่สำเร็จ → แค่ log (ล็อกอินต่อได้ GET /api/me จะสร้างให้ภายหลัง)
 * ย้ายผัง Guest ไม่สำเร็จ → throw ให้การล็อกอินล้มเหลว: session Guest เดิมยังอยู่ ผังจึงไม่หายและลองใหม่ได้
 */
export async function syncSignIn(repo: AccountRepository, sync: SignInSync): Promise<MergeGuestResult | null> {
  const input = profileInput(sync.userId, sync.profile);
  if (input) {
    await repo.upsert(sync.userId, input).catch((error: unknown) => {
      console.error("[wang-raan] บันทึกโปรไฟล์ไป Backend ไม่สำเร็จ", error instanceof Error ? error.message : error);
    });
  }
  const guestId = guestToMerge(sync.userId, sync.previousUserId);
  if (!guestId) return null;
  return repo.mergeGuest(sync.userId, guestId);
}
