// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { IsometricScene, IsometricView } from "@/components/preview-3d/isometric-view";
import { projectPoint } from "@/core/preview/isometric";
import { layoutStore } from "@/store/use-layout-store";
import { simulationStore } from "@/store/use-simulation-store";
import { cafeLayout } from "@/test/fixtures/layouts";
import { projectAgents, seatedFacing } from "./iso-simulation-overlay";

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
