import "server-only";
/**
 * ลิงก์แชร์ (feat-030, feat-040) — เรียก Backend ตามสัญญา contracts/openapi.yaml
 * Backend เก็บ "สำเนา" ของผังตอนกดแชร์ (snapshot) และเป็นคนสร้าง share key
 */
import type { StoreLayout, ValidationResult } from "@/core/layout";
import { backendClient, readBody, send } from "./backend";
import { SHARE_KEY_PATTERN } from "./share-key";
import type { BackendClient } from "./token-relay";

export { SHARE_KEY_PATTERN, createShareKey } from "./share-key";

export type ShareStatus = "active" | "expired" | "revoked";

export interface ShareLink {
  shareKey: string;
  layoutId: string;
  status: ShareStatus;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
}

export interface PublicShare {
  layout: StoreLayout;
  validation: ValidationResult;
  createdAt: string;
  expiresAt: string | null;
}

export interface ShareRepository {
  create(ownerId: string, layoutId: string, expiresAt: string | null): Promise<ShareLink | "not-found">;
  list(ownerId: string, layoutId: string): Promise<ShareLink[] | "not-found">;
  update(ownerId: string, shareKey: string, expiresAt: string | null): Promise<ShareLink | "not-found" | "revoked">;
  revoke(ownerId: string, shareKey: string): Promise<boolean>;
  /** เปิดแบบสาธารณะ (ไม่มีผู้ใช้) — clientIp ใช้นับ rate limit ที่ Backend */
  getPublic(shareKey: string, clientIp?: string): Promise<PublicShare | "not-found" | "revoked" | "expired">;
}

const layoutShares = (layoutId: string) => `/v1/layouts/${encodeURIComponent(layoutId)}/shares`;
const share = (key: string) => `/v1/shares/${encodeURIComponent(key)}`;

async function errorCode(res: Response): Promise<string | null> {
  const body = (await res.json().catch(() => null)) as { error?: { code?: unknown } } | null;
  return typeof body?.error?.code === "string" ? body.error.code : null;
}

export function createRemoteShareRepository(client: BackendClient = backendClient): ShareRepository {
  return {
    async create(ownerId, layoutId, expiresAt) {
      const body = JSON.stringify(expiresAt ? { expiresAt } : {});
      const res = await send(client, ownerId, layoutShares(layoutId), { method: "POST", body }, [404]);
      return res.status === 404 ? "not-found" : readBody<ShareLink>(res);
    },
    async list(ownerId, layoutId) {
      const res = await send(client, ownerId, layoutShares(layoutId), {}, [404]);
      if (res.status === 404) return "not-found";
      return (await readBody<{ shares: ShareLink[] }>(res)).shares;
    },
    async update(ownerId, shareKey, expiresAt) {
      if (!SHARE_KEY_PATTERN.test(shareKey)) return "not-found";
      const res = await send(client, ownerId, share(shareKey), { method: "PATCH", body: JSON.stringify({ expiresAt }) }, [404, 410]);
      if (res.status === 404) return "not-found";
      if (res.status === 410) return "revoked";
      return readBody<ShareLink>(res);
    },
    async revoke(ownerId, shareKey) {
      if (!SHARE_KEY_PATTERN.test(shareKey)) return false;
      const res = await send(client, ownerId, share(shareKey), { method: "DELETE" }, [404]);
      return res.ok;
    },
    async getPublic(shareKey, clientIp = "unknown") {
      if (!SHARE_KEY_PATTERN.test(shareKey)) return "not-found";
      const res = await send(client, null, `/v1/public/shares/${shareKey}`, { headers: { "x-client-ip": clientIp } }, [404, 410]);
      if (res.status === 404) return "not-found";
      if (res.status === 410) return (await errorCode(res)) === "SHARE_EXPIRED" ? "expired" : "revoked";
      return readBody<PublicShare>(res);
    },
  };
}

export const shareRepository: ShareRepository = createRemoteShareRepository();
