/**
 * ข้อความระหว่าง UI ↔ Simulation Web Worker (architecture.md §6)
 * คำขอทุกข้อความมี `requestId` เพื่อจับคู่คำตอบ; TICK เป็นข้อความที่ Worker ส่งเองเป็นระยะ
 */
import type { StoreLayout, ValidationResult } from "../layout/types";
import type { DayAnalysis, DayInput } from "./day-analysis";
import type { PeakWindow, ServiceStyle, SimulationMetrics } from "./engine";

export interface SimulationStartConfig {
  customersPerHour: number;
  /** วินาทีจำลองต่อวินาทีจริง — รับเฉพาะค่าที่ SimulationController แปลงแล้ว */
  speed: number;
  seed?: number;
  /** ค่าร้าน/ลูกค้าเพิ่มเติม (feat-093) — ไม่ส่งใช้ค่าตั้งต้นของ engine */
  serviceStyle?: ServiceStyle;
  peak?: PeakWindow | null;
  closeSeconds?: number | null;
  frontStaff?: number;
  cooks?: number;
  cookMinutesPerDish?: number;
  dineMinutes?: [number, number];
  patienceMinutes?: number;
  /** เดินเวลาเบื้องหลังถึงวินาทีนี้ก่อนเริ่มส่งภาพ (เช่น ต้นช่วงคนเยอะ) — heatmap เริ่มนับจากจุดนี้ */
  startAtSeconds?: number;
  /** หยุดเองเมื่อถึงวินาทีนี้ (เช่น จบช่วงคนเยอะ) แล้วส่ง TICK สุดท้ายที่มี finished: true */
  stopAtSeconds?: number;
  /** ช่วงที่ไม่มีใครเดิน เล่นเร็วขึ้นเอง (QUIET_SPEED) แล้วกลับความเร็วปกติเมื่อมีคนเริ่มเดิน */
  skipQuiet?: boolean;
}

export type WorkerRequest =
  | { type: "PING"; requestId: number }
  | { type: "SYNC_LAYOUT"; requestId: number; payload: { layout: StoreLayout; validation: ValidationResult } }
  | { type: "START"; requestId: number; layoutRevision: string; config: SimulationStartConfig }
  | { type: "PAUSE"; requestId: number }
  | { type: "RESUME"; requestId: number }
  | { type: "STOP"; requestId: number }
  | { type: "SET_SPEED"; requestId: number; speed: number }
  | { type: "ANALYZE_DAY"; requestId: number; layoutRevision: string; input: DayInput };

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
  /** ทางเดินตั้งแต่ tick ก่อน: [id, จำนวนจุด, x1, y1, ...] ต่อคน (ดู Simulation.drainPaths) */
  paths?: Float32Array;
  /** พนักงานหน้าร้าน: index, x, y, STAFF_STATE_CODE (ดู STAFF_STRIDE) */
  staff?: Float32Array;
  metrics: SimulationMetrics;
  /** ส่งเป็นระยะ (ไม่ใช่ทุก tick) เพื่อลดปริมาณข้อมูล */
  heatmap?: Float32Array;
  heatmapMax?: number;
  /** ถึง stopAtSeconds แล้ว — worker หยุดเดินเวลา */
  finished?: boolean;
}

export type WorkerResponse =
  | { type: "PONG"; requestId: number }
  | { type: "STATUS"; requestId: number; status: "READY"; layoutRevision: string; grid: GridSummary }
  /**
   * `initial` คือภาพ ณ ขณะเริ่มจำลอง ก่อน tick รอบแรก
   * ทำให้ทุก renderer เห็นพนักงานประจำเคาน์เตอร์ทันที ไม่ต้องรอ timer ของ Worker
   */
  | {
      type: "STARTED";
      requestId: number;
      seats: number;
      grid: { cols: number; rows: number; cellSize: number };
      /** Worker เวอร์ชันเก่าอาจยังไม่มี field นี้ระหว่าง rollout */
      initial?: { agents: Float32Array; staff: Float32Array };
    }
  | { type: "ACK"; requestId: number; command: "PAUSE" | "RESUME" | "STOP" | "SET_SPEED" }
  | { type: "ANALYSIS"; requestId: number; layoutRevision: string; analysis: DayAnalysis }
  | { type: "ERROR"; requestId: number; code: WorkerErrorCode; message: string };

export type WorkerMessage = WorkerResponse | TickMessage;
