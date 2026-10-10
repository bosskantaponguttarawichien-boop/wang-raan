import "server-only";
/**
 * Public Share (feat-030) — เก็บ "สำเนา" ของผังตอนกดแชร์ (snapshot) ผูกกับ share key สุ่ม
 * แก้ผังภายหลังไม่กระทบลิงก์เดิม (แชร์ใหม่ได้ลิงก์ใหม่) จึงแคชหน้าแชร์ได้นาน
 */
import type { StoreLayout, ValidationResult } from "@/core/layout";

export interface SharedLayout {
  shareKey: string;
  ownerId: string;
  layout: StoreLayout;
  validation: ValidationResult;
  createdAt: string;
}

/** 32 ไบต์สุ่มจาก CSPRNG (256 บิต) เข้ารหัส base64url = 43 ตัวอักษร — เดาไม่ได้ */
export const SHARE_KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function createShareKey(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export interface ShareRepository {
  create(entry: Omit<SharedLayout, "shareKey" | "createdAt">): Promise<SharedLayout>;
  get(shareKey: string): Promise<SharedLayout | null>;
}

export function createMemoryShareRepository(now: () => Date = () => new Date(), newKey: () => string = createShareKey): ShareRepository {
  const items = new Map<string, SharedLayout>();
  return {
    async create(entry) {
      const shared = { ...entry, shareKey: newKey(), createdAt: now().toISOString() };
      items.set(shared.shareKey, shared);
      return shared;
    },
    async get(shareKey) {
      return SHARE_KEY_PATTERN.test(shareKey) ? (items.get(shareKey) ?? null) : null;
    },
  };
}

const globalForShare = globalThis as unknown as { __wangRaanShareRepo?: ShareRepository };
export const shareRepository: ShareRepository = (globalForShare.__wangRaanShareRepo ??= createMemoryShareRepository());
