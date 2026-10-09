import { GRID_STEP, ROOM_MAX, ROOM_MIN } from "./constants";
import type { LayoutObject, Meters, Point, Rect, Rotation } from "./types";

const EPSILON = 1e-9;

/** ปัดเศษทศนิยมจาก floating point (ความละเอียด 1 ไมโครเมตร) */
export function roundMeters(value: Meters): Meters {
  const rounded = Math.round(value * 1e6) / 1e6;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/** Snap ค่าเข้ากริด (ค่าเริ่มต้น 0.25 ม.) */
export function snapToGrid(value: Meters, step: Meters = GRID_STEP): Meters {
  return roundMeters(Math.round(value / step) * step);
}

export function snapPoint(point: Point, step: Meters = GRID_STEP): Point {
  return { x: snapToGrid(point.x, step), y: snapToGrid(point.y, step) };
}

/** ขนาดร้าน: snap กริดแล้วบีบให้อยู่ในช่วง 2–30 ม. */
export function clampRoomDimension(value: Meters): Meters {
  if (!Number.isFinite(value)) return ROOM_MIN;
  return Math.min(ROOM_MAX, Math.max(ROOM_MIN, snapToGrid(value)));
}

export function normalizeRotation(degrees: number): Rotation {
  const quarter = Math.round(degrees / 90);
  return ((((quarter % 4) + 4) % 4) * 90) as Rotation;
}

/** ขนาด footprint บนผังหลังหมุน */
export function footprintSize(obj: Pick<LayoutObject, "width" | "depth" | "rotation">): {
  width: Meters;
  depth: Meters;
} {
  return obj.rotation % 180 === 0
    ? { width: obj.width, depth: obj.depth }
    : { width: obj.depth, depth: obj.width };
}

/** สี่เหลี่ยม footprint จริงบนผัง */
export function footprint(obj: Pick<LayoutObject, "x" | "y" | "width" | "depth" | "rotation">): Rect {
  return { x: obj.x, y: obj.y, ...footprintSize(obj) };
}

export function rectCenter(rect: Rect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.depth / 2 };
}

export function objectCenter(obj: Pick<LayoutObject, "x" | "y" | "width" | "depth" | "rotation">): Point {
  return rectCenter(footprint(obj));
}

/** ระยะซ้อนทับตามแกน x และ y (≤ 0 แปลว่าไม่ทับในแกนนั้น) */
export function rectOverlap(a: Rect, b: Rect): { x: Meters; y: Meters } {
  return {
    x: Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x),
    y: Math.min(a.y + a.depth, b.y + b.depth) - Math.max(a.y, b.y),
  };
}

/** สี่เหลี่ยมสองชิ้นทับกันจริง (แตะขอบกันไม่นับ) */
export function rectsIntersect(a: Rect, b: Rect): boolean {
  const o = rectOverlap(a, b);
  return o.x > EPSILON && o.y > EPSILON;
}

/** หมุนจุดรอบจุดศูนย์กลางตามเข็มนาฬิกา (แกน y ชี้ลง) ทีละ 90° */
export function rotatePoint(point: Point, center: Point, rotation: Rotation): Point {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  switch (rotation) {
    case 0:
      return { ...point };
    case 90:
      return { x: center.x - dy, y: center.y + dx };
    case 180:
      return { x: center.x - dx, y: center.y - dy };
    case 270:
      return { x: center.x + dy, y: center.y - dx };
  }
}

/** เวกเตอร์หน่วยของทิศ rotation (0 = เหนือ / −y) */
export function directionVector(rotation: Rotation): Point {
  switch (rotation) {
    case 0:
      return { x: 0, y: -1 };
    case 90:
      return { x: 1, y: 0 };
    case 180:
      return { x: 0, y: 1 };
    case 270:
      return { x: -1, y: 0 };
  }
}
