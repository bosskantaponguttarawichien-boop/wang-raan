/**
 * Flow-Field Pathfinding บน Occupancy Grid (architecture.md §6)
 * Dijkstra จากชุดช่องเป้าหมาย → ระยะทางสั้นสุดของทุกช่อง และช่องถัดไปที่ควรเดินไป
 * - เดินได้ 8 ทิศ (ทแยงมีต้นทุน √2) แต่ห้ามตัดมุมสิ่งกีดขวาง (ทั้งสองช่องตั้งฉากต้องว่าง)
 * - ช่อง BLOCKED เดินผ่านไม่ได้
 */
import { CELL_FREE, type OccupancyGrid } from "./occupancy-grid";

export interface FlowField {
  /** ระยะทาง (หน่วยช่อง) ถึงเป้าหมายที่ใกล้สุด; Infinity = ไปไม่ถึง */
  distance: Float64Array;
  /** index ช่องถัดไปบนเส้นทางสั้นสุด; -1 = อยู่ที่เป้าหมายแล้ว หรือไปไม่ถึง */
  next: Int32Array;
}

const DIRECTIONS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

/** Binary min-heap ของ (priority, index) */
class MinHeap {
  private priorities: number[] = [];
  private items: number[] = [];

  get size() {
    return this.items.length;
  }

  push(priority: number, item: number) {
    this.priorities.push(priority);
    this.items.push(item);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.priorities[parent]! <= priority) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): [number, number] {
    const top: [number, number] = [this.priorities[0]!, this.items[0]!];
    const lastP = this.priorities.pop()!;
    const lastI = this.items.pop()!;
    if (this.items.length > 0) {
      this.priorities[0] = lastP;
      this.items[0] = lastI;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.items.length && this.priorities[l]! < this.priorities[m]!) m = l;
        if (r < this.items.length && this.priorities[r]! < this.priorities[m]!) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }

  private swap(a: number, b: number) {
    [this.priorities[a], this.priorities[b]] = [this.priorities[b]!, this.priorities[a]!];
    [this.items[a], this.items[b]] = [this.items[b]!, this.items[a]!];
  }
}

export function isPassable(grid: OccupancyGrid, col: number, row: number): boolean {
  return col >= 0 && row >= 0 && col < grid.cols && row < grid.rows && grid.cells[row * grid.cols + col] === CELL_FREE;
}

/** เดินจาก (col,row) ไป (col+dc,row+dr) ได้ไหม — ทแยงต้องไม่ตัดมุม */
export function canStep(grid: OccupancyGrid, col: number, row: number, dc: number, dr: number): boolean {
  if (!isPassable(grid, col + dc, row + dr)) return false;
  if (dc !== 0 && dr !== 0) return isPassable(grid, col + dc, row) && isPassable(grid, col, row + dr);
  return true;
}

export function computeFlowField(grid: OccupancyGrid, goals: Iterable<number>): FlowField {
  const total = grid.cols * grid.rows;
  const distance = new Float64Array(total).fill(Infinity);
  const next = new Int32Array(total).fill(-1);
  const heap = new MinHeap();

  for (const goal of goals) {
    if (goal < 0 || goal >= total || grid.cells[goal] !== CELL_FREE) continue;
    distance[goal] = 0;
    heap.push(0, goal);
  }

  while (heap.size > 0) {
    const [d, index] = heap.pop();
    if (d > distance[index]!) continue;
    const col = index % grid.cols;
    const row = (index - col) / grid.cols;
    for (const [dc, dr, cost] of DIRECTIONS) {
      // ขยายจากเป้าหมายออกไป: ช่องเพื่อนบ้านต้องเดินกลับมายังช่องนี้ได้ (กราฟสมมาตร)
      if (!canStep(grid, col, row, dc, dr)) continue;
      const neighbor = (row + dr) * grid.cols + (col + dc);
      const nd = d + cost;
      if (nd < distance[neighbor]! - 1e-6) {
        distance[neighbor] = nd;
        next[neighbor] = index;
        heap.push(nd, neighbor);
      }
    }
  }
  return { distance, next };
}

/** เส้นทางจากช่องเริ่มต้นไปเป้าหมาย (รวมช่องเริ่มและช่องเป้าหมาย) หรือ [] ถ้าไปไม่ถึง */
export function tracePath(field: FlowField, start: number, maxSteps = 100_000): number[] {
  if (!Number.isFinite(field.distance[start]!)) return [];
  const path = [start];
  let current = start;
  while (field.distance[current]! > 0 && path.length < maxSteps) {
    current = field.next[current]!;
    path.push(current);
  }
  return path;
}
