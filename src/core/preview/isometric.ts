/**
 * Isometric scene builder — Pure TypeScript (design-system.md §2.4, §7.3)
 * แปลงผัง 2D เป็นรายการ polygon สำหรับเรนเดอร์ด้วย SVG ล้วน (ไม่ใช้ WebGL / Three.js)
 *
 *   scale = min(42, 430 / (width + depth))
 *   point(x, y, z) = [300 + (x − y)·scale, 58 + (x + y)·scale·0.52 − z]
 *   depth sorting: x + y + w + h + depthOffset (เงา = depth − 0.08)
 *
 * ลุคห้องตัด (cutaway room): ผนังหลัง 2 ด้านสูงและมีความหนา, พื้นมีฐาน (slab), โทนขาว + ส้ม
 */
import { FURNITURE_COLOR_HEX } from "../layout/constants";
import { directionVector, footprint } from "../layout/geometry";
import { chairStyleOf, tableStyleOf } from "../layout/table-set";
import type { Chair, FurnitureColor, LayoutObject, Meters, Rect, StoreLayout } from "../layout/types";

export const ISO_ORIGIN_X = 300;
export const ISO_ORIGIN_Y = 58;
/** ความหนาผนัง (เมตร) และความหนาฐานพื้น (px) */
export const WALL_THICKNESS = 0.2;
export const SLAB_HEIGHT = 10;

/** ความสูงผนัง (px): ราว 2.6 ม. ตาม scale แต่ไม่ต่ำกว่า 72px ให้สูงกว่าครัว (52px) เสมอ */
export function wallHeight(scale: number): number {
  return Math.round(Math.max(72, scale * 2.6));
}

/** จานสี 3 ทิศ [บน, ขวา, หน้า] ตาม design-system.md §2.4 — โทนขาว + ส้ม */
export const ISO_PALETTE = {
  tableTop: ["#ffffff", "#dfe2e8", "#eceef2"],
  tableLeg: ["#f2a46b", "#c8703a", "#de8a50"],
  chairSeat: ["#ff9b52", "#dc6428", "#f07b38"],
  chairLeg: ["#dde0e5", "#aeb3bc", "#c5c9d0"],
  chairBack: ["#ff8d42", "#d45d23", "#ea7232"],
  kitchenTop: ["#ffffff", "#dcdfe5", "#eaecf0"],
  kitchenBody: ["#f3f4f6", "#cfd3da", "#e1e4e9"],
  kitchenCooktop: ["#41464f", "#2b2f36", "#363a42"],
  counterTop: ["#ffffff", "#dee1e7", "#eceef2"],
  counterBody: ["#f8a466", "#d4672c", "#ea8041"],
  counterPos: ["#63c9f2", "#2c8bc0", "#41a5d9"],
  floor: "#fafbfc",
  floorFar: "#f1f3f6",
  grid: "#e6e9ee",
  /** ผนังด้านใน [ตะวันตก (หันขวา), เหนือ (หันหน้า)] — ไล่สี [บน, ล่าง] */
  wallInner: [
    ["#eef0f3", "#e0e3e8"],
    ["#fafbfc", "#eceef2"],
  ],
  wallTop: "#ffffff",
  wallEnd: "#e2e5ea",
  /** ฐานพื้น [หน้า, ขวา] */
  slab: ["#e7e9ed", "#d6d9df"],
  door: "#cfd4dc",
  doorFrame: "#f2a46b",
  doormat: "#f28c45",
  shadow: "#2e3440",
  entrance: "#3b62f4",
} as const;

type Triple = readonly [string, string, string];

/** คูณความสว่างของสี hex (#rrggbb) */
function shade(hex: string, factor: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * factor))).toString(16).padStart(2, "0");
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}

/** จานสี 3 ทิศ [บน, ขวา, หน้า] จากสีเฟอร์นิเจอร์ที่ผู้ใช้เลือก */
export function furnitureTriple(color: FurnitureColor): Triple {
  const base = FURNITURE_COLOR_HEX[color];
  return [base, shade(base, 0.82), shade(base, 0.92)];
}

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
  /** "shadow" = เงาตกกระทบ (เรนเดอร์แบบนุ่มด้วย blur) */
  kind?: "shadow";
}

export interface IsoScene {
  viewBox: string;
  scale: number;
  floor: string;
  /** หน้าด้านในของผนังหลัง [ตะวันตก, เหนือ] */
  walls: string[];
  /** ฝาบนผนังรูปตัว L */
  wallTop: string;
  /** หน้าตัดปลายผนัง [ปลายผนังตะวันตก (หันหน้า), ปลายผนังเหนือ (หันขวา)] */
  wallEnds: string[];
  /** ด้านข้างฐานพื้น [หน้า (y = D), ขวา (x = W)] */
  slab: string[];
  /** รอยต่อผนัง-พื้น (polyline) สำหรับเงา ambient occlusion */
  seam: string;
  /** ช่องประตูบนผนัง (ทางเข้าผนังเหนือ/ตะวันตก) */
  door: string | null;
  /** พรมหน้าทางเข้าบนพื้น */
  doormat: string | null;
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
    // ไม่มีเส้นขอบ — แยกหน้าด้วยแสงเงาของสีล้วน; stroke สีเดียวกับหน้า 0.5px ปิดรอยต่อ anti-alias ระหว่างหน้า
    push(id, depth, [b, c, bc, ab], { fill: colors[1], stroke: colors[1], strokeWidth: 0.5 });
    push(id, depth + 0.002, [d, c, bc, dc], { fill: colors[2], stroke: colors[2], strokeWidth: 0.5 });
    push(id, depth + 0.004, [a, b, c, d], { fill: colors[0], stroke: colors[0], strokeWidth: 0.5 });
  }

  function shadow(id: string, r: Rect, base: number) {
    const { x, y, width: w, depth: h } = r;
    push(id, base - 0.08, [p(x, y), p(x + w, y), p(x + w, y + h), p(x, y + h)], {
      fill: ISO_PALETTE.shadow,
      opacity: 0.16,
      offsetY: 4,
      kind: "shadow",
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

  /**
   * ทรงกระบอก (ฐานวงรีใน rect) z0 → z1: ผิวข้างครึ่งที่หันเข้าหาผู้ชม (มุม −45°…135°) + หน้าบน
   */
  function cylinder(id: string, r: Rect, z0: number, z1: number, colors: Triple, depth: number) {
    const cx = r.x + r.width / 2;
    const cy = r.y + r.depth / 2;
    const at = (deg: number, z: number) => {
      const a = (deg * Math.PI) / 180;
      return p(cx + (Math.cos(a) * r.width) / 2, cy + (Math.sin(a) * r.depth) / 2, z);
    };
    const steps = 24;
    const front = Array.from({ length: steps / 2 + 1 }, (_, i) => -45 + (180 * i) / (steps / 2));
    push(id, depth, [...front.map((d) => at(d, z1)), ...[...front].reverse().map((d) => at(d, z0))], {
      fill: colors[1],
      stroke: colors[1],
      strokeWidth: 0.5,
    });
    push(id, depth + 0.004, Array.from({ length: steps }, (_, i) => at((360 * i) / steps, z1)), {
      fill: colors[0],
      stroke: colors[2],
      strokeWidth: 0.5,
    });
  }

  /** ขาเดี่ยวกลาง + ฐานแบน */
  function pedestal(id: string, r: Rect, size: number, height: number, colors: Triple, depth: number) {
    const cx = r.x + r.width / 2;
    const cy = r.y + r.depth / 2;
    const foot = Math.min(r.width, r.depth) * 0.55;
    cylinder(id, { x: cx - foot / 2, y: cy - foot / 2, width: foot, depth: foot }, 0, 1.5, colors, depth - 0.01);
    prism(id, { x: cx - size / 2, y: cy - size / 2, width: size, depth: size }, 1.5, height, colors, depth);
  }

  /** แถบพนักพิงด้านหลังของเก้าอี้ (ตรงข้ามทิศด้านหน้า) — แผ่นบาง `t` ม. ร่นจากขอบข้าง `side` ม. */
  function chairBackRect(chair: Chair, r: Rect, t = 0.06, side = 0.06): Rect {
    const f = directionVector(chair.rotation);
    const e = 0.04;
    if (f.y > 0) return { x: r.x + side, y: r.y + e, width: r.width - 2 * side, depth: t };
    if (f.y < 0) return { x: r.x + side, y: r.y + r.depth - t - e, width: r.width - 2 * side, depth: t };
    if (f.x > 0) return { x: r.x + e, y: r.y + side, width: t, depth: r.depth - 2 * side };
    return { x: r.x + r.width - t - e, y: r.y + side, width: t, depth: r.depth - 2 * side };
  }

  /** เสาเล็ก 2 ต้นที่ปลายพนักพิง (ต่อเบาะกับพนักพิง เว้นช่องให้เห็นว่าเป็นแผ่นแยก) */
  function backPosts(back: Rect, size: number): Rect[] {
    const alongX = back.width >= back.depth;
    const inner = 0.03;
    const cy = back.y + (back.depth - size) / 2;
    const cx = back.x + (back.width - size) / 2;
    return alongX
      ? [
          { x: back.x + inner, y: cy, width: size, depth: size },
          { x: back.x + back.width - size - inner, y: cy, width: size, depth: size },
        ]
      : [
          { x: cx, y: back.y + inner, width: size, depth: size },
          { x: cx, y: back.y + back.depth - size - inner, width: size, depth: size },
        ];
  }

  /** ขนาดชิ้นเรียว (เมตร) แต่บนจอไม่บางกว่า `minPx` px ให้ยังมองเห็นในร้านใหญ่ */
  const slim = (m: Meters, minPx: number) => Math.max(m, minPx / scale);

  function drawObject(obj: LayoutObject) {
    const r = footprint(obj);
    const base = r.x + r.y + r.width + r.depth;
    shadow(obj.id, r, base);
    switch (obj.type) {
      case "table": {
        // ท็อปบาง 3px ยื่นคลุมขา + ขาเรียว (ระดับท็อปคงที่ z = 34) — ผังที่ไม่มี style คงจานสีเดิม
        const style = tableStyleOf(obj);
        const topColors = obj.style ? furnitureTriple(style.color) : ISO_PALETTE.tableTop;
        const round = style.shape === "round";
        const leg = Math.min(slim(0.05, 1.2), r.width * 0.2, r.depth * 0.2);
        if (style.legStyle === "pedestal") {
          pedestal(obj.id, r, leg * 1.6, 31, ISO_PALETTE.tableLeg, base - 0.06);
        } else {
          // โต๊ะกลม: ขาร่นเข้าในวงกลม
          legs(obj.id, r, leg, round ? Math.min(r.width, r.depth) * 0.2 : 0.08, 31, ISO_PALETTE.tableLeg, base - 0.06);
        }
        if (round) cylinder(obj.id, r, 31, 34, topColors, base + 0.08);
        else prism(obj.id, r, 31, 34, topColors, base + 0.08);
        break;
      }
      case "chair": {
        // ขาโลหะเรียว + เบาะบาง 3px (ระดับนั่ง z = 18) + พนักพิงแผ่นบางบนเสา 2 ต้น
        const style = chairStyleOf(obj);
        const seatColors = obj.style ? furnitureTriple(style.color) : ISO_PALETTE.chairSeat;
        const backColors = obj.style ? furnitureTriple(style.color) : ISO_PALETTE.chairBack;
        const leg = Math.min(slim(0.035, 1), r.width * 0.2, r.depth * 0.2);
        if (style.legStyle === "pedestal") pedestal(obj.id, r, leg * 1.6, 15, ISO_PALETTE.chairLeg, base - 0.06);
        else legs(obj.id, r, leg, 0.06, 15, ISO_PALETTE.chairLeg, base - 0.06);
        if (style.shape === "round") cylinder(obj.id, inset(r, 0.04), 15, 18, seatColors, base + 0.01);
        else prism(obj.id, inset(r, 0.04), 15, 18, seatColors, base + 0.01);
        // สตูล: ไม่มีพนักพิง
        if (style.kind === "stool") break;
        // พนักพิงฝั่งไกล (เหนือ/ตะวันตก) วาดก่อนเบาะ ฝั่งใกล้ (ใต้/ตะวันออก) วาดหลังเบาะ
        const f = directionVector(obj.rotation);
        const backIsNear = f.x < 0 || f.y < 0;
        const backDepth = base + (backIsNear ? 0.03 : -0.03);
        const back = style.shape === "round" ? chairBackRect(obj, r, 0.06, Math.min(r.width, r.depth) * 0.22) : chairBackRect(obj, r);
        backPosts(back, leg).forEach((post, i) => prism(obj.id, post, 18, 22, ISO_PALETTE.chairLeg, backDepth - 0.002 + i * 0.001));
        prism(obj.id, back, 22, 38, backColors, backDepth);
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
  const H = wallHeight(scale);
  const T = WALL_THICKNESS;
  const floor = poly([p(0, 0), p(W, 0), p(W, D), p(0, D)]);
  // ผนังหลัง 2 ด้าน (ตะวันตก x = 0 และเหนือ y = 0) ซึ่งอยู่ไกลสายตา — หนา T ม. ยื่นออกนอกห้อง
  const walls = [
    poly([p(0, 0), p(0, D), p(0, D, H), p(0, 0, H)]),
    poly([p(0, 0), p(W, 0), p(W, 0, H), p(0, 0, H)]),
  ];
  const wallTop = poly([p(-T, -T, H), p(W, -T, H), p(W, 0, H), p(0, 0, H), p(0, D, H), p(-T, D, H)]);
  const wallEnds = [
    poly([p(-T, D, 0), p(0, D, 0), p(0, D, H), p(-T, D, H)]),
    poly([p(W, -T, 0), p(W, 0, 0), p(W, 0, H), p(W, -T, H)]),
  ];
  // ฐานพื้นรองรับทั้งห้องรวมใต้ผนัง
  const slab = [
    poly([p(-T, D, 0), p(W, D, 0), p(W, D, -SLAB_HEIGHT), p(-T, D, -SLAB_HEIGHT)]),
    poly([p(W, -T, 0), p(W, D, 0), p(W, D, -SLAB_HEIGHT), p(W, -T, -SLAB_HEIGHT)]),
  ];
  const seam = poly([p(0, D), p(0, 0), p(W, 0)]);

  const grid: IsoScene["grid"] = [];
  const line = (a: [number, number], b: [number, number]) =>
    grid.push({ x1: round(a[0]), y1: round(a[1]), x2: round(b[0]), y2: round(b[1]) });
  for (let x = 1; x < W; x++) line(p(x, 0), p(x, D));
  for (let y = 1; y < D; y++) line(p(0, y), p(W, y));

  let entrance: IsoScene["entrance"] = null;
  let door: string | null = null;
  let doormat: string | null = null;
  if (layout.entrance) {
    const e = layout.entrance;
    const a = e.position;
    const b = e.position + e.width;
    const mid = (a + b) / 2;
    const mat = 0.45;
    const doorH = Math.round(H * 0.8);
    const [ex, ey] =
      e.wall === "north" ? p(mid, 0) : e.wall === "south" ? p(mid, D) : e.wall === "west" ? p(0, mid) : p(W, mid);
    entrance = { x: round(ex), y: round(ey) };
    if (e.wall === "north") {
      door = poly([p(a, 0), p(b, 0), p(b, 0, doorH), p(a, 0, doorH)]);
      doormat = poly([p(a, 0), p(b, 0), p(b, mat), p(a, mat)]);
    } else if (e.wall === "west") {
      door = poly([p(0, a), p(0, b), p(0, b, doorH), p(0, a, doorH)]);
      doormat = poly([p(0, a), p(0, b), p(mat, b), p(mat, a)]);
    } else if (e.wall === "south") {
      doormat = poly([p(a, D - mat), p(b, D - mat), p(b, D), p(a, D)]);
    } else {
      doormat = poly([p(W - mat, a), p(W, a), p(W, b), p(W - mat, b)]);
    }
  }

  // viewBox ครอบทั้งพื้น ฐาน ผนัง และวัตถุที่สูงที่สุด (+ ป้ายทางเข้า)
  const top = Math.max(H, 60);
  const corners = [
    p(-T, -T, top),
    p(W, -T, top),
    p(-T, D, top),
    p(-T, D, -SLAB_HEIGHT),
    p(W, D, -SLAB_HEIGHT),
    p(W, -T, -SLAB_HEIGHT),
  ];
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
    wallTop,
    wallEnds,
    slab,
    seam,
    door,
    doormat,
    grid,
    polygons,
    entrance,
  };
}

/** polygon ของสี่เหลี่ยมบนพื้น (z = 0) — ใช้วาดแผ่นไฮไลต์ใต้ชิ้นงานที่เลือก */
export function isoFloorRect(r: Rect, scale: number, pad: Meters = 0): string {
  const x0 = r.x - pad;
  const y0 = r.y - pad;
  const x1 = r.x + r.width + pad;
  const y1 = r.y + r.depth + pad;
  return [projectPoint(x0, y0, 0, scale), projectPoint(x1, y0, 0, scale), projectPoint(x1, y1, 0, scale), projectPoint(x0, y1, 0, scale)]
    .map(([x, y]) => `${round(x)},${round(y)}`)
    .join(" ");
}

/** คำนวณตำแหน่ง anchor เป็นเปอร์เซ็นต์ใน viewBox ของฉาก สำหรับวาง Floating Toolbar (feat-058) */
export function getIsoAnchor(
  x: Meters,
  y: Meters,
  scene: IsoScene,
  z = 32,
): { xPct: number; yPct: number } {
  const [minX = 0, minY = 0, vbWidth = 1, vbHeight = 1] = scene.viewBox.split(" ").map(Number);
  const [px, py] = projectPoint(x, y, z, scene.scale);
  const xPct = Math.min(85, Math.max(15, (((px - minX) / vbWidth) * 100)));
  const yPct = Math.min(82, Math.max(6, (((py - minY) / vbHeight) * 100)));
  return { xPct: round(xPct), yPct: round(yPct) };
}
