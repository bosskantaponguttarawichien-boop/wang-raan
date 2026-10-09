import "server-only";
/**
 * ที่เก็บผังร้านฝั่ง BFF
 * V1 ยังไม่มี Backend Layout Service (architecture.md §3) จึงใช้ in-memory ตาม interface นี้
 * เมื่อมี BE จริงให้สร้าง implementation ที่เรียก be-client แทน โดย Route Handlers ไม่ต้องแก้
 */
import type { StoreLayout, ValidationResult } from "@/core/layout";

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
  list(): Promise<LayoutSummary[]>;
  get(id: string): Promise<StoredLayout | null>;
  create(layout: StoreLayout, validation: ValidationResult): Promise<StoredLayout | "conflict">;
  update(layout: StoreLayout, validation: ValidationResult): Promise<StoredLayout | "not-found">;
  remove(id: string): Promise<boolean>;
}

export function createMemoryLayoutRepository(now: () => Date = () => new Date()): LayoutRepository {
  const items = new Map<string, StoredLayout>();
  return {
    async list() {
      return [...items.values()]
        .map(({ layout, validation, updatedAt }) => ({
          id: layout.id,
          width: layout.width,
          depth: layout.depth,
          objectCount: layout.objects.length,
          status: validation.status,
          updatedAt,
        }))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    async get(id) {
      return items.get(id) ?? null;
    },
    async create(layout, validation) {
      if (items.has(layout.id)) return "conflict";
      const at = now().toISOString();
      const stored = { layout, validation, createdAt: at, updatedAt: at };
      items.set(layout.id, stored);
      return stored;
    },
    async update(layout, validation) {
      const existing = items.get(layout.id);
      if (!existing) return "not-found";
      const stored = { ...existing, layout, validation, updatedAt: now().toISOString() };
      items.set(layout.id, stored);
      return stored;
    },
    async remove(id) {
      return items.delete(id);
    },
  };
}

// เก็บไว้บน globalThis เพื่อไม่ให้หายเมื่อ dev server hot-reload
const globalForRepo = globalThis as unknown as { __wangRaanLayoutRepo?: LayoutRepository };
export const layoutRepository: LayoutRepository = (globalForRepo.__wangRaanLayoutRepo ??= createMemoryLayoutRepository());
