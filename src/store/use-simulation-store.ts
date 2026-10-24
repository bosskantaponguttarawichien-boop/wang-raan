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
  /** วินาทีจำลองต่อวินาทีจริง */
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
  /** ผลวิเคราะห์ทั้งวันรอบล่าสุด (feat-094/094) */
  analysis: DayAnalysis | null;
  setConfig: (patch: Partial<SimulationConfigState>) => void;
  setShowHeatmap: (show: boolean) => void;
}

export const SPEED_OPTIONS = [10, 30, 60, 120] as const;

export function createSimulationStore() {
  return createStore<SimulationStoreState>()((set, get) => ({
    status: "idle",
    message: null,
    metrics: null,
    seats: 0,
    config: { ...DEFAULT_DAY_CONFIG, speed: 60 },
    showHeatmap: true,
    analysis: null,
    setConfig: (patch) => set({ config: { ...get().config, ...patch } }),
    setShowHeatmap: (showHeatmap) => set({ showHeatmap }),
  }));
}

export const simulationStore = createSimulationStore();

export function useSimulationStore<T>(selector: (state: SimulationStoreState) => T): T {
  return useStore(simulationStore, selector);
}
