// @vitest-environment jsdom
import { MessageChannel } from "node:worker_threads";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SimulationWorkerRuntime } from "@/core/simulation";
import { useLiveValidation } from "@/components/validation/use-live-validation";
import type { WorkerLike } from "@/lib/simulation-client";
import { createLayoutStore, layoutStore } from "@/store/use-layout-store";
import { createSimulationStore, simulationStore } from "@/store/use-simulation-store";
import { cafeLayout, withoutType } from "@/test/fixtures/layouts";
import { SimulationController } from "./simulation-controller";
import { interpolateAgents, paintHeatmap } from "./simulation-overlay";
import { SimulationPanel, formatSimTime } from "./simulation-panel";

/** Worker จำลองบน MessageChannel + SimulationWorkerRuntime จริง (tick ด้วยมือ) */
function fakeWorker() {
  const { port1, port2 } = new MessageChannel();
  const runtime = new SimulationWorkerRuntime();
  const posted: unknown[] = [];
  port2.on("message", (data) => {
    posted.push(data);
    const { response, transfer } = runtime.handle(data);
    port2.postMessage(response, transfer);
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
  return { worker, runtime, posted, tick };
}

const flush = () => new Promise((r) => setTimeout(r, 20));

function setup(layout = cafeLayout()) {
  const fake = fakeWorker();
  const layoutState = createLayoutStore({ initialLayout: layout });
  const sim = createSimulationStore();
  const controller = new SimulationController({
    createWorker: () => fake.worker,
    layout: layoutState,
    simulation: sim,
    now: () => performance.now(),
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
  it("ผัง Ready → ตรวจซ้ำ → SYNC → START → รับ TICK แล้วมีลูกค้า + heatmap", async () => {
    const { fake, layoutState, sim, controller } = setup();
    disposers.push(() => controller.dispose());
    expect(layoutState.getState().validation).toBeNull();
    const result = await controller.start();
    expect(result).toEqual({ ok: true });
    expect(layoutState.getState().validation?.status).toBe("ready"); // ตรวจผังทางการก่อนเริ่มเสมอ
    expect(sim.getState()).toMatchObject({ status: "running", seats: 6 });
    expect(fake.posted.map((m) => (m as { type: string }).type)).toEqual(["SYNC_LAYOUT", "START"]);
    for (let i = 0; i < 40; i++) fake.tick(250);
    await flush();
    expect(controller.current).not.toBeNull();
    expect(controller.heatmap).toMatchObject({ cols: 32, rows: 24 });
    expect(sim.getState().metrics!.time).toBeGreaterThan(0);
  });

  it("ผัง Blocked → ไม่ส่งอะไรไป Worker เลย และแจ้งเหตุผล", async () => {
    const { fake, sim, controller } = setup(withoutType(cafeLayout(), "kitchen"));
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
    await controller.setSpeed(120);
    expect(sim.getState().config.speed).toBe(120);
    fake.tick(100);
    await flush();
    await controller.stop();
    expect(sim.getState().status).toBe("idle");
    expect(fake.posted.map((m) => (m as { type: string }).type)).toEqual(["SYNC_LAYOUT", "START", "PAUSE", "RESUME", "SET_SPEED", "STOP"]);
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

function Panel() {
  const live = useLiveValidation();
  return <SimulationPanel live={live} />;
}

describe("ปุ่มเริ่มจำลอง (feat-020)", () => {
  beforeEach(() => {
    layoutStore.getState().loadLayout(cafeLayout());
    simulationStore.setState({ status: "idle", message: null, metrics: null });
  });

  it("Blocked → ปุ่ม disabled และบอกเหตุผลเป็นข้อความ (aria-describedby)", () => {
    layoutStore.getState().loadLayout(withoutType(cafeLayout(), "counter"));
    render(<Panel />);
    const button = screen.getByTestId("start-simulation");
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent("เริ่มจำลอง (ต้องแก้ผังก่อน)");
    expect(button).toHaveAccessibleDescription("ต้องแก้ผัง 1 ข้อก่อน ปุ่มเริ่มจำลองจะกดได้เมื่อผังพร้อม");
  });

  it("Ready → กดได้; แก้ผังจน Blocked → ปุ่ม disabled ทันที", () => {
    render(<Panel />);
    const button = screen.getByTestId("start-simulation");
    expect(button).toBeEnabled();
    const kitchen = layoutStore.getState().layout.objects.find((o) => o.type === "kitchen")!;
    act(() => layoutStore.getState().deleteObject(kitchen.id));
    expect(screen.getByTestId("start-simulation")).toBeDisabled();
  });

  it("Warning → ยังกดเริ่มจำลองได้", () => {
    layoutStore.getState().loadLayout({
      ...cafeLayout(),
      objects: [...cafeLayout().objects, { id: "t-empty", type: "table", x: 6, y: 5, width: 0.8, depth: 0.8, rotation: 0, chairIds: [] }],
    });
    render(<Panel />);
    expect(screen.getByTestId("start-simulation")).toBeEnabled();
  });

  it("disabled แล้วคลิกหรือกด Enter ก็ไม่เริ่ม", async () => {
    const user = userEvent.setup();
    layoutStore.getState().loadLayout(withoutType(cafeLayout(), "kitchen"));
    const start = vi.spyOn(SimulationController.prototype, "start");
    render(<Panel />);
    await user.click(screen.getByTestId("start-simulation"));
    await user.keyboard("{Enter}");
    expect(start).not.toHaveBeenCalled();
    start.mockRestore();
  });

  it("ระหว่างจำลองแสดงปุ่มหยุดชั่วคราว/หยุด และตัวเลขสรุป", () => {
    simulationStore.setState({
      status: "running",
      seats: 6,
      metrics: { time: 3900, arrived: 10, served: 4, noSeat: 1, inStore: 5, queuing: 1, seated: 3, maxQueue: 2, avgVisitMinutes: 22.5 },
    });
    render(<Panel />);
    expect(screen.getByRole("button", { name: "⏸ หยุดชั่วคราว" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "■ หยุดจำลอง" })).toBeInTheDocument();
    expect(screen.getByTestId("simulation-metrics")).toHaveTextContent("1 ชม. 05 นาที");
    expect(screen.getByTestId("simulation-metrics")).toHaveTextContent("3 / 6 ที่");
  });
});

describe("Overlay helpers", () => {
  it("formatSimTime", () => {
    expect(formatSimTime(59)).toBe("0 นาที");
    expect(formatSimTime(125 * 60)).toBe("2 ชม. 05 นาที");
  });

  it("interpolateAgents: เลื่อนระหว่าง 2 tick ตาม id และไม่ interpolate เมื่อกระโดดไกล", () => {
    const prev = { at: 0, agents: new Float32Array([1, 0, 0, 0, 2, 5, 5, 4]) };
    const curr = { at: 50, agents: new Float32Array([1, 0.5, 0, 0, 2, 1, 1, 5, 3, 2, 2, 0]) };
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
