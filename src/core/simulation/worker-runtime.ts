/**
 * ตรรกะของ Simulation Worker แบบ Pure — แยกจากไฟล์ worker เพื่อทดสอบได้โดยไม่ต้องมี Worker จริง
 * P2 Gate: Worker ตรวจผังซ้ำเองเสมอ (ไม่เชื่อผลตรวจจาก UI อย่างเดียว) และเริ่มจำลองได้เฉพาะผังที่ sync แล้วเท่านั้น
 */
import { z } from "zod";
import type { StoreLayout } from "../layout/types";
import { validateLayout } from "../validation/engine";
import { StoreLayoutSchema, ValidationResultSchema } from "../validation/layout.schema";
import { computeLayoutRevision } from "../validation/revision";
import { Simulation } from "./engine";
import { buildOccupancyGrid } from "./occupancy-grid";
import type { TickMessage, WorkerResponse } from "./protocol";

const RequestId = z.number().int();
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
      customersPerHour: z.number().finite().min(1).max(600),
      speed: z.number().finite().min(1).max(600),
      seed: z.number().int().optional(),
    }),
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

export class SimulationWorkerRuntime {
  private synced: { layout: StoreLayout; revision: string } | null = null;
  private simulation: Simulation | null = null;
  private running = false;
  private speed = 30;
  private ticks = 0;

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
        const { customersPerHour, speed, seed } = message.config;
        this.simulation = new Simulation(this.synced.layout, { customersPerHour, seed: seed ?? Date.now() % 2 ** 31 });
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
    }
  }

  /** เดินเวลาไป `realMs` มิลลิวินาทีจริง (× speed) แล้วคืน TICK; null เมื่อไม่ได้รันอยู่ */
  tick(realMs: number): HandledMessage<TickMessage> | null {
    if (!this.simulation || !this.running) return null;
    this.simulation.step((realMs / 1000) * this.speed);
    const agents = this.simulation.agentBuffer();
    const tick: TickMessage = { type: "TICK", agents, metrics: this.simulation.getMetrics() };
    const transfer: ArrayBuffer[] = [agents.buffer as ArrayBuffer];
    if (this.ticks++ % HEATMAP_EVERY === 0) {
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
