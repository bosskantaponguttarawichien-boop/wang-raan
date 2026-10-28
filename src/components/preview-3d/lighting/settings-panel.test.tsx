// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createLightingStore } from "@/store/use-lighting-store";
import { parseLocalDateTimeToUtcMs } from "./settings";
import { LightingSettingsPanel } from "./settings-panel";

afterEach(() => {
  cleanup();
});

describe("feat-120: LightingSettingsPanel accessibility, Thai labels, and state updates (settings-panel.tsx)", () => {
  it("renders Thai aria-labels, Bangkok reference disclosure, and switches between realtime and fixed modes without calling navigator.geolocation", () => {
    const fixedNowMs = parseLocalDateTimeToUtcMs("2026-03-21T10:00", "Asia/Bangkok");
    const store = createLightingStore({}, () => fixedNowMs);

    render(<LightingSettingsPanel store={store} />);

    // Verify Thai section and disclosure label
    expect(
      screen.getByRole("region", { name: "ตั้งค่าแสงอาทิตย์และเวลาในฉาก 3 มิติ" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("lighting-reference-disclosure")).toHaveTextContent(
      "ค่าอ้างอิงเริ่มต้น: กรุงเทพฯ (ไม่ได้ตรวจพบตำแหน่งของคุณ)",
    );

    // Default mode is realtime
    const realtimeBtn = screen.getByRole("button", { name: "ใช้เวลาเครื่องจริง (Realtime)" });
    const fixedBtn = screen.getByRole("button", { name: "ใช้เวลาทดสอบคงที่ (Fixed Time)" });
    expect(realtimeBtn).toHaveAttribute("aria-pressed", "true");
    expect(fixedBtn).toHaveAttribute("aria-pressed", "false");

    // Switch to fixed mode
    fireEvent.click(fixedBtn);
    expect(store.getState().settings.mode).toBe("fixed");
    expect(fixedBtn).toHaveAttribute("aria-pressed", "true");

    // Date-time picker appears in fixed mode
    const dateInput = screen.getByLabelText("วันและเวลาทดสอบคงที่");
    expect(dateInput).toBeInTheDocument();
    fireEvent.change(dateInput, { target: { value: "2026-03-21T23:15" } });
    expect(store.getState().settings.fixedDateTimeLocal).toBe("2026-03-21T23:15");
    expect(store.getState().solar.phase).toBe("night");
  });

  it("updates latitude, longitude, north offset, clamps out-of-range coordinates with Thai feedback, and resets to Bangkok defaults", () => {
    const fixedNowMs = parseLocalDateTimeToUtcMs("2026-03-21T09:00", "Asia/Bangkok");
    const store = createLightingStore({ mode: "fixed" }, () => fixedNowMs);

    render(<LightingSettingsPanel store={store} />);

    const latInput = screen.getByLabelText("ละติจูดองศาเหนือ");
    const lonInput = screen.getByLabelText("ลองจิจูดองศาตะวันออก");
    const northInput = screen.getByLabelText("มุมชดเชยทิศเหนือของผังร้าน");

    // Enter valid Tokyo coordinates
    fireEvent.change(latInput, { target: { value: "35.6762" } });
    fireEvent.change(lonInput, { target: { value: "139.6503" } });
    fireEvent.change(northInput, { target: { value: "45" } });

    expect(store.getState().settings.latitude).toBeCloseTo(35.6762, 4);
    expect(store.getState().settings.longitude).toBeCloseTo(139.6503, 4);
    expect(store.getState().settings.northOffsetDegrees).toBe(45);

    // Out-of-range latitude (> 90) clamps to 90 and displays validation feedback
    fireEvent.change(latInput, { target: { value: "125" } });
    expect(store.getState().settings.latitude).toBe(90);
    expect(screen.getByTestId("lighting-validation-message")).toHaveTextContent(
      "ละติจูดถูกปรับให้อยู่ในช่วง -90 ถึง 90 องศา",
    );

    // Click reset button -> restores Bangkok defaults
    const resetBtn = screen.getByRole("button", { name: "คืนค่าอ้างอิงเริ่มต้นกรุงเทพฯ" });
    fireEvent.click(resetBtn);
    expect(store.getState().settings.latitude).toBeCloseTo(13.7563, 4);
    expect(store.getState().settings.longitude).toBeCloseTo(100.5018, 4);
    expect(store.getState().settings.northOffsetDegrees).toBe(0);
  });
});
