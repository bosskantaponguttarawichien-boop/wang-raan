/**
 * Isometric scene builder — Pure TypeScript (design-system.md §2.4, §7.3)
 * แปลงผัง 2D เป็นรายการ polygon สำหรับเรนเดอร์ด้วย SVG ล้วน (ไม่ใช้ WebGL / Three.js)
 *
 *   scale = min(42, 430 / (width + depth))
 *   point(x, y, z) = [300 + (x − y)·scale, 58 + (x + y)·scale·0.52 − z]
 *   depth sorting: x + y + w + h + depthOffset (เงา = depth − 0.08)
 */
import { directionVector, footprint } from "../layout/geometry";
import type { Chair, LayoutObject, Meters, Rect, StoreLayout } from "../layout/types";

export const ISO_ORIGIN_X = 300;
export const ISO_ORIGIN_Y = 58;
const WALL_HEIGHT = 24;
const STROKE = "#879ab5";

/** จานสี 3 ทิศ [บน, ขวา, หน้า] ตาม design-system.md §2.4 */
export const ISO_PALETTE = {
  tableTop: ["#d8e3ff", "#adc2f5", "#bfd0fb"],
  tableLeg: ["#9fb7ed", "#7894d3", "#8ea7df"],
  chairSeat: ["#f7d9ad", "#dcad70", "#efc58b"],
  chairLeg: ["#cb955b", "#aa7847", "#bd8851"],
  chairBack: ["#e9bf86", "#c99057", "#dba96b"],
  kitchenTop: ["#e5ecf5", "#aabaca", "#c2d0df"],
  kitchenBody: ["#b9c9db", "#98aaba", "#acbdce"],
  kitchenCooktop: ["#c4d3e5", "#98aaba", "#acbdce"],
  counterTop: ["#e4ebf5", "#afc0d5", "#cbd7e6"],
  counterBody: ["#d2ddeb", "#9eafc5", "#bdcadb"],
  counterPos: ["#eff4fa", "#aabbd0", "#cad5e2"],
  floor: "#fdfefe",
  grid: "#e1e8f2",
  wall: "#eaf0fa",
  wallStroke: "#b5c3d6",
  shadow: "#526f9f",
  entrance: "#3b62f4",
} as const;

type Triple = readonly [string, string, string];

export interface IsoPolygon {
  objectId: string | null;
  depth: number;
  points: string;
  fill: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  /** เลื่อนแกน y (px) — ใช้กับเงา */
  offsetY?: number;
}

export interface IsoScene {
  viewBox: string;
  scale: number;
  floor: string;
  walls: string[];
  grid: Array<{ x1: number; y1: number; x2: number; y2: number }>;
  /** เรียงตามลำดับการวาดแล้ว (ไกล → ใกล้) */
  polygons: IsoPolygon[];
  entrance: { x: number; y: number } | null;
}

const round = (v: number) => Math.round(v * 10) / 10;

export function isoScale(width: Meters, depth: Meters): number {
  return Math.min(42, 430 / (width + depth));
}

export function projectPoint(x: Meters, y: Meters, z: number, scale: number): [number, number] {
  return [ISO_ORIGIN_X + (x - y) * scale, ISO_ORIGIN_Y + (x + y) * scale * 0.52 - z];
}

export function buildIsoScene(layout: StoreLayout): IsoScene {
  const scale = isoScale(layout.width, layout.depth);
  const p = (x: number, y: number, z = 0) => projectPoint(x, y, z, scale);
  const poly = (pts: Array<[number, number]>) => pts.map(([x, y]) => `${round(x)},${round(y)}`).join(" ");
  const polygons: IsoPolygon[] = [];
  const push = (objectId: string | null, depth: number, pts: Array<[number, number]>, extra: Partial<IsoPolygon>) =>
    polygons.push({ objectId, depth, points: poly(pts), fill: "#fff", ...extra });

  /**
   * ปริซึมสี่เหลี่ยม: ฐานที่ z0 สูงขึ้นไปถึง z1 วาด 3 หน้า (ขวา, หน้า, บน)
   * `depth` คือค่าเรียงลำดับของชิ้นส่วน = depth ฐานของวัตถุ (จาก footprint) + offset ภายในวัตถุ
   * (ห้ามคำนวณจาก rect ของชิ้นส่วนที่ inset เพราะจะได้ค่าน้อยกว่าเงาและถูกเงาทับ)
   */
  function prism(id: string, r: Rect, z0: number, z1: number, colors: Triple, depth: number) {
    const { x, y, width: w, depth: h } = r;
    const a = p(x, y, z1);
    const b = p(x + w, y, z1);
    const c = p(x + w, y + h, z1);
    const d = p(x, y + h, z1);
    const ab = p(x + w, y, z0);
    const bc = p(x + w, y + h, z0);
    const dc = p(x, y + h, z0);
    push(id, depth, [b, c, bc, ab], { fill: colors[1], stroke: STROKE, strokeWidth: 0.65 });
    push(id, depth + 0.002, [d, c, bc, dc], { fill: colors[2], stroke: STROKE, strokeWidth: 0.65 });
    push(id, depth + 0.004, [a, b, c, d], { fill: colors[0], stroke: STROKE, strokeWidth: 0.75 });
  }

  function shadow(id: string, r: Rect, base: number) {
    const { x, y, width: w, depth: h } = r;
    push(id, base - 0.08, [p(x, y), p(x + w, y), p(x + w, y + h), p(x, y + h)], {
      fill: ISO_PALETTE.shadow,
      opacity: 0.13,
      offsetY: 5,
    });
  }

  const inset = (r: Rect, d: number): Rect => ({ x: r.x + d, y: r.y + d, width: r.width - 2 * d, depth: r.depth - 2 * d });

  function legs(id: string, r: Rect, size: number, margin: number, height: number, colors: Triple, depth: number) {
    const { x, y, width: w, depth: h } = r;
    for (const [lx, ly] of [
      [x + margin, y + margin],
      [x + w - size - margin, y + margin],
      [x + margin, y + h - size - margin],
      [x + w - size - margin, y + h - size - margin],
    ] as const) {
      // ขาที่อยู่ใกล้สายตา (x + y มาก) วาดทีหลัง
      prism(id, { x: lx, y: ly, width: size, depth: size }, 0, height, colors, depth + (lx + ly - x - y) * 0.001);
    }
  }

  /** แถบพนักพิงด้านหลังของเก้าอี้ (ตรงข้ามทิศด้านหน้า) */
  function chairBackRect(chair: Chair, r: Rect): Rect {
    const f = directionVector(chair.rotation);
    const t = 0.16;
    if (f.y > 0) return { x: r.x + 0.06, y: r.y + 0.05, width: r.width - 0.12, depth: r.depth * t };
    if (f.y < 0) return { x: r.x + 0.06, y: r.y + r.depth * (1 - t) - 0.05, width: r.width - 0.12, depth: r.depth * t };
    if (f.x > 0) return { x: r.x + 0.05, y: r.y + 0.06, width: r.width * t, depth: r.depth - 0.12 };
    return { x: r.x + r.width * (1 - t) - 0.05, y: r.y + 0.06, width: r.width * t, depth: r.depth - 0.12 };
  }

  function drawObject(obj: LayoutObject) {
    const r = footprint(obj);
    const base = r.x + r.y + r.width + r.depth;
    shadow(obj.id, r, base);
    switch (obj.type) {
      case "table": {
        const leg = Math.min(0.13, r.width * 0.13, r.depth * 0.13);
        legs(obj.id, r, leg, 0.09, 29, ISO_PALETTE.tableLeg, base - 0.06);
        prism(obj.id, inset(r, 0.035), 29, 34, ISO_PALETTE.tableTop, base + 0.08);
        break;
      }
      case "chair": {
        const leg = Math.min(0.08, r.width * 0.16, r.depth * 0.16);
        legs(obj.id, r, leg, 0.07, 14, ISO_PALETTE.chairLeg, base - 0.06);
        prism(obj.id, inset(r, 0.06), 13, 18, ISO_PALETTE.chairSeat, base + 0.01);
        // พนักพิงฝั่งไกล (เหนือ/ตะวันตก) วาดก่อนเบาะ ฝั่งใกล้ (ใต้/ตะวันออก) วาดหลังเบาะ
        const f = directionVector(obj.rotation);
        const backIsNear = f.x < 0 || f.y < 0;
        prism(obj.id, chairBackRect(obj, r), 18, 38, ISO_PALETTE.chairBack, base + (backIsNear ? 0.03 : -0.03));
        break;
      }
      case "kitchen": {
        prism(obj.id, inset(r, 0.04), 0, 45, ISO_PALETTE.kitchenBody, base + 0.01);
        prism(obj.id, r, 45, 50, ISO_PALETTE.kitchenTop, base + 0.08);
        // เตา 2 หัวบนท็อปครัว
        const size = Math.min(0.35, r.width * 0.3, r.depth * 0.4);
        const cy = r.y + (r.depth - size) / 2;
        prism(obj.id, { x: r.x + r.width * 0.2, y: cy, width: size, depth: size }, 50, 52, ISO_PALETTE.kitchenCooktop, base + 0.12);
        prism(obj.id, { x: r.x + r.width * 0.8 - size, y: cy, width: size, depth: size }, 50, 52, ISO_PALETTE.kitchenCooktop, base + 0.13);
        break;
      }
      case "counter": {
        prism(obj.id, inset(r, 0.04), 0, 37, ISO_PALETTE.counterBody, base + 0.01);
        prism(obj.id, r, 37, 42, ISO_PALETTE.counterTop, base + 0.08);
        prism(
          obj.id,
          { x: r.x + r.width * 0.68, y: r.y + r.depth * 0.2, width: r.width * 0.16, depth: r.depth * 0.23 },
          42,
          49,
          ISO_PALETTE.counterPos,
          base + 0.16,
        );
        break;
      }
    }
  }

  layout.objects.forEach(drawObject);
  polygons.sort((a, b) => a.depth - b.depth);

  const { width: W, depth: D } = layout;
  const floor = poly([p(0, 0), p(W, 0), p(W, D), p(0, D)]);
  // ผนังหลัง 2 ด้าน (เหนือ y = 0 และตะวันตก x = 0) ซึ่งอยู่ไกลสายตาในมุม isometric นี้
  const walls = [
    poly([p(0, 0), p(W, 0), p(W, 0, WALL_HEIGHT), p(0, 0, WALL_HEIGHT)]),
    poly([p(0, 0), p(0, D), p(0, D, WALL_HEIGHT), p(0, 0, WALL_HEIGHT)]),
  ];
  const grid: IsoScene["grid"] = [];
  const line = (a: [number, number], b: [number, number]) =>
    grid.push({ x1: round(a[0]), y1: round(a[1]), x2: round(b[0]), y2: round(b[1]) });
  for (let x = 1; x < W; x++) line(p(x, 0), p(x, D));
  for (let y = 1; y < D; y++) line(p(0, y), p(W, y));

  let entrance: IsoScene["entrance"] = null;
  if (layout.entrance) {
    const e = layout.entrance;
    const mid = e.position + e.width / 2;
    const [ex, ey] =
      e.wall === "north" ? p(mid, 0) : e.wall === "south" ? p(mid, D) : e.wall === "west" ? p(0, mid) : p(W, mid);
    entrance = { x: round(ex), y: round(ey) };
  }

  // viewBox ครอบทั้งพื้น ผนัง และวัตถุที่สูงที่สุด (+ ป้ายทางเข้า)
  const corners = [p(0, 0), p(W, 0), p(W, D), p(0, D), p(0, 0, 60), p(W, 0, 60), p(0, D, 60)];
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  const pad = 24;
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const width = Math.max(...xs) + pad - minX;
  const height = Math.max(...ys) + pad + 8 - minY;
  return {
    viewBox: `${round(minX)} ${round(minY)} ${round(width)} ${round(height)}`,
    scale,
    floor,
    walls,
    grid,
    polygons,
    entrance,
  };
}
