import { MessageChannel } from "node:worker_threads";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleWorkerMessage } from "@/core/simulation";
import { validateLayout } from "@/core/validation";
import { cafeLayout } from "@/test/fixtures/layouts";
import { SimulationClient, type WorkerLike } from "./simulation-client";

/** Worker จำลองด้วย MessageChannel จริง (structured clone + transfer เหมือน Worker) */
function channelWorker(): WorkerLike & { close(): void } {
  const { port1, port2 } = new MessageChannel();
  port2.on("message", (data) => {
    const { response, transfer } = handleWorkerMessage(data);
    port2.postMessage(response, transfer);
  });
  const listeners = new Set<(e: MessageEvent) => void>();
  port1.on("message", (data) => listeners.forEach((l) => l({ data } as MessageEvent)));
  return {
    postMessage: (m) => port1.postMessage(m),
    addEventListener: (_t, l) => listeners.add(l),
    removeEventListener: (_t, l) => listeners.delete(l),
    terminate: vi.fn(),
    close: () => {
      port1.close();
      port2.close();
    },
  };
}

const open: Array<{ close(): void }> = [];
afterEach(() => open.splice(0).forEach((w) => w.close()));

describe("SimulationClient ↔ Worker (postMessage)", () => {
  it("PING / PONG และจับคู่ requestId ถูกต้องเมื่อส่งพร้อมกันหลายคำขอ", async () => {
    const worker = channelWorker();
    open.push(worker);
    const client = new SimulationClient(worker);
    const layout = cafeLayout();
    const [a, b, c] = await Promise.all([client.ping(), client.syncLayout(layout, validateLayout(layout)), client.ping()]);
    expect(a).toEqual({ type: "PONG", requestId: 1 });
    expect(b).toMatchObject({ type: "STATUS", requestId: 2, status: "READY" });
    expect(c).toEqual({ type: "PONG", requestId: 3 });
  });

  it("กริดที่ได้กลับมาผ่าน structured clone เป็น Uint8Array ครบทุกช่อง", async () => {
    const worker = channelWorker();
    open.push(worker);
    const layout = cafeLayout();
    const res = await new SimulationClient(worker).syncLayout(layout, validateLayout(layout));
    if (res.type !== "STATUS") throw new Error(res.type);
    expect(res.grid.cells).toBeInstanceOf(Uint8Array);
    expect(res.grid.cells).toHaveLength(32 * 24);
    expect(res.grid.entranceCells.length).toBeGreaterThan(0);
  });

  it("Worker ไม่ตอบ → reject หลัง timeout; dispose ปิด worker และ reject คำขอค้าง", async () => {
    vi.useFakeTimers();
    const silent: WorkerLike = { postMessage: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), terminate: vi.fn() };
    const client = new SimulationClient(silent, 100);
    const timed = client.ping();
    vi.advanceTimersByTime(101);
    await expect(timed).rejects.toThrow("ไม่ตอบสนอง");
    const pending = client.ping();
    client.dispose();
    await expect(pending).rejects.toThrow("ถูกปิดแล้ว");
    expect(silent.terminate).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
