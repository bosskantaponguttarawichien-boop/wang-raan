import { randomId } from "./entities";
import { createEmptyLayout, createEntrance } from "./entities";
import { createKitchen, createCounter } from "./entities";
import { addTableSet } from "./table-set";
import type { IdFactory, StoreLayout } from "./types";

/**
 * ผังตัวอย่าง "คาเฟ่ 8 × 6 ม." ตาม PRD §9 ข้อ 13 และ feat-051
 * ได้สถานะ Ready จาก Validation Engine จริง (ผ่าน Completeness, Collision, Clearance, Accessibility)
 */
export function createSampleCafeLayout(newId: IdFactory = randomId): StoreLayout {
  let layout = createEmptyLayout({ width: 8, depth: 6 }, newId);
  layout = {
    ...layout,
    entrance: createEntrance(layout, { wall: "south", position: 1.25 }, newId),
    objects: [
      createKitchen({ position: { x: 0.5, y: 0.5 } }, newId),
      createCounter({ position: { x: 5, y: 0.5 } }, newId),
    ],
  };
  layout = addTableSet(layout, "table-4-seats", { x: 3, y: 3 }, newId).layout;
  layout = addTableSet(layout, "table-2-seats", { x: 6, y: 3.5 }, newId).layout;
  return layout;
}
