import { describe, expect, it } from "vitest";
import { CELL_BLOCKED, CELL_FREE, type OccupancyGrid } from "./occupancy-grid";
import { BODY_CLEARANCE, createPathRefiner, smoothPath } from "./path-smoothing";

/** ห้อง 3×3 ม. (กริด 0.25) มีโต๊ะ 1×1 ม. กลางห้อง */
function grid(): OccupancyGrid {
  const cols = 12, rows = 12;
  const cells = new Uint8Array(cols * rows).fill(CELL_FREE);
  for (let row = 4; row < 8; row++) for (let col = 4; col < 8; col++) cells[row * cols + col] = CELL_BLOCKED;
  return { cellSize: 0.25, cols, rows, cells } as unknown as OccupancyGrid;
}

describe("path-smoothing", () => {
  it("ตัดจุดซิกแซกที่เดินตรงถึงกันได้ และคงจุดแรก/สุดท้าย", () => {
    const refiner = createPathRefiner(grid());
    const stairs = [0, 1, 2, 3].flatMap(i => [{ x: 0.125 + i * 0.25, y: 0.125 + i * 0.25 }, { x: 0.375 + i * 0.25, y: 0.125 + i * 0.25 }]);
    const smoothed = smoothPath(stairs, refiner);
    expect(smoothed[0]).toEqual(stairs[0]);
    expect(smoothed.at(-1)).toEqual(stairs.at(-1));
    expect(smoothed.length).toBeLessThan(stairs.length);
  });

  it("ไม่ตัดผ่านโต๊ะ และดันทางที่เฉียดขอบโต๊ะออกให้ห่างขึ้น", () => {
    const refiner = createPathRefiner(grid());
    // เดินอ้อมมุมโต๊ะตามกลางช่องที่ติดขอบโต๊ะ (ห่าง 0.125 ม.)
    const around = [{ x: 0.875, y: 0.875 }, { x: 0.875, y: 2.125 }, { x: 2.125, y: 2.125 }];
    expect(refiner.segmentClear(around[0]!, around[2]!)).toBe(false);
    const smoothed = smoothPath(around, refiner);
    expect(smoothed).toHaveLength(3);
    expect(refiner.clearance(smoothed[1]!)).toBeGreaterThan(refiner.clearance(around[1]!));
    expect(refiner.clearance(smoothed[1]!)).toBeLessThanOrEqual(BODY_CLEARANCE + 1e-9);
  });
});
