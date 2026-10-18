import { describe, expect, it } from "vitest";
import { cafeLayout } from "@/test/fixtures/layouts";
import { footprint } from "../layout/geometry";
import {
  arrowKeyToPlan,
  farWalls,
  pointFromView,
  pointToView,
  rotateLayoutForView,
  rotateViewBy,
  vectorFromView,
  vectorToView,
  viewMatrix,
  viewSize,
  wallFromView,
  wallToView,
  VIEW_ROTATIONS,
} from "./view-rotation";

const room = { width: 8, depth: 6 };

describe("View rotation (หมุนมุมมองผัง)", () => {
  it("หมุนวนทีละ 90° ทั้งสองทิศ", () => {
    expect(rotateViewBy(0, 1)).toBe(90);
    expect(rotateViewBy(270, 1)).toBe(0);
    expect(rotateViewBy(0, -1)).toBe(270);
  });

  it("หมุน 90° ตามเข็ม: ผนังตะวันตกขึ้นบน ผนังใต้ไปซ้าย และสลับกว้าง-ลึก", () => {
    expect(wallFromView("north", 90)).toBe("west");
    expect(wallFromView("west", 90)).toBe("south");
    expect(wallToView("north", 90)).toBe("east");
    expect(viewSize(room, 90)).toEqual({ width: 6, depth: 8 });
    expect(pointToView({ x: 0, y: 0 }, room, 90)).toEqual({ x: 6, y: 0 });
  });

  it("ผนังไกลกล้อง (ที่ 3D ต้องวาด) เปลี่ยนตามมุมมอง", () => {
    expect(farWalls(0)).toEqual(["north", "west"]);
    expect(farWalls(90)).toEqual(["west", "south"]);
    expect(farWalls(180)).toEqual(["south", "east"]);
    expect(farWalls(270)).toEqual(["east", "north"]);
  });

  it("แปลงจุดและเวกเตอร์ไป-กลับได้ค่าเดิมทุกมุม", () => {
    for (const r of VIEW_ROTATIONS) {
      const p = { x: 1.25, y: 4.5 };
      expect(pointFromView(pointToView(p, room, r), room, r)).toEqual(p);
      expect(vectorFromView(vectorToView({ x: 0.25, y: -1 }, r), r)).toEqual({ x: 0.25, y: -1 });
      const [a, b, c, d, e, f] = viewMatrix(room, r);
      expect({ x: a * p.x + c * p.y + e, y: b * p.x + d * p.y + f }).toEqual(pointToView(p, room, r));
    }
    // ลากไปทางขวาของจอเมื่อหมุน 90° = เลื่อนไปทางเหนือ (−y) บนผังจริง
    expect(vectorFromView({ x: 1, y: 0 }, 90)).toEqual({ x: 0, y: -1 });
    expect(arrowKeyToPlan("ArrowRight", 0.25, 90)).toEqual({ x: 0, y: -0.25 });
    expect(arrowKeyToPlan("ArrowUp", 1, 0)).toEqual({ x: 0, y: -1 });
    expect(arrowKeyToPlan("r", 1, 0)).toBeNull();
  });

  it("หมุนผังเพื่อแสดงผล: footprint อยู่ในห้องใหม่ ประตูย้ายผนังตาม และ id เดิม", () => {
    const layout = cafeLayout();
    for (const r of VIEW_ROTATIONS) {
      const view = rotateLayoutForView(layout, r);
      expect(view.objects.map((o) => o.id)).toEqual(layout.objects.map((o) => o.id));
      for (const [i, obj] of view.objects.entries()) {
        const fp = footprint(obj);
        const orig = footprint(layout.objects[i]!);
        expect(fp.x).toBeGreaterThanOrEqual(0);
        expect(fp.y).toBeGreaterThanOrEqual(0);
        expect(fp.x + fp.width).toBeLessThanOrEqual(view.width + 1e-9);
        expect(fp.y + fp.depth).toBeLessThanOrEqual(view.depth + 1e-9);
        expect(fp.width * fp.depth).toBeCloseTo(orig.width * orig.depth, 9);
        // มุมบนซ้ายของ footprint ในมุมมอง = มุมหนึ่งของ footprint เดิมที่หมุนแล้ว
        const back = pointFromView({ x: fp.x + fp.width / 2, y: fp.y + fp.depth / 2 }, layout, r);
        expect(back.x).toBeCloseTo(orig.x + orig.width / 2, 9);
        expect(back.y).toBeCloseTo(orig.y + orig.depth / 2, 9);
      }
      expect(view.entrance?.wall).toBe(wallToView(layout.entrance!.wall, r));
    }
    // ทางเข้าผนังใต้ x 1.25–2.45 → หมุน 90° อยู่ผนังตะวันตก y 1.25–2.45
    const rotated = rotateLayoutForView(layout, 90);
    expect(rotated.entrance).toMatchObject({ wall: "west", position: 1.25 });
    expect(rotateLayoutForView(layout, 0)).toBe(layout);
  });
});
