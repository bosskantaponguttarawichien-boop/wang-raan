/**
 * ตรรกะของ Simulation Worker แบบ Pure — แยกจากไฟล์ worker เพื่อทดสอบได้โดยไม่ต้องมี Worker จริง
 * P2 Gate: Worker ตรวจผังซ้ำเองเสมอ (ไม่เชื่อผลตรวจจาก UI อย่างเดียว) และเริ่มจำลองได้เฉพาะผังที่ sync แล้วเท่านั้น
 */
import { z } from "zod";
import type { StoreLayout } from "../layout/types";
import { validateLayout } from "../validation/engine";
import { StoreLayoutSchema, ValidationResultSchema } from "../validation/layout.schema";
import { computeLayoutRevision } from "../validation/revision";
import { analyzeDay } from "./day-analysis";
import { Simulation } from "./engine";
import { buildOccupancyGrid } from "./occupancy-grid";
import type { TickMessage, WorkerResponse } from "./protocol";

const RequestId = z.number().int();
const DAY_SECONDS = 24 * 3600;
/** พนักงาน/พ่อครัวสูงสุดต่อตำแหน่ง */
export const MAX_TEAM = 20;

const Minute = z.number().int().min(0).max(24 * 60 - 1);
const BreakWindowSchema = z.object({ startSeconds: z.number().finite().min(0).max(DAY_SECONDS), endSeconds: z.number().finite().min(0).max(DAY_SECONDS) }).refine((rest) => rest.endSeconds > rest.startSeconds);
const PeakWindowSchema = z.object({ startSeconds: z.number().finite().min(0), endSeconds: z.number().finite().min(0), customersPerHour: z.number().finite().min(0).max(600) }).refine((peak) => peak.endSeconds > peak.startSeconds);
const PartyWeightsSchema = z.tuple([z.number().min(0).max(100), z.number().min(0).max(100), z.number().min(0).max(100), z.number().min(0).max(100)]).refine((weights) => weights.some((weight) => weight > 0));
const DayInputSchema = z
  .object({
    openMinute: Minute,
    closeMinute: Minute,
    dailyCustomers: z.number().int().min(1).max(5000),
    peakStartMinute: Minute,
    peakEndMinute: Minute,
    secondPeak: z.object({ startMinute: Minute, endMinute: Minute }).optional(),
    frontStaff: z.number().int().min(1).max(MAX_TEAM),
    cashiers: z.number().int().min(0).max(MAX_TEAM - 1).optional(),
    cooks: z.number().int().min(1).max(MAX_TEAM),
    cookMinutesPerDish: z.number().finite().min(0.5).max(120),
    dineMinutes: z.tuple([z.number().finite().min(1).max(240), z.number().finite().min(1).max(240)]),
    patienceMinutes: z.number().finite().min(1).max(240),
    tablePatienceMinutes: z.number().finite().min(1).max(240).optional(),
    partyWeights: PartyWeightsSchema.optional(),
    varyPatience: z.boolean().optional(),
    queueBalkAt: z.number().int().min(0).max(100).optional(),
    varyMenuTimes: z.boolean().optional(),
    varyStaffSpeed: z.boolean().optional(),
    teamBreak: BreakWindowSchema.optional(),
    staggerBreak: z.boolean().optional(),
    extraDishPercent: z.number().int().min(0).max(100).optional(),
  })
  .refine((d) => d.openMinute !== d.closeMinute, { message: "เวลาเปิดและปิดต้องไม่ตรงกัน" })
  .refine((d) => (d.cashiers ?? 0) < d.frontStaff, { message: "ต้องมีพนักงานบริการอย่างน้อย 1 คน" })
  .refine((d) => d.dineMinutes[0] <= d.dineMinutes[1], { message: "ช่วงเวลาทานไม่ถูกต้อง" });
const RequestSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("PING"), requestId: RequestId }),
  z.object({
    type: z.literal("SYNC_LAYOUT"),
    requestId: RequestId,
    payload: z.object({ layout: StoreLayoutSchema, validation: ValidationResultSchema }),
  }),
  z.object({
    type: z.literal("START"),
    requestId: RequestId,
    layoutRevision: z.string(),
    config: z.object({
      customersPerHour: z.number().finite().min(0).max(600),
      speed: z.number().finite().min(1).max(600),
      seed: z.number().int().optional(),
      serviceStyle: z.enum(["table-service", "counter-order"]).optional(),
      peak: z
        .object({
          startSeconds: z.number().finite().min(0),
          endSeconds: z.number().finite().min(0),
          customersPerHour: z.number().finite().min(0).max(600),
        })
        .nullable()
        .optional(),
      peaks: z.array(PeakWindowSchema).max(2).optional(),
      closeSeconds: z.number().finite().positive().max(DAY_SECONDS).nullable().optional(),
      frontStaff: z.number().int().min(1).max(MAX_TEAM).optional(),
      cashiers: z.number().int().min(0).max(MAX_TEAM - 1).optional(),
      cooks: z.number().int().min(1).max(MAX_TEAM).optional(),
      cookMinutesPerDish: z.number().finite().min(0.5).max(120).optional(),
      dineMinutes: z.tuple([z.number().finite().min(1).max(240), z.number().finite().min(1).max(240)]).optional(),
      patienceMinutes: z.number().finite().min(1).max(240).optional(),
      tablePatienceMinutes: z.number().finite().min(1).max(240).optional(),
      partyWeights: PartyWeightsSchema.optional(),
      varyPatience: z.boolean().optional(),
      queueBalkAt: z.number().int().min(0).max(100).optional(),
      varyMenuTimes: z.boolean().optional(),
      varyStaffSpeed: z.boolean().optional(),
      teamBreak: BreakWindowSchema.optional(),
      staggerBreak: z.boolean().optional(),
      extraDishPercent: z.number().int().min(0).max(100).optional(),
      startAtSeconds: z.number().finite().min(0).max(DAY_SECONDS).optional(),
      stopAtSeconds: z.number().finite().positive().max(DAY_SECONDS + 6 * 3600).optional(),
      skipQuiet: z.boolean().optional(),
    }).refine((d) => (d.cashiers ?? 0) < (d.frontStaff ?? 2), { message: "ต้องมีพนักงานบริการอย่างน้อย 1 คน" }),
  }),
  z.object({
    type: z.literal("ANALYZE_DAY"),
    requestId: RequestId,
    layoutRevision: z.string(),
    input: DayInputSchema,
  }),
  z.object({ type: z.literal("PAUSE"), requestId: RequestId }),
  z.object({ type: z.literal("RESUME"), requestId: RequestId }),
  z.object({ type: z.literal("STOP"), requestId: RequestId }),
  z.object({ type: z.literal("SET_SPEED"), requestId: RequestId, speed: z.number().finite().min(1).max(600) }),
]);

export interface HandledMessage<T = WorkerResponse> {
  response: T;
  /** ArrayBuffer ที่โอนกรรมสิทธิ์ได้ (ไม่ต้องคัดลอก) */
  transfer: ArrayBuffer[];
}

/** ส่ง heatmap ทุก ๆ N tick */
export const HEATMAP_EVERY = 5;

/** ช่วงเงียบ (ไม่มีใครเดิน) เล่นเร็วอย่างน้อยเท่านี้ (วินาทีจำลอง/วินาทีจริง) — ไม่ต้องนั่งดูร้านนิ่ง ๆ */
export const QUIET_SPEED = 60;
/** ร้านว่างทั้งร้าน: ข้ามไปถึงลูกค้ากลุ่มถัดไปได้ในครั้งเดียว ไม่เกินเท่านี้ (วินาทีจำลอง) */
export const EMPTY_SKIP_SECONDS = 2 * 3600;
let nextRuntimeId = 1;

export class SimulationWorkerRuntime {
  private readonly runtimeId = nextRuntimeId++;
  private generation = 0;
  private runId = "";
  private sequence = 0;
  private synced: { layout: StoreLayout; revision: string } | null = null;
  private simulation: Simulation | null = null;
  private running = false;
  private speed = 30;
  private ticks = 0;
  private stopAt: number | null = null;
  private skipQuiet = false;

  get isRunning() {
    return this.running;
  }

  handle(data: unknown): HandledMessage {
    const parsed = RequestSchema.safeParse(data);
    if (!parsed.success) {
      const raw = (data as { requestId?: unknown } | null)?.requestId;
      return this.error(typeof raw === "number" ? raw : -1, "INVALID_MESSAGE", "รูปแบบข้อความไม่ถูกต้อง");
    }
    const message = parsed.data;
    const { requestId } = message;

    switch (message.type) {
      case "PING":
        return { response: { type: "PONG", requestId }, transfer: [] };

      case "SYNC_LAYOUT": {
        const { layout, validation } = message.payload;
        const revision = computeLayoutRevision(layout);
        if (validation.layoutRevision !== revision) {
          return this.error(requestId, "STALE_VALIDATION", "ผลตรวจไม่ตรงกับผังล่าสุด กรุณาตรวจผังใหม่");
        }
        if (validation.status === "blocked" || validateLayout(layout).status === "blocked") {
          this.reset();
          this.synced = null;
          return this.error(requestId, "BLOCKED", "ผังยังไม่ผ่านกฎจำเป็น เริ่มจำลองไม่ได้");
        }
        // ผังเปลี่ยน → หยุดการจำลองเดิม
        if (this.synced?.revision !== revision) this.reset();
        this.synced = { layout, revision };
        const grid = buildOccupancyGrid(layout);
        return {
          response: { type: "STATUS", requestId, status: "READY", layoutRevision: revision, grid },
          transfer: [grid.cells.buffer as ArrayBuffer],
        };
      }

      case "START": {
        if (!this.synced) return this.error(requestId, "NOT_SYNCED", "ยังไม่ได้ส่งผังที่ผ่านการตรวจ");
        if (message.layoutRevision !== this.synced.revision) {
          return this.error(requestId, "STALE_VALIDATION", "ผังเปลี่ยนหลังการตรวจ กรุณาตรวจผังใหม่");
        }
        const { speed, seed, startAtSeconds, stopAtSeconds, skipQuiet, ...options } = message.config;
        const defined = Object.fromEntries(Object.entries(options).filter(([, v]) => v !== undefined));
        this.simulation = new Simulation(this.synced.layout, { ...defined, seed: seed ?? Date.now() % 2 ** 31 });
        this.stopAt = stopAtSeconds ?? null;
        // เดินเวลาเบื้องหลังถึงจุดเริ่มดู (เช่น ต้นช่วงคนเยอะ) แล้วล้าง heatmap ให้เห็นเฉพาะช่วงที่ดู
        if (startAtSeconds) {
          this.simulation.step(startAtSeconds);
          this.simulation.heatmap.fill(0);
        }
        // เก็บทางเดินลูกค้าและพนักงานเฉพาะช่วงที่เล่นภาพ (ช่วงเดินเวลาเบื้องหลังไม่ต้องใช้)
        this.simulation.trackPaths();
        this.skipQuiet = skipQuiet ?? false;
        this.speed = speed;
        this.running = true;
        this.ticks = 0;
        this.runId = `run:${this.runtimeId}:${++this.generation}`;
        this.sequence = 0;
        const { cols, rows, cellSize } = this.simulation.grid;
        // ส่งภาพตั้งต้นพร้อม STARTED แทนการรอ tick แรก: ร้านเปิดใหม่จึงไม่มีลูกค้า
        // แต่พนักงานต้องยืนประจำเคาน์เตอร์ให้เห็นทันทีในทุก renderer รวมถึง SVG บนมือถือ
        const agents = this.simulation.agentBuffer();
        const staff = this.simulation.staffBuffer();
        const presentation = this.simulation.presentationSnapshot({ runId: this.runId, layoutRevision: this.synced.revision, sequence: this.sequence });
        return {
          response: { type: "STARTED", requestId, runId: this.runId, seats: this.simulation.seatCount, grid: { cols, rows, cellSize }, initial: { agents, staff, presentation } },
          transfer: [agents.buffer as ArrayBuffer, staff.buffer as ArrayBuffer],
        };
      }

      case "PAUSE":
      case "RESUME":
        if (!this.simulation) return this.error(requestId, "NOT_RUNNING", "ยังไม่ได้เริ่มจำลอง");
        this.running = message.type === "RESUME";
        return { response: { type: "ACK", requestId, command: message.type }, transfer: [] };

      case "STOP":
        this.reset();
        return { response: { type: "ACK", requestId, command: "STOP" }, transfer: [] };

      case "SET_SPEED":
        this.speed = message.speed;
        return { response: { type: "ACK", requestId, command: "SET_SPEED" }, transfer: [] };

      case "ANALYZE_DAY": {
        // P2 Gate เดียวกับ START: วิเคราะห์ได้เฉพาะผังที่ sync และผ่านการตรวจแล้ว
        if (!this.synced) return this.error(requestId, "NOT_SYNCED", "ยังไม่ได้ส่งผังที่ผ่านการตรวจ");
        if (message.layoutRevision !== this.synced.revision) {
          return this.error(requestId, "STALE_VALIDATION", "ผังเปลี่ยนหลังการตรวจ กรุณาตรวจผังใหม่");
        }
        const analysis = analyzeDay(this.synced.layout, message.input);
        return { response: { type: "ANALYSIS", requestId, layoutRevision: this.synced.revision, analysis }, transfer: [] };
      }
    }
  }

  /**
   * เดินเวลาไป `realMs` มิลลิวินาทีจริง (× speed วินาทีจำลอง/วินาทีจริง) แล้วคืน TICK; null เมื่อไม่ได้รันอยู่
   * ที่ 1× เวลาจำลองเดินเท่าเวลาจริง 1 วินาทีต่อ 1 วินาทีตลอดเวลา (ไม่เร่งความเร็วเองตอนไม่มีใครเดิน)
   * เมื่อเปิด skipQuiet ตอนเริ่มเล่นภาพที่ร้านว่าง จะให้ลูกค้ากลุ่มแรกมาทันทีใน tick แรกเพื่อไม่ต้องรอนั่งดูร้านว่าง
   */
  tick(realMs: number): HandledMessage<TickMessage> | null {
    if (!this.simulation || !this.running) return null;
    if (this.skipQuiet && this.ticks === 0 && this.simulation.isEmpty()) {
      this.simulation.spawnFirstCustomer();
    }
    let seconds = (realMs / 1000) * this.speed;
    if (this.stopAt !== null) seconds = Math.max(0, Math.min(seconds, this.stopAt - this.simulation.getMetrics().time));
    this.simulation.step(seconds);
    const finished = this.stopAt !== null && this.simulation.getMetrics().time >= this.stopAt - 1e-9;
    if (finished) this.running = false;
    const agents = this.simulation.agentBuffer();
    const paths = this.simulation.drainPaths();
    const staff = this.simulation.staffBuffer();
    const sequence = ++this.sequence;
    const presentation = this.simulation.presentationSnapshot({ runId: this.runId, layoutRevision: this.synced!.revision, sequence });
    const tick: TickMessage = { type: "TICK", runId: this.runId, sequence, presentation, agents, paths, staff, metrics: this.simulation.getMetrics() };
    if (finished) tick.finished = true;
    const transfer: ArrayBuffer[] = [agents.buffer as ArrayBuffer, paths.buffer as ArrayBuffer, staff.buffer as ArrayBuffer];
    if (this.ticks++ % HEATMAP_EVERY === 0 || finished) {
      const heatmap = this.simulation.heatmap.slice();
      let max = 0;
      for (const v of heatmap) if (v > max) max = v;
      tick.heatmap = heatmap;
      tick.heatmapMax = max;
      transfer.push(heatmap.buffer as ArrayBuffer);
    }
    return { response: tick, transfer };
  }

  private reset() {
    this.simulation = null;
    this.stopAt = null;
    this.skipQuiet = false;
    this.running = false;
    this.ticks = 0;
    this.runId = "";
    this.sequence = 0;
  }

  private error(requestId: number, code: Extract<WorkerResponse, { type: "ERROR" }>["code"], message: string): HandledMessage {
    return { response: { type: "ERROR", requestId, code, message }, transfer: [] };
  }
}

/** ฟังก์ชันแบบ stateless (ใช้กับ PING / SYNC_LAYOUT ในเทสต์เดิม) */
export function handleWorkerMessage(data: unknown): HandledMessage {
  return new SimulationWorkerRuntime().handle(data);
}
