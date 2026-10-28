/**
 * SimulationController — เจ้าของ Web Worker และบังคับ P2 Validation Gate (PRD §3.1 ข้อ 5, C-05/C-07)
 *
 * start():
 *   1. ตรวจผังล่าสุดซ้ำ (store.runValidation) — ผลตรวจบน UI ไม่ถูกเชื่อถือ
 *   2. Blocked → ไม่เริ่ม
 *   3. สร้าง P1 → P2 contract แล้วตรวจด้วย Zod (P1LayoutContractSchema)
 *   4. SYNC_LAYOUT → Worker ตรวจซ้ำอีกชั้น → ANALYZE_DAY (จำลองทั้งวันเบื้องหลัง ตอบ 3 คำถาม, feat-095)
 *   5. START ตั้งแต่เปิดร้าน (ร้านว่าง) → หยุดเองเมื่อจบช่วงคนเยอะ (TICK finished)
 *      ที่ 1× เวลาเดินตามเวลาจริง 1 วินาทีต่อ 1 วินาที และให้ลูกค้ากลุ่มแรกมาทันทีตอนเริ่ม (ไม่ต้องรอนั่งดูร้านว่าง)
 * ตำแหน่งลูกค้าที่ส่งให้ภาพผ่าน WalkPacer และพนักงานผ่าน StaffPacer ก่อน — ภาพเดินตามทางจริงด้วยความเร็วคนเดิน
 * (พนักงานแวะเข้าครัวก่อนเสิร์ฟด้วย)
 * ผังเปลี่ยนระหว่างจำลอง → หยุดทันที (ผลจำลองเดิมไม่ตรงกับผังแล้ว)
 */
import type { StoreApi } from "zustand/vanilla";
import { ANALYSIS_SEEDS, STAFF_WALK_SPEED, type TickMessage } from "@/core/simulation";
import type { PresentationSnapshot } from "@/core/simulation/presentation-contract";
import { toDayInput } from "@/lib/day-config";
import { P1LayoutContractSchema } from "@/core/validation";
import { SimulationClient, createSimulationWorker, type WorkerLike } from "@/lib/simulation-client";
import { layoutStore, type LayoutStoreState } from "@/store/use-layout-store";
import {
  REAL_SECONDS_TO_SIMULATION_SECONDS_AT_1X,
  simulationStore,
  type SimulationStoreState,
} from "@/store/use-simulation-store";
import { StaffPacer } from "./staff-pacer";
import { VISUAL_WALK_SPEED, WalkPacer, doorFrame, wallDoorFrame } from "./walk-pacer";
import { PresentationBridge } from "./presentation-bridge";
import { PlaybackClock } from "./motion/playback-clock";
import { alignPresentation } from "./motion/presentation-frame";

export interface SimulationFrame {
  /** เวลาที่ได้รับ (performance.now) */
  at: number;
  agents: Float32Array;
  /** พนักงานหน้าร้าน: index, x, y, STAFF_STATE_CODE */
  staff: Float32Array;
  presentation?: PresentationSnapshot;
  /** Tick time for scene actions; delta is simulation time, already scaled once. */
  timing?: { simulationSeconds: number; deltaSeconds: number; playbackRate: number };
}

export interface HeatmapFrame {
  values: Float32Array;
  max: number;
  cols: number;
  rows: number;
}

export type StartResult = { ok: true } | { ok: false; reason: string };

/** วิเคราะห์ทั้งวันอาจใช้หลายวินาทีบนเครื่องช้า */
export const ANALYZE_TIMEOUT_MS = 60_000;
/** ไม่มีช่วงคนเยอะ → ดูภาพชั่วโมงแรกหลังเปิดร้าน */
const DEFAULT_PLAYBACK_SECONDS = 3600;

/** แปลงตัวคูณที่ผู้ใช้เลือกให้เป็นหน่วยที่ Simulation Worker ใช้ */
export function playbackSpeedToWorkerSpeed(multiplier: number): number {
  return multiplier * REAL_SECONDS_TO_SIMULATION_SECONDS_AT_1X;
}

export interface ControllerDeps {
  createWorker: () => WorkerLike;
  layout: StoreApi<LayoutStoreState>;
  simulation: StoreApi<SimulationStoreState>;
  now: () => number;
  /** อัปเดต metrics ใน store ไม่เกินทุก ๆ N ms (กัน re-render ถี่) */
  metricsThrottleMs?: number;
  visibility?: { isHidden: () => boolean; subscribe: (listener: () => void) => () => void };
}

export class SimulationController {
  private client: SimulationClient | null = null;
  private unsubscribeTick: (() => void) | null = null;
  private lastMetricsAt = -Infinity;
  private grid: { cols: number; rows: number } | null = null;
  /** ภาพลูกค้าเดินเท่าคนจริง — current/previous เป็นตำแหน่งที่ผ่าน pacer แล้ว */
  private readonly pacer = new WalkPacer();
  /** ภาพพนักงานเดินเท่าคนจริง และแวะเข้าครัวก่อนเสิร์ฟ */
  private readonly staffPacer = new StaffPacer();
  private readonly bridge = new PresentationBridge();
  private readonly clock = new PlaybackClock();
  private readonly velocities = new Map<number, number>();
  private readonly unsubscribeLayout: () => void;
  private readonly unsubscribeVisibility?: () => void;
  private hidden = false;
  private autoPaused = false;
  private resyncOnNextTick = false;
  private visibilityTransition: Promise<void> = Promise.resolve();
  private epoch = 0;
  private disposed = false;
  previous: SimulationFrame | null = null;
  current: SimulationFrame | null = null;
  heatmap: HeatmapFrame | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly deps: ControllerDeps) {
    this.unsubscribeLayout = deps.layout.subscribe((state, prev) => {
      if (state.layout === prev.layout) return;
      // ผังเปลี่ยน: heatmap เดิมใช้ไม่ได้ และหยุดการจำลองที่กำลังรัน
      const status = deps.simulation.getState().status;
      if (status !== "idle") void this.stop("ผังเปลี่ยนระหว่างจำลอง จึงหยุดการจำลองแล้ว");
      this.clearFrames();
    });
    this.hidden = deps.visibility?.isHidden() ?? false;
    this.unsubscribeVisibility = deps.visibility?.subscribe(() => { void this.setVisibility(deps.visibility!.isHidden()); });
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
    if (this.disposed) return { ok: false, reason: "การจำลองนี้ปิดแล้ว" };
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

    const { config } = this.deps.simulation.getState();
    const day = toDayInput(config);
    if (!day.ok) {
      this.setSim({ message: day.reason });
      return { ok: false, reason: day.reason };
    }

    const epoch = ++this.epoch;
    this.setSim({ status: "starting", message: null, metrics: null, analysis: null });
    this.clearFrames();
    // ลูกค้าเดินมาจากนอกร้าน / ต่อแถวรอโต๊ะนอกประตู (เฉพาะภาพ)
    this.pacer.setDoor(doorFrame(layout));
    // พนักงานเดินเข้าประตูครัวไปรับอาหาร (เฉพาะภาพ — engine รับอาหารที่ช่องติดผนัง)
    this.staffPacer.setKitchenDoor(wallDoorFrame(layout, layout.kitchenDoor));
    try {
      const client = this.ensureClient();
      const synced = await client.syncLayout(layout, validation);
      if (synced.type !== "STATUS") throw new Error(synced.type === "ERROR" ? synced.message : "Worker ตอบกลับไม่ถูกต้อง");
      if (epoch !== this.epoch) return { ok: false, reason: "ยกเลิกการเริ่มจำลอง" };
      const analyzed = await client.request(
        { type: "ANALYZE_DAY", layoutRevision: validation.layoutRevision, input: day.input },
        ANALYZE_TIMEOUT_MS,
      );
      if (analyzed.type !== "ANALYSIS") throw new Error(analyzed.type === "ERROR" ? analyzed.message : "คำนวณผลทั้งวันไม่สำเร็จ");
      if (epoch !== this.epoch || this.deps.simulation.getState().status !== "starting") return { ok: false, reason: "ยกเลิกการเริ่มจำลอง" };
      this.setSim({ analysis: analyzed.analysis });

      const { plan } = analyzed.analysis;
      // เริ่มตั้งแต่เปิดร้าน ร้านยังว่าง แล้วดูลูกค้าทยอยเข้าจนจบช่วงคนเยอะ
      const startAt = 0;
      const stopAt = plan.peak?.endSeconds ?? Math.min(plan.closeSeconds, DEFAULT_PLAYBACK_SECONDS);
      const { input } = day;
      const started = await client.request({
        type: "START",
        layoutRevision: validation.layoutRevision,
        config: {
          serviceStyle: "table-service",
          customersPerHour: plan.customersPerHour,
          peak: plan.peak,
          closeSeconds: plan.closeSeconds,
          frontStaff: input.frontStaff,
          cooks: input.cooks,
          cookMinutesPerDish: input.cookMinutesPerDish,
          dineMinutes: input.dineMinutes,
          patienceMinutes: input.patienceMinutes,
          // ลูกค้าชุดเดียวกับที่วิเคราะห์ ภาพจะตรงกับคำตอบ
          seed: ANALYSIS_SEEDS[0],
          speed: playbackSpeedToWorkerSpeed(config.speed),
          startAtSeconds: startAt,
          stopAtSeconds: stopAt,
          skipQuiet: true,
        },
      });
      if (started.type !== "STARTED") throw new Error(started.type === "ERROR" ? started.message : "เริ่มจำลองไม่สำเร็จ");
      // ระหว่างรอ Worker ผู้ใช้อาจแก้ผัง/กดหยุดไปแล้ว
      if (epoch !== this.epoch || this.deps.simulation.getState().status !== "starting") {
        if (epoch === this.epoch) await client.request({ type: "STOP" });
        return { ok: false, reason: "ยกเลิกการเริ่มจำลอง" };
      }
      this.grid = { cols: started.grid.cols, rows: started.grid.rows };
      this.bridge.begin(validation.layoutRevision, { runId: started.runId, presentation: started.initial?.presentation });
      // Worker รุ่นใหม่ส่ง frame ตั้งต้นให้เห็นพนักงานทันที; ระหว่าง rollout
      // อาจยังเจอ Worker รุ่นเก่าที่ไม่มี initial จึงรอ TICK แรกแทน ห้ามทำให้เริ่มจำลองล้มเหลว
      if (started.initial) {
        const initialAt = this.deps.now();
        const walkSpeed = VISUAL_WALK_SPEED * config.speed;
        this.previous = null;
        this.current = {
          at: initialAt,
          agents: this.pacer.update(started.initial.agents, undefined, 0, walkSpeed),
          staff: this.staffPacer.update(started.initial.staff, 0, STAFF_WALK_SPEED * config.speed, config.speed, this.bridge.current !== null),
          presentation: this.bridge.current ?? undefined,
          timing: { simulationSeconds: this.bridge.current?.simTimeSeconds ?? 0, deltaSeconds: 0, playbackRate: config.speed },
        };
        this.clock.reset(this.bridge.current?.simTimeSeconds ?? null, initialAt);
        this.emit();
      }
      this.setSim({ status: "running", seats: started.seats });
      if (this.hidden) void this.setVisibility(true);
      return { ok: true };
    } catch (error) {
      if (epoch !== this.epoch) return { ok: false, reason: "ยกเลิกการเริ่มจำลอง" };
      const reason = (error as Error).message;
      this.setSim({ status: "idle", message: reason });
      return { ok: false, reason };
    }
  }

  async pause() {
    if (this.deps.simulation.getState().status !== "running" || !this.client) return;
    this.setSim({ status: "paused" });
    try { await this.client.request({ type: "PAUSE" }); }
    catch { await this.stop("หยุดการจำลอง เนื่องจากเชื่อมต่อการจำลองไม่ได้"); }
  }

  async resume() {
    if (this.deps.simulation.getState().status !== "paused" || !this.client) return;
    const epoch = this.epoch;
    await this.client.request({ type: "RESUME" });
    if (epoch !== this.epoch || this.deps.simulation.getState().status !== "paused") return;
    const now = this.deps.now();
    this.clock.reset(this.bridge.current?.simTimeSeconds ?? null, now);
    if (this.current) { this.current = { ...this.current, at: now, timing: this.current.timing ? { ...this.current.timing, deltaSeconds: 0 } : undefined }; this.previous = this.current; }
    this.setSim({ status: "running" });
  }

  /** Serialise rapid hide/show events, so an outstanding PAUSE cannot strand the run. */
  setVisibility(hidden: boolean): Promise<void> {
    this.hidden = hidden;
    this.visibilityTransition = this.visibilityTransition.then(async () => {
      if (this.disposed) return;
      if (this.hidden && this.deps.simulation.getState().status === "running") {
        this.autoPaused = true; await this.pause();
      } else if (!this.hidden && this.autoPaused && this.deps.simulation.getState().status === "paused") {
        this.autoPaused = false; await this.resume();
      }
    }).catch(() => this.stop("หยุดการจำลอง เนื่องจากเชื่อมต่อการจำลองไม่ได้"));
    return this.visibilityTransition;
  }

  async setSpeed(multiplier: number) {
    this.deps.simulation.getState().setConfig({ speed: multiplier });
    if (this.client && this.deps.simulation.getState().status !== "idle") {
      await this.client.request({ type: "SET_SPEED", speed: playbackSpeedToWorkerSpeed(multiplier) });
    }
  }

  async stop(message: string | null = null) {
    this.epoch++;
    this.autoPaused = false;
    const wasActive = this.deps.simulation.getState().status !== "idle";
    this.setSim({ status: "idle", message });
    // เก็บ heatmap ล่าสุดไว้ดูต่อ แต่ล้างจุดลูกค้า
    this.previous = null;
    this.current = null;
    this.resetPacer();
    this.emit();
    if (wasActive && this.client) await this.client.request({ type: "STOP" }).catch(() => undefined);
  }

  private clearFrames() {
    this.previous = null;
    this.current = null;
    this.heatmap = null;
    this.resetPacer();
    this.emit();
  }

  private resetPacer() {
    this.pacer.reset();
    this.staffPacer.reset();
    this.clock.reset();
    this.bridge.reset();
    this.velocities.clear();
    this.resyncOnNextTick = false;
    this.lastMetricsAt = -Infinity;
  }

  private onTick(tick: TickMessage) {
    const status = this.deps.simulation.getState().status;
    if (status !== "running" || this.hidden || !this.bridge.accept(tick)) return;
    const now = this.deps.now();
    const playback = this.deps.simulation.getState().config.speed;
    const snapshot = this.bridge.current;
    if (this.resyncOnNextTick) {
      this.pacer.reset(); this.staffPacer.reset(); this.velocities.clear();
      this.clock.reset(tick.metrics.time, now); this.previous = null; this.current = null;
      this.resyncOnNextTick = false;
    }
    const timing = this.clock.advance(tick.metrics.time, now, playback, snapshot !== null);
    if (timing.gap) {
      this.resyncOnNextTick = true;
      this.setSim({ message: "หยุดชั่วคราวเพื่อให้ภาพและเวลาตรงกัน" });
      void this.pause(); return;
    }
    if (snapshot) for (const customer of snapshot.customers) this.velocities.set(customer.renderAgentId, customer.walkMetersPerSecond);
    const walkSpeed = (id: number) => (this.velocities.get(id) ?? VISUAL_WALK_SPEED) * playback;
    let sourceStaff = tick.staff ?? new Float32Array(0);
    if (snapshot?.staff.some(member => member.activity === "pickup")) {
      sourceStaff = sourceStaff.slice();
      const hidden = new Set(snapshot.staff.filter(member => member.activity === "pickup").map(member => member.staffId));
      for (let offset = 0; offset < sourceStaff.length; offset += 4) if (hidden.has(sourceStaff[offset]!)) sourceStaff[offset + 3] = 5;
    }
    this.previous = this.current;
    const agents = this.pacer.update(tick.agents, tick.paths, timing.seconds, walkSpeed);
    const staff = this.staffPacer.update(sourceStaff, timing.seconds, STAFF_WALK_SPEED * playback, playback, snapshot !== null);
    for (const id of this.velocities.keys()) if (!this.pacer.has(id)) this.velocities.delete(id);
    this.current = {
      at: now,
      agents, staff, presentation: snapshot ? alignPresentation(snapshot, agents, staff) : undefined,
      timing: { simulationSeconds: tick.metrics.time, deltaSeconds: timing.seconds * playback, playbackRate: playback },
    };
    if (this.pacer.needsResync || this.staffPacer.needsResync) {
      this.resyncOnNextTick = true; void this.pause();
    }
    if (tick.heatmap && this.grid) {
      this.heatmap = { values: tick.heatmap, max: tick.heatmapMax ?? 0, ...this.grid };
    }
    if (tick.finished || now - this.lastMetricsAt >= (this.deps.metricsThrottleMs ?? 250)) {
      this.lastMetricsAt = now;
      this.setSim({ metrics: tick.metrics });
    }
    this.emit();
    // จบช่วงที่ดูแล้ว — worker หยุดเดินเวลาเอง; กลับสู่โหมดแก้ผัง เก็บผลและ heatmap ไว้
    if (tick.finished) void this.stop("ดูช่วงคนเยอะจบแล้ว");
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.epoch++;
    this.unsubscribeLayout(); this.unsubscribeVisibility?.(); this.listeners.clear();
    this.unsubscribeTick?.();
    this.client?.dispose();
    this.client = null;
    this.previous = null; this.current = null; this.heatmap = null;
    this.resetPacer();
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
    visibility: typeof document === "undefined" ? undefined : {
      isHidden: () => document.hidden,
      subscribe: listener => { document.addEventListener("visibilitychange", listener); return () => document.removeEventListener("visibilitychange", listener); },
    },
  });
  return singleton;
}
