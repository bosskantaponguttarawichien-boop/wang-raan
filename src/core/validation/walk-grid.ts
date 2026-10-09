/**
 * Walk Grid — พื้นฐานของการตรวจ Clearance และ Accessibility (PRD.md §5.5–§5.6)
 *
 * แนวคิด: คนที่เดินผ่านทางกว้าง w เทียบได้กับวงกลมเส้นผ่านศูนย์กลาง w
 * 1. สร้าง lattice ของจุดทุก ๆ GRID_RESOLUTION (0.05 ม.) ครอบพื้นที่ร้าน (รวมแนวผนัง)
 * 2. จุดที่อยู่ในวัตถุ (ขอบปิด) หรืออยู่บนแนวผนัง (ยกเว้นช่องประตู) เป็นสิ่งกีดขวาง
 * 3. Euclidean Distance Transform → ระยะว่าง (clearance) ของทุกจุดถึงสิ่งกีดขวางที่ใกล้ที่สุด
 * 4. จุดที่ clearance ≥ w/2 คือจุดที่ "ศูนย์กลางวงกลมกว้าง w" ยืนได้ แล้ว BFS จากทางเข้า
 *
 * ความแม่นยำ: เมื่อขอบวัตถุและผนังอยู่บน lattice 0.05 ม. (ตำแหน่ง snap 0.25 ม., ขนาด preset,
 * ระยะสอด 0.10 ม.) ระยะที่วัดได้เป็นค่าจริง ทางเดินกว้าง 1.20 ม. ผ่าน และ 1.15 ม. ไม่ผ่าน
 * กรณีขอบไม่อยู่บน lattice ความคลาดเคลื่อนไม่เกิน GRID_RESOLUTION
 *
 * การไหลเข้าจากประตู: จุดเริ่มคือจุดที่วงกลมกว้าง w ยืนได้และแตะช่องประตู
 * (ประตูแคบกว่า w จึงไม่ทำให้ทางเดินด้านในล้มเหลวเอง — ความกว้างประตูมีขอบเขตของตัวเอง)
 */
import { footprint, roundMeters } from "../layout/geometry";
import type { Entrance, Meters, Point, Rect, StoreLayout } from "../layout/types";

export const GRID_RESOLUTION: Meters = 0.05;
const EPSILON = 1e-9;
const FAR = 1e20;

export interface WalkGrid {
  /** ระยะห่างระหว่างจุด lattice (ม.) */
  h: Meters;
  /** จำนวนจุดตามแกน x / y (รวมจุดบนผนังทั้งสองฝั่ง) */
  cols: number;
  rows: number;
  /** 1 = สิ่งกีดขวาง */
  obstacle: Uint8Array;
  /** ระยะถึงสิ่งกีดขวางที่ใกล้ที่สุด (ม.) */
  clearance: Float64Array;
  /** ช่องประตูบนผนัง (null = ไม่มีทางเข้า หรือทางเข้าไม่อยู่บนผนัง) */
  opening: { a: Point; b: Point } | null;
}

/** ส่วนของเส้นตรงช่องประตู (null ถ้าช่องประตูยื่นเลยผนัง) */
export function entranceSegment(
  layout: Pick<StoreLayout, "width" | "depth">,
  entrance: Entrance,
): { a: Point; b: Point } | null {
  const horizontal = entrance.wall === "north" || entrance.wall === "south";
  const length = horizontal ? layout.width : layout.depth;
  const start = entrance.position;
  const end = entrance.position + entrance.width;
  if (start < -EPSILON || end > length + EPSILON || entrance.width <= EPSILON) return null;
  switch (entrance.wall) {
    case "north":
      return { a: { x: start, y: 0 }, b: { x: end, y: 0 } };
    case "south":
      return { a: { x: start, y: layout.depth }, b: { x: end, y: layout.depth } };
    case "west":
      return { a: { x: 0, y: start }, b: { x: 0, y: end } };
    case "east":
      return { a: { x: layout.width, y: start }, b: { x: layout.width, y: end } };
  }
}

/** Felzenszwalb & Huttenlocher 1D squared distance transform (in-place บน buffer) */
function edt1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array): void {
  let k = 0;
  v[0] = 0;
  z[0] = -FAR;
  z[1] = FAR;
  for (let q = 1; q < n; q++) {
    let s = (f[q]! + q * q - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!);
    while (s <= z[k]!) {
      k--;
      s = (f[q]! + q * q - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = FAR;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1]! < q) k++;
    const dq = q - v[k]!;
    d[q] = dq * dq + f[v[k]!]!;
  }
}

/** 2D Euclidean distance transform → ระยะเป็นจำนวนช่อง lattice */
export function distanceTransform(obstacle: Uint8Array, cols: number, rows: number): Float64Array {
  const grid = new Float64Array(cols * rows);
  for (let i = 0; i < grid.length; i++) grid[i] = obstacle[i] ? 0 : FAR;

  const n = Math.max(cols, rows);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);

  for (let x = 0; x < cols; x++) {
    for (let y = 0; y < rows; y++) f[y] = grid[y * cols + x]!;
    edt1d(f, rows, d, v, z);
    for (let y = 0; y < rows; y++) grid[y * cols + x] = d[y]!;
  }
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) f[x] = grid[y * cols + x]!;
    edt1d(f, cols, d, v, z);
    for (let x = 0; x < cols; x++) grid[y * cols + x] = Math.sqrt(d[x]!);
  }
  return grid;
}

/** ช่วง index ของจุด lattice ที่อยู่ใน [from, to] (ขอบปิด) */
function latticeRange(from: Meters, to: Meters, h: Meters, count: number): [number, number] {
  const lo = Math.max(0, Math.ceil(from / h - EPSILON));
  const hi = Math.min(count - 1, Math.floor(to / h + EPSILON));
  return [lo, hi];
}

export function buildWalkGrid(layout: StoreLayout, h: Meters = GRID_RESOLUTION): WalkGrid {
  const cols = Math.round(layout.width / h) + 1;
  const rows = Math.round(layout.depth / h) + 1;
  const obstacle = new Uint8Array(cols * rows);

  // ผนัง: จุดบนขอบ lattice ทั้ง 4 ด้าน
  for (let x = 0; x < cols; x++) {
    obstacle[x] = 1;
    obstacle[(rows - 1) * cols + x] = 1;
  }
  for (let y = 0; y < rows; y++) {
    obstacle[y * cols] = 1;
    obstacle[y * cols + cols - 1] = 1;
  }

  // ช่องประตู: จุดบนผนังที่อยู่ภายในช่องเปิด (ไม่รวมวงกบ) ไม่เป็นสิ่งกีดขวาง
  const opening = layout.entrance ? entranceSegment(layout, layout.entrance) : null;
  if (opening) {
    const [x0, x1] = latticeRange(opening.a.x, opening.b.x, h, cols);
    const [y0, y1] = latticeRange(opening.a.y, opening.b.y, h, rows);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const px = x * h;
        const py = y * h;
        const interior =
          opening.a.x === opening.b.x
            ? py > opening.a.y + EPSILON && py < opening.b.y - EPSILON
            : px > opening.a.x + EPSILON && px < opening.b.x - EPSILON;
        if (interior) obstacle[y * cols + x] = 0;
      }
    }
  }

  for (const obj of layout.objects) {
    const r = footprint(obj);
    const [x0, x1] = latticeRange(r.x, r.x + r.width, h, cols);
    const [y0, y1] = latticeRange(r.y, r.y + r.depth, h, rows);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) obstacle[y * cols + x] = 1;
  }

  const cells = distanceTransform(obstacle, cols, rows);
  const clearance = new Float64Array(cells.length);
  for (let i = 0; i < cells.length; i++) clearance[i] = cells[i]! * h;

  return { h, cols, rows, obstacle, clearance, opening };
}

export function pointToSegmentDistance(p: Point, a: Point, b: Point): Meters {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function pointToRectDistance(p: Point, rect: Rect): Meters {
  const dx = Math.max(rect.x - p.x, 0, p.x - (rect.x + rect.width));
  const dy = Math.max(rect.y - p.y, 0, p.y - (rect.y + rect.depth));
  return Math.hypot(dx, dy);
}

/** วงกลมกว้าง `width` ยืนที่จุด index นี้ได้หรือไม่ */
export function fits(grid: WalkGrid, index: number, width: Meters): boolean {
  return grid.clearance[index]! >= width / 2 - EPSILON;
}

/** จุดเริ่มต้นจากทางเข้า: วงกลมกว้าง `width` ยืนได้และแตะช่องประตู */
export function entranceStartIndices(grid: WalkGrid, width: Meters): number[] {
  const { opening, h, cols, rows } = grid;
  if (!opening) return [];
  const reach = width / 2 + h;
  const [x0, x1] = latticeRange(Math.min(opening.a.x, opening.b.x) - reach, Math.max(opening.a.x, opening.b.x) + reach, h, cols);
  const [y0, y1] = latticeRange(Math.min(opening.a.y, opening.b.y) - reach, Math.max(opening.a.y, opening.b.y) + reach, h, rows);
  const starts: number[] = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const index = y * cols + x;
      if (!fits(grid, index, width)) continue;
      if (pointToSegmentDistance({ x: x * h, y: y * h }, opening.a, opening.b) <= reach + EPSILON) starts.push(index);
    }
  }
  return starts;
}

/** BFS (8 ทิศ) จากทางเข้า บนจุดที่วงกลมกว้าง `width` ยืนได้ → 1 = เดินไปถึงได้ */
export function reachableFromEntrance(grid: WalkGrid, width: Meters): Uint8Array {
  const { cols, rows } = grid;
  const visited = new Uint8Array(cols * rows);
  const queue = new Int32Array(cols * rows);
  let head = 0;
  let tail = 0;
  for (const start of entranceStartIndices(grid, width)) {
    visited[start] = 1;
    queue[tail++] = start;
  }
  while (head < tail) {
    const index = queue[head++]!;
    const x = index % cols;
    const y = (index - x) / cols;
    for (let dy = -1; dy <= 1; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= rows) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        if ((dx === 0 && dy === 0) || nx < 0 || nx >= cols) continue;
        const next = ny * cols + nx;
        if (visited[next] || !fits(grid, next, width)) continue;
        visited[next] = 1;
        queue[tail++] = next;
      }
    }
  }
  return visited;
}

/**
 * จุดที่วงกลมกว้าง `width` ซึ่งเดินมาถึงได้ แตะ rect (ระยะถึง rect ≤ width/2 + h)
 * ใช้เป็น "จุดบริการ" ของวัตถุ
 */
export function touchingReachablePoints(
  grid: WalkGrid,
  reachable: Uint8Array,
  rect: Rect,
  width: Meters,
): Point[] {
  const { h, cols, rows } = grid;
  const reach = width / 2 + h;
  const [x0, x1] = latticeRange(rect.x - reach, rect.x + rect.width + reach, h, cols);
  const [y0, y1] = latticeRange(rect.y - reach, rect.y + rect.depth + reach, h, rows);
  const points: Point[] = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!reachable[y * cols + x]) continue;
      const p = { x: roundMeters(x * h), y: roundMeters(y * h) };
      if (pointToRectDistance(p, rect) <= reach + EPSILON) points.push(p);
    }
  }
  return points;
}
