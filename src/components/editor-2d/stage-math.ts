import { footprint, type LayoutObject, type Meters, type Point, type StoreLayout, type Wall } from "@/core/layout";
import { pointFromView, rectToView, vectorFromView, viewSize, type ViewRotation } from "@/core/preview/view-rotation";
import { OBJECT_LABEL } from "@/core/validation";

/**
 * แปลงตำแหน่ง pointer (px) เป็นเมตรบนผัง — rect ได้จาก getBoundingClientRect (รวม zoom และการหมุนมุมมองแล้ว
 * = กรอบของผังตามที่เห็นบนจอ) จึงคิดเป็นพิกัดมุมมองก่อน แล้วหมุนกลับเป็นพิกัดผังจริง
 */
export function clientToMeters(
  client: { x: number; y: number },
  rect: { left: number; top: number; width: number; height: number },
  layout: Pick<StoreLayout, "width" | "depth">,
  rotation: ViewRotation = 0,
): Point {
  const view = viewSize(layout, rotation);
  const point = {
    x: ((client.x - rect.left) / rect.width) * view.width,
    y: ((client.y - rect.top) / rect.height) * view.depth,
  };
  return pointFromView(point, layout, rotation);
}

/** ระยะลาก (px บนจอ) → เวกเตอร์เมตรบนผังจริง */
export function deltaToMeters(
  dx: number,
  dy: number,
  rect: { width: number; height: number },
  layout: Pick<StoreLayout, "width" | "depth">,
  rotation: ViewRotation = 0,
): Point {
  const view = viewSize(layout, rotation);
  return vectorFromView({ x: (dx / rect.width) * view.width, y: (dy / rect.height) * view.depth }, rotation);
}

export function percent(value: Meters, total: Meters): string {
  return `${(value / total) * 100}%`;
}

/** หาผนังที่ใกล้จุดที่สุด และตำแหน่งประตูให้กึ่งกลางอยู่ที่จุดนั้น */
export function nearestWallPosition(
  point: Point,
  layout: Pick<StoreLayout, "width" | "depth">,
  entranceWidth: Meters,
): { wall: Wall; position: Meters } {
  const distances: Array<[Wall, number]> = [
    ["north", Math.abs(point.y)],
    ["south", Math.abs(layout.depth - point.y)],
    ["west", Math.abs(point.x)],
    ["east", Math.abs(layout.width - point.x)],
  ];
  const [wall] = distances.reduce((best, d) => (d[1] < best[1] ? d : best));
  const along = wall === "north" || wall === "south" ? point.x : point.y;
  return { wall, position: along - entranceWidth / 2 };
}

export const WALL_LABEL: Record<Wall, string> = {
  north: "ด้านบน",
  south: "ด้านล่าง",
  east: "ด้านขวา",
  west: "ด้านซ้าย",
};

export function objectLabel(obj: LayoutObject): string {
  if (obj.type === "table") return obj.chairIds.length > 0 ? `โต๊ะ ${obj.chairIds.length} ที่นั่ง` : "โต๊ะ";
  return OBJECT_LABEL[obj.type];
}

const meters = (v: Meters) => v.toFixed(2);

export function objectAriaLabel(obj: LayoutObject, issue?: string): string {
  const base = `${objectLabel(obj)} ตำแหน่ง x ${meters(obj.x)} ม. y ${meters(obj.y)} ม. หมุน ${obj.rotation} องศา`;
  return issue ? `${base} — ${issue}` : base;
}

/** ระยะเผื่อรอบวัตถุที่หลุดนอกร้าน (เมตร) ให้ขอบวัตถุไม่ชิดขอบจอพอดีและยังจับลากได้ */
export const OUTSIDE_PADDING: Meters = 0.3;

export interface OutsideMargins {
  left: Meters;
  top: Meters;
  right: Meters;
  bottom: Meters;
}

/**
 * วัตถุยื่นออกนอกกรอบร้านเท่าไรในแต่ละด้านของจอ (เมตร ในพิกัดมุมมอง) — ใช้เป็น margin รอบกรอบร้าน
 *
 * วัตถุวางแบบ absolute เทียบกับกรอบร้าน ส่วนที่ยื่นไปทางซ้าย/บนของจอเลื่อน scroll ไปดูไม่ได้เลย
 * (เบราว์เซอร์ไม่ให้ scroll ไปทางพิกัดติดลบ) ผู้ใช้จึงเห็น error "ล้นออกนอกผนัง" โดยหาวัตถุไม่เจอ
 * การเว้น margin เท่าระยะที่ยื่นทำให้วัตถุทุกชิ้นอยู่ในพื้นที่ที่เลื่อนไปถึงได้
 */
export function outsideMargins(
  objects: readonly LayoutObject[],
  layout: Pick<StoreLayout, "width" | "depth">,
  rotation: ViewRotation = 0,
): OutsideMargins {
  const view = viewSize(layout, rotation);
  const margins: OutsideMargins = { left: 0, top: 0, right: 0, bottom: 0 };
  for (const obj of objects) {
    const r = rectToView(footprint(obj), layout, rotation);
    margins.left = Math.max(margins.left, -r.x);
    margins.top = Math.max(margins.top, -r.y);
    margins.right = Math.max(margins.right, r.x + r.width - view.width);
    margins.bottom = Math.max(margins.bottom, r.y + r.depth - view.depth);
  }
  const pad = (v: Meters) => (v > 1e-6 ? v + OUTSIDE_PADDING : 0);
  return { left: pad(margins.left), top: pad(margins.top), right: pad(margins.right), bottom: pad(margins.bottom) };
}
