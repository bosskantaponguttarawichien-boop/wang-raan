import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { cafeLayout } from "@/test/fixtures/layouts";
import { ISO_ORIGIN_X, ISO_ORIGIN_Y, buildIsoScene, isoScale, projectPoint } from "./isometric";

describe("Isometric projection (design-system §7.3)", () => {
  it("scale = min(42, 430 / (width + depth))", () => {
    expect(isoScale(8, 6)).toBeCloseTo(430 / 14, 9);
    expect(isoScale(4, 4)).toBe(42);
  });

  it("point(x, y, z) = [300 + (x − y)·s, 58 + (x + y)·s·0.52 − z]", () => {
    expect(projectPoint(0, 0, 0, 10)).toEqual([ISO_ORIGIN_X, ISO_ORIGIN_Y]);
    expect(projectPoint(2, 1, 5, 10)).toEqual([310, 58 + 15.6 - 5]);
  });

  it("ฉาก: พื้น ผนังหลัง 2 ด้าน กริดทุก 1 ม. และจุดทางเข้า", () => {
    const layout = cafeLayout();
    const scene = buildIsoScene(layout);
    expect(scene.walls).toHaveLength(2);
    expect(scene.grid).toHaveLength(7 + 5);
    expect(scene.floor.split(" ")).toHaveLength(4);
    // ทางเข้าผนังใต้ กึ่งกลางที่ x = 1.25 + 0.6
    const [ex, ey] = projectPoint(1.85, 6, 0, scene.scale);
    expect(scene.entrance).toEqual({ x: Math.round(ex * 10) / 10, y: Math.round(ey * 10) / 10 });
  });

  it("วัตถุทุกชิ้นมี polygon และเรียงตาม depth (ไกล → ใกล้)", () => {
    const layout = cafeLayout();
    const scene = buildIsoScene(layout);
    const ids = new Set(scene.polygons.map((p) => p.objectId));
    for (const obj of layout.objects) expect(ids.has(obj.id)).toBe(true);
    const depths = scene.polygons.map((p) => p.depth);
    expect(depths).toEqual([...depths].sort((a, b) => a - b));
    // เงาวาดก่อนทุกชิ้นส่วนของวัตถุเดียวกัน (อยู่ใต้ชิ้นงานเสมอ)
    for (const obj of layout.objects) {
      const own = scene.polygons.filter((p) => p.objectId === obj.id);
      expect(own[0]!.opacity).toBe(0.13);
      expect(own.slice(1).every((p) => p.opacity === undefined)).toBe(true);
    }
  });

  it("ใช้จานสีตาม design-system §2.4", () => {
    const fills = new Set(buildIsoScene(cafeLayout()).polygons.map((p) => p.fill));
    for (const color of ["#d8e3ff", "#f7d9ad", "#e5ecf5", "#e4ebf5", "#eff4fa"]) expect(fills.has(color)).toBe(true);
  });

  it.each([0, 90, 180, 270] as const)("พนักพิงเก้าอี้อยู่ด้านหลังเสมอ (rotation %s°)", (rotation) => {
    const chair = { id: "c", type: "chair" as const, tableId: "t", x: 2, y: 2, width: 0.5, depth: 0.5, rotation };
    const layout = { ...cafeLayout(), objects: [chair] };
    const backTop = buildIsoScene(layout).polygons.filter((p) => p.fill === "#e9bf86");
    expect(backTop).toHaveLength(1);
  });

  it("viewBox ครอบทั้งฉาก แม้ร้านยาวมาก (30 × 2 ม.)", () => {
    const scene = buildIsoScene({ ...cafeLayout(), width: 30, depth: 2, objects: [] });
    const [minX, , w] = scene.viewBox.split(" ").map(Number);
    const xs = scene.floor.split(" ").map((p) => Number(p.split(",")[0]));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(minX!);
    expect(Math.max(...xs)).toBeLessThanOrEqual(minX! + w!);
  });

  it("ไม่มีทางเข้า → ไม่มีจุดทางเข้า", () => {
    expect(buildIsoScene({ ...cafeLayout(), entrance: null }).entrance).toBeNull();
  });

  it("ไม่ใช้ WebGL / Three.js", () => {
    const source = readFileSync(resolve(__dirname, "isometric.ts"), "utf8");
    expect(source).not.toMatch(/from\s+["'](three|@react-three)[^"']*["']|getContext\s*\(|WebGLRenderingContext/);
  });
});
