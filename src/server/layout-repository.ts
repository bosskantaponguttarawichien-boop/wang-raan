import "server-only";
/**
 * ที่เก็บผังร้านฝั่ง BFF — แยกตามเจ้าของ (ownerId = id ผู้ใช้จาก Session)
 * - ไม่มี Backend (V1): in-memory
 * - ตั้ง WANGRAAN_BACKEND_URL: เรียก Backend Layout Service ผ่าน Token Relay (Bearer internal token)
 * Route Handlers ใช้ interface เดียวกันทั้งสองแบบ
 */
import type { StoreLayout, ValidationResult } from "@/core/layout";
import { createBackendClient, type BackendClient } from "./token-relay";

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
  create(ownerId: string, layout: StoreLayout, validation: ValidationResult): Promise<StoredLayout | "conflict">;
  update(ownerId: string, layout: StoreLayout, validation: ValidationResult): Promise<StoredLayout | "not-found">;
  remove(ownerId: string, id: string): Promise<boolean>;
}

export function toSummary({ layout, validation, updatedAt }: StoredLayout): LayoutSummary {
  return {
    id: layout.id,
    width: layout.width,
    depth: layout.depth,
    objectCount: layout.objects.length,
    status: validation.status,
    updatedAt,
  };
}

export function createMemoryLayoutRepository(now: () => Date = () => new Date()): LayoutRepository {
  // แยกตามเจ้าของ → ผู้ใช้ต่างคนใช้ id เดียวกันได้ (เช่น นำเข้าไฟล์ของคนอื่น) และไม่รู้ว่าคนอื่นมี id นั้นหรือไม่
  const owners = new Map<string, Map<string, StoredLayout>>();
  const itemsOf = (ownerId: string) => {
    let items = owners.get(ownerId);
    if (!items) owners.set(ownerId, (items = new Map()));
    return items;
  };
  return {
    async list(ownerId) {
      return [...(owners.get(ownerId)?.values() ?? [])].map(toSummary).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    async get(ownerId, id) {
      return owners.get(ownerId)?.get(id) ?? null;
    },
    async create(ownerId, layout, validation) {
      const items = itemsOf(ownerId);
      if (items.has(layout.id)) return "conflict";
      const at = now().toISOString();
      const stored = { layout, validation, createdAt: at, updatedAt: at };
      items.set(layout.id, stored);
      return stored;
    },
    async update(ownerId, layout, validation) {
      const existing = owners.get(ownerId)?.get(layout.id);
      if (!existing) return "not-found";
      const stored = { ...existing, layout, validation, updatedAt: now().toISOString() };
      itemsOf(ownerId).set(layout.id, stored);
      return stored;
    },
    async remove(ownerId, id) {
      return owners.get(ownerId)?.delete(id) ?? false;
    },
  };
}

/** Backend ตอบผิดปกติ (สถานะที่ BFF ไม่ได้คาดไว้) — Route Handler แปลงเป็น 502 */
export class BackendError extends Error {
  constructor(readonly status: number) {
    super(`Backend ${status}`);
    this.name = "BackendError";
  }
}

/** Repository ที่เรียก Backend Layout Service — สิทธิ์ความเป็นเจ้าของตรวจที่ Backend จาก sub ใน Bearer token */
export function createRemoteLayoutRepository(client: BackendClient): LayoutRepository {
  /** ส่งคำขอ; สถานะที่ไม่ใช่ 2xx และไม่อยู่ใน `expected` = BackendError (ห้ามอ่าน error body เป็นข้อมูลผัง) */
  const send = async (ownerId: string, path: string, init: RequestInit = {}, expected: number[] = []) => {
    const res = await client.request(ownerId, path, init);
    if (!res.ok && !expected.includes(res.status)) throw new BackendError(res.status);
    return res;
  };
  const item = (id: string) => `/layouts/${encodeURIComponent(id)}`;
  return {
    async list(ownerId) {
      const body = (await (await send(ownerId, "/layouts")).json()) as { layouts?: unknown };
      if (!Array.isArray(body.layouts)) throw new BackendError(502);
      return body.layouts as LayoutSummary[];
    },
    async get(ownerId, id) {
      const res = await send(ownerId, item(id), {}, [404]);
      return res.status === 404 ? null : ((await res.json()) as StoredLayout);
    },
    async create(ownerId, layout, validation) {
      const res = await send(ownerId, "/layouts", { method: "POST", body: JSON.stringify({ layout, validation }) }, [409]);
      return res.status === 409 ? "conflict" : ((await res.json()) as StoredLayout);
    },
    async update(ownerId, layout, validation) {
      const res = await send(ownerId, item(layout.id), { method: "PUT", body: JSON.stringify({ layout, validation }) }, [404]);
      return res.status === 404 ? "not-found" : ((await res.json()) as StoredLayout);
    },
    async remove(ownerId, id) {
      const res = await send(ownerId, item(id), { method: "DELETE" }, [404]);
      return res.ok;
    },
  };
}

function createDefaultRepository(): LayoutRepository {
  const baseUrl = process.env.WANGRAAN_BACKEND_URL;
  const secret = process.env.INTERNAL_TOKEN_SECRET;
  if (baseUrl && secret) return createRemoteLayoutRepository(createBackendClient({ baseUrl, secret }));
  return createMemoryLayoutRepository();
}

// เก็บไว้บน globalThis เพื่อไม่ให้หายเมื่อ dev server hot-reload
const globalForRepo = globalThis as unknown as { __wangRaanLayoutRepo?: LayoutRepository };
export const layoutRepository: LayoutRepository = (globalForRepo.__wangRaanLayoutRepo ??= createDefaultRepository());
