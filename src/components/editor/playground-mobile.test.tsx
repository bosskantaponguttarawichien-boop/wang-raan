// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlaygroundPanel } from "./playground-panel";
import { PlaygroundRail } from "./playground-rail";
import { PlaygroundHeader } from "./playground-header";
import { useLiveValidation } from "@/components/validation/use-live-validation";
import { layoutActions as actions, layoutStore } from "@/store/use-layout-store";
import { cafeLayout } from "@/test/fixtures/layouts";

function PanelHarness({ sheetOpen, onToggleSheet }: { sheetOpen: boolean; onToggleSheet: () => void }) {
  const live = useLiveValidation();
  return <PlaygroundPanel live={live} sheetOpen={sheetOpen} onToggleSheet={onToggleSheet} />;
}

function RailHarness({ sheetOpen, onToggleSheet }: { sheetOpen: boolean; onToggleSheet: () => void }) {
  const live = useLiveValidation();
  return <PlaygroundRail live={live} sheetOpen={sheetOpen} onToggleSheet={onToggleSheet} />;
}

afterEach(() => {
  cleanup();
});

describe("feat-059: Playground มือถือ — Bottom Tab Bar + Bottom Sheet", () => {
  beforeEach(() => {
    layoutStore.getState().loadLayout(cafeLayout());
    actions().setActiveTab("add");
  });

  it("Grip handle ใน PlaygroundPanel กดแล้วเรียก onToggleSheet", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<PanelHarness sheetOpen={true} onToggleSheet={onToggle} />);

    const gripBtn = screen.getByRole("button", { name: "ย่อ/ขยายแผง" });
    expect(gripBtn).toBeInTheDocument();

    await user.click(gripBtn);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("เมื่อ sheetOpen = false → PlaygroundPanel ได้ class max-[767px]:hidden", () => {
    const { container } = render(<PanelHarness sheetOpen={false} onToggleSheet={() => {}} />);
    const panel = container.querySelector("#panel");
    expect(panel).toHaveClass("max-[767px]:hidden");
  });

  it("กดแท็บเดิมใน rail → เรียก onToggleSheet เพื่อพับ/กาง sheet", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<RailHarness sheetOpen={true} onToggleSheet={onToggle} />);

    // ปัจจุบันอยู่แท็บ add
    const addTab = screen.getByRole("button", { name: "เพิ่ม" });
    await user.click(addTab);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("กดแท็บใหม่ใน rail ขณะที่ sheet พับอยู่ (false) → สลับแท็บและเรียก onToggleSheet ให้กางขึ้นมา", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<RailHarness sheetOpen={false} onToggleSheet={onToggle} />);

    const shopTab = screen.getByRole("button", { name: "ร้าน" });
    await user.click(shopTab);
    expect(layoutStore.getState().activeTab).toBe("shop");
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("แคตตาล็อกในแท็บเพิ่มมี class เลื่อนแนวนอนบน mobile (overflow-x-auto, shrink-0)", () => {
    const { container } = render(<PanelHarness sheetOpen={true} onToggleSheet={() => {}} />);
    const catList = container.querySelector(".cat-list");
    expect(catList).toHaveClass("max-[767px]:overflow-x-auto");

    const item = screen.getByRole("button", { name: /เพิ่มโต๊ะ/i });
    expect(item).toHaveClass("max-[767px]:shrink-0");
  });

  it("ViewSwitch ใน Header มีป้ายชื่อสั้น 2D / 3D สำหรับหน้าจอมือถือ (< 480px)", () => {
    render(<PlaygroundHeader />);
    const switcher = screen.getByRole("group", { name: "มุมมอง" });
    expect(switcher).toHaveTextContent("2D");
    expect(switcher).toHaveTextContent("3D");
  });
});
