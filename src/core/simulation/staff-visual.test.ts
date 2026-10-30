import { describe, expect, it } from "vitest";
import { cafeLayout } from "@/test/fixtures/layouts";
import { CELL_FREE, buildOccupancyGrid } from "./occupancy-grid";
import { STAFF_STATE_CODE, StaffVisuals, WALL_CLEARANCE } from "./staff-visual";
import { prepareStore } from "./engine";

const layout = cafeLayout();
const table = layout.objects.find((o) => o.type === "table")!;

/** ทุกจุดบนทุกช่วงของแผนเดิน (จุดยืนทำงานรวมอยู่ด้วย) */
function planPoints(kind: "deliver" | "take-order" | "clean") {
  const visuals = new StaffVisuals(layout, 1);
  const plan = visuals.plan(0, kind, table.id, 40, 30);
  return { visuals, points: plan.phases.flatMap((phase) => phase.points) };
}

describe("StaffVisuals — เส้นทางเดินของพนักงาน", () => {
  it("เดิน 1.2 ม./วิ และมีเวลารับ/วางจานในงบงานเดิม แม้มีพนักงาน20คน", () => {
    const store = prepareStore(layout), visuals = new StaffVisuals(layout, 20);
    for (const table of store.tables) {
      const walk = Math.min(...table.chairIds.map(id => store.deliverWalk.get(id) ?? Infinity));
      for (let worker = 0; worker < 20; worker++) {
        const plan = visuals.plan(worker, "deliver", table.id, walk + 10, walk);
        expect(plan.phases.reduce((sum, phase) => sum + phase.seconds, 0)).toBeCloseTo(plan.total, 6);
        for (const phase of plan.phases.filter(phase => phase.length > 0)) expect(phase.length / phase.seconds).toBeCloseTo(1.2, 6);
        expect(plan.phases.some(phase => phase.activity === "pickup")).toBe(true);
        expect(plan.phases.some(phase => phase.activity === "put-down")).toBe(true);
      }
    }
  });
  it.each(["deliver", "take-order", "clean"] as const)("เส้นทาง %s ไม่เดินชิดผนัง", (kind) => {
    const { points } = planPoints(kind);
    const home = new StaffVisuals(layout, 1).homes[0]!;
    expect(points.length).toBeGreaterThan(2);
    for (const p of points) {
      // จุดยืนประจำหลังเคาน์เตอร์เป็นจุดเดียวที่ยังชิดผนังได้ (staffSpots เป็นคนกำหนด)
      if (Math.hypot(p.x - home.x, p.y - home.y) < 1e-6) continue;
      expect(p.x).toBeGreaterThanOrEqual(WALL_CLEARANCE - 1e-9);
      expect(p.y).toBeGreaterThanOrEqual(WALL_CLEARANCE - 1e-9);
      expect(p.x).toBeLessThanOrEqual(layout.width - WALL_CLEARANCE + 1e-9);
      expect(p.y).toBeLessThanOrEqual(layout.depth - WALL_CLEARANCE + 1e-9);
    }
  });

  it("จุดบนเส้นทางยังอยู่ในช่องว่างของกริด (ไม่ถูกดันเข้าไปในวัตถุ)", () => {
    const grid = buildOccupancyGrid(layout, undefined, { blockStaffSpots: false });
    const { points } = planPoints("deliver");
    for (const p of points) {
      const col = Math.min(grid.cols - 1, Math.floor(p.x / grid.cellSize));
      const row = Math.min(grid.rows - 1, Math.floor(p.y / grid.cellSize));
      expect(grid.cells[row * grid.cols + col]).toBe(CELL_FREE);
    }
  });

  it("รอบเสิร์ฟยังเริ่มที่ประตูครัว (ช่วง serving เริ่มใกล้ผนังที่มีประตูครัว)", () => {
    const { points, visuals } = planPoints("deliver");
    const serving = visuals.plan(0, "deliver", table.id, 40, 30).phases.find((p) => p.code === STAFF_STATE_CODE.serving);
    expect(serving).toBeDefined();
    expect(serving!.points[0]!.y).toBeLessThan(0.6); // ประตูครัวอยู่ผนังทิศเหนือ
    expect(points.length).toBeGreaterThan(2);
  });
});
