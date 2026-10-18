// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IsometricView } from "./isometric-view";
import { layoutActions as actions, layoutStore } from "@/store/use-layout-store";
import { simulationStore } from "@/store/use-simulation-store";
import { cafeLayout } from "@/test/fixtures/layouts";

afterEach(() => {
  cleanup();
});

describe("feat-058: มุมมอง 3D — เลือกและขยับวัตถุ (Pure SVG)", () => {
  beforeEach(() => {
    layoutStore.getState().loadLayout(cafeLayout());
    actions().selectObject(null);
    simulationStore.setState({ status: "idle", message: null });
  });

  it("คลิกเลือกวัตถุใน 3D → selectedObjectId อัปเดต, แสดงเส้นรอบเงารวม + แผ่นพื้น และ toast แนะนำ", async () => {
    const user = userEvent.setup();
    const onToast = vi.fn();
    render(<IsometricView onToast={onToast} />);

    const svg = screen.getByTestId("iso-svg");
    const tablePoly = svg.querySelector("polygon[data-object-id=\"table-01\"]");
    expect(tablePoly).not.toBeNull();

    await user.click(tablePoly!);
    expect(layoutStore.getState().selectedObjectId).toBe("table-01");
    // ไม่ทาเส้นน้ำเงินทุกหน้า — ใช้เส้นรอบเงารวมของทั้งชุด (โต๊ะ + เก้าอี้ลูก) และแผ่นพื้นแทน
    expect(tablePoly).not.toHaveAttribute("stroke", "#3b62f4");
    const outline = screen.getByTestId("iso-selection-outline");
    const ownFaces = svg.querySelectorAll("polygon[data-object-id=\"table-01\"]:not([opacity])").length;
    expect(outline.querySelectorAll("polygon").length).toBeGreaterThan(ownFaces);
    expect(screen.getByTestId("iso-selection-pad")).toHaveAttribute("stroke-dasharray", "5 4");
    expect(onToast).toHaveBeenCalledWith("ใน 3D เลือกแล้วขยับด้วยปุ่มลูกศร · ลากได้ในมุมมอง 2D");

    // ชุดโต๊ะใช้แผงแก้ไขทางซ้าย จึงไม่ซ้ำคำสั่งเป็น toolbar ลอยบนฉาก
    expect(screen.queryByRole("toolbar")).toBeNull();
  });

  it("หมุนมุมมอง 180°: ฉากวาดจากผังที่หมุน (ทางเข้าผนังใต้กลายเป็นผนังหลังมีช่องประตู) และลูกศรขวา = ทิศตะวันตกของผัง", async () => {
    const user = userEvent.setup();
    layoutStore.setState({ viewRotation: 180 });
    try {
      render(<IsometricView />);
      // ผัง cafe: ทางเข้าอยู่ผนังใต้ → มุมมองปกติไม่มีช่องประตูบนผนังหลัง แต่หมุน 180° แล้วผนังใต้เป็นผนังหลัง
      expect(screen.getByTestId("iso-svg").querySelector("polygon[stroke-width='2.5']")).not.toBeNull();
      actions().selectObject("counter-01");
      await user.keyboard("{ArrowRight}");
      expect(layoutStore.getState().layout.objects.find((o) => o.id === "counter-01")).toMatchObject({ x: 4.75, y: 0.5 });
    } finally {
      layoutStore.setState({ viewRotation: 0 });
    }
  });

  it("ขยับด้วยปุ่มลูกศรใน 3D → พิกัดใน store อัปเดตตรงกัน (0.25 ม. และ Shift 1 ม.)", async () => {
    const user = userEvent.setup();
    render(<IsometricView />);

    // เลือก counter-01 (x: 5, y: 0.5)
    actions().selectObject("counter-01");
    const counter = () => layoutStore.getState().layout.objects.find((o) => o.id === "counter-01")!;
    expect(counter().x).toBe(5);
    expect(counter().y).toBe(0.5);

    // กด ArrowRight → ขยับทีละ 0.25 ม.
    await user.keyboard("{ArrowRight}");
    expect(counter().x).toBe(5.25);

    // กด Shift+ArrowDown → ขยับทีละ 1 ม.
    await user.keyboard("{Shift>}{ArrowDown}{/Shift}");
    expect(counter().y).toBe(1.5);
  });

  it("คีย์ลัด R หมุน, Delete ลบ, และ Esc ยกเลิกการเลือกใน 3D", async () => {
    const user = userEvent.setup();
    const onToast = vi.fn();
    render(<IsometricView onToast={onToast} />);

    actions().selectObject("table-02");
    const table = () => layoutStore.getState().layout.objects.find((o) => o.id === "table-02");
    expect(table()?.rotation).toBe(0);

    // กด R → หมุน 90°
    await user.keyboard("r");
    expect(table()?.rotation).toBe(90);

    // กด Escape → ยกเลิกการเลือก
    await user.keyboard("{Escape}");
    expect(layoutStore.getState().selectedObjectId).toBeNull();

    // เลือกใหม่แล้วกด Delete → ลบพร้อม toast
    actions().selectObject("counter-01");
    await user.keyboard("{Delete}");
    expect(layoutStore.getState().layout.objects.some((o) => o.id === "counter-01")).toBe(false);
    expect(onToast).toHaveBeenCalledWith("ลบแล้ว · กด Ctrl+Z เพื่อย้อน");
  });

  it("คลิกพื้นที่ว่างในฉาก 3D → ยกเลิกการเลือก", async () => {
    const user = userEvent.setup();
    render(<IsometricView />);

    actions().selectObject("table-01");
    expect(layoutStore.getState().selectedObjectId).toBe("table-01");

    const svg = screen.getByTestId("iso-svg");
    const floor = svg.querySelector("polygon:not([data-object-id])");
    expect(floor).not.toBeNull();

    await user.click(floor!);
    expect(layoutStore.getState().selectedObjectId).toBeNull();
    expect(screen.queryByTestId("iso-selection-outline")).toBeNull();
    expect(screen.queryByTestId("iso-selection-pad")).toBeNull();
  });
});
