// @vitest-environment jsdom
import { MessageChannel } from "node:worker_threads";
import { emptyMetrics } from "@/core/simulation";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SimulationWorkerRuntime } from "@/core/simulation";
import { useLiveValidation } from "@/components/validation/use-live-validation";
import { formatClockMinutes, formatClockSeconds } from "@/lib/day-config";
import type { WorkerLike } from "@/lib/simulation-client";
import { createLayoutStore, layoutStore } from "@/store/use-layout-store";
import { DEFAULT_SPEED, SPEED_OPTIONS, createSimulationStore, simulationStore } from "@/store/use-simulation-store";
import { cafeLayout, withoutType } from "@/test/fixtures/layouts";
import { playbackSpeedToWorkerSpeed, SimulationController } from "./simulation-controller";
import { interpolateAgents, paintHeatmap } from "./simulation-overlay";
import { SimulationPanel, formatSimTime } from "./simulation-panel";

/** Worker จำลองบน MessageChannel + SimulationWorkerRuntime จริง (tick ด้วยมือ) */
function fakeWorker(legacyStarted = false) {
  const { port1, port2 } = new MessageChannel();
  const runtime = new SimulationWorkerRuntime();
  const posted: unknown[] = [];
  port2.on("message", (data) => {
    posted.push(data);
    const { response, transfer } = runtime.handle(data);
    // จำลอง tab ที่ยังใช้ Worker bundle รุ่นเก่าในช่วง deploy rollout
    if (legacyStarted && response.type === "STARTED") {
      const { initial: _initial, ...legacyResponse } = response;
      port2.postMessage(legacyResponse);
    } else {
      port2.postMessage(response, transfer);
    }
  });
  const listeners = new Set<(e: MessageEvent) => void>();
  port1.on("message", (data) => listeners.forEach((l) => l({ data } as MessageEvent)));
  const worker: WorkerLike = {
    postMessage: (m) => port1.postMessage(m),
    addEventListener: (_t, l) => listeners.add(l),
    removeEventListener: (_t, l) => listeners.delete(l),
    terminate: () => {
      port1.close();
      port2.close();
    },
  };
  const tick = (ms = 50) => {
    const result = runtime.tick(ms);
    if (result) port2.postMessage(result.response, result.transfer);
  };
  const emit = (data: unknown) => listeners.forEach(listener => listener({ data } as MessageEvent));
  return { worker, runtime, posted, tick, emit };
}

const flush = () => new Promise((r) => setTimeout(r, 20));

/** ชุดทดสอบนี้ตรวจสัญญาเวลา 1× (เวลาจริง) เป็นหลัก — ค่าเริ่มต้นของแอปคือ DEFAULT_SPEED */
function setup(layout = cafeLayout(), legacyStarted = false, now = () => performance.now(), speed = 1) {
  const fake = fakeWorker(legacyStarted);
  const layoutState = createLayoutStore({ initialLayout: layout });
  const sim = createSimulationStore();
  sim.getState().setConfig({ speed });
  const controller = new SimulationController({
    createWorker: () => fake.worker,
    layout: layoutState,
    simulation: sim,
    now,
    metricsThrottleMs: 0,
  });
  return { fake, layoutState, sim, controller };
}

const disposers: Array<() => void> = [];
afterEach(() => {
  disposers.splice(0).forEach((d) => d());
  cleanup();
});

describe("P2 Gate ใน SimulationController", () => {
  it("ผัง Ready → ตรวจซ้ำ → SYNC → ANALYZE_DAY → START ช่วงคนเยอะ → รับ TICK แล้วมีลูกค้า + heatmap", async () => {
    const { fake, layoutState, sim, controller } = setup();
    disposers.push(() => controller.dispose());
    expect(layoutState.getState().validation).toBeNull();
    const result = await controller.start();
    expect(result).toEqual({ ok: true });
    expect(layoutState.getState().validation?.status).toBe("ready"); // ตรวจผังทางการก่อนเริ่มเสมอ
    expect(sim.getState()).toMatchObject({ status: "running", seats: 6 });
    expect(fake.posted.map((m) => (m as { type: string }).type)).toEqual(["SYNC_LAYOUT", "ANALYZE_DAY", "START"]);
    // ค่าตั้งต้น 10:00–20:00 คนเยอะ 11:30–13:00 → ภาพเริ่มตอนเปิดร้าน (ร้านว่าง) แล้วจบเมื่อจบช่วงคนเยอะ
    expect(sim.getState().analysis?.staffing.recommended).not.toBeNull();
    expect(fake.posted.at(-1)).toMatchObject({ type: "START", config: { startAtSeconds: 0, stopAtSeconds: 10_800, cooks: 1, frontStaff: 2, speed: 1, skipQuiet: true } });
    // ไม่ต้องรอ tick แรก: พนักงานประจำเคาน์เตอร์ต้องเห็นพร้อมสถานะ running
    expect(controller.current).not.toBeNull();
    expect(controller.current!.agents).toHaveLength(0);
    expect(controller.current!.staff).toHaveLength(2 * 4);
    for (let i = 0; i < 40; i++) fake.tick(250);
    await flush();
    expect(controller.current).not.toBeNull();
    expect(controller.current!.staff.length).toBe(2 * 4); // พนักงานหน้าร้าน 2 คน
    expect(controller.heatmap).toMatchObject({ cols: 32, rows: 24 });
    expect(sim.getState().metrics!.time).toBeGreaterThan(0);
  });

  it("Worker รุ่นเก่าที่ไม่มี initial frame ยังเริ่มจำลองได้", async () => {
    const { controller, sim } = setup(cafeLayout(), true);
    disposers.push(() => controller.dispose());
    await expect(controller.start()).resolves.toEqual({ ok: true });
    expect(sim.getState().status).toBe("running");
    expect(controller.current).toBeNull(); // รอ TICK แรกตามพฤติกรรมเดิม
  });

  it("สองช่วงพีคส่งไปวิเคราะห์และเล่นภาพจนจบช่วงสุดท้าย", async () => {
    const { fake, sim, controller } = setup();
    disposers.push(() => controller.dispose());
    sim.getState().setConfig({ secondPeakEnabled: true, secondPeakStart: "17:30", secondPeakEnd: "19:00" });
    await expect(controller.start()).resolves.toEqual({ ok: true });
    expect(fake.posted.find((message) => (message as { type: string }).type === "ANALYZE_DAY"))
      .toMatchObject({ input: { secondPeak: { startMinute: 1050, endMinute: 1140 } } });
    expect(fake.posted.at(-1)).toMatchObject({ type: "START", config: { stopAtSeconds: 32400, peaks: [{ startSeconds: 5400, endSeconds: 10800 }, { startSeconds: 27000, endSeconds: 32400 }] } });
  });

  it("จบช่วงคนเยอะ → หยุดเอง กลับโหมดแก้ผัง เก็บผลและ heatmap ไว้", async () => {
    const { fake, sim, controller } = setup();
    disposers.push(() => controller.dispose());
    await controller.start();
    sim.getState().setConfig({ speed: 30 });
    await controller.setSpeed(30);
    // 1500 × 0.25 วิ × x30 = 11250 วิ > เปิดร้านถึงจบพีค 10800 วิ
    for (let i = 0; i < 1500; i++) fake.tick(250);
    await flush();
    await flush();
    expect(sim.getState()).toMatchObject({ status: "idle", message: "ดูช่วงคนเยอะจบแล้ว" });
    expect(sim.getState().metrics!.time).toBeCloseTo(10_800, 5);
    expect(sim.getState().analysis).not.toBeNull();
    expect(controller.heatmap).not.toBeNull();
    expect(controller.current).toBeNull();
  });

  it("ค่าฟอร์มผิด (ช่วงคนเยอะนอกเวลาเปิด) → ไม่ส่งอะไรไป Worker และแจ้งเหตุผล", async () => {
    const { fake, sim, controller } = setup();
    disposers.push(() => controller.dispose());
    sim.getState().setConfig({ peakStart: "21:00", peakEnd: "22:00" });
    const result = await controller.start();
    expect(result.ok).toBe(false);
    expect(sim.getState().message).toMatch(/ช่วงคนเยอะ/);
    expect(fake.posted).toEqual([]);
  });

  it("ผัง Blocked → ไม่ส่งอะไรไป Worker เลย และแจ้งเหตุผล", async () => {
    const { fake, sim, controller } = setup({ ...cafeLayout(), kitchenDoor: null });
    disposers.push(() => controller.dispose());
    const result = await controller.start();
    expect(result).toEqual({ ok: false, reason: "ผังยังไม่ผ่านกฎจำเป็น 1 ข้อ จึงเริ่มจำลองไม่ได้" });
    expect(fake.posted).toEqual([]);
    expect(sim.getState().status).toBe("idle");
  });

  it("แก้ผังระหว่างจำลอง → หยุดทันทีและล้างภาพ", async () => {
    const { fake, layoutState, sim, controller } = setup();
    disposers.push(() => controller.dispose());
    await controller.start();
    fake.tick(1000);
    await flush();
    const table = layoutState.getState().layout.objects.find((o) => o.type === "table")!;
    layoutState.getState().updateObjectPosition(table.id, table.x + 0.25, table.y);
    expect(sim.getState()).toMatchObject({ status: "idle", message: "ผังเปลี่ยนระหว่างจำลอง จึงหยุดการจำลองแล้ว" });
    expect(controller.current).toBeNull();
    expect(controller.heatmap).toBeNull();
    await flush();
    expect(fake.posted.at(-1)).toMatchObject({ type: "STOP" });
  });

  it("pause / resume / speed / stop", async () => {
    const { fake, sim, controller } = setup();
    disposers.push(() => controller.dispose());
    await controller.start();
    await controller.pause();
    expect(sim.getState().status).toBe("paused");
    await controller.resume();
    await controller.setSpeed(2);
    expect(sim.getState().config.speed).toBe(2);
    expect(fake.posted.at(-1)).toMatchObject({ type: "SET_SPEED", speed: 2 });
    fake.tick(100);
    await flush();
    await controller.stop();
    expect(sim.getState().status).toBe("idle");
    expect(fake.posted.map((m) => (m as { type: string }).type)).toEqual(["SYNC_LAYOUT", "ANALYZE_DAY", "START", "PAUSE", "RESUME", "SET_SPEED", "STOP"]);
    // หยุดแล้วกดซ้ำได้อีกครั้ง
    expect(await controller.start()).toEqual({ ok: true });
  });

  it("กดเริ่มซ้ำระหว่างกำลังจำลอง → ปฏิเสธ", async () => {
    const { controller } = setup();
    disposers.push(() => controller.dispose());
    await controller.start();
    expect(await controller.start()).toEqual({ ok: false, reason: "กำลังจำลองอยู่แล้ว" });
  });
});

describe("สเกลเวลาเล่นภาพ", () => {
  it("x1 = เวลาจริง และทุกตัวเลือกแปลงเป็นหน่วย Worker ถูกต้อง", () => {
    expect(SPEED_OPTIONS.map(playbackSpeedToWorkerSpeed)).toEqual([1, 2, 5, 10, 30]);
  });

  it("ค่าเริ่มต้นเล่นที่ 30× และส่งตัวคูณนี้ให้ Worker", async () => {
    expect(DEFAULT_SPEED).toBe(30);
    expect(createSimulationStore().getState().config.speed).toBe(30);
    const { fake, controller } = setup(cafeLayout(), false, () => performance.now(), DEFAULT_SPEED);
    disposers.push(() => controller.dispose());
    await controller.start();
    expect(fake.posted.find((m) => (m as { type: string }).type === "START")).toMatchObject({ config: { speed: 30 } });
  });

  it("เวลาย่อแบบเกมที่ 30×: พนักงานเดินบนจอไม่เกิน 1.75 เท่าคนจริง และนาฬิกาชะลอทีละน้อยให้ภาพไล่ทัน", async () => {
    let now = 0;
    const { fake, controller, sim } = setup(cafeLayout(), false, () => now, 30);
    disposers.push(() => controller.dispose());
    await controller.start();
    const start = controller.current!.staff;
    const x = start[1]!, y = start[2]!;
    let previousX = x;
    let fastest = 0;
    let fastestOverall = 0;
    const speeds: number[] = [];
    for (let i = 0; i <= 40; i++) {
      now = i * 100;
      const tick = fake.runtime.tick(i === 0 ? 0 : 100)!.response;
      // การจำลองพาพนักงานไปไกล 30 ม. ทันที — เกินกว่าที่ภาพเดินทันมาก
      fake.emit({ ...tick, staff: new Float32Array([0, x + 30, y, 1]) });
      await flush();
      const staffX = controller.current!.staff[1]!;
      if (i > 0 && i <= 8) fastest = Math.max(fastest, (staffX - previousX) / 0.1);
      if (i > 0) fastestOverall = Math.max(fastestOverall, (staffX - previousX) / 0.1);
      previousX = staffX;
      speeds.push(controller.current!.timing!.playbackRate);
    }
    // ท่าเดินช่วงแรก: เร็วกว่าคนจริง (1.2 ม./วิ) ไม่เกิน 1.75 เท่า ไม่วิ่งวูบตามเวลา 30×
    expect(fastest).toBeGreaterThan(1.2);
    expect(fastest).toBeLessThanOrEqual(1.2 * 1.75 + 1e-6);
    // ค้างหลังมากจนชะลอสุดแล้ว เร่งท่าเดินได้ไม่เกิน 3 เท่าคนจริง
    expect(fastestOverall).toBeLessThanOrEqual(1.2 * 3 + 1e-6);
    // นาฬิกาชะลอทีละขั้นเล็ก ๆ ไม่กระโดด และไม่ต่ำกว่า 7.5× (1/4 ของที่เลือก เมื่อรอให้ภาพไปถึงงานที่โต๊ะ); ป้ายความเร็วที่ผู้ใช้เลือกยังเป็น 30×
    expect(Math.min(...speeds)).toBeLessThan(30);
    expect(Math.min(...speeds)).toBeGreaterThanOrEqual(7.5 - 1e-6);
    for (let i = 1; i < speeds.length; i++) expect(Math.abs(speeds[i]! - speeds[i - 1]!)).toBeLessThanOrEqual(30 * 0.4 * 0.1 + 0.2);
    expect(sim.getState().config.speed).toBe(30);
    expect(fake.posted.some((m) => (m as { type: string; speed?: number }).type === "SET_SPEED" && (m as { speed: number }).speed < 30)).toBe(true);
  });

  it("controller ใช้ความเร็วแต่ละคนจาก metadata และพนักงานเดิน 6 เมตรใน 5 วินาที", async () => {
    let now = 0;
    const { fake, controller } = setup(cafeLayout(), false, () => now);
    disposers.push(() => controller.dispose());
    await controller.start();
    const start = controller.current!.staff;
    const x = start[1]!, y = start[2]!;
    let previous: Float32Array | null = null;
    const distances = [0, 0];
    for (let i = 0; i <= 50; i++) {
      now = i * 100;
      const tick = fake.runtime.tick(i === 0 ? 0 : 100)!.response;
      const presentation = tick.presentation!;
      fake.emit({ ...tick,
        agents: new Float32Array([10, x + 60, y, 3, 11, x + 60, y + 1, 3]),
        paths: i === 0 ? new Float32Array([10, 2, x, y, x + 60, y, 11, 2, x, y + 1, x + 60, y + 1]) : undefined,
        staff: new Float32Array([0, x + 6, y, 3]),
        presentation: { ...presentation, customers: [10, 11].map((id, index) => ({
          renderAgentId: id, partyId: 1, memberIndex: index, tableId: null, chairId: null,
          serviceCycleId: null, activity: "walking", seatingPhase: null, walkMetersPerSecond: index ? 1.4 : 1, mealId: null,
        })) },
      });
      const current = controller.current!.agents;
      if (previous) for (let member = 0; member < 2; member++) {
        const offset = member * 4;
        distances[member]! += Math.hypot(current[offset + 1]! - previous[offset + 1]!, current[offset + 2]! - previous[offset + 2]!);
      }
      previous = current;
    }
    expect(controller.current!.staff[1]! - x).toBeCloseTo(6, 4);
    // Includes the entrance corner; sampled chords may be slightly shorter than the complete path.
    expect(distances[0]).toBeGreaterThan(4.75); expect(distances[0]).toBeLessThanOrEqual(5.001);
    expect(distances[1]).toBeGreaterThan(6.65); expect(distances[1]).toBeLessThanOrEqual(7.001);
    expect(controller.current!.presentation?.customers.map(c => c.walkMetersPerSecond)).toEqual([1, 1.4]);
    expect(controller.current!.timing).toMatchObject({ simulationSeconds: expect.closeTo(5), deltaSeconds: expect.closeTo(0.1), playbackRate: 1 });
  });

  it("ซ่อนแท็บ 60 วินาทีหยุด Worker แล้วกลับมาไม่เดินชดเชย; manual pause ยังคงหยุด", async () => {
    let now = 0;
    const { fake, controller, sim } = setup(cafeLayout(), false, () => now);
    disposers.push(() => controller.dispose());
    await controller.start();
    now = 100; fake.tick(100); await flush();
    await controller.setVisibility(true);
    const time = sim.getState().metrics!.time;
    now += 60_000; fake.tick(60_000); await flush();
    expect(sim.getState().status).toBe("paused");
    expect(sim.getState().metrics!.time).toBe(time);
    await controller.setVisibility(false);
    expect(sim.getState().status).toBe("running");
    now += 100; fake.tick(100); await flush();
    expect(controller.current!.timing!.deltaSeconds).toBeCloseTo(0.1);
    now += 100; fake.tick(100); await flush();
    expect(controller.current!.timing!.deltaSeconds).toBeCloseTo(0.1);
    await controller.pause(); await controller.setVisibility(true); await controller.setVisibility(false);
    expect(sim.getState().status).toBe("paused");
    // Rapid hide/show settles in the latest requested state.
    await controller.resume();
    await Promise.all([controller.setVisibility(true), controller.setVisibility(false)]);
    expect(sim.getState().status).toBe("running");
  });

  it("เครื่องช้าทำให้ TICK มาช้าเป็นช่วง ๆ → ตั้งต้นภาพใหม่แล้วเล่นต่อเอง ไม่ค้างรอให้กดเล่นต่อ", async () => {
    // feat-137: เครื่องที่วาดได้ 3–4 fps ทำให้ TICK ถึง main thread ช้ากว่า 0.5 วินาที
    // เดิมถือเป็นช่องว่างแล้วหยุดภาพทุกครั้ง การจำลองจึงค้างตั้งแต่วินาทีแรกและไม่กลับมาเอง
    let now = 0;
    const { fake, controller, sim } = setup(cafeLayout(), false, () => now);
    disposers.push(() => controller.dispose());
    await controller.start();
    now = 100; fake.tick(100); await flush();
    expect(sim.getState().status).toBe("running");
    // สามรอบที่ TICK มาช้า 700 ms ติดกัน — ต้องยังเล่นอยู่และเวลาจำลองเดินหน้าเรื่อย ๆ
    for (let round = 0; round < 3; round += 1) {
      const before = sim.getState().metrics?.time ?? 0;
      now += 700; fake.tick(700); await flush();
      expect(sim.getState().status).toBe("running");
      expect(sim.getState().metrics!.time).toBeGreaterThan(before);
    }
    // ตั้งต้นใหม่แล้วต้องมีเฟรมให้วาดจริง และไม่ไล่เวลาที่ทิ้งไป
    expect(controller.current).not.toBeNull();
    expect(controller.current!.timing!.deltaSeconds).toBe(0);
    // เฟรมปกติถัดไปเดินเวลาตามจริงต่อได้
    now += 100; fake.tick(100); await flush();
    expect(sim.getState().status).toBe("running");
    expect(controller.current!.timing!.deltaSeconds).toBeCloseTo(0.1);
  });

  it("เปิดมุมมอง 3D ครั้งแรกบล็อก main thread หลายวินาที → เล่นต่อเอง ไม่ต้องกดเล่นต่อ", async () => {
    // feat-137: โหลด GLB + คอมไพล์ shader ครั้งแรกบล็อก main thread ได้หลายวินาที
    // เดิมถือเป็นช่องว่างยาวแล้วหยุดภาพ ผู้ใช้จึงเห็น "หยุดชั่วคราว" ทันทีที่เปิด 3D
    let now = 0;
    const { fake, controller, sim } = setup(cafeLayout(), false, () => now);
    disposers.push(() => controller.dispose());
    await controller.start();
    now = 100; fake.tick(100); await flush();
    expect(sim.getState().status).toBe("running");
    const before = sim.getState().metrics!.time;
    // บล็อก 6 วินาที: worker เดินเวลาต่อ แล้ว TICK ทั้งหมดมาถึงทีเดียว
    now += 6000; fake.tick(6000); await flush();
    expect(sim.getState().status).toBe("running");
    expect(sim.getState().metrics!.time).toBeGreaterThan(before);
    expect(controller.current!.timing!.deltaSeconds).toBe(0);
  });

  it("tick ขาดหายยาวหยุดภาพก่อนกระโดด และ dispose ถอด listener ของผัง", async () => {
    let now = 0;
    const { fake, controller, sim, layoutState } = setup(cafeLayout(), false, () => now);
    await controller.start();
    const before = controller.current;
    now = 60_000; fake.tick(60_000); await flush();
    expect(sim.getState().status).toBe("paused");
    expect(controller.current).toBe(before);
    controller.dispose(); controller.dispose();
    sim.setState({ status: "idle", message: "after dispose" });
    layoutState.getState().loadLayout(cafeLayout());
    expect(sim.getState().message).toBe("after dispose");
    await expect(controller.start()).resolves.toMatchObject({ ok: false });
  });
});

function Panel() {
  const live = useLiveValidation();
  return <SimulationPanel live={live} />;
}

describe("ปุ่มเริ่มจำลอง (feat-020, feat-055)", () => {
  beforeEach(() => {
    layoutStore.getState().loadLayout(cafeLayout());
    simulationStore.setState({ status: "idle", message: null, metrics: null });
  });

  it("Blocked → ปุ่ม aria-disabled=\"true\" และบอกเหตุผลเป็นข้อความ (aria-describedby)", () => {
    layoutStore.getState().loadLayout(withoutType(cafeLayout(), "counter"));
    render(<Panel />);
    const button = screen.getByTestId("start-simulation");
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).not.toBeDisabled();
    expect(button).toHaveTextContent("แก้อีก 1 ข้อก่อนเริ่ม");
    expect(button).toHaveAccessibleDescription("ต้องแก้ผัง 1 ข้อก่อน ปุ่มเริ่มจำลองจะกดได้เมื่อผังพร้อม");
  });

  it("Ready → กดได้; แก้ผังจน Blocked → ปุ่ม aria-disabled=\"true\" ทันที", () => {
    render(<Panel />);
    const button = screen.getByTestId("start-simulation");
    expect(button).toHaveAttribute("aria-disabled", "false");
    act(() => layoutStore.getState().removeKitchenDoor());
    expect(screen.getByTestId("start-simulation")).toHaveAttribute("aria-disabled", "true");
  });

  it("Warning → ยังกดเริ่มจำลองได้", () => {
    layoutStore.getState().loadLayout({
      ...cafeLayout(),
      objects: [...cafeLayout().objects, { id: "t-empty", type: "table", x: 6, y: 5, width: 0.8, depth: 0.8, rotation: 0, chairIds: [] }],
    });
    render(<Panel />);
    expect(screen.getByTestId("start-simulation")).toHaveAttribute("aria-disabled", "false");
  });

  it("Blocked แล้วคลิกหรือกด Enter ก็ไม่เริ่ม และเรียก toast เตือน (PRD §9 ข้อ 9)", async () => {
    const user = userEvent.setup();
    layoutStore.getState().loadLayout({ ...cafeLayout(), kitchenDoor: null });
    const start = vi.spyOn(SimulationController.prototype, "start");
    const onToast = vi.fn();
    const onFocus = vi.fn();
    function PanelWithMocks() {
      const live = useLiveValidation();
      return <SimulationPanel live={live} onToast={onToast} onFocusIssue={onFocus} />;
    }
    render(<PanelWithMocks />);
    await user.click(screen.getByTestId("start-simulation"));
    expect(start).not.toHaveBeenCalled();
    expect(onToast).toHaveBeenCalledWith(expect.stringContaining("ยังเริ่มจำลองไม่ได้"));
    start.mockRestore();
  });

  it("ระหว่างจำลองแสดงปุ่มหยุดชั่วคราว/จบรอบ และตัวเลขสรุป", () => {
    simulationStore.setState({
      status: "running",
      seats: 6,
      metrics: { ...emptyMetrics(), time: 3900, arrived: 10, served: 4, noSeat: 1, inStore: 5, queuing: 1, seated: 3, maxQueue: 2, avgVisitMinutes: 22.5 },
    });
    render(<Panel />);
    expect(screen.getByRole("button", { name: "⏸ หยุดชั่วคราว" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "■ จบรอบ" })).toBeInTheDocument();
    expect(screen.getByTestId("simulation-metrics")).toHaveTextContent("1 ชม. 05 นาที");
    expect(screen.getByTestId("simulation-metrics")).toHaveTextContent("3 / 6 ที่");
  });
});

describe("Overlay helpers", () => {
  it("formatSimTime และ formatClockSeconds", () => {
    expect(formatSimTime(59)).toBe("0 นาที");
    expect(formatSimTime(125 * 60)).toBe("2 ชม. 05 นาที");
    expect(formatClockSeconds(600, 0)).toBe("10:00:00");
    expect(formatClockSeconds(600, 5)).toBe("10:00:05");
    expect(formatClockSeconds(600, 65)).toBe("10:01:05");
    // นาฬิการะหว่างเล่นภาพโชว์แค่นาที (ปัดลง)
    expect(formatClockMinutes(600, 0)).toBe("10:00");
    expect(formatClockMinutes(600, 119)).toBe("10:01");
    expect(formatClockMinutes(1439, 120)).toBe("00:01");
  });

  it("interpolateAgents: เลื่อนระหว่าง 2 tick ตาม id และไม่ interpolate เมื่อกระโดดไกล", () => {
    const staff = new Float32Array(0);
    const prev = { at: 0, agents: new Float32Array([1, 0, 0, 0, 2, 5, 5, 4]), staff };
    const curr = { at: 50, agents: new Float32Array([1, 0.5, 0, 0, 2, 1, 1, 5, 3, 2, 2, 0]), staff };
    expect(interpolateAgents(prev, curr, 0.5)).toEqual([
      [0.25, 0, 0],
      [1, 1, 5],
      [2, 2, 0],
    ]);
    expect(interpolateAgents(null, null, 1)).toEqual([]);
  });

  it("paintHeatmap: ช่องว่างโปร่งใส, ช่องหนาแน่นสุดเป็นสีแดงอมส้ม", () => {
    const image = { data: new Uint8ClampedArray(3 * 4) } as ImageData;
    paintHeatmap({ values: new Float32Array([0, 1, 4]), max: 4, cols: 3, rows: 1 }, image);
    expect(image.data[3]).toBe(0);
    expect(Array.from(image.data.slice(8, 12))).toEqual([228, 104, 93, 160]);
    expect(image.data[7]).toBeGreaterThan(0);
  });
});
