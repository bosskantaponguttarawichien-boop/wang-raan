/**
 * Occupancy Grid 0.25 ม. สำหรับ P2 Simulation (architecture.md §6)
 * ช่องที่มีวัตถุทับ (พื้นที่ทับ > 0) = ไม่ว่าง; ช่องแถวติดผนังตรงช่องประตู = ช่องทางเข้า
 */
import { GRID_STEP } from "../layout/constants";
import { footprint } from "../layout/geometry";
import type { Meters, StoreLayout } from "../layout/types";
import { entranceSegment } from "../validation/walk-grid";

export const SIM_CELL_SIZE: Meters = GRID_STEP;
export const CELL_FREE = 0;
export const CELL_BLOCKED = 1;

const EPSILON = 1e-9;

export interface OccupancyGrid {
  cellSize: Meters;
  cols: number;
  rows: number;
  /** row-major: index = row * cols + col */
  cells: Uint8Array;
  /** index ของช่องว่างที่ติดช่องประตู (จุดเกิด/ออกของลูกค้า) */
  entranceCells: number[];
  freeCount: number;
}

export function buildOccupancyGrid(layout: StoreLayout, cellSize: Meters = SIM_CELL_SIZE): OccupancyGrid {
  const cols = Math.ceil(layout.width / cellSize - EPSILON);
  const rows = Math.ceil(layout.depth / cellSize - EPSILON);
  const cells = new Uint8Array(cols * rows);

  for (const obj of layout.objects) {
    const r = footprint(obj);
    const c0 = Math.max(0, Math.floor(r.x / cellSize + EPSILON));
    const c1 = Math.min(cols - 1, Math.ceil((r.x + r.width) / cellSize - EPSILON) - 1);
    const r0 = Math.max(0, Math.floor(r.y / cellSize + EPSILON));
    const r1 = Math.min(rows - 1, Math.ceil((r.y + r.depth) / cellSize - EPSILON) - 1);
    for (let row = r0; row <= r1; row++) for (let col = c0; col <= c1; col++) cells[row * cols + col] = CELL_BLOCKED;
  }

  const entranceCells: number[] = [];
  const opening = layout.entrance ? entranceSegment(layout, layout.entrance) : null;
  if (opening) {
    const horizontal = opening.a.y === opening.b.y;
    const from = horizontal ? opening.a.x : opening.a.y;
    const to = horizontal ? opening.b.x : opening.b.y;
    const first = Math.max(0, Math.floor(from / cellSize + EPSILON));
    const last = Math.min((horizontal ? cols : rows) - 1, Math.ceil(to / cellSize - EPSILON) - 1);
    for (let k = first; k <= last; k++) {
      const index = horizontal
        ? (opening.a.y === 0 ? 0 : rows - 1) * cols + k
        : k * cols + (opening.a.x === 0 ? 0 : cols - 1);
      if (cells[index] === CELL_FREE) entranceCells.push(index);
    }
  }

  let freeCount = 0;
  for (const cell of cells) if (cell === CELL_FREE) freeCount++;
  return { cellSize, cols, rows, cells, entranceCells, freeCount };
}
