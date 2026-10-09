import {
  addTableSet,
  createCounter,
  createEmptyLayout,
  createEntrance,
  createKitchen,
  createSequentialIds,
  type IdFactory,
  type LayoutObject,
  type StoreLayout,
} from "@/core/layout";

/**
 * ผังคาเฟ่ 8 × 6 ม. ที่ผ่านทุกกฎ (Ready) — ใช้เป็นฐานของเทสต์ Validation
 *
 *   y=0  ┌──────────────────────────────┐
 *        │ [ครัว 2×1.5]      [เคาน์เตอร์ 2.4×0.7]│
 *        │          ▣4 ที่นั่ง      ▣2 ที่นั่ง   │
 *   y=6  └──[ทางเข้า 1.2]─────────────────┘
 */
export function cafeLayout(ids: IdFactory = createSequentialIds()): StoreLayout {
  let layout = createEmptyLayout({ width: 8, depth: 6 }, ids);
  layout = {
    ...layout,
    entrance: createEntrance(layout, { wall: "south", position: 1.25 }, ids),
    objects: [
      createKitchen({ position: { x: 0.5, y: 0.5 } }, ids),
      createCounter({ position: { x: 5, y: 0.5 } }, ids),
    ],
  };
  layout = addTableSet(layout, "table-4-seats", { x: 3, y: 3 }, ids).layout;
  layout = addTableSet(layout, "table-2-seats", { x: 6, y: 3.5 }, ids).layout;
  return layout;
}

export function withObjects(layout: StoreLayout, ...objects: LayoutObject[]): StoreLayout {
  return { ...layout, objects: [...layout.objects, ...objects] };
}

export function withoutType(layout: StoreLayout, type: LayoutObject["type"]): StoreLayout {
  return { ...layout, objects: layout.objects.filter((o) => o.type !== type) };
}

export function patchObject(layout: StoreLayout, id: string, patch: Partial<LayoutObject>): StoreLayout {
  return {
    ...layout,
    objects: layout.objects.map((o) => (o.id === id ? ({ ...o, ...patch } as LayoutObject) : o)),
  };
}

/** วัตถุดิบแบบกำหนดพิกัดเอง (ไม่ snap) สำหรับสร้างช่องทางเดินที่ความกว้างแม่นยำ */
export function block(
  id: string,
  x: number,
  y: number,
  width: number,
  depth: number,
  type: "kitchen" | "counter" = "kitchen",
): LayoutObject {
  return { id, type, x, y, width, depth, rotation: 0 };
}

/**
 * ห้อง 8 × 4 ม. ประตูผนังตะวันตก (y 1.5–2.7) แนวกั้น x 3–5 เหลือช่องทางเดินกว้าง `gap` ที่ y = 1.5
 * ปลายทาง (`target`) อยู่ฝั่งตะวันออก จึงต้องผ่านช่องนี้เท่านั้น
 */
export function corridor(gap: number, target: LayoutObject, entranceWidth = 1.2): StoreLayout {
  return {
    id: "corridor",
    version: 1,
    units: "m",
    width: 8,
    depth: 4,
    entrance: { id: "entrance-01", wall: "west", position: 1.5, width: entranceWidth },
    objects: [block("wall-n", 3, 0, 2, 1.5), block("wall-s", 3, 1.5 + gap, 2, 4 - 1.5 - gap), target],
  };
}

export const TARGETS = {
  counter: block("target", 7.3, 1, 0.7, 2, "counter"),
  kitchen: block("target", 6.5, 1, 1.5, 2, "kitchen"),
  table: { id: "target", type: "table", x: 7, y: 1.5, width: 0.8, depth: 0.8, rotation: 0, chairIds: [] },
  chair: { id: "target", type: "chair", tableId: "none", x: 7.3, y: 1.5, width: 0.5, depth: 0.5, rotation: 0 },
} as const satisfies Record<string, LayoutObject>;
