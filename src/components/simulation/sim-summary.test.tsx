// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { emptyMetrics } from "@/core/simulation";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SimulationPanel } from "./simulation-panel";
import { useLiveValidation } from "@/components/validation/use-live-validation";
import { layoutStore } from "@/store/use-layout-store";
import { simulationStore } from "@/store/use-simulation-store";
import { cafeLayout } from "@/test/fixtures/layouts";

function SimPanelHarness() {
  const live = useLiveValidation();
  return <SimulationPanel live={live} />;
}

afterEach(() => {
  cleanup();
});

describe("feat-057: สรุปผลจบรอบ + ใช้ผลรอบล่าสุดตอนแก้ผัง", () => {
  beforeEach(() => {
    layoutStore.getState().loadLayout(cafeLayout());
    simulationStore.setState({
      status: "idle",
      message: null,
      metrics: null,
      showHeatmap: true,
    });
  });

  it("เมื่อมีผลรอบล่าสุดใน store: แสดงการ์ดสรุปผลและคำแนะนำ 1 ประโยค", () => {
    simulationStore.setState({
      metrics: {
        ...emptyMetrics(),
        time: 3600,
        arrived: 25,
        served: 20,
        noSeat: 3,
        noSuitableTable: 3,
        inStore: 2,
        queuing: 0,
        seated: 2,
        maxQueue: 1,
        avgVisitMinutes: 24.5,
      },
      seats: 6,
    });

    render(<SimPanelHarness />);

    const card = screen.getByTestId("latest-sim-summary");
    expect(card).toBeInTheDocument();
    expect(card).toHaveTextContent("สรุปผลจำลองรอบล่าสุด");
    expect(card).toHaveTextContent("25 คน");
    expect(card).toHaveTextContent("20 คน");
    expect(card).toHaveTextContent("3 คน"); // ไม่มีที่นั่ง
    expect(card).toHaveTextContent("มีกลุ่มที่ไม่มีโต๊ะขนาดรองรับ");

    // ปุ่มเริ่มกลายเป็น "จำลองร้านอีกครั้ง"
    const startBtn = screen.getByTestId("start-simulation");
    expect(startBtn).toHaveTextContent("จำลองร้านอีกครั้ง");
  });

  it("สลับเช็กบ็อกซ์แสดงจุดหนาแน่นบนผัง (จาง): เปลี่ยนค่า showHeatmap ใน store", async () => {
    const user = userEvent.setup();
    simulationStore.setState({
      metrics: {
        ...emptyMetrics(),
        time: 1800,
        arrived: 10,
        served: 8,
        noSeat: 0,
        inStore: 2,
        queuing: 0,
        seated: 2,
        maxQueue: 0,
        avgVisitMinutes: 18,
      },
      seats: 6,
      showHeatmap: true,
    });

    render(<SimPanelHarness />);

    const checkbox = screen.getByRole("checkbox", { name: "แสดงจุดหนาแน่นบนผัง (จาง)" });
    expect(checkbox).toBeChecked();

    await user.click(checkbox);
    expect(checkbox).not.toBeChecked();
    expect(simulationStore.getState().showHeatmap).toBe(false);
  });

  it("ผลรอบล่าสุดคงอยู่เมื่อสลับแท็บ และไม่หายไปเองจนกว่าจะเริ่มใหม่", () => {
    simulationStore.setState({
      metrics: {
        ...emptyMetrics(),
        time: 1200,
        arrived: 8,
        served: 6,
        noSeat: 0,
        inStore: 2,
        queuing: 0,
        seated: 2,
        maxQueue: 0,
        avgVisitMinutes: 15,
      },
      seats: 6,
    });

    // สมมติสลับแท็บไป shop แล้วกลับมา check
    layoutStore.getState().setActiveTab("shop");
    layoutStore.getState().setActiveTab("check");

    render(<SimPanelHarness />);
    expect(screen.getByTestId("latest-sim-summary")).toBeInTheDocument();
  });
});
