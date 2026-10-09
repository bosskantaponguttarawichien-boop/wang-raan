import { describe, expect, it } from "vitest";
import { footprint, type StoreLayout } from "@/core/layout";
import { TARGETS, block, cafeLayout, corridor, withObjects } from "@/test/fixtures/layouts";
import { analyzeRoutes, checkAccessibility, computeServicePoints, issueCode, pointToRectDistance } from "./index";

const codes = (layout: StoreLayout) => checkAccessibility(layout).map(issueCode);

describe("Accessibility (PRD §5.6)", () => {
  it("ผังคาเฟ่ปกติ → เข้าถึงได้ทุกชิ้น", () => {
    expect(checkAccessibility(cafeLayout())).toEqual([]);
  });

  it.each([
    ["chair", "ลูกค้าเดินจากทางเข้าไปถึงเก้าอี้ตัวนี้ไม่ได้"],
    ["table", "พนักงานเข้าถึงจุดบริการของโต๊ะนี้ไม่ได้"],
    ["kitchen", "พนักงานเข้าถึงครัวไม่ได้"],
    ["counter", "พนักงานเข้าถึงเคาน์เตอร์ไม่ได้"],
  ] as const)("ทางเดินตัน (ช่อง 0.50 ม.) → %s เข้าไม่ถึง Blocked", (type, message) => {
    expect(checkAccessibility(corridor(0.5, TARGETS[type]))).toEqual([
      {
        id: `accessibility/unreachable-${type}/target`,
        category: "accessibility",
        severity: "blocked",
        objectIds: ["target"],
        message,
      },
    ]);
  });

  it.each(["chair", "table", "kitchen", "counter"] as const)("ช่อง 0.60 ม. → %s ยังเข้าถึงได้", (type) => {
    expect(codes(corridor(0.6, TARGETS[type]))).toEqual([]);
  });

  it("ทางเดินปิดสนิท (ไม่มีช่อง) → เข้าไม่ถึง", () => {
    expect(codes(corridor(0, TARGETS.counter))).toEqual(["unreachable-counter"]);
  });

  it("วัตถุบังหน้าประตู → Entrance ไม่เชื่อมพื้นที่เดิน (รายงานเพียงรายการเดียว)", () => {
    const layout = withObjects(corridor(2, TARGETS.counter), block("blocker", 0, 1.25, 0.5, 1.7));
    expect(checkAccessibility(layout)).toEqual([
      expect.objectContaining({ id: "accessibility/entrance-disconnected/entrance-01", severity: "blocked" }),
    ]);
  });

  it("ทางเข้ายื่นเลยแนวผนัง → Blocked", () => {
    const base = corridor(2, TARGETS.counter);
    const layout = { ...base, entrance: { ...base.entrance!, position: 3.5 } };
    expect(codes(layout)).toEqual(["entrance-off-wall"]);
  });

  it("เก้าอี้ที่ถูกล้อมด้วยโต๊ะและครัว → ลูกค้าเข้าไม่ถึง (ใช้มุมหมุนจริง)", () => {
    const layout = cafeLayout();
    const chair = layout.objects.find((o) => o.type === "chair" && o.rotation === 180)!; // เก้าอี้ฝั่งเหนือของโต๊ะ 4 ที่นั่ง
    const c = footprint(chair);
    // ปิดด้านหลังและสองข้างของเก้าอี้ให้ชิด
    const closed = withObjects(
      layout,
      block("k-back", c.x - 0.6, c.y - 1, c.width + 1.2, 1),
      block("k-left", c.x - 0.6, c.y, 0.6, 0.4),
      block("k-right", c.x + c.width, c.y, 0.6, 0.4),
    );
    expect(checkAccessibility(closed).map((i) => i.id)).toContain(`accessibility/unreachable-chair/${chair.id}`);
  });

  it("ไม่มีทางเข้า → ไม่ตรวจ (Completeness รายงานแล้ว)", () => {
    expect(checkAccessibility({ ...cafeLayout(), entrance: null })).toEqual([]);
  });
});

describe("Service Points", () => {
  it("ทุก Table / Kitchen / Counter มีจุดบริการที่แตะ bounding box", () => {
    const layout = cafeLayout();
    const points = computeServicePoints(layout);
    expect(points.map((p) => p.type).sort()).toEqual(["counter", "kitchen", "table", "table"]);
    for (const sp of points) {
      const obj = layout.objects.find((o) => o.id === sp.objectId)!;
      expect(sp.point).not.toBeNull();
      expect(sp.candidates).toBeGreaterThan(0);
      expect(pointToRectDistance(sp.point!, footprint(obj))).toBeLessThanOrEqual(0.35 + 1e-9);
    }
  });

  it("วัตถุที่เข้าไม่ถึง → point = null", () => {
    const [sp] = computeServicePoints(corridor(0.5, TARGETS.counter)).filter((p) => p.objectId === "target");
    expect(sp).toEqual({ objectId: "target", type: "counter", point: null, candidates: 0 });
  });

  it("ไม่มีทางเข้า → ทุกจุดเป็น null", () => {
    const points = computeServicePoints({ ...cafeLayout(), entrance: null });
    expect(points.every((p) => p.point === null)).toBe(true);
  });

  it("analyzeRoutes ระบุสถานะ ok / narrow / unreachable ต่อวัตถุ", () => {
    const status = (gap: number) =>
      analyzeRoutes(corridor(gap, TARGETS.counter))!.routes.find((r) => r.object.id === "target")!.status;
    expect([status(1.2), status(0.8), status(0.4)]).toEqual(["ok", "narrow", "unreachable"]);
  });
});
