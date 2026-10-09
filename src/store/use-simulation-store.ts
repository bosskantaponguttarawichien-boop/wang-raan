/**
 * Simulation Store — สถานะการเล่นจำลอง P2 (architecture.md §7)
 * ตำแหน่งลูกค้าและ heatmap ไม่อยู่ใน store (เปลี่ยน 20 ครั้ง/วินาที) แต่อยู่ใน SimulationController
 */
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import type { SimulationMetrics } from "@/core/simulation";

export type SimulationStatus = "idle" | "starting" | "running" | "paused";

export interface SimulationConfigState {
  customersPerHour: number;
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
  setConfig: (patch: Partial<SimulationConfigState>) => void;
}

export const CUSTOMER_RATE_OPTIONS = [10, 20, 40, 80] as const;
export const SPEED_OPTIONS = [10, 30, 60, 120] as const;

export function createSimulationStore() {
  return createStore<SimulationStoreState>()((set, get) => ({
    status: "idle",
    message: null,
    metrics: null,
    seats: 0,
    config: { customersPerHour: 20, speed: 60 },
    setConfig: (patch) => set({ config: { ...get().config, ...patch } }),
  }));
}

export const simulationStore = createSimulationStore();

export function useSimulationStore<T>(selector: (state: SimulationStoreState) => T): T {
  return useStore(simulationStore, selector);
}
