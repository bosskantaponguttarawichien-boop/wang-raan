import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { cafeLayout } from "@/test/fixtures/layouts";
import { ISO_ORIGIN_X, ISO_ORIGIN_Y, SLAB_HEIGHT, buildIsoScene, isoScale, projectPoint, wallHeight } from "./isometric";

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
    // ทางเข้าผนังใต้ (ไม่มีผนังวาด) → มีพรมหน้าทางเข้า ไม่มีช่องประตู
    expect(scene.doormat).not.toBeNull();
    expect(scene.door).toBeNull();
  });

  it("ห้องตัด: ผนังหนา (ฝาบนตัว L + ปลายผนัง 2 ด้าน) สูงกว่าครัว และมีฐานพื้น 2 ด้าน", () => {
    const scene = buildIsoScene(cafeLayout());
    expect(scene.wallTop.split(" ")).toHaveLength(6);
    expect(scene.wallEnds).toHaveLength(2);
    expect(scene.slab).toHaveLength(2);
    expect(wallHeight(scene.scale)).toBeGreaterThan(52);
    expect(wallHeight(5)).toBe(72);
    // มุมล่างฐานพื้นด้านหน้าอยู่ต่ำกว่าพื้น SLAB_HEIGHT px
    const [, floorY] = projectPoint(8, 6, 0, scene.scale);
    const slabYs = scene.slab[0]!.split(" ").map((pt) => Number(pt.split(",")[1]));
    expect(Math.max(...slabYs)).toBeCloseTo(floorY + SLAB_HEIGHT, 0);
  });

  it.each(["north", "west"] as const)("ทางเข้าบนผนัง %s → มีช่องประตูบนผนังและพรม", (wall) => {
    const layout = { ...cafeLayout(), entrance: { id: "e", wall, position: 1, width: 1 } };
    const scene = buildIsoScene(layout);
    expect(scene.door).not.toBeNull();
    expect(scene.doormat).not.toBeNull();
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
      expect(own[0]!.kind).toBe("shadow");
      expect(own.slice(1).every((p) => p.opacity === undefined && p.kind === undefined)).toBe(true);
    }
  });

  it("ใช้จานสีตาม design-system §2.4", () => {
    const fills = new Set(buildIsoScene(cafeLayout()).polygons.map((p) => p.fill));
    // ท็อปโต๊ะ/เคาน์เตอร์สีขาว, เบาะเก้าอี้ส้ม, ตัวเคาน์เตอร์ส้ม, จอ POS ฟ้า
    for (const color of ["#ffffff", "#ff9b52", "#f8a466", "#63c9f2"]) expect(fills.has(color)).toBe(true);
  });

  it("เฟอร์นิเจอร์ไม่มีเส้นขอบ (stroke สีเดียวกับหน้า)", () => {
    const parts = buildIsoScene(cafeLayout()).polygons.filter((p) => p.kind !== "shadow");
    expect(parts.length).toBeGreaterThan(0);
    for (const part of parts) expect(part.stroke).toBe(part.fill);
  });

  it.each([0, 90, 180, 270] as const)("พนักพิงเก้าอี้อยู่ด้านหลังเสมอ (rotation %s°)", (rotation) => {
    const chair = { id: "c", type: "chair" as const, tableId: "t", x: 2, y: 2, width: 0.5, depth: 0.5, rotation };
    const layout = { ...cafeLayout(), objects: [chair] };
    const backTop = buildIsoScene(layout).polygons.filter((p) => p.fill === "#ff8d42");
    expect(backTop).toHaveLength(1);
  });

  it("โต๊ะ: ท็อปบาง 3px คลุมทั้ง footprint + ขาเรียว 4 ต้น · เก้าอี้: พนักพิงแผ่นบางบนเสา 2 ต้น", () => {
    const table = { id: "t", type: "table" as const, x: 2, y: 2, width: 0.8, depth: 0.8, rotation: 0 as const, seats: 2, chairIds: [] };
    const scene = buildIsoScene({ ...cafeLayout(), objects: [table] });
    const top = scene.polygons.filter((p) => p.fill === "#ffffff");
    expect(top).toHaveLength(1);
    // หน้าบนของท็อปตรงกับมุม footprint ที่ z = 34 (ยื่นคลุมขา)
    const [ax, ay] = projectPoint(2, 2, 34, scene.scale);
    expect(top[0]!.points.split(" ")[0]).toBe(`${Math.round(ax * 10) / 10},${Math.round(ay * 10) / 10}`);
    // ขา 4 ต้น × 3 หน้า (หน้าบนสีขา)
    expect(scene.polygons.filter((p) => p.fill === "#f2a46b")).toHaveLength(4);

    const chair = { id: "c", type: "chair" as const, tableId: "t", x: 2, y: 2, width: 0.5, depth: 0.5, rotation: 0 as const };
    const chairScene = buildIsoScene({ ...cafeLayout(), objects: [chair] });
    // ขาโลหะ 4 + เสาพนักพิง 2 = 6 ชิ้น (นับจากหน้าบนสีโลหะ)
    expect(chairScene.polygons.filter((p) => p.fill === "#dde0e5")).toHaveLength(6);
  });

  it("ร้านใหญ่ (scale เล็ก) ขาโต๊ะยังมองเห็นบนจอ (หน้าบนกว้าง ≥ 2px)", () => {
    const table = { id: "t", type: "table" as const, x: 2, y: 2, width: 0.8, depth: 0.8, rotation: 0 as const, seats: 2, chairIds: [] };
    const scene = buildIsoScene({ ...cafeLayout(), width: 30, depth: 30, objects: [table] });
    const legTop = scene.polygons.find((p) => p.fill === "#f2a46b")!;
    const xs = legTop.points.split(" ").map((pt) => Number(pt.split(",")[0]));
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThanOrEqual(2);
  });

  it("viewBox ครอบทั้งฉาก แม้ร้านยาวมาก (30 × 2 ม.)", () => {
    const scene = buildIsoScene({ ...cafeLayout(), width: 30, depth: 2, objects: [] });
    const [minX, , w] = scene.viewBox.split(" ").map(Number);
    const xs = scene.floor.split(" ").map((p) => Number(p.split(",")[0]));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(minX!);
    expect(Math.max(...xs)).toBeLessThanOrEqual(minX! + w!);
    // ฝาบนผนังต้องไม่ล้นขอบบนของ viewBox
    const [, minY] = scene.viewBox.split(" ").map(Number);
    const topYs = scene.wallTop.split(" ").map((p) => Number(p.split(",")[1]));
    expect(Math.min(...topYs)).toBeGreaterThanOrEqual(minY!);
  });

  it("ไม่มีทางเข้า → ไม่มีจุดทางเข้า", () => {
    expect(buildIsoScene({ ...cafeLayout(), entrance: null }).entrance).toBeNull();
  });

  it("ไม่ใช้ WebGL / Three.js", () => {
    const source = readFileSync(resolve(__dirname, "isometric.ts"), "utf8");
    expect(source).not.toMatch(/from\s+["'](three|@react-three)[^"']*["']|getContext\s*\(|WebGLRenderingContext/);
  });

  it("สไตล์ชุดโต๊ะ: สีที่เลือก, โต๊ะกลม (ท็อปหลายเหลี่ยม), ขาเดี่ยว และสตูลไม่มีพนักพิง", () => {
    const table = {
      id: "t", type: "table" as const, x: 2, y: 2, width: 1, depth: 1, rotation: 0 as const, chairIds: ["c"],
      style: { shape: "round" as const, legStyle: "pedestal" as const, color: "oak" as const },
    };
    const chair = {
      id: "c", type: "chair" as const, tableId: "t", x: 2.25, y: 1.6, width: 0.5, depth: 0.5, rotation: 180 as const,
      style: { kind: "stool" as const, legStyle: "four-legs" as const, color: "sage" as const },
    };
    const scene = buildIsoScene({ ...cafeLayout(), objects: [table, chair] });
    const top = scene.polygons.filter((p) => p.objectId === "t" && p.fill === "#bd7a45");
    expect(top).toHaveLength(1);
    expect(top[0]!.points.split(" ").length).toBeGreaterThan(4);
    // ขาเดี่ยว: ไม่มีขา 4 ต้น
    expect(scene.polygons.filter((p) => p.objectId === "t" && p.fill === "#f2a46b").length).toBeLessThan(4);
    // สตูล: ไม่มีเสาพนักพิง → หน้าบนสีโลหะเหลือแค่ขา 4 ต้น
    expect(scene.polygons.filter((p) => p.objectId === "c" && p.fill === "#dde0e5")).toHaveLength(4);
    expect(scene.polygons.some((p) => p.objectId === "c" && p.fill === "#7eaa8a")).toBe(true);
  });
});
