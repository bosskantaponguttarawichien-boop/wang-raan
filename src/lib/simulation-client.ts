/**
 * Client ของ Simulation Worker: ห่อ postMessage ให้เป็น Promise จับคู่ด้วย requestId
 * รับ WorkerLike เพื่อให้ทดสอบด้วย MessagePort ได้
 */
import type { StoreLayout, ValidationResult } from "@/core/layout";
import type { TickMessage, WorkerRequest, WorkerResponse } from "@/core/simulation";

export interface WorkerLike {
  postMessage(message: unknown): void;
  addEventListener(type: "message", listener: (event: MessageEvent) => void): void;
  removeEventListener(type: "message", listener: (event: MessageEvent) => void): void;
  terminate?: () => void;
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type RequestBody = DistributiveOmit<WorkerRequest, "requestId">;

export class SimulationClient {
  private nextId = 1;
  private readonly pending = new Map<number, { resolve: (r: WorkerResponse) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private readonly tickListeners = new Set<(tick: TickMessage) => void>();
  private readonly onMessage = (event: MessageEvent) => {
    const data = event.data as WorkerResponse | TickMessage;
    if (data?.type === "TICK") {
      this.tickListeners.forEach((listener) => listener(data));
      return;
    }
    const response = data as WorkerResponse;
    const entry = this.pending.get(response?.requestId);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.pending.delete(response.requestId);
    entry.resolve(response);
  };

  constructor(
    private readonly worker: WorkerLike,
    private readonly timeoutMs = 5000,
  ) {
    worker.addEventListener("message", this.onMessage);
  }

  request(body: RequestBody): Promise<WorkerResponse> {
    const requestId = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error("Simulation worker ไม่ตอบสนอง"));
      }, this.timeoutMs);
      this.pending.set(requestId, { resolve, reject, timer });
      this.worker.postMessage({ ...body, requestId });
    });
  }

  /** รับ TICK ที่ Worker ส่งมาเป็นระยะ — คืนฟังก์ชันยกเลิก */
  onTick(listener: (tick: TickMessage) => void): () => void {
    this.tickListeners.add(listener);
    return () => this.tickListeners.delete(listener);
  }

  ping() {
    return this.request({ type: "PING" });
  }

  syncLayout(layout: StoreLayout, validation: ValidationResult) {
    return this.request({ type: "SYNC_LAYOUT", payload: { layout, validation } });
  }

  dispose() {
    this.worker.removeEventListener("message", this.onMessage);
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new Error("Simulation worker ถูกปิดแล้ว"));
    }
    this.pending.clear();
    this.tickListeners.clear();
    this.worker.terminate?.();
  }
}

/** สร้าง Worker จริงในเบราว์เซอร์ (Next.js bundle ไฟล์ worker ให้จาก new URL) */
export function createSimulationWorker(): Worker {
  return new Worker(new URL("../workers/simulation.worker.ts", import.meta.url), { type: "module" });
}
