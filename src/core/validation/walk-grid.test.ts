import { describe, expect, it } from "vitest";
import type { Entrance, StoreLayout } from "@/core/layout";
import { block } from "@/test/fixtures/layouts";
import {
  buildWalkGrid,
  distanceTransform,
  entranceSegment,
  entranceStartIndices,
  fits,
  pointToRectDistance,
  pointToSegmentDistance,
  reachableFromEntrance,
} from "./index";

function emptyRoom(entrance: Entrance | null, width = 4, depth = 4): StoreLayout {
  return { id: "l", version: 1, units: "m", width, depth, entrance, objects: [] };
}

const south: Entrance = { id: "e", wall: "south", position: 1.4, width: 1.2 };

describe("distanceTransform", () => {
  it("ตรงกับ brute force บนกริดสุ่ม", () => {
    const cols = 17;
    const rows = 11;
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const obstacle = new Uint8Array(cols * rows).map(() => (random() < 0.12 ? 1 : 0));
    obstacle[0] = 1;
    const result = distanceTransform(obstacle, cols, rows);
    for (let i = 0; i < obstacle.length; i++) {
      let best = Infinity;
      for (let j = 0; j < obstacle.length; j++) {
        if (!obstacle[j]) continue;
        best = Math.min(best, Math.hypot((i % cols) - (j % cols), Math.floor(i / cols) - Math.floor(j / cols)));
      }
      expect(result[i]).toBeCloseTo(best, 9);
    }
  });
});

describe("buildWalkGrid", () => {
  it("ระยะว่างกลางห้องเปล่า 4 × 4 = 2.00 ม. (ถึงผนัง)", () => {
    const grid = buildWalkGrid(emptyRoom(south));
    const center = 40 * grid.cols + 40;
    expect(grid.cols).toBe(81);
    expect(grid.clearance[center]).toBeCloseTo(2, 9);
  });

  it("ช่องประตูบนผนังไม่เป็นสิ่งกีดขวาง แต่วงกบเป็น", () => {
    const grid = buildWalkGrid(emptyRoom(south));
    const row = grid.rows - 1;
    const at = (x: number) => grid.obstacle[row * grid.cols + Math.round(x / grid.h)];
    expect(at(1.4)).toBe(1); // วงกบ
    expect(at(2.0)).toBe(0); // กลางประตู
    expect(at(2.6)).toBe(1);
    // จุดกลางประตูห่างจากวงกบ 0.60 ม.
    expect(grid.clearance[row * grid.cols + 40]).toBeCloseTo(0.6, 9);
  });

  it("วัตถุใช้ขอบปิด และวัตถุนอกห้องไม่ทำให้พัง", () => {
    const layout = { ...emptyRoom(south), objects: [block("k", 1, 1, 1, 1), block("far", 20, 20, 1, 1)] };
    const grid = buildWalkGrid(layout);
    expect(grid.obstacle[20 * grid.cols + 20]).toBe(1); // มุม (1,1)
    expect(grid.obstacle[40 * grid.cols + 40]).toBe(1); // มุม (2,2)
    expect(grid.clearance[30 * grid.cols + 50]).toBeCloseTo(0.5, 9); // (2.5, 1.5) ห่างขอบขวาของ k 0.5
  });
});

describe("entranceSegment", () => {
  const room = { width: 8, depth: 6 };
  it.each([
    ["north", { a: { x: 1, y: 0 }, b: { x: 2.2, y: 0 } }],
    ["south", { a: { x: 1, y: 6 }, b: { x: 2.2, y: 6 } }],
    ["west", { a: { x: 0, y: 1 }, b: { x: 0, y: 2.2 } }],
    ["east", { a: { x: 8, y: 1 }, b: { x: 8, y: 2.2 } }],
  ] as const)("%s", (wall, expected) => {
    const segment = entranceSegment(room, { id: "e", wall, position: 1, width: 1.2 })!;
    expect(segment.a).toEqual(expected.a);
    expect(segment.b.x).toBeCloseTo(expected.b.x, 9);
    expect(segment.b.y).toBeCloseTo(expected.b.y, 9);
  });

  it("ช่องประตูยื่นเลยผนัง หรือกว้าง 0 → null", () => {
    expect(entranceSegment(room, { id: "e", wall: "west", position: 5.5, width: 1.2 })).toBeNull();
    expect(entranceSegment(room, { id: "e", wall: "north", position: -0.5, width: 1.2 })).toBeNull();
    expect(entranceSegment(room, { id: "e", wall: "north", position: 1, width: 0 })).toBeNull();
  });
});

describe("reachability", () => {
  it("ไม่มีทางเข้า → ไม่มีจุดเริ่มและเดินไปไหนไม่ได้", () => {
    const grid = buildWalkGrid(emptyRoom(null));
    expect(entranceStartIndices(grid, 0.6)).toEqual([]);
    expect(reachableFromEntrance(grid, 0.6).some((v) => v === 1)).toBe(false);
  });

  it("ห้องเปล่า: วงกลม 1.20 ม. เดินจากประตูได้ทั่วห้องยกเว้นแนวชิดผนัง", () => {
    const grid = buildWalkGrid(emptyRoom(south));
    const reach = reachableFromEntrance(grid, 1.2);
    const idx = (x: number, y: number) => Math.round(y / grid.h) * grid.cols + Math.round(x / grid.h);
    expect(reach[idx(2, 2)]).toBe(1);
    expect(reach[idx(0.6, 0.6)]).toBe(1);
    expect(reach[idx(0.55, 2)]).toBe(0);
    expect(fits(grid, idx(0.6, 2), 1.2)).toBe(true);
  });

  it("ประตูแคบกว่าความกว้างทางเดิน ยังเริ่มเดินได้เมื่อด้านในกว้างพอ", () => {
    const grid = buildWalkGrid(emptyRoom({ ...south, width: 0.6 }));
    expect(entranceStartIndices(grid, 1.2).length).toBeGreaterThan(0);
  });
});

describe("ระยะทางเรขาคณิต", () => {
  it("pointToSegmentDistance", () => {
    expect(pointToSegmentDistance({ x: 1, y: 1 }, { x: 0, y: 0 }, { x: 2, y: 0 })).toBe(1);
    expect(pointToSegmentDistance({ x: 3, y: 0 }, { x: 0, y: 0 }, { x: 2, y: 0 })).toBe(1);
    expect(pointToSegmentDistance({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(5);
  });

  it("pointToRectDistance", () => {
    const rect = { x: 1, y: 1, width: 2, depth: 1 };
    expect(pointToRectDistance({ x: 2, y: 1.5 }, rect)).toBe(0);
    expect(pointToRectDistance({ x: 4, y: 1.5 }, rect)).toBe(1);
    expect(pointToRectDistance({ x: 0, y: 0 }, rect)).toBeCloseTo(Math.SQRT2, 9);
  });
});
