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
  const items = new Map<string, StoredLayout & { ownerId: string }>();
  // ผังของคนอื่น = "ไม่พบ" (ไม่บอกว่ามีอยู่)
  const owned = (ownerId: string, id: string) => {
    const item = items.get(id);
    return item && item.ownerId === ownerId ? item : null;
  };
  const strip = ({ layout, validation, createdAt, updatedAt }: StoredLayout): StoredLayout => ({ layout, validation, createdAt, updatedAt });
  return {
    async list(ownerId) {
      return [...items.values()]
        .filter((i) => i.ownerId === ownerId)
        .map(toSummary)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    async get(ownerId, id) {
      const item = owned(ownerId, id);
      return item ? strip(item) : null;
    },
    async create(ownerId, layout, validation) {
      if (items.has(layout.id)) return "conflict";
      const at = now().toISOString();
      const stored = { layout, validation, createdAt: at, updatedAt: at };
      items.set(layout.id, { ...stored, ownerId });
      return stored;
    },
    async update(ownerId, layout, validation) {
      const existing = owned(ownerId, layout.id);
      if (!existing) return "not-found";
      const stored = { ...strip(existing), layout, validation, updatedAt: now().toISOString() };
      items.set(layout.id, { ...stored, ownerId });
      return stored;
    },
    async remove(ownerId, id) {
      return owned(ownerId, id) ? items.delete(id) : false;
    },
  };
}

/** Repository ที่เรียก Backend Layout Service — สิทธิ์ความเป็นเจ้าของตรวจที่ Backend จาก sub ใน Bearer token */
export function createRemoteLayoutRepository(client: BackendClient): LayoutRepository {
  const send = async (ownerId: string, path: string, init?: RequestInit) => {
    const res = await client.request(ownerId, path, init);
    if (res.status >= 500) throw new Error(`Backend ${res.status}`);
    return res;
  };
  return {
    async list(ownerId) {
      const res = await send(ownerId, "/layouts");
      return ((await res.json()) as { layouts: LayoutSummary[] }).layouts;
    },
    async get(ownerId, id) {
      const res = await send(ownerId, `/layouts/${encodeURIComponent(id)}`);
      return res.ok ? ((await res.json()) as StoredLayout) : null;
    },
    async create(ownerId, layout, validation) {
      const res = await send(ownerId, "/layouts", { method: "POST", body: JSON.stringify({ layout, validation }) });
      return res.status === 409 ? "conflict" : ((await res.json()) as StoredLayout);
    },
    async update(ownerId, layout, validation) {
      const res = await send(ownerId, `/layouts/${encodeURIComponent(layout.id)}`, {
        method: "PUT",
        body: JSON.stringify({ layout, validation }),
      });
      return res.status === 404 ? "not-found" : ((await res.json()) as StoredLayout);
    },
    async remove(ownerId, id) {
      const res = await send(ownerId, `/layouts/${encodeURIComponent(id)}`, { method: "DELETE" });
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
