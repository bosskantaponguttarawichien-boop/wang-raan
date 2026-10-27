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
const DayInputSchema = z
  .object({
    openMinute: Minute,
    closeMinute: Minute,
    dailyCustomers: z.number().int().min(1).max(5000),
    peakStartMinute: Minute,
    peakEndMinute: Minute,
    frontStaff: z.number().int().min(1).max(MAX_TEAM),
    cooks: z.number().int().min(1).max(MAX_TEAM),
    cookMinutesPerDish: z.number().finite().min(0.5).max(120),
    dineMinutes: z.tuple([z.number().finite().min(1).max(240), z.number().finite().min(1).max(240)]),
    patienceMinutes: z.number().finite().min(1).max(240),
  })
  .refine((d) => d.openMinute !== d.closeMinute, { message: "เวลาเปิดและปิดต้องไม่ตรงกัน" })
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
      closeSeconds: z.number().finite().positive().max(DAY_SECONDS).nullable().optional(),
      frontStaff: z.number().int().min(1).max(MAX_TEAM).optional(),
      cooks: z.number().int().min(1).max(MAX_TEAM).optional(),
      cookMinutesPerDish: z.number().finite().min(0.5).max(120).optional(),
      dineMinutes: z.tuple([z.number().finite().min(1).max(240), z.number().finite().min(1).max(240)]).optional(),
      patienceMinutes: z.number().finite().min(1).max(240).optional(),
      startAtSeconds: z.number().finite().min(0).max(DAY_SECONDS).optional(),
      stopAtSeconds: z.number().finite().positive().max(DAY_SECONDS + 6 * 3600).optional(),
      easeIn: z.boolean().optional(),
    }),
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

/** เริ่มเล่นภาพแบบค่อย ๆ เร่ง: เดินเวลาเท่าของจริงช่วงนี้ (ลูกค้าเดินเข้าร้านให้เห็น) */
export const EASE_IN_HOLD_MS = 6000;
/** แล้วค่อย ๆ เร่งจากเวลาจริงถึงความเร็วที่เลือกภายในช่วงนี้ */
export const EASE_IN_RAMP_MS = 4000;
/** ก่อนเริ่มเล่นภาพ เดินเวลาเบื้องหลังหาลูกค้ากลุ่มถัดไปได้ไม่เกินเท่านี้ (วินาทีจำลอง) */
export const EASE_IN_LOOKAHEAD_SECONDS = 10 * 60;

/** ความเร็ว (วินาทีจำลอง/วินาทีจริง) หลังเริ่มเล่นภาพไป `elapsedMs`: 1 → target แบบทวีคูณ ไม่กระชาก */
export function easedSpeed(target: number, elapsedMs: number): number {
  if (elapsedMs <= EASE_IN_HOLD_MS) return Math.min(1, target);
  const p = Math.min(1, (elapsedMs - EASE_IN_HOLD_MS) / EASE_IN_RAMP_MS);
  return target ** (p * p * (3 - 2 * p));
}

export class SimulationWorkerRuntime {
  private synced: { layout: StoreLayout; revision: string } | null = null;
  private simulation: Simulation | null = null;
  private running = false;
  private speed = 30;
  private ticks = 0;
  private stopAt: number | null = null;
  /** มิลลิวินาทีจริงที่เล่นไปแล้วช่วงค่อย ๆ เร่ง; null = ไม่อยู่ในช่วงนี้ */
  private easeInMs: number | null = null;

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
        const { speed, seed, startAtSeconds, stopAtSeconds, easeIn, ...options } = message.config;
        const defined = Object.fromEntries(Object.entries(options).filter(([, v]) => v !== undefined));
        this.simulation = new Simulation(this.synced.layout, { ...defined, seed: seed ?? Date.now() % 2 ** 31 });
        this.stopAt = stopAtSeconds ?? null;
        // เดินเวลาเบื้องหลังถึงจุดเริ่มดู (เช่น ต้นช่วงคนเยอะ) แล้วล้าง heatmap ให้เห็นเฉพาะช่วงที่ดู
        if (startAtSeconds) this.simulation.step(startAtSeconds);
        // ค่อย ๆ เร่ง: เริ่มภาพตอนลูกค้ากลุ่มถัดไปเพิ่งถึงประตู (ไม่กินเกินครึ่งช่วงที่ดู)
        if (easeIn) {
          const left = this.stopAt === null ? Infinity : (this.stopAt - this.simulation.getMetrics().time) / 2;
          this.simulation.advanceToNextArrival(Math.min(EASE_IN_LOOKAHEAD_SECONDS, Math.max(0, left)));
        }
        if (startAtSeconds || easeIn) this.simulation.heatmap.fill(0);
        this.easeInMs = easeIn ? 0 : null;
        this.speed = speed;
        this.running = true;
        this.ticks = 0;
        const { cols, rows, cellSize } = this.simulation.grid;
        return { response: { type: "STARTED", requestId, seats: this.simulation.seatCount, grid: { cols, rows, cellSize } }, transfer: [] };
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

  /** เดินเวลาไป `realMs` มิลลิวินาทีจริง (× speed วินาทีจำลอง/วินาทีจริง, ช่วงค่อย ๆ เร่งใช้ easedSpeed) แล้วคืน TICK; null เมื่อไม่ได้รันอยู่ */
  tick(realMs: number): HandledMessage<TickMessage> | null {
    if (!this.simulation || !this.running) return null;
    let speed = this.speed;
    if (this.easeInMs !== null) {
      this.easeInMs += realMs;
      speed = easedSpeed(this.speed, this.easeInMs);
      if (this.easeInMs >= EASE_IN_HOLD_MS + EASE_IN_RAMP_MS) this.easeInMs = null;
    }
    let seconds = (realMs / 1000) * speed;
    let finished = false;
    if (this.stopAt !== null) {
      const left = this.stopAt - this.simulation.getMetrics().time;
      if (left <= seconds) {
        seconds = Math.max(0, left);
        finished = true;
      }
    }
    this.simulation.step(seconds);
    if (finished) this.running = false;
    const agents = this.simulation.agentBuffer();
    const tick: TickMessage = { type: "TICK", agents, metrics: this.simulation.getMetrics() };
    if (finished) tick.finished = true;
    const transfer: ArrayBuffer[] = [agents.buffer as ArrayBuffer];
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
    this.easeInMs = null;
    this.running = false;
    this.ticks = 0;
  }

  private error(requestId: number, code: Extract<WorkerResponse, { type: "ERROR" }>["code"], message: string): HandledMessage {
    return { response: { type: "ERROR", requestId, code, message }, transfer: [] };
  }
}

/** ฟังก์ชันแบบ stateless (ใช้กับ PING / SYNC_LAYOUT ในเทสต์เดิม) */
export function handleWorkerMessage(data: unknown): HandledMessage {
  return new SimulationWorkerRuntime().handle(data);
}
