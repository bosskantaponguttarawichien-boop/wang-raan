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
 * เวลาย่อแบบเกม (PacingGovernor): เร่งเวลาสูง ท่าเดินไม่เร่งตาม และชะลอนาฬิกาเนียน ๆ เมื่อภาพพนักงานค้างหลัง
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
import { DeliveryHold, PUT_DOWN_SECONDS } from "./motion/delivery-hold";
import {
  CUSTOMER_BACKLOG_GRACE_SECONDS, MIN_TASK_SHOW_SECONDS, PacingGovernor, motionRate, type PacingState,
} from "./motion/pacing-governor";

export interface SimulationFrame {
  /** เวลาที่ได้รับ (performance.now) */
  at: number;
  agents: Float32Array;
  /** พนักงานหน้าร้าน: index, x, y, STAFF_STATE_CODE */
  staff: Float32Array;
  presentation?: PresentationSnapshot;
  /**
   * Tick time for scene actions; delta is simulation time, already scaled once.
   * playbackRate = ตัวคูณเวลาที่ Worker ใช้จริง (อาจถูกชะลอจากที่ผู้ใช้เลือก),
   * motionRate = ท่าทางเร็วกว่าคนจริงกี่เท่า
   */
  timing?: { simulationSeconds: number; deltaSeconds: number; playbackRate: number; motionRate?: number };
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

/**
 * เวลาที่ยอมทิ้งแล้วตั้งต้นภาพใหม่ทั้งที่ยังเล่นต่อ (วินาทีจำลองหลังหารด้วยตัวคูณความเร็ว)
 *
 * ช่องว่างระดับวินาทีเป็นเรื่องปกติของฝั่งภาพ ไม่ใช่สัญญาณว่าการจำลองเสีย: เปิดมุมมอง 3D ครั้งแรก
 * ต้องโหลด GLB และคอมไพล์ shader ซึ่งบล็อก main thread ได้หลายวินาที เครื่องที่ไม่มี GPU ก็ค้างเป็น
 * ช่วง ๆ ได้อีก ทุกกรณีนี้ต้องเล่นต่อได้เองโดยไม่ต้องให้ผู้ใช้กด "เล่นต่อ"
 *
 * เพดานนี้จึงกว้างพอจะคลุมจังหวะโหลดฉาก แต่ยังแคบกว่าช่องว่างระดับ "เครื่องหลับ/แท็บถูกพักยาว"
 * (หลายสิบวินาทีขึ้นไป) ซึ่งตัวละครจะกระโดดไกลจนดูไม่รู้เรื่อง จึงยังหยุดภาพไว้ให้ผู้ใช้ตัดสินใจ
 */
const MAX_RESYNC_SECONDS = 10;
/** ส่ง SET_SPEED ห่างกันอย่างน้อยเท่านี้ (ms) ระหว่างชะลอ/เร่งนาฬิกา */
const PACING_SEND_INTERVAL_MS = 100;
/** งานที่พนักงานต้องยืนทำที่โต๊ะ — ภาพต้องเดินไปถึงทันเห็น (วางจานใช้ DeliveryHold แทน) */
const TABLE_TASKS = new Set(["taking-order", "clearing", "wiping"]);
/** ภาพพนักงานอยู่ใกล้จุดทำงานเท่านี้ (ม.) ถือว่าถึงแล้ว (ตรงกับ alignPresentation) */
const AT_SERVICE_POINT = 0.12;

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
  private readonly governor = new PacingGovernor();
  private readonly deliveries = new DeliveryHold();
  /** วินาทีจริงที่ภาพเล่นไปแล้ว ไม่นับช่วงหยุด/แท็บซ่อน — นาฬิกาของท่าวางจาน (DeliveryHold) */
  private playedSeconds = 0;
  /** ตัวคูณเวลาที่ Worker ใช้อยู่ (ส่งไปล่าสุด) */
  private workerSpeed = 1;
  private pacing: PacingState = { speed: 1, walkRate: 1 };
  private lastPacingSentAt = -Infinity;
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
      const stopAt = plan.peaks.at(-1)?.endSeconds ?? Math.min(plan.closeSeconds, DEFAULT_PLAYBACK_SECONDS);
      const { input } = day;
      const started = await client.request({
        type: "START",
        layoutRevision: validation.layoutRevision,
        config: {
          serviceStyle: "table-service",
          customersPerHour: plan.customersPerHour,
          peak: plan.peak,
          peaks: plan.peaks,
          closeSeconds: plan.closeSeconds,
          frontStaff: input.frontStaff,
          cashiers: input.cashiers,
          cooks: input.cooks,
          cookMinutesPerDish: input.cookMinutesPerDish,
          dineMinutes: input.dineMinutes,
          patienceMinutes: input.patienceMinutes,
          tablePatienceMinutes: input.tablePatienceMinutes,
          partyWeights: input.partyWeights,
          varyPatience: input.varyPatience,
          queueBalkAt: input.queueBalkAt,
          varyMenuTimes: input.varyMenuTimes,
          varyStaffSpeed: input.varyStaffSpeed,
          teamBreak: input.teamBreak,
          staggerBreak: input.staggerBreak,
          extraDishPercent: input.extraDishPercent,
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
      this.resetPacing(config.speed);
      if (started.initial) {
        const initialAt = this.deps.now();
        const walkSpeed = VISUAL_WALK_SPEED * this.pacing.walkRate;
        this.previous = null;
        this.current = {
          at: initialAt,
          agents: this.pacer.update(started.initial.agents, undefined, 0, walkSpeed),
          staff: this.staffPacer.update(started.initial.staff, 0, STAFF_WALK_SPEED * this.pacing.walkRate, this.workerSpeed, this.bridge.current !== null),
          presentation: this.bridge.current ?? undefined,
          timing: { simulationSeconds: this.bridge.current?.simTimeSeconds ?? 0, deltaSeconds: 0, ...this.rates() },
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
    this.resetPacing(multiplier);
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

  /**
   * ตั้งต้นภาพใหม่ให้ตรงกับเวลาจำลองที่ worker บอก โดยไม่หยุดการเล่น
   * ใช้เมื่อภาพกับเวลาหลุดจากกัน (เครื่องช้า/TICK มาช้า/คิว pacer ล้น) — ตัวละครจะกระโดดเข้าที่ครั้งเดียว
   * ซึ่งดีกว่าหยุดภาพค้างแล้วรอให้ผู้ใช้กดเล่นต่อเอง
   */
  private resync(simulationSeconds: number, now: number) {
    this.pacer.reset(); this.staffPacer.reset(); this.velocities.clear(); this.deliveries.reset();
    this.clock.reset(simulationSeconds, now);
    this.previous = null; this.current = null;
    this.resyncOnNextTick = false;
  }

  private resetPacing(selected: number) {
    this.governor.reset();
    this.workerSpeed = selected;
    this.pacing = this.governor.state(selected);
    this.lastPacingSentAt = -Infinity;
  }

  /** ตัวคูณที่ฉาก 3D ใช้: เวลาจำลองตามที่ Worker เดินจริง ท่าทางตามเพดานภาพ */
  private rates() {
    return { playbackRate: this.workerSpeed, motionRate: motionRate(this.workerSpeed) };
  }

  /** ชะลอ/เร่งนาฬิกาตามที่ภาพค้างหลัง — ส่งให้ Worker เฉพาะเมื่อเปลี่ยนพอสมควร ไม่ถี่เกิน */
  private updatePacing(selected: number, dt: number, now: number, staff: Float32Array, snapshot: PresentationSnapshot | null) {
    const staffSpeed = STAFF_WALK_SPEED * this.pacing.walkRate;
    const staffBacklog = this.staffPacer.backlogSeconds(staffSpeed, this.workerSpeed);
    const customerBacklog = this.pacer.backlogSeconds(id => (this.velocities.get(id) ?? VISUAL_WALK_SPEED) * this.pacing.walkRate);
    this.pacing = this.governor.update(
      selected, Math.max(staffBacklog, customerBacklog - CUSTOMER_BACKLOG_GRACE_SECONDS), dt, this.taskSpeedLimit(staff, snapshot, staffSpeed),
    );
    const target = this.pacing.speed;
    if (!this.client || target === this.workerSpeed || now - this.lastPacingSentAt < PACING_SEND_INTERVAL_MS) return;
    const settled = target === selected;
    if (!settled && Math.abs(target - this.workerSpeed) < Math.max(0.005 * selected, 0.05)) return;
    this.workerSpeed = target;
    this.lastPacingSentAt = now;
    void this.client.request({ type: "SET_SPEED", speed: playbackSpeedToWorkerSpeed(target) }).catch(() => undefined);
  }

  /**
   * ตัวคูณสูงสุดที่ภาพพนักงานยังเดินไปถึงงานที่โต๊ะ (ที่การจำลองเริ่มแล้ว) ทันเห็นอย่างน้อย MIN_TASK_SHOW_SECONDS
   * ไม่มีงานรอ → Infinity
   */
  private taskSpeedLimit(staff: Float32Array, snapshot: PresentationSnapshot | null, staffSpeed: number): number {
    if (!snapshot) return Number.POSITIVE_INFINITY;
    let limit = Number.POSITIVE_INFINITY;
    const milestones = new Map(snapshot.milestones.map(entry => [entry.taskId, entry]));
    for (const member of snapshot.staff) {
      if (!TABLE_TASKS.has(member.activity) || !member.servicePoint) continue;
      // เก็บจานต่อด้วยเช็ดที่จุดเดิม: นับเวลาจนเช็ดเสร็จ ไม่ใช่แค่ช่วงเก็บจานที่สั้นมาก (ไม่งั้นชะลอสุดทุกครั้ง)
      const wipeEnd = member.activity === "clearing" && member.taskId ? milestones.get(member.taskId)?.wipeFinishedAtSeconds ?? null : null;
      const remaining = Math.max(member.phaseEndsAtSeconds, wipeEnd ?? 0) - snapshot.simTimeSeconds;
      if (!(remaining > 0)) continue;
      let offset = 0;
      while (offset < staff.length && staff[offset] !== member.staffId) offset += 4;
      if (offset >= staff.length) continue;
      if (Math.hypot(staff[offset + 1]! - member.servicePoint.x, staff[offset + 2]! - member.servicePoint.y) <= AT_SERVICE_POINT) continue;
      const arrival = this.staffPacer.backlogFor(member.staffId, staffSpeed, this.workerSpeed);
      limit = Math.min(limit, remaining / (arrival + MIN_TASK_SHOW_SECONDS));
    }
    return limit;
  }

  /** จานเสิร์ฟตามภาพพนักงาน (ถือถาดจนถึงโต๊ะ แล้วหยุดวางจาน) — ไม่ใช่ตามเวลาจำลองที่วางไปก่อนแล้ว */
  private holdDeliveries(snapshot: PresentationSnapshot, staff: Float32Array, playedDelta: number) {
    // ใช้เวลาที่ภาพเล่นจริง ไม่ใช่นาฬิกาเครื่อง: หยุดชั่วคราวนาน ๆ แล้วเล่นต่อ ถาดต้องยังอยู่ในมือและท่าวางไม่ข้าม
    this.playedSeconds += Math.max(0, playedDelta);
    const held = this.deliveries.apply(snapshot, staff, this.playedSeconds, this.workerSpeed);
    for (const stop of this.deliveries.newStops) {
      this.staffPacer.holdAt(stop.staffId, stop.point.x, stop.point.y, PUT_DOWN_SECONDS * this.workerSpeed);
    }
    return held;
  }

  private resetPacer() {
    this.pacer.reset();
    this.deliveries.reset();
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
    const selected = this.deps.simulation.getState().config.speed;
    const playback = this.workerSpeed;
    const snapshot = this.bridge.current;
    if (this.resyncOnNextTick) this.resync(tick.metrics.time, now);
    let timing = this.clock.advance(tick.metrics.time, now, playback, snapshot !== null);
    if (timing.gap) {
      if (timing.seconds > MAX_RESYNC_SECONDS) {
        // ช่องว่างยาวจริง (แท็บถูกพัก/เครื่องหยุดไปนาน) — หยุดภาพก่อนให้ตัวละครกระโดดไกล
        this.resyncOnNextTick = true;
        // ที่ความเร็วสูงบนเครื่องที่วาดไม่ทัน การหยุดจะเกิดซ้ำเรื่อย ๆ จึงบอกทางแก้ไปด้วย
        // ไม่ใช่แจ้งแค่ว่าหยุดแล้วปล่อยให้ผู้ใช้กดเล่นต่อวนไปเรื่อย ๆ
        this.setSim({
          message: selected > 1
            ? `หยุดชั่วคราวเพื่อให้ภาพและเวลาตรงกัน — เครื่องวาดภาพไม่ทันที่ ${selected}× ลองลดความเร็วลงแล้วเล่นต่อ`
            : "หยุดชั่วคราวเพื่อให้ภาพและเวลาตรงกัน",
        });
        void this.pause(); return;
      }
      // เครื่องช้าทำให้ TICK มาช้าเป็นช่วง ๆ (โหลดโมเดล, GC, ฉากหนาแน่น): ตั้งต้นภาพใหม่ให้ตรงกับ
      // เวลาจำลองจริงแล้วเล่นต่อทันที — ทิ้งเวลาที่ขาดไปตาม architecture.md §5.3.2 (ไม่ไล่เวลา ไม่เล่นย้อน)
      // เดิมหยุดทุกกรณีแล้วรอผู้ใช้กด "เล่นต่อ" เอง เครื่องที่วาดได้ 3–4 fps จึงค้างตั้งแต่วินาทีแรก
      this.resync(tick.metrics.time, now);
      timing = { seconds: 0, gap: false };
    }
    if (snapshot) for (const customer of snapshot.customers) this.velocities.set(customer.renderAgentId, customer.walkMetersPerSecond);
    const walkRate = this.pacing.walkRate;
    const walkSpeed = (id: number) => (this.velocities.get(id) ?? VISUAL_WALK_SPEED) * walkRate;
    let sourceStaff = tick.staff ?? new Float32Array(0);
    if (snapshot?.staff.some(member => member.activity === "pickup")) {
      sourceStaff = sourceStaff.slice();
      const hidden = new Set(snapshot.staff.filter(member => member.activity === "pickup").map(member => member.staffId));
      for (let offset = 0; offset < sourceStaff.length; offset += 4) if (hidden.has(sourceStaff[offset]!)) sourceStaff[offset + 3] = 5;
    }
    this.previous = this.current;
    const agents = this.pacer.update(tick.agents, tick.paths, timing.seconds, walkSpeed);
    const staff = this.staffPacer.update(sourceStaff, timing.seconds, STAFF_WALK_SPEED * walkRate, playback, snapshot !== null);
    for (const id of this.velocities.keys()) if (!this.pacer.has(id)) this.velocities.delete(id);
    this.current = {
      at: now,
      agents, staff, presentation: snapshot ? alignPresentation(this.holdDeliveries(snapshot, staff, timing.seconds), agents, staff) : undefined,
      timing: { simulationSeconds: tick.metrics.time, deltaSeconds: timing.seconds * playback, ...this.rates() },
    };
    this.updatePacing(selected, timing.seconds, now, staff, snapshot);
    // คิวของ pacer ล้น = ภาพตามตำแหน่งจริงไม่ทัน ตั้งต้นใหม่ใน TICK ถัดไปโดยไม่หยุดภาพ
    if (this.pacer.needsResync || this.staffPacer.needsResync) this.resyncOnNextTick = true;
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
