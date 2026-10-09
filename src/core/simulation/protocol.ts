/**
 * ข้อความระหว่าง UI ↔ Simulation Web Worker (architecture.md §6)
 * คำขอทุกข้อความมี `requestId` เพื่อจับคู่คำตอบ; TICK เป็นข้อความที่ Worker ส่งเองเป็นระยะ
 */
import type { StoreLayout, ValidationResult } from "../layout/types";
import type { SimulationMetrics } from "./engine";

export interface SimulationStartConfig {
  customersPerHour: number;
  /** วินาทีจำลองต่อวินาทีจริง */
  speed: number;
  seed?: number;
}

export type WorkerRequest =
  | { type: "PING"; requestId: number }
  | { type: "SYNC_LAYOUT"; requestId: number; payload: { layout: StoreLayout; validation: ValidationResult } }
  | { type: "START"; requestId: number; layoutRevision: string; config: SimulationStartConfig }
  | { type: "PAUSE"; requestId: number }
  | { type: "RESUME"; requestId: number }
  | { type: "STOP"; requestId: number }
  | { type: "SET_SPEED"; requestId: number; speed: number };

export interface GridSummary {
  cellSize: number;
  cols: number;
  rows: number;
  cells: Uint8Array;
  entranceCells: number[];
  freeCount: number;
}

export type WorkerErrorCode = "INVALID_MESSAGE" | "STALE_VALIDATION" | "BLOCKED" | "NOT_SYNCED" | "NOT_RUNNING";

export interface TickMessage {
  type: "TICK";
  /** ค่าต่อ agent: id, x, y, stateCode (ดู AGENT_STRIDE) */
  agents: Float32Array;
  metrics: SimulationMetrics;
  /** ส่งเป็นระยะ (ไม่ใช่ทุก tick) เพื่อลดปริมาณข้อมูล */
  heatmap?: Float32Array;
  heatmapMax?: number;
}

export type WorkerResponse =
  | { type: "PONG"; requestId: number }
  | { type: "STATUS"; requestId: number; status: "READY"; layoutRevision: string; grid: GridSummary }
  | { type: "STARTED"; requestId: number; seats: number; grid: { cols: number; rows: number; cellSize: number } }
  | { type: "ACK"; requestId: number; command: "PAUSE" | "RESUME" | "STOP" | "SET_SPEED" }
  | { type: "ERROR"; requestId: number; code: WorkerErrorCode; message: string };

export type WorkerMessage = WorkerResponse | TickMessage;
