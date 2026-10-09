/**
 * SimulationController — เจ้าของ Web Worker และบังคับ P2 Validation Gate (PRD §3.1 ข้อ 5, C-05/C-07)
 *
 * start():
 *   1. ตรวจผังล่าสุดซ้ำ (store.runValidation) — ผลตรวจบน UI ไม่ถูกเชื่อถือ
 *   2. Blocked → ไม่เริ่ม
 *   3. สร้าง P1 → P2 contract แล้วตรวจด้วย Zod (P1LayoutContractSchema)
 *   4. SYNC_LAYOUT → Worker ตรวจซ้ำอีกชั้น → START
 * ผังเปลี่ยนระหว่างจำลอง → หยุดทันที (ผลจำลองเดิมไม่ตรงกับผังแล้ว)
 */
import type { StoreApi } from "zustand/vanilla";
import type { TickMessage } from "@/core/simulation";
import { P1LayoutContractSchema } from "@/core/validation";
import { SimulationClient, createSimulationWorker, type WorkerLike } from "@/lib/simulation-client";
import { layoutStore, type LayoutStoreState } from "@/store/use-layout-store";
import { simulationStore, type SimulationStoreState } from "@/store/use-simulation-store";

export interface SimulationFrame {
  /** เวลาที่ได้รับ (performance.now) */
  at: number;
  agents: Float32Array;
}

export interface HeatmapFrame {
  values: Float32Array;
  max: number;
  cols: number;
  rows: number;
}

export type StartResult = { ok: true } | { ok: false; reason: string };

export interface ControllerDeps {
  createWorker: () => WorkerLike;
  layout: StoreApi<LayoutStoreState>;
  simulation: StoreApi<SimulationStoreState>;
  now: () => number;
  /** อัปเดต metrics ใน store ไม่เกินทุก ๆ N ms (กัน re-render ถี่) */
  metricsThrottleMs?: number;
}

export class SimulationController {
  private client: SimulationClient | null = null;
  private unsubscribeTick: (() => void) | null = null;
  private lastMetricsAt = -Infinity;
  private grid: { cols: number; rows: number } | null = null;
  previous: SimulationFrame | null = null;
  current: SimulationFrame | null = null;
  heatmap: HeatmapFrame | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly deps: ControllerDeps) {
    deps.layout.subscribe((state, prev) => {
      if (state.layout === prev.layout) return;
      // ผังเปลี่ยน: heatmap เดิมใช้ไม่ได้ และหยุดการจำลองที่กำลังรัน
      const status = deps.simulation.getState().status;
      if (status !== "idle") void this.stop("ผังเปลี่ยนระหว่างจำลอง จึงหยุดการจำลองแล้ว");
      this.clearFrames();
    });
  }

  /** แจ้ง overlay เมื่อมีเฟรมใหม่ */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }

  private ensureClient(): SimulationClient {
    if (!this.client) {
      this.client = new SimulationClient(this.deps.createWorker());
      this.unsubscribeTick = this.client.onTick((tick) => this.onTick(tick));
    }
    return this.client;
  }

  private setSim(patch: Partial<SimulationStoreState>) {
    this.deps.simulation.setState(patch);
  }

  async start(): Promise<StartResult> {
    const sim = this.deps.simulation.getState();
    if (sim.status === "starting" || sim.status === "running") return { ok: false, reason: "กำลังจำลองอยู่แล้ว" };

    // 1–2. ตรวจผังล่าสุดซ้ำเสมอ
    const validation = this.deps.layout.getState().runValidation();
    const layout = this.deps.layout.getState().layout;
    if (validation.status === "blocked") {
      const reason = `ผังยังไม่ผ่านกฎจำเป็น ${validation.issues.filter((i) => i.severity === "blocked").length} ข้อ จึงเริ่มจำลองไม่ได้`;
      this.setSim({ message: reason });
      return { ok: false, reason };
    }

    // 3. สัญญา P1 → P2
    const contract = P1LayoutContractSchema.safeParse({ contractVersion: "p1-layout-v1", layout, validation });
    if (!contract.success) {
      const reason = "ข้อมูลผังไม่ตรงตามสัญญา P1 → P2";
      this.setSim({ message: reason });
      return { ok: false, reason };
    }

    this.setSim({ status: "starting", message: null, metrics: null });
    this.clearFrames();
    try {
      const client = this.ensureClient();
      const synced = await client.syncLayout(layout, validation);
      if (synced.type !== "STATUS") throw new Error(synced.type === "ERROR" ? synced.message : "Worker ตอบกลับไม่ถูกต้อง");
      const { config } = this.deps.simulation.getState();
      const started = await client.request({
        type: "START",
        layoutRevision: validation.layoutRevision,
        config: { customersPerHour: config.customersPerHour, speed: config.speed },
      });
      if (started.type !== "STARTED") throw new Error(started.type === "ERROR" ? started.message : "เริ่มจำลองไม่สำเร็จ");
      // ระหว่างรอ Worker ผู้ใช้อาจแก้ผัง/กดหยุดไปแล้ว
      if (this.deps.simulation.getState().status !== "starting") {
        await client.request({ type: "STOP" });
        return { ok: false, reason: "ยกเลิกการเริ่มจำลอง" };
      }
      this.grid = { cols: started.grid.cols, rows: started.grid.rows };
      this.setSim({ status: "running", seats: started.seats });
      return { ok: true };
    } catch (error) {
      const reason = (error as Error).message;
      this.setSim({ status: "idle", message: reason });
      return { ok: false, reason };
    }
  }

  async pause() {
    if (this.deps.simulation.getState().status !== "running" || !this.client) return;
    await this.client.request({ type: "PAUSE" });
    this.setSim({ status: "paused" });
  }

  async resume() {
    if (this.deps.simulation.getState().status !== "paused" || !this.client) return;
    await this.client.request({ type: "RESUME" });
    this.setSim({ status: "running" });
  }

  async setSpeed(speed: number) {
    this.deps.simulation.getState().setConfig({ speed });
    if (this.client && this.deps.simulation.getState().status !== "idle") await this.client.request({ type: "SET_SPEED", speed });
  }

  async stop(message: string | null = null) {
    const wasActive = this.deps.simulation.getState().status !== "idle";
    this.setSim({ status: "idle", message });
    // เก็บ heatmap ล่าสุดไว้ดูต่อ แต่ล้างจุดลูกค้า
    this.previous = null;
    this.current = null;
    this.emit();
    if (wasActive && this.client) await this.client.request({ type: "STOP" }).catch(() => undefined);
  }

  private clearFrames() {
    this.previous = null;
    this.current = null;
    this.heatmap = null;
    this.emit();
  }

  private onTick(tick: TickMessage) {
    const status = this.deps.simulation.getState().status;
    if (status !== "running" && status !== "paused") return;
    const now = this.deps.now();
    this.previous = this.current;
    this.current = { at: now, agents: tick.agents };
    if (tick.heatmap && this.grid) {
      this.heatmap = { values: tick.heatmap, max: tick.heatmapMax ?? 0, ...this.grid };
    }
    if (now - this.lastMetricsAt >= (this.deps.metricsThrottleMs ?? 250)) {
      this.lastMetricsAt = now;
      this.setSim({ metrics: tick.metrics });
    }
    this.emit();
  }

  dispose() {
    this.unsubscribeTick?.();
    this.client?.dispose();
    this.client = null;
  }
}

let singleton: SimulationController | null = null;

/** Controller เดียวต่อแท็บ (สร้าง Worker เมื่อเริ่มจำลองครั้งแรก) */
export function getSimulationController(): SimulationController {
  singleton ??= new SimulationController({
    createWorker: createSimulationWorker,
    layout: layoutStore,
    simulation: simulationStore,
    now: () => performance.now(),
  });
  return singleton;
}
