// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { emptyMetrics } from "@/core/simulation";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Artboard } from "@/components/editor-2d/artboard";
import { IsometricView } from "@/components/preview-3d/isometric-view";
import { PlaygroundRail } from "@/components/editor/playground-rail";
import { PlaygroundStatusBar } from "@/components/editor/playground-status-bar";
import { SimulationPanel } from "./simulation-panel";
import { useLiveValidation } from "@/components/validation/use-live-validation";
import { layoutStore } from "@/store/use-layout-store";
import { simulationStore } from "@/store/use-simulation-store";
import { cafeLayout } from "@/test/fixtures/layouts";

function ArtboardHarness({ onToast }: { onToast?: (msg: string) => void }) {
  const live = useLiveValidation();
  return <Artboard live={live} onToast={onToast} />;
}

function RailHarness() {
  const live = useLiveValidation();
  return <PlaygroundRail live={live} />;
}

function StatusBarHarness() {
  const live = useLiveValidation();
  return <PlaygroundStatusBar live={live} />;
}

function SimPanelHarness({ onToast }: { onToast?: (msg: string) => void }) {
  const live = useLiveValidation();
  return <SimulationPanel live={live} onToast={onToast} />;
}

afterEach(() => {
  cleanup();
});

describe("feat-056: โหมดจำลอง — ล็อกผังและตัวควบคุมระหว่างรัน", () => {
  beforeEach(() => {
    layoutStore.getState().loadLayout(cafeLayout());
    simulationStore.setState({ status: "idle", message: null, metrics: null });
  });

  it("โหมดปกติ (idle): rail แสดงผล, วัตถุเลื่อนได้, ไม่มี chip ล็อก", () => {
    render(<RailHarness />);
    expect(screen.getByRole("navigation", { name: "เครื่องมือ" })).toBeInTheDocument();
    cleanup();

    render(<ArtboardHarness />);
    expect(screen.queryByTestId("chip-lock")).not.toBeInTheDocument();
  });

  it("ระหว่างจำลอง (running): rail ซ่อน, แสดง chip ล็อกทั้ง 2D และ 3D", () => {
    simulationStore.setState({
      status: "running",
      seats: 6,
      metrics: { ...emptyMetrics(), time: 120, arrived: 2, served: 1, noSeat: 0, inStore: 1, queuing: 0, seated: 1, maxQueue: 0, avgVisitMinutes: 10 },
    });

    const { container: railContainer } = render(<RailHarness />);
    expect(railContainer.firstChild).toBeNull();
    cleanup();

    // 2D Artboard แสดง chip ล็อก
    render(<ArtboardHarness />);
    expect(screen.getByTestId("chip-lock")).toBeInTheDocument();
    expect(screen.getByTestId("chip-lock")).toHaveTextContent("ผังล็อกระหว่างจำลอง");
    cleanup();

    // 3D View แสดง chip ล็อก
    render(<IsometricView />);
    expect(screen.getByTestId("chip-lock")).toBeInTheDocument();
  });

  it("ระหว่างจำลอง: คลิกหรือลากวัตถุใน 2D ขึ้น toast เตือนและไม่เริ่ม drag", async () => {
    const user = userEvent.setup();
    const onToast = vi.fn();
    simulationStore.setState({ status: "running", seats: 6 });

    render(<ArtboardHarness onToast={onToast} />);
    const tableBtn = screen.getAllByRole("button", { name: /โต๊ะ/i })[0]!;
    expect(tableBtn).toHaveClass("cursor-default");

    await user.click(tableBtn);
    expect(onToast).toHaveBeenCalledWith('ผังล็อกระหว่างจำลอง — กด "จบรอบ" ก่อนแก้ไข');
  });

  it("ระหว่างจำลอง: คลิกวัตถุใน 3D ขึ้น toast เตือน", async () => {
    const user = userEvent.setup();
    const onToast = vi.fn();
    simulationStore.setState({ status: "running", seats: 6 });

    render(<IsometricView onToast={onToast} />);
    const svg = screen.getByTestId("iso-svg");
    const polyWithObject = svg.querySelector("polygon[data-object-id]");
    expect(polyWithObject).not.toBeNull();

    await user.click(polyWithObject!);
    expect(onToast).toHaveBeenCalledWith('ผังล็อกระหว่างจำลอง — กด "จบรอบ" ก่อนแก้ไข');
  });

  it("ระหว่างจำลอง: แผงควบคุมแสดงปุ่มหยุดชั่วคราว, จบรอบ, ความเร็ว, และ status bar มีปุ่มกลับไปแก้ผัง", () => {
    simulationStore.setState({
      status: "running",
      seats: 6,
      metrics: { ...emptyMetrics(), time: 300, arrived: 5, served: 2, noSeat: 0, inStore: 3, queuing: 0, seated: 2, maxQueue: 0, avgVisitMinutes: 15 },
    });

    render(<SimPanelHarness />);
    expect(screen.getByRole("button", { name: "⏸ หยุดชั่วคราว" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "■ จบรอบ" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "ความเร็วจำลอง" })).toBeInTheDocument();
    expect(screen.getByText(/ผังถูกล็อกระหว่างจำลอง/)).toBeInTheDocument();
    cleanup();

    render(<StatusBarHarness />);
    expect(screen.getByRole("button", { name: /กลับไปแก้ผัง/i })).toBeInTheDocument();
  });

  it("หยุดชั่วคราว (paused): ผังยังคงล็อกอยู่", async () => {
    const user = userEvent.setup();
    const onToast = vi.fn();
    simulationStore.setState({ status: "paused", seats: 6 });

    render(<ArtboardHarness onToast={onToast} />);
    expect(screen.getByTestId("chip-lock")).toBeInTheDocument();

    const tableBtn = screen.getAllByRole("button", { name: /โต๊ะ/i })[0]!;
    await user.click(tableBtn);
    expect(onToast).toHaveBeenCalledWith('ผังล็อกระหว่างจำลอง — กด "จบรอบ" ก่อนแก้ไข');
  });
});
