/**
 * ทำทางเดินบนกริดให้เป็นทางที่คนเดินจริง — Pure TypeScript (ใช้ได้ทั้ง Worker และฝั่งภาพ)
 *
 * ทางจาก flow field ผ่านกลางช่องกริด 0.25 ม. ทีละช่องแบบ 8 ทิศ จึง
 * - หักมุมทีละ 45° (ตัวละครหันซ้ายขวาไปมา) — แก้ด้วย string pulling: ตัดจุดกลางทางที่มองเห็นกันได้ตรง ๆ
 * - กลางช่องห่างขอบเฟอร์นิเจอร์แค่ 0.125 ม. แต่ตัวคนกว้างราว 0.2 ม. จากแกนกลาง จึงเดินเฉียดจนทะลุโต๊ะ —
 *   แก้ด้วยการดันจุดกลางทางออกจากเฟอร์นิเจอร์ให้ได้ BODY_CLEARANCE เท่าที่ทางว่างพอ
 *
 * จุดแรกและจุดสุดท้ายไม่ขยับเสมอ (จุดยืนทำงาน/เก้าอี้/ประตูต้องตรงกับการจำลอง)
 * ใช้เฉพาะเส้นทางที่แสดงบนจอ ไม่เปลี่ยนเวลาหรือผลจำลอง
 */
import type { Point } from "../layout/types";
import { CELL_FREE, type OccupancyGrid } from "./occupancy-grid";

/** ระยะจากแกนกลางตัวถึงขอบเฟอร์นิเจอร์ที่ต้องการ (ม.) — ไหล่กว้างราว 0.4 ม. */
export const BODY_CLEARANCE = 0.2;
/** ทางตรงที่ตัดมุมต้องห่างเฟอร์นิเจอร์อย่างน้อยเท่านี้ (ม.) — เท่ากับกลางช่องกริดเดิมโดยประมาณ */
export const MIN_SEGMENT_CLEARANCE = 0.12;
/** ระยะสุ่มตรวจตามแนวทางตรง (ม.) */
const SAMPLE_STEP = 0.05;
/** มองหาเฟอร์นิเจอร์รอบจุดไม่เกินกี่ช่อง */
const SEARCH_CELLS = 2;

export interface PathRefiner {
  /** ระยะจากจุดถึงช่องที่ถูกกันที่ใกล้ที่สุด (Infinity = ไม่มีในรัศมีที่ตรวจ) */
  clearance(p: Point): number;
  /** เดินตรงจาก a ไป b ได้โดยไม่เฉียดเฟอร์นิเจอร์ */
  segmentClear(a: Point, b: Point): boolean;
  /** ดันจุดออกจากเฟอร์นิเจอร์ให้ได้ BODY_CLEARANCE เท่าที่ทำได้โดยไม่เข้าใกล้สิ่งอื่นมากขึ้น */
  nudge(p: Point): Point;
}

export function createPathRefiner(grid: OccupancyGrid): PathRefiner {
  const s = grid.cellSize;
  const blocked = (col: number, row: number) =>
    col >= 0 && row >= 0 && col < grid.cols && row < grid.rows && grid.cells[row * grid.cols + col] !== CELL_FREE;

  /** ระยะและทิศหนีจากช่องที่ถูกกันที่ใกล้ที่สุด */
  const nearest = (p: Point): { distance: number; away: Point } => {
    const col0 = Math.floor(p.x / s);
    const row0 = Math.floor(p.y / s);
    let best = Number.POSITIVE_INFINITY;
    let away: Point = { x: 0, y: 0 };
    for (let row = row0 - SEARCH_CELLS; row <= row0 + SEARCH_CELLS; row++) {
      for (let col = col0 - SEARCH_CELLS; col <= col0 + SEARCH_CELLS; col++) {
        if (!blocked(col, row)) continue;
        const cx = Math.min(Math.max(p.x, col * s), (col + 1) * s);
        const cy = Math.min(Math.max(p.y, row * s), (row + 1) * s);
        const dx = p.x - cx, dy = p.y - cy;
        const distance = Math.hypot(dx, dy);
        if (distance < best) {
          best = distance;
          away = distance > 1e-9 ? { x: dx / distance, y: dy / distance } : { x: 0, y: 0 };
        }
      }
    }
    return { distance: best, away };
  };

  const insideBlocked = (p: Point) => blocked(Math.floor(p.x / s), Math.floor(p.y / s));

  const refiner: PathRefiner = {
    clearance: (p) => nearest(p).distance,
    segmentClear(a, b) {
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      const steps = Math.max(1, Math.ceil(length / SAMPLE_STEP));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        if (insideBlocked(p) || nearest(p).distance < MIN_SEGMENT_CLEARANCE) return false;
      }
      return true;
    },
    nudge(p) {
      let point = p;
      for (let iteration = 0; iteration < 3; iteration++) {
        const { distance, away } = nearest(point);
        if (!(distance < BODY_CLEARANCE) || (away.x === 0 && away.y === 0)) break;
        const moved = { x: point.x + away.x * (BODY_CLEARANCE - distance), y: point.y + away.y * (BODY_CLEARANCE - distance) };
        // ช่องทางแคบ (มีของทั้งสองข้าง) ดันแล้วไปชิดอีกฝั่ง — คงจุดที่ดีที่สุดที่ได้
        if (insideBlocked(moved) || nearest(moved).distance <= distance + 1e-6) break;
        point = moved;
      }
      return point;
    },
  };
  return refiner;
}

/**
 * ทางเดินที่เรียบแล้ว: ตัดจุดกลางทางที่เดินตรงถึงกันได้ แล้วดันจุดที่เหลือออกจากเฟอร์นิเจอร์
 * จุดแรก/สุดท้ายคงเดิม
 */
export function smoothPath(points: readonly Point[], refiner: PathRefiner): Point[] {
  if (points.length <= 2) return points.slice();
  const pulled: Point[] = [points[0]!];
  let anchor = 0;
  while (anchor < points.length - 1) {
    // ไล่ไปข้างหน้าจนกว่าจะมองไม่เห็นกันตรง ๆ (ทางจาก flow field ไม่ย้อนกลับ จึงไม่ต้องตรวจทุกคู่)
    let next = anchor + 1;
    while (next + 1 < points.length && refiner.segmentClear(points[anchor]!, points[next + 1]!)) next++;
    pulled.push(points[next]!);
    anchor = next;
  }
  const last = pulled.length - 1;
  return pulled.map((point, index) => {
    if (index === 0 || index === last) return point;
    const moved = refiner.nudge(point);
    return refiner.segmentClear(pulled[index - 1]!, moved) && refiner.segmentClear(moved, pulled[index + 1]!) ? moved : point;
  });
}
