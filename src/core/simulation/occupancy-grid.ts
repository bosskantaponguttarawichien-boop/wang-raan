/**
 * Occupancy Grid 0.25 ม. สำหรับ P2 Simulation (architecture.md §6)
 * ช่องที่มีวัตถุทับ (พื้นที่ทับ > 0) = ไม่ว่าง; ช่องแถวติดผนังตรงช่องประตู = ช่องทางเข้า
 * ช่องแถวติดผนังตรงประตูครัว = จุดรับอาหารของพนักงาน (simulation แบบร้านอาหาร)
 * จุดยืนพนักงานหลังเคาน์เตอร์ก็ไม่ว่าง (ช่องที่จุดกลางอยู่ในพื้นที่ยืน หรือช่องที่พนักงานยืนอยู่) ลูกค้าจะได้ไม่เดินทะลุ
 */
import { GRID_STEP } from "../layout/constants";
import { EPSILON } from "../layout/epsilon";
import { footprint } from "../layout/geometry";
import type { Meters, StoreLayout, WallDoor } from "../layout/types";
import { STAFF_RADIUS, staffSpots } from "../preview/staff-spots";
import { entranceSegment } from "../validation/walk-grid";

export const SIM_CELL_SIZE: Meters = GRID_STEP;
export const CELL_FREE = 0;
export const CELL_BLOCKED = 1;

export interface OccupancyGrid {
  cellSize: Meters;
  cols: number;
  rows: number;
  /** row-major: index = row * cols + col */
  cells: Uint8Array;
  /** index ของช่องว่างที่ติดช่องประตู (จุดเกิด/ออกของลูกค้า) */
  entranceCells: number[];
  /** index ของช่องว่างที่ติดประตูครัว (ว่างเมื่อไม่มีประตูครัว) */
  kitchenCells: number[];
  freeCount: number;
}

/** ช่องว่างแถวติดผนังตรงช่องประตู */
function doorCells(layout: StoreLayout, door: WallDoor | null, cells: Uint8Array, cols: number, rows: number, cellSize: Meters): number[] {
  const result: number[] = [];
  const opening = door ? entranceSegment(layout, door) : null;
  if (!opening) return result;
  const horizontal = opening.a.y === opening.b.y;
  const from = horizontal ? opening.a.x : opening.a.y;
  const to = horizontal ? opening.b.x : opening.b.y;
  const first = Math.max(0, Math.floor(from / cellSize + EPSILON));
  const last = Math.min((horizontal ? cols : rows) - 1, Math.ceil(to / cellSize - EPSILON) - 1);
  for (let k = first; k <= last; k++) {
    const index = horizontal
      ? (opening.a.y === 0 ? 0 : rows - 1) * cols + k
      : k * cols + (opening.a.x === 0 ? 0 : cols - 1);
    if (cells[index] === CELL_FREE) result.push(index);
  }
  return result;
}

/** blockStaffSpots: false = กันเฉพาะวัตถุ (ทางเดินของพนักงานเอง ที่ต้องเดินออกจากหลังเคาน์เตอร์) */
export function buildOccupancyGrid(
  layout: StoreLayout,
  cellSize: Meters = SIM_CELL_SIZE,
  { blockStaffSpots = true }: { blockStaffSpots?: boolean } = {},
): OccupancyGrid {
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

  for (const { position } of blockStaffSpots ? staffSpots(layout) : []) {
    const own = Math.min(rows - 1, Math.floor(position.y / cellSize)) * cols + Math.min(cols - 1, Math.floor(position.x / cellSize));
    cells[own] = CELL_BLOCKED;
    const c0 = Math.max(0, Math.ceil((position.x - STAFF_RADIUS) / cellSize - 0.5));
    const c1 = Math.min(cols - 1, Math.floor((position.x + STAFF_RADIUS) / cellSize - 0.5));
    const r0 = Math.max(0, Math.ceil((position.y - STAFF_RADIUS) / cellSize - 0.5));
    const r1 = Math.min(rows - 1, Math.floor((position.y + STAFF_RADIUS) / cellSize - 0.5));
    for (let row = r0; row <= r1; row++) for (let col = c0; col <= c1; col++) cells[row * cols + col] = CELL_BLOCKED;
  }

  const entranceCells = doorCells(layout, layout.entrance, cells, cols, rows, cellSize);
  const kitchenCells = doorCells(layout, layout.kitchenDoor, cells, cols, rows, cellSize);

  let freeCount = 0;
  for (const cell of cells) if (cell === CELL_FREE) freeCount++;
  return { cellSize, cols, rows, cells, entranceCells, kitchenCells, freeCount };
}
