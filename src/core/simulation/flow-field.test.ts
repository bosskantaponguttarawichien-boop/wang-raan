import { describe, expect, it } from "vitest";
import { CELL_BLOCKED, CELL_FREE, computeFlowField, tracePath, type OccupancyGrid } from "./index";

/** สร้างกริดจากภาพ ASCII: '#' = สิ่งกีดขวาง */
function gridFrom(rows: string[]): OccupancyGrid {
  const cells = new Uint8Array(rows.join("").split("").map((c) => (c === "#" ? CELL_BLOCKED : CELL_FREE)));
  return { cellSize: 0.25, cols: rows[0]!.length, rows: rows.length, cells, entranceCells: [], freeCount: 0 };
}
const idx = (g: OccupancyGrid, col: number, row: number) => row * g.cols + col;

describe("Flow field (Dijkstra)", () => {
  it("พื้นที่โล่ง: ระยะทาง = octile distance (ทแยง √2)", () => {
    const g = gridFrom(Array(8).fill("........"));
    const f = computeFlowField(g, [idx(g, 0, 0)]);
    expect(f.distance[idx(g, 7, 0)]).toBeCloseTo(7, 5);
    expect(f.distance[idx(g, 7, 7)]).toBeCloseTo(7 * Math.SQRT2, 5);
    expect(f.distance[idx(g, 7, 3)]).toBeCloseTo(4 + 3 * Math.SQRT2, 5);
  });

  it("กำแพงบังทำให้ต้องอ้อม และเส้นทางไม่ผ่านช่อง BLOCKED เลย", () => {
    const g = gridFrom([
      "........",
      "######..",
      "........",
    ]);
    const f = computeFlowField(g, [idx(g, 0, 0)]);
    const path = tracePath(f, idx(g, 0, 2));
    expect(path.length).toBeGreaterThan(3);
    for (const cell of path) expect(g.cells[cell]).toBe(CELL_FREE);
    // ทุกก้าวเป็นช่องติดกัน (8 ทิศ)
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1]!;
      const b = path[i]!;
      expect(Math.abs((a % g.cols) - (b % g.cols))).toBeLessThanOrEqual(1);
      expect(Math.abs(Math.floor(a / g.cols) - Math.floor(b / g.cols))).toBeLessThanOrEqual(1);
    }
  });

  it("ห้ามตัดมุมผ่านช่องทแยงระหว่างสิ่งกีดขวางสองชิ้น", () => {
    const g = gridFrom([
      ".#",
      "#.",
    ]);
    const f = computeFlowField(g, [idx(g, 0, 0)]);
    expect(f.distance[idx(g, 1, 1)]).toBe(Infinity);
    expect(tracePath(f, idx(g, 1, 1))).toEqual([]);
  });

  it("หลายเป้าหมาย: ไปเป้าหมายที่ใกล้ที่สุด; เป้าหมายที่เป็นสิ่งกีดขวางถูกข้าม", () => {
    const g = gridFrom(["#.........."]);
    const f = computeFlowField(g, [0, idx(g, 10, 0), -5, 999]);
    expect(f.distance[idx(g, 8, 0)]).toBe(2);
    expect(f.distance[0]).toBe(Infinity);
    expect(tracePath(f, idx(g, 8, 0))).toEqual([8, 9, 10]);
  });
});
