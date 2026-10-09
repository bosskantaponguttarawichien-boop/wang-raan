import type { LayoutObject, Meters, Point, StoreLayout, Wall } from "@/core/layout";
import { OBJECT_LABEL } from "@/core/validation";

/** แปลงตำแหน่ง pointer (px) เป็นเมตรบนผัง — rect ได้จาก getBoundingClientRect (รวม zoom แล้ว) */
export function clientToMeters(
  client: { x: number; y: number },
  rect: { left: number; top: number; width: number; height: number },
  layout: Pick<StoreLayout, "width" | "depth">,
): Point {
  return {
    x: ((client.x - rect.left) / rect.width) * layout.width,
    y: ((client.y - rect.top) / rect.height) * layout.depth,
  };
}

/** ระยะลาก (px) → เมตร */
export function deltaToMeters(
  dx: number,
  dy: number,
  rect: { width: number; height: number },
  layout: Pick<StoreLayout, "width" | "depth">,
): Point {
  return { x: (dx / rect.width) * layout.width, y: (dy / rect.height) * layout.depth };
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
  north: "ทิศเหนือ (ด้านบน)",
  south: "ทิศใต้ (ด้านล่าง)",
  east: "ทิศตะวันออก (ด้านขวา)",
  west: "ทิศตะวันตก (ด้านซ้าย)",
};

export function objectLabel(obj: LayoutObject): string {
  if (obj.type === "table") return obj.preset === "table-2-seats" ? "โต๊ะ 2 ที่นั่ง" : obj.preset === "table-4-seats" ? "โต๊ะ 4 ที่นั่ง" : "โต๊ะ";
  return OBJECT_LABEL[obj.type];
}

const meters = (v: Meters) => v.toFixed(2);

export function objectAriaLabel(obj: LayoutObject, issue?: string): string {
  const base = `${objectLabel(obj)} ตำแหน่ง x ${meters(obj.x)} ม. y ${meters(obj.y)} ม. หมุน ${obj.rotation} องศา`;
  return issue ? `${base} — ${issue}` : base;
}
