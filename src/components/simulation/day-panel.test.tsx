// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { analyzeDay } from "@/core/simulation";
import { useLiveValidation } from "@/components/validation/use-live-validation";
import { DEFAULT_DAY_CONFIG, toDayInput } from "@/lib/day-config";
import { layoutStore } from "@/store/use-layout-store";
import { simulationStore } from "@/store/use-simulation-store";
import { cafeLayout, withoutType } from "@/test/fixtures/layouts";
import { SimulationPanel } from "./simulation-panel";

function Harness() {
  const live = useLiveValidation();
  return <SimulationPanel live={live} />;
}

afterEach(cleanup);

describe("แผงจำลองร้าน 1 วัน (feat-095)", () => {
  beforeEach(() => {
    layoutStore.getState().loadLayout(cafeLayout());
    simulationStore.setState({ status: "idle", message: null, metrics: null, analysis: null, config: { ...DEFAULT_DAY_CONFIG, speed: 1 } });
  });

  it("3 ส่วน: ร้าน / พนักงาน / ลูกค้า พร้อมค่าที่คำนวณให้", () => {
    render(<Harness />);
    const form = screen.getByTestId("day-setup-form");
    for (const name of ["ร้านของคุณ", "พนักงาน", "ลูกค้าวันนี้"]) expect(within(form).getByRole("region", { name })).toBeInTheDocument();
    expect(form).toHaveTextContent("เปิดวันละ 10 ชั่วโมง");
    expect(form).toHaveTextContent("ครัวทำได้ราว 12 จาน/ชม.");
    expect(form).toHaveTextContent("ช่วงนี้ลูกค้าเข้าราว 24.5 คน/ชม. · ช่วงอื่นราว 9.8 คน/ชม.");
    expect(form).toHaveTextContent("มีเพราะผังมีเคาน์เตอร์ 1 จุด");
    expect(form).toHaveTextContent("15–25 นาที");
    expect(form).toHaveTextContent("นับตั้งแต่นั่งลงจนได้อาหาร");
    expect(screen.getByTestId("start-simulation")).toHaveTextContent("จำลองร้าน 1 วัน");
  });

  it("เพิ่มพ่อครัว → ครัวทำได้มากขึ้น; แก้เวลาเปิด–ปิด → ชั่วโมงเปลี่ยน", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "เพิ่มพ่อครัว" }));
    expect(simulationStore.getState().config.cooks).toBe(2);
    expect(screen.getByTestId("day-setup-form")).toHaveTextContent("ครัวทำได้ราว 24 จาน/ชม. (2 คน × 12 จาน)");
    expect(screen.getByRole("button", { name: "ลดพ่อครัว" })).toBeEnabled();
    simulationStore.getState().setConfig({ closeTime: "22:00" });
    expect(await screen.findByText("เปิดวันละ 12 ชั่วโมง")).toBeInTheDocument();
  });

  it("ผังไม่มีเคาน์เตอร์ → ไม่มีช่องพนักงานหน้าร้าน บอกให้วางก่อน", () => {
    layoutStore.getState().loadLayout(withoutType(cafeLayout(), "counter"));
    render(<Harness />);
    expect(screen.getByText("วางเคาน์เตอร์ในผังก่อน ถึงจะมีพนักงานหน้าร้าน")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "เพิ่มพนักงานหน้าร้าน" })).toBeNull();
    expect(screen.getByRole("button", { name: "เพิ่มพ่อครัว" })).toBeInTheDocument();
  });

  it("ช่วงคนเยอะนอกเวลาเปิด → แจ้งเตือนทันที", () => {
    simulationStore.getState().setConfig({ peakStart: "21:00", peakEnd: "22:00" });
    render(<Harness />);
    expect(screen.getByRole("alert")).toHaveTextContent("ช่วงคนเยอะต้องอยู่ในเวลาเปิดร้าน");
  });

  it("มีผลวิเคราะห์ → การ์ดตอบ 3 ข้อ", { timeout: 30_000 }, () => {
    const day = toDayInput({ ...DEFAULT_DAY_CONFIG, dailyCustomers: 200 });
    if (!day.ok) throw new Error(day.reason);
    simulationStore.setState({ analysis: analyzeDay(cafeLayout(), day.input) });
    render(<Harness />);
    const card = screen.getByTestId("day-answers");
    expect(card).toHaveTextContent("คำตอบสำหรับร้านคุณ");
    expect(card).toHaveTextContent("6 ที่นั่ง");
    expect(card).toHaveTextContent("คนเยอะ 11:30–13:00");
    expect(within(card).getByTestId("answer-staff")).toHaveTextContent(/หน้าร้าน \d · พ่อครัว \d/);
    expect(within(card).getByTestId("answer-cook-time")).toHaveTextContent(/ไม่เกิน [\d.]+ นาที ต่อจาน/);
    expect(within(card).getByTestId("answer-seats")).toHaveTextContent("ไม่พอ");
    expect(within(card).getByTestId("answer-seats")).toHaveTextContent("ควรเพิ่มโต๊ะ");
    expect(screen.getByTestId("start-simulation")).toHaveTextContent("จำลองร้านอีกครั้ง");
  });
});

describe("ปุ่มจำลองร้าน 1 วัน: เริ่มไม่ได้ต้องแจ้งผู้ใช้ (feat-095)", () => {
  beforeEach(() => {
    layoutStore.getState().loadLayout(cafeLayout());
    simulationStore.setState({ status: "idle", message: null, metrics: null, analysis: null, config: { ...DEFAULT_DAY_CONFIG, speed: 1 } });
  });

  it("ค่าฟอร์มผิด → toast บอกเหตุผล และไม่เริ่ม", async () => {
    const user = userEvent.setup();
    const toasts: string[] = [];
    simulationStore.getState().setConfig({ peakStart: "21:00", peakEnd: "22:00" });
    function WithToast() {
      const live = useLiveValidation();
      return <SimulationPanel live={live} onToast={(m) => toasts.push(m)} />;
    }
    render(<WithToast />);
    await user.click(screen.getByTestId("start-simulation"));
    expect(toasts).toEqual([expect.stringMatching(/ช่วงคนเยอะ/)]);
    expect(simulationStore.getState().status).toBe("idle");
  });
});
