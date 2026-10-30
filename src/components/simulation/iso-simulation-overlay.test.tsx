// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IsometricScene, IsometricView } from "@/components/preview-3d/isometric-view";
import { projectPoint } from "@/core/preview/isometric";
import { layoutStore } from "@/store/use-layout-store";
import { simulationStore } from "@/store/use-simulation-store";
import { cafeLayout } from "@/test/fixtures/layouts";
import type { PresentationSnapshot, TablePresentation } from "@/core/simulation/presentation-contract";
import { projectAgents, seatedFacing, tableBadges, drawThoughtBubble } from "./iso-simulation-overlay";

afterEach(() => {
  cleanup();
});

describe("จำลองลูกค้าในมุมมอง 3D", () => {
  beforeEach(() => {
    layoutStore.getState().loadLayout(cafeLayout());
    simulationStore.setState({ status: "idle", message: null });
  });

  it("projectAgents ฉายตำแหน่ง (เมตร) ลงพื้น isometric และเรียงไกล → ใกล้", () => {
    const sprites = projectAgents(
      [
        [7, 5, 4, 0],
        [8, 1, 1, 4],
        [9, 3, 2, 2],
      ],
      30,
    );
    expect(sprites.map((s) => s.id)).toEqual([8, 9, 7]);
    const [x, y] = projectPoint(1, 1, 0, 30);
    expect(sprites[0]).toEqual({ id: 8, mx: 1, my: 1, x, y, state: 4 });
  });

  it("คนนั่งหันหน้าเข้าโต๊ะตามทิศเก้าอี้ที่ใกล้ที่สุด", () => {
    const layout = cafeLayout();
    const back = { front: false, right: false };
    for (const chair of layout.objects.filter((o) => o.type === "chair")) {
      const cx = chair.x + chair.width / 2;
      const cy = chair.y + chair.depth / 2;
      const table = layout.objects.find((o) => o.id === chair.tableId)!;
      const toTable = { x: table.x + table.width / 2 - cx, y: table.y + table.depth / 2 - cy };
      const f = seatedFacing(layout, cx, cy, back);
      // หันไปทางโต๊ะบนจอ: ขวา ⇔ (dx − dy) > 0, หน้า ⇔ (dx + dy) > 0
      if (Math.abs(toTable.x - toTable.y) > 0.01) expect(f.right).toBe(toTable.x - toTable.y > 0);
      if (Math.abs(toTable.x + toTable.y) > 0.01) expect(f.front).toBe(toTable.x + toTable.y > 0);
    }
    // ไม่มีเก้าอี้ใกล้ ๆ → คงทิศเดิม
    expect(seatedFacing(layout, 7.9, 5.9, back)).toBe(back);
  });

  it("Editor 3D มี canvas ลูกค้า + ชั้น heatmap บนพื้น และ active ตามสถานะการจำลอง", () => {
    const { rerender } = render(<IsometricView />);
    const overlay = screen.getByTestId("iso-simulation-overlay");
    expect(overlay).toHaveAttribute("data-active", "false");
    // heatmap อยู่ใน SVG ก่อนเฟอร์นิเจอร์ (ไม่ทับโต๊ะ/เก้าอี้)
    const heat = screen.getByTestId("iso-heatmap");
    const firstObject = screen.getByTestId("iso-svg").querySelector("polygon[data-object-id]")!;
    expect(heat.compareDocumentPosition(firstObject) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    simulationStore.setState({ status: "running" });
    rerender(<IsometricView />);
    expect(screen.getByTestId("iso-simulation-overlay")).toHaveAttribute("data-active", "true");
  });

  it("หน้าแชร์ (IsometricScene ปกติ) ไม่มีชั้นจำลอง", () => {
    render(<IsometricScene layout={cafeLayout()} />);
    expect(screen.queryByTestId("iso-simulation-overlay")).toBeNull();
    expect(screen.queryByTestId("iso-heatmap")).toBeNull();
  });
});

describe("fallback 2D แสดงวงจรบริการจาก snapshot", () => {
  const snapshotWith = (tables: readonly TablePresentation[], tableId: string): PresentationSnapshot => ({
    version: 1, runId: "run-1", layoutRevision: "rev-1", sequence: 0, simTimeSeconds: 100,
    customers: [], tables,
    meals: tables.flatMap((table) => table.mealIds.map((mealId) => ({
      mealId, ownerRenderAgentId: 10, tableId, chairId: "chair-1", serviceCycleId: table.serviceCycleId,
      foodKind: "fried-rice" as const, anchor: { x: 0, y: 0.3 }, progress: "full" as const, consumed: 0,
      placedAtSeconds: 90,
    }))),
    staff: [], milestones: [],
  });
  const tableOf = (tableId: string, overrides: Partial<TablePresentation> = {}): TablePresentation => ({
    tableId, serviceCycleId: "cycle-1", availability: "occupied", surface: "served",
    mealIds: ["meal-1"], stainAmount: 0, wipeProgress: 0, cleanCompletedAtSeconds: null, ...overrides,
  });

  it("ไม่วาดอะไรเมื่อ worker ไม่ส่ง metadata", () => {
    expect(tableBadges(undefined, cafeLayout())).toEqual([]);
  });

  it("นับจานและหาจุดกลางโต๊ะจากผังจริง", () => {
    const layout = cafeLayout();
    const table = layout.objects.find((object) => object.type === "table")!;
    const badges = tableBadges(snapshotWith([tableOf(table.id, { mealIds: ["meal-1", "meal-2"] })], table.id), layout);
    expect(badges).toHaveLength(1);
    expect(badges[0]).toMatchObject({ tableId: table.id, dishCount: 2, surface: "served" });
    expect(badges[0]!.mx).toBeCloseTo(table.x + table.width / 2, 6);
    expect(badges[0]!.my).toBeCloseTo(table.y + table.depth / 2, 6);
  });

  it("คราบจางลงตามการเช็ดแต่ยังเหลือจนงานเช็ดเสร็จ", () => {
    const layout = cafeLayout();
    const id = layout.objects.find((object) => object.type === "table")!.id;
    const dirty = tableBadges(snapshotWith([tableOf(id, { surface: "used", stainAmount: 0.8 })], id), layout)[0]!;
    expect(dirty.stain).toBeCloseTo(0.8, 6);
    expect(dirty.wiping).toBe(false);
    const wiping = tableBadges(snapshotWith([tableOf(id, { surface: "wiping", stainAmount: 0.8, wipeProgress: 0.5 })], id), layout)[0]!;
    expect(wiping.stain).toBeCloseTo(0.4, 6);
    expect(wiping.wiping).toBe(true);
    const clean = tableBadges(snapshotWith([tableOf(id, { surface: "clean", mealIds: [], stainAmount: 0, wipeProgress: 1 })], id), layout)[0]!;
    expect(clean).toMatchObject({ stain: 0, dishCount: 0 });
  });

  it("ข้ามโต๊ะที่ไม่อยู่ในผังที่กำลังแสดง", () => {
    expect(tableBadges(snapshotWith([tableOf("table-ที่ไม่มีจริง")], "table-ที่ไม่มีจริง"), cafeLayout())).toEqual([]);
  });

  it("drawThoughtBubble draws thought bubbles on canvas context", () => {
    const fillText = vi.fn();
    const fill = vi.fn();
    const stroke = vi.fn();
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn(),
      beginPath: vi.fn(),
      roundRect: vi.fn(),
      rect: vi.fn(),
      arc: vi.fn(),
      fill,
      stroke,
      measureText: vi.fn(() => ({ width: 20 })),
      fillText,
    } as unknown as CanvasRenderingContext2D;

    drawThoughtBubble(ctx, 100, 100, { kind: "food-critical", waitSeconds: 900, severity: "critical" }, 1);
    expect(fillText).toHaveBeenCalled();
    expect(String(fillText.mock.calls[0]?.[0])).toContain("😤");
    expect(String(fillText.mock.calls[0]?.[0])).toContain("15น.!");
  });
});
