/// <reference lib="webworker" />
/**
 * P2 Simulation Web Worker — รันนอก Main UI Thread
 * ตรรกะทั้งหมดอยู่ใน src/core/simulation (Pure TS, ทดสอบได้); ไฟล์นี้ต่อสาย postMessage + นาฬิกา
 */
import { SimulationWorkerRuntime } from "@/core/simulation/worker-runtime";

/** ส่ง TICK ราว 20 ครั้ง/วินาที — UI interpolate ต่อเป็น 60 FPS */
const TICK_MS = 50;

const scope = self as unknown as DedicatedWorkerGlobalScope;
const runtime = new SimulationWorkerRuntime();
let last = performance.now();

scope.addEventListener("message", (event: MessageEvent<unknown>) => {
  const { response, transfer } = runtime.handle(event.data);
  if (response.type === "STARTED" || (response.type === "ACK" && response.command === "RESUME")) last = performance.now();
  scope.postMessage(response, transfer);
});

setInterval(() => {
  const now = performance.now();
  // จำกัดช่วงเวลาสูงสุด กันเวลากระโดดเมื่อแท็บถูกพัก
  const elapsed = Math.min(now - last, 250);
  last = now;
  const result = runtime.tick(elapsed);
  if (result) scope.postMessage(result.response, result.transfer);
}, TICK_MS);
