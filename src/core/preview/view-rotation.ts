/**
 * การหมุนมุมมองผัง (View Rotation) — Pure TypeScript
 *
 * หมุนเฉพาะ "มุมมอง" ทีละ 90° ตามเข็มนาฬิกา (บนจอ แกน y ชี้ลง) — ไม่แก้ข้อมูลผังจริงและไม่เข้า Undo
 *   rotation 0   : ผนังเหนืออยู่บน (ค่าเริ่มต้น)
 *   rotation 90  : ผนังตะวันตกขึ้นไปอยู่บน (ผังหมุนตามเข็ม 90°)
 *   rotation 180 : ผนังใต้อยู่บน
 *   rotation 270 : ผนังตะวันออกอยู่บน
 *
 * 1 ขั้น (90°) แปลงพิกัดผัง (x, y) ในห้อง W × D → พิกัดมุมมอง (D − y, x) ในห้อง D × W
 * มุมมอง 3D (cutaway) วาดผนัง 2 ด้านที่อยู่ "บน" และ "ซ้าย" ของมุมมอง — ด้านไกลกล้องเสมอ
 */
import { footprint } from "../layout/geometry";
import type { LayoutObject, Meters, Point, Rect, Rotation, StoreLayout, Wall } from "../layout/types";

export type ViewRotation = 0 | 90 | 180 | 270;

export const VIEW_ROTATIONS: readonly ViewRotation[] = [0, 90, 180, 270];

/** หมุนมุมมอง +90° (ตามเข็ม) หรือ −90° (ทวนเข็ม) */
export function rotateViewBy(rotation: ViewRotation, direction: 1 | -1): ViewRotation {
  return (((rotation + direction * 90) % 360) + 360) % 360 as ViewRotation;
}

const steps = (rotation: ViewRotation) => rotation / 90;

/** ผนังของผังจริงหลังหมุนมุมมอง 1 ขั้น (เหนือ → ขวา) */
const WALL_STEP: Record<Wall, Wall> = { north: "east", east: "south", south: "west", west: "north" };

/** ผนังของผังจริง → ตำแหน่งที่เห็นในมุมมอง */
export function wallToView(wall: Wall, rotation: ViewRotation): Wall {
  let w = wall;
  for (let i = 0; i < steps(rotation); i++) w = WALL_STEP[w];
  return w;
}

/** ผนังที่เห็นในมุมมอง → ผนังของผังจริง */
export function wallFromView(viewWall: Wall, rotation: ViewRotation): Wall {
  return (["north", "east", "south", "west"] as const).find((w) => wallToView(w, rotation) === viewWall)!;
}

/** ผนัง 2 ด้านที่ไกลกล้อง (บน, ซ้ายของมุมมอง) — มุมมอง 3D วาดผนังเฉพาะ 2 ด้านนี้ ให้เห็นภายในร้าน */
export function farWalls(rotation: ViewRotation): [Wall, Wall] {
  return [wallFromView("north", rotation), wallFromView("west", rotation)];
}

/** ขนาดห้องในมุมมอง (หมุน 90°/270° สลับกว้าง-ลึก) */
export function viewSize(layout: Pick<StoreLayout, "width" | "depth">, rotation: ViewRotation) {
  return steps(rotation) % 2 === 0
    ? { width: layout.width, depth: layout.depth }
    : { width: layout.depth, depth: layout.width };
}

/** พิกัดผังจริง → พิกัดมุมมอง */
export function pointToView(p: Point, layout: Pick<StoreLayout, "width" | "depth">, rotation: ViewRotation): Point {
  let { x, y } = p;
  let { width: w, depth: d } = layout;
  for (let i = 0; i < steps(rotation); i++) {
    [x, y] = [d - y, x];
    [w, d] = [d, w];
  }
  return { x, y };
}

/** พิกัดมุมมอง → พิกัดผังจริง */
export function pointFromView(p: Point, layout: Pick<StoreLayout, "width" | "depth">, rotation: ViewRotation): Point {
  const inverse = ((360 - rotation) % 360) as ViewRotation;
  return pointToView(p, viewSize(layout, rotation), inverse);
}

/** เวกเตอร์ (ระยะเลื่อน) ในมุมมอง → เวกเตอร์บนผังจริง — ใช้กับการลากและปุ่มลูกศร */
export function vectorFromView(v: Point, rotation: ViewRotation): Point {
  let { x, y } = v;
  for (let i = 0; i < steps(rotation); i++) [x, y] = [y, -x];
  return { x: x + 0, y: y + 0 };
}

const ARROW_KEYS: Record<string, Point> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

/** ปุ่มลูกศร (ทิศบนจอ) ระยะ `step` ม. → เวกเตอร์บนผังจริง (null = ไม่ใช่ปุ่มลูกศร) */
export function arrowKeyToPlan(key: string, step: Meters, rotation: ViewRotation): Point | null {
  const v = ARROW_KEYS[key];
  return v ? vectorFromView({ x: v.x * step, y: v.y * step }, rotation) : null;
}

/** เวกเตอร์บนผังจริง → เวกเตอร์ในมุมมอง */
export function vectorToView(v: Point, rotation: ViewRotation): Point {
  let { x, y } = v;
  for (let i = 0; i < steps(rotation); i++) [x, y] = [-y, x];
  return { x: x + 0, y: y + 0 };
}

/** affine [a, b, c, d, e, f] ของ pointToView: x' = a·x + c·y + e, y' = b·x + d·y + f (รูปแบบ SVG matrix) */
export function viewMatrix(
  layout: Pick<StoreLayout, "width" | "depth">,
  rotation: ViewRotation,
): [number, number, number, number, number, number] {
  const o = pointToView({ x: 0, y: 0 }, layout, rotation);
  const ex = vectorToView({ x: 1, y: 0 }, rotation);
  const ey = vectorToView({ x: 0, y: 1 }, rotation);
  return [ex.x, ex.y, ey.x, ey.y, o.x, o.y];
}

/** สี่เหลี่ยมบนผังจริง → สี่เหลี่ยมในมุมมอง (ใช้วาง Floating Toolbar ที่ไม่หมุนตามผัง) */
export function rectToView(r: Rect, layout: Pick<StoreLayout, "width" | "depth">, rotation: ViewRotation): Rect {
  const a = pointToView({ x: r.x, y: r.y }, layout, rotation);
  const b = pointToView({ x: r.x + r.width, y: r.y + r.depth }, layout, rotation);
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), depth: Math.abs(b.y - a.y) };
}

function doorToView<T extends { wall: Wall; position: Meters; width: Meters }>(
  door: T,
  layout: Pick<StoreLayout, "width" | "depth">,
  rotation: ViewRotation,
): T {
  const wall = wallToView(door.wall, rotation);
  const along = (p: Point) => (wall === "north" || wall === "south" ? p.x : p.y);
  const at = (t: Meters): Point =>
    door.wall === "north"
      ? { x: t, y: 0 }
      : door.wall === "south"
        ? { x: t, y: layout.depth }
        : door.wall === "west"
          ? { x: 0, y: t }
          : { x: layout.width, y: t };
  const a = along(pointToView(at(door.position), layout, rotation));
  const b = along(pointToView(at(door.position + door.width), layout, rotation));
  return { ...door, wall, position: Math.min(a, b) };
}

/**
 * ผังที่หมุนไปอยู่ในพิกัดมุมมองแล้ว (id เดิมทั้งหมด) — ใช้เฉพาะการแสดงผล ห้ามนำไปบันทึกหรือตรวจผัง
 * footprint ใหม่ = สี่เหลี่ยมเดิมที่หมุนแล้ว; rotation ของวัตถุบวกเพิ่มตามมุมมอง (ขนาดก่อนหมุนคงเดิม)
 */
export function rotateLayoutForView(layout: StoreLayout, rotation: ViewRotation): StoreLayout {
  if (rotation === 0) return layout;
  const size = viewSize(layout, rotation);
  const objects = layout.objects.map((obj): LayoutObject => {
    const r = rectToView(footprint(obj), layout, rotation);
    return {
      ...obj,
      x: r.x,
      y: r.y,
      rotation: ((obj.rotation + rotation) % 360) as Rotation,
    } as LayoutObject;
  });
  return {
    ...layout,
    ...size,
    entrance: layout.entrance ? doorToView(layout.entrance, layout, rotation) : null,
    kitchenDoor: layout.kitchenDoor ? doorToView(layout.kitchenDoor, layout, rotation) : null,
    objects,
  };
}
