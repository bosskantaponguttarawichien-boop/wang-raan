import "server-only";
/**
 * บัญชีผู้ใช้ฝั่ง BFF — เรียก Backend ตามสัญญา contracts/openapi.yaml (`/v1/me`) ผ่าน Token Relay
 * ผู้ใช้ระบุจาก `sub` ใน Bearer token เท่านั้น (เข้าถึงบัญชีคนอื่นไม่ได้)
 */
import type { ShareDto, StoredLayoutDto } from "@/lib/api-client";
import { backendClient, readBody, send } from "./backend";
import type { BackendClient } from "./token-relay";

export type AuthProvider = "guest" | "google" | "line" | "github" | "email";

export interface UserProfile {
  id: string;
  provider: AuthProvider;
  name: string | null;
  email: string | null;
  image: string | null;
  createdAt: string;
  updatedAt: string;
}

/** PUT /v1/me — ส่งเฉพาะช่องที่จะแก้ */
export interface ProfileUpdate {
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

export interface Identity {
  provider: AuthProvider;
  providerAccountId: string;
  email: string | null;
  emailVerified: boolean;
  createdAt: string;
  lastLoginAt: string;
}

/** POST /v1/auth/identities/resolve (สัญญา ResolveIdentityRequest) */
export type ResolveIdentityInput =
  | { provider: "guest" }
  | {
      provider: "google" | "line" | "github";
      providerAccountId: string;
      email: string | null;
      emailVerified: boolean;
      name?: string | null;
      image?: string | null;
    };

export interface ResolvedUser {
  user: UserProfile;
  created: boolean;
}

/** OTP ไม่ผ่าน — code ตามสัญญา (OTP_INVALID / OTP_EXPIRED / OTP_ATTEMPTS_EXCEEDED / RATE_LIMITED / INVALID_REQUEST) */
export class OtpError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "OtpError";
  }
}

export interface AccountExport {
  exportedAt: string;
  user: UserProfile;
  identities: Identity[];
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
  /** หา/สร้างบัญชีตอนล็อกอิน (Guest/OAuth) — id ที่ได้ใช้เป็น `sub` */
  resolve(input: ResolveIdentityInput, clientIp: string): Promise<ResolvedUser>;
  /** ตรวจ OTP ผ่าน → บัญชีของอีเมลนั้น; ไม่ผ่าน → OtpError */
  verifyOtp(email: string, code: string, clientIp: string): Promise<ResolvedUser>;
  get(userId: string): Promise<UserProfile | null>;
  /** null = ไม่มีบัญชีนี้ใน Backend */
  update(userId: string, profile: ProfileUpdate): Promise<UserProfile | null>;
  remove(userId: string): Promise<void>;
  export(userId: string): Promise<AccountExport>;
  mergeGuest(userId: string, guestId: string): Promise<MergeGuestResult>;
}

export function createRemoteAccountRepository(client: BackendClient = backendClient): AccountRepository {
  return {
    async resolve(input, clientIp) {
      return readBody<ResolvedUser>(
        await send(client, null, "/v1/auth/identities/resolve", {
          method: "POST",
          headers: { "x-client-ip": clientIp },
          body: JSON.stringify(input),
        }),
      );
    },
    async verifyOtp(email, code, clientIp) {
      const res = await send(
        client,
        null,
        "/v1/auth/otp/verify",
        { method: "POST", headers: { "x-client-ip": clientIp }, body: JSON.stringify({ email, code }) },
        [400, 429],
      );
      if (res.ok) return readBody<ResolvedUser>(res);
      const error = ((await res.json().catch(() => null)) as { error?: { code?: unknown } } | null)?.error;
      throw new OtpError(typeof error?.code === "string" ? error.code : "INVALID_REQUEST");
    },
    async get(userId) {
      const res = await send(client, userId, "/v1/me", {}, [404]);
      return res.status === 404 ? null : readBody<UserProfile>(res);
    },
    async update(userId, profile) {
      const res = await send(client, userId, "/v1/me", { method: "PUT", body: JSON.stringify(profile) }, [404]);
      return res.status === 404 ? null : readBody<UserProfile>(res);
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
