import "server-only";
/**
 * บัญชีผู้ใช้ฝั่ง BFF — เรียก Backend ตามสัญญา contracts/openapi.yaml (`/v1/me`) ผ่าน Token Relay
 * ผู้ใช้ระบุจาก `sub` ใน Bearer token เท่านั้น (เข้าถึงบัญชีคนอื่นไม่ได้)
 */
import type { ShareDto, StoredLayoutDto } from "@/lib/api-client";
import { backendClient, readBody, send } from "./backend";
import type { BackendClient } from "./token-relay";

export type AuthProvider = "guest" | "google" | "line" | "github";

export interface UserProfile {
  id: string;
  provider: AuthProvider;
  name: string | null;
  email: string | null;
  image: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProfileInput {
  provider: AuthProvider;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

export interface AccountExport {
  exportedAt: string;
  user: UserProfile;
  layouts: StoredLayoutDto[];
  shares: ShareDto[];
  contactMessages: { name: string; email: string; message: string; receivedAt: string }[];
}

export interface MergeGuestResult {
  movedLayouts: number;
  movedShares: number;
  renamed: { from: string; to: string }[];
}

export interface AccountRepository {
  get(userId: string): Promise<UserProfile | null>;
  upsert(userId: string, profile: ProfileInput): Promise<UserProfile>;
  remove(userId: string): Promise<void>;
  export(userId: string): Promise<AccountExport>;
  mergeGuest(userId: string, guestId: string): Promise<MergeGuestResult>;
}

const PROVIDERS: readonly AuthProvider[] = ["guest", "google", "line", "github"];

/** provider จาก id ผู้ใช้ (`<provider>-<...>` ตาม auth-config.subjectFor) — รูปแบบอื่นคืน null */
export function providerOf(userId: string): AuthProvider | null {
  const prefix = userId.slice(0, userId.indexOf("-"));
  return (PROVIDERS as readonly string[]).includes(prefix) ? (prefix as AuthProvider) : null;
}

export function createRemoteAccountRepository(client: BackendClient = backendClient): AccountRepository {
  return {
    async get(userId) {
      const res = await send(client, userId, "/v1/me", {}, [404]);
      return res.status === 404 ? null : readBody<UserProfile>(res);
    },
    async upsert(userId, profile) {
      return readBody<UserProfile>(await send(client, userId, "/v1/me", { method: "PUT", body: JSON.stringify(profile) }));
    },
    async remove(userId) {
      await send(client, userId, "/v1/me", { method: "DELETE" });
    },
    async export(userId) {
      return readBody<AccountExport>(await send(client, userId, "/v1/me/export"));
    },
    async mergeGuest(userId, guestId) {
      return readBody<MergeGuestResult>(
        await send(client, userId, "/v1/me/merge-guest", { method: "POST", body: JSON.stringify({ guestId }) }),
      );
    },
  };
}

export const accountRepository: AccountRepository = createRemoteAccountRepository();
