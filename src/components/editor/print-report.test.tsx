// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { emptyMetrics } from "@/core/simulation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as exportModule from "@/core/export";
import { validateLayout } from "@/core/validation";
import { summarizeIssues } from "@/components/validation/use-live-validation";
import { layoutStore } from "@/store/use-layout-store";
import { cafeLayout } from "@/test/fixtures/layouts";
import { PrintReport } from "./print-report";

const live = () => {
  const result = validateLayout(layoutStore.getState().layout);
  return { result, ...summarizeIssues(result.issues) };
};

beforeEach(() => layoutStore.getState().loadLayout(cafeLayout()));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PrintReport (สร้างเฉพาะตอนพิมพ์)", () => {
  it("ไม่พิมพ์ → ไม่สร้าง SVG แม้ผังเปลี่ยน; beforeprint → สร้าง; afterprint → ถอดออก", () => {
    const spy = vi.spyOn(exportModule, "renderPlanSvg");
    const { rerender } = render(<PrintReport live={live()} />);
    act(() => layoutStore.getState().setRoomDimensions(9, 6));
    rerender(<PrintReport live={live()} />);
    expect(spy).not.toHaveBeenCalled();
    expect(screen.queryByTestId("print-report")).toBeNull();

    act(() => {
      window.dispatchEvent(new Event("beforeprint"));
    });
    expect(screen.getByTestId("print-report")).toHaveTextContent("ผังร้าน 9 × 6 เมตร");
    expect(spy).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(new Event("afterprint"));
    });
    expect(screen.queryByTestId("print-report")).toBeNull();
  });

  it("มีผลจำลองรอบล่าสุด → รวมผลจำลองลงในรายงานพิมพ์ (feat-057)", async () => {
    const { simulationStore } = await import("@/store/use-simulation-store");
    simulationStore.setState({
      metrics: { ...emptyMetrics(), time: 3600, arrived: 15, served: 12, noSeat: 2, inStore: 1, queuing: 0, seated: 1, maxQueue: 1, avgVisitMinutes: 20 },
      seats: 6,
    });
    render(<PrintReport live={live()} />);
    act(() => {
      window.dispatchEvent(new Event("beforeprint"));
    });
    const report = screen.getByTestId("print-report");
    expect(report).toHaveTextContent("ผลจำลองลูกค้า (รอบล่าสุด)");
    expect(report).toHaveTextContent("ลูกค้าที่เข้ามา");
    expect(report).toHaveTextContent("15 คน");
    expect(report).toHaveTextContent("ไม่มีที่นั่ง");
    expect(report).toHaveTextContent("2 คน");
  });
});
