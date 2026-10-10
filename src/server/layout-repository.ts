import "server-only";
/**
 * ที่เก็บผังร้านฝั่ง BFF — เรียก Backend ตามสัญญา contracts/openapi.yaml (`/v1/layouts`) ผ่าน Token Relay
 * ความเป็นเจ้าของตรวจที่ Backend จาก `sub` ใน Bearer token (ผังของคนอื่นตอบ 404)
 * Backend คำนวณผลตรวจเอง — BFF ส่งแค่ `{ layout }`
 */
import type { StoreLayout, ValidationResult } from "@/core/layout";
import { BackendError, backendClient, readBody, send } from "./backend";
import type { BackendClient } from "./token-relay";

export { BackendError } from "./backend";

export interface StoredLayout {
  layout: StoreLayout;
  validation: ValidationResult;
  createdAt: string;
  updatedAt: string;
}

export interface LayoutSummary {
  id: string;
  width: number;
  depth: number;
  objectCount: number;
  status: ValidationResult["status"];
  updatedAt: string;
}

export interface LayoutRepository {
  list(ownerId: string): Promise<LayoutSummary[]>;
  get(ownerId: string, id: string): Promise<StoredLayout | null>;
  create(ownerId: string, layout: StoreLayout): Promise<StoredLayout | "conflict">;
  update(ownerId: string, layout: StoreLayout): Promise<StoredLayout | "not-found">;
  remove(ownerId: string, id: string): Promise<boolean>;
}

const item = (id: string) => `/v1/layouts/${encodeURIComponent(id)}`;

export function createRemoteLayoutRepository(client: BackendClient = backendClient): LayoutRepository {
  return {
    async list(ownerId) {
      const body = await readBody<{ layouts?: unknown }>(await send(client, ownerId, "/v1/layouts"));
      if (!Array.isArray(body.layouts)) throw new BackendError(502);
      return body.layouts as LayoutSummary[];
    },
    async get(ownerId, id) {
      const res = await send(client, ownerId, item(id), {}, [404]);
      return res.status === 404 ? null : readBody<StoredLayout>(res);
    },
    async create(ownerId, layout) {
      const res = await send(client, ownerId, "/v1/layouts", { method: "POST", body: JSON.stringify({ layout }) }, [409]);
      if (res.status !== 409) return readBody<StoredLayout>(res);
      // 409 มีสองแบบ: id ซ้ำ (ให้ผู้เรียกสลับไป PUT) หรือโควตาเต็ม (ส่งต่อให้ผู้ใช้)
      const error = ((await res.json().catch(() => null)) as { error?: Record<string, unknown> } | null)?.error ?? {};
      if (error.code === "LAYOUT_EXISTS") return "conflict";
      throw new BackendError(409, typeof error.code === "string" ? error.code : null, error);
    },
    async update(ownerId, layout) {
      const res = await send(client, ownerId, item(layout.id), { method: "PUT", body: JSON.stringify({ layout }) }, [404]);
      return res.status === 404 ? "not-found" : readBody<StoredLayout>(res);
    },
    async remove(ownerId, id) {
      const res = await send(client, ownerId, item(id), { method: "DELETE" }, [404]);
      return res.ok;
    },
  };
}

export const layoutRepository: LayoutRepository = createRemoteLayoutRepository();
