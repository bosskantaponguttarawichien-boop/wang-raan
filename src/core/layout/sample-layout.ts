import { DEFAULT_SIZES } from "./constants";
import {
  createCounter,
  createEmptyLayout,
  createEntrance,
  createKitchen,
  randomId,
  wallLength,
} from "./entities";
import { snapToGrid } from "./geometry";
import { addTableSet } from "./table-set";
import type { IdFactory, Meters, StoreLayout, Wall } from "./types";

export interface StarterLayoutParams {
  width: Meters;
  depth: Meters;
  wall: Wall;
  doorWidth?: Meters;
}

/**
 * สร้างผังเริ่มต้นตามขนาดและตำแหน่งประตูที่ระบุ
 * พร้อมจัดวาง Kitchen, Counter และ Table 2 ที่นั่งในจุดที่เหมาะสมโดยอัตโนมัติ
 * เพื่อให้ผังผ่าน Completeness Gate และบันทึกลงระบบได้โดยไม่ติดสถานะ Blocked
 */
export function createStarterLayout(
  params: StarterLayoutParams,
  newId: IdFactory = randomId,
): StoreLayout {
  const { width, depth, wall } = params;
  let layout = createEmptyLayout({ width, depth }, newId);
  const wallLen = wallLength(layout, wall);
  const doorWidth = params.doorWidth ?? 1.0;
  const doorPos = Math.max(0, snapToGrid((wallLen - doorWidth) / 2));

  layout = {
    ...layout,
    entrance: createEntrance(layout, { wall, position: doorPos, width: doorWidth }, newId),
    objects: [],
  };

  const kw = DEFAULT_SIZES.kitchen.width;
  const kd = DEFAULT_SIZES.kitchen.depth;
  const cw = DEFAULT_SIZES.counter.width;
  const cd = DEFAULT_SIZES.counter.depth;

  // กำหนดตำแหน่งวางครัว และเคาน์เตอร์ ให้สอดคล้องกับผนังทางเข้าเพื่อเว้นทางเดินหลัก
  let kPos = { x: 0.5, y: 0.5 };
  let cPos = { x: snapToGrid(Math.max(0.5, width - cw - 0.5)), y: 0.5 };

  if (wall === "north") {
    kPos = { x: 0.5, y: snapToGrid(Math.max(0.5, depth - kd - 0.5)) };
    cPos = { x: snapToGrid(Math.max(0.5, width - cw - 0.5)), y: snapToGrid(Math.max(0.5, depth - cd - 0.5)) };
  } else if (wall === "east") {
    kPos = { x: 0.5, y: 0.5 };
    cPos = { x: 0.5, y: snapToGrid(Math.max(0.5, depth - cd - 0.5)) };
  } else if (wall === "west") {
    kPos = { x: snapToGrid(Math.max(0.5, width - kw - 0.5)), y: 0.5 };
    cPos = { x: snapToGrid(Math.max(0.5, width - cw - 0.5)), y: snapToGrid(Math.max(0.5, depth - cd - 0.5)) };
  }

  layout = {
    ...layout,
    objects: [
      createKitchen({ position: kPos }, newId),
      createCounter({ position: cPos }, newId),
    ],
  };

  // วางโต๊ะ 2 ที่นั่งไว้กลางห้อง (ห่างจากผนังและวัตถุอื่นเพื่อรองรับ Clearance & Accessibility)
  const tPos = {
    x: snapToGrid(Math.max(1.5, Math.min(width - 2.5, width / 2 - 0.4))),
    y: snapToGrid(Math.max(1.5, Math.min(depth - 2.5, depth / 2 - 0.4))),
  };
  layout = addTableSet(layout, "table-2-seats", tPos, newId).layout;

  return layout;
}

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

