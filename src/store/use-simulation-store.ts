/**
 * Simulation Store — สถานะการเล่นจำลอง P2 (architecture.md §7)
 * ตำแหน่งลูกค้าและ heatmap ไม่อยู่ใน store (เปลี่ยน 20 ครั้ง/วินาที) แต่อยู่ใน SimulationController
 */
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import type { DayAnalysis, SimulationMetrics } from "@/core/simulation";
import { DEFAULT_DAY_CONFIG, type DayConfig } from "@/lib/day-config";

export type SimulationStatus = "idle" | "starting" | "running" | "paused";

/** ค่าฟอร์มจำลองร้าน 1 วัน (feat-095) + ความเร็วเล่นภาพ */
export interface SimulationConfigState extends DayConfig {
  /**
   * ตัวคูณเวลาเล่นภาพ: x1 = เวลาจริง 1 วินาทีต่อ 1 วินาที (ค่าเริ่มต้น DEFAULT_SPEED)
   * ที่ตัวคูณสูง ท่าทางบนภาพไม่เร่งตาม (เวลาย่อแบบเกม — motion/pacing-governor.ts)
   * แปลงเป็นวินาทีจำลองต่อวินาทีจริงที่ SimulationController ก่อนส่ง Worker
   */
  speed: number;
}

export interface SimulationStoreState {
  status: SimulationStatus;
  /** ข้อความแจ้งผลล่าสุด (เช่น เหตุผลที่เริ่มไม่ได้) */
  message: string | null;
  metrics: SimulationMetrics | null;
  seats: number;
  config: SimulationConfigState;
  showHeatmap: boolean;
  showThoughts: boolean;
  /** ผลวิเคราะห์ทั้งวันรอบล่าสุด (feat-094/094) */
  analysis: DayAnalysis | null;
  setConfig: (patch: Partial<SimulationConfigState>) => void;
  setShowHeatmap: (show: boolean) => void;
  setShowThoughts: (show: boolean) => void;
}

/** ฐานเวลา x1 = เวลาจริง — ลูกค้าและพนักงานเดินเท่าคนจริง */
export const REAL_SECONDS_TO_SIMULATION_SECONDS_AT_1X = 1;
export const SPEED_OPTIONS = [1, 2, 5, 10, 30] as const;
/** เริ่มที่ 30×: ลูกค้ากิน 20 นาทีดูจริงราว 40 วินาที เปิดร้าน 10 ชม. ดูจบราว 20 นาที */
export const DEFAULT_SPEED = 30;

export function createSimulationStore() {
  return createStore<SimulationStoreState>()((set, get) => ({
    status: "idle",
    message: null,
    metrics: null,
    seats: 0,
    config: { ...DEFAULT_DAY_CONFIG, speed: DEFAULT_SPEED },
    showHeatmap: true,
    showThoughts: true,
    analysis: null,
    setConfig: (patch) => set({ config: { ...get().config, ...patch } }),
    setShowHeatmap: (showHeatmap) => set({ showHeatmap }),
    setShowThoughts: (showThoughts) => set({ showThoughts }),
  }));
}

export const simulationStore = createSimulationStore();

export function useSimulationStore<T>(selector: (state: SimulationStoreState) => T): T {
  return useStore(simulationStore, selector);
}
