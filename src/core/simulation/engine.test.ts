import { describe, expect, it } from "vitest";
import { addTableSet, createSequentialIds, footprint, type StoreLayout } from "@/core/layout";
import { validateLayout } from "@/core/validation";
import { block, cafeLayout } from "@/test/fixtures/layouts";
import {
  AGENT_STRIDE,
  CELL_FREE,
  HEATMAP_EVERY,
  Simulation,
  SimulationWorkerRuntime,
  AGENT_STATE_CODE,
  touchingCells,
  type SimulationConfig,
  type TickMessage,
} from "./index";

/** แบบ B (คาเฟ่ สั่งที่เคาน์เตอร์) — พฤติกรรมเดิมก่อน feat-093 */
const cafe = (config: Partial<SimulationConfig> = {}): Partial<SimulationConfig> => ({ serviceStyle: "counter-order", ...config });
const atChair = (state: keyof typeof AGENT_STATE_CODE) => AGENT_STATE_CODE[state] === 4;

function run(sim: Simulation, seconds: number, dt = 0.25, onStep?: () => void) {
  for (let t = 0; t < seconds; t += dt) {
    sim.step(dt);
    onStep?.();
  }
}

const cellOf = (sim: Simulation, x: number, y: number) =>
  Math.floor(y / sim.grid.cellSize) * sim.grid.cols + Math.floor(x / sim.grid.cellSize);

describe("Customer flow simulation แบบ B สั่งที่เคาน์เตอร์ (feat-018)", () => {
  // จำลอง 2 ชม. ทีละ 0.25 วินาทีและตรวจทุกก้าว (~4.5 วินาทีในเครื่อง) — runner ของ CI ช้ากว่าเพดาน 5 วินาที
  it("ลูกค้าที่กำลังเดินไม่เคยอยู่ในช่องสิ่งกีดขวาง และไม่ทะลุสิ่งกีดขวางระหว่างก้าว", { timeout: 30_000 }, () => {
    const sim = new Simulation(cafeLayout(), cafe({ customersPerHour: 120, seed: 7 }));
    let previous = new Map<number, { x: number; y: number; state: string }>();
    let checked = 0;
    run(sim, 2 * 3600, 0.25, () => {
      const now = new Map<number, { x: number; y: number; state: string }>();
      for (const a of sim.debugAgents()) {
        now.set(a.id, a);
        if (atChair(a.state)) continue;
        expect(sim.grid.cells[cellOf(sim, a.x, a.y)]).toBe(CELL_FREE);
        const p = previous.get(a.id);
        // จุดกึ่งกลางระหว่างก้าวที่เดินต่อเนื่อง (ไม่นับจังหวะลุกจากเก้าอี้ซึ่งตำแหน่งก่อนหน้าคือกลางเก้าอี้)
        if (p && !atChair(p.state as keyof typeof AGENT_STATE_CODE)) {
          expect(sim.grid.cells[cellOf(sim, (a.x + p.x) / 2, (a.y + p.y) / 2)]).toBe(CELL_FREE);
        }
        checked++;
      }
      previous = now;
    });
    expect(checked).toBeGreaterThan(10_000);
  });

  it("ลูกค้าเดินถึงเคาน์เตอร์ → นั่งเก้าอี้ → ออกทางประตูได้ครบวงจร", () => {
    // ร้านมี 6 ที่นั่ง → รองรับได้ราว 13 คน/ชม. (ทาน 15–40 นาที) จึงใช้ 8 คน/ชม.
    const sim = new Simulation(cafeLayout(), cafe({ customersPerHour: 8, seed: 3 }));
    run(sim, 6 * 3600);
    const m = sim.getMetrics();
    expect(m.arrived).toBeGreaterThan(30);
    expect(m.served).toBeGreaterThan(25);
    expect(m.noSeat).toBeLessThan(m.arrived * 0.2);
    // เวลาเฉลี่ยในร้าน ≈ สั่ง + เดิน + ทาน (15–40 นาที)
    expect(m.avgVisitMinutes).toBeGreaterThan(15);
    expect(m.avgVisitMinutes).toBeLessThan(45);
    // คนที่ออกจากร้านแล้วทุกคน ผ่านการนั่งทานหรือไม่มีที่นั่ง
    expect(m.arrived - m.inStore).toBeLessThanOrEqual(m.served + m.noSeat);
  });

  it("เก้าอี้หนึ่งตัวมีคนนั่งได้คนเดียว และคนนั่งอยู่ที่เก้าอี้จริง", () => {
    const layout = cafeLayout();
    const sim = new Simulation(layout, cafe({ customersPerHour: 200, seed: 11 }));
    run(sim, 1800, 0.25, () => {
      const seated = sim.debugAgents().filter((a) => a.state === "seated");
      const chairs = seated.map((a) => a.chairId);
      expect(new Set(chairs).size).toBe(chairs.length);
      for (const a of seated) {
        const chair = layout.objects.find((o) => o.id === a.chairId)!;
        const r = footprint(chair);
        expect(a.x).toBeGreaterThan(r.x);
        expect(a.x).toBeLessThan(r.x + r.width);
      }
    });
    expect(sim.getMetrics().seated).toBeLessThanOrEqual(sim.seatCount);
  });

  it("ลูกค้ามากเกินที่นั่ง → บางคนไม่มีที่นั่ง; เคาน์เตอร์เดียวรับพร้อมกันได้ 2 คน ที่เหลือรอคิว", () => {
    const sim = new Simulation(cafeLayout(), cafe({ customersPerHour: 400, seed: 5 }));
    let maxOrdering = 0;
    run(sim, 3600, 0.25, () => {
      maxOrdering = Math.max(maxOrdering, sim.debugAgents().filter((a) => a.state === "ordering").length);
    });
    const m = sim.getMetrics();
    expect(maxOrdering).toBeLessThanOrEqual(2);
    expect(m.maxQueue).toBeGreaterThan(0);
    expect(m.noSeat).toBeGreaterThan(0);
  });

  it("เส้นทางสมจริง: ใช้เวลาเดินจากประตูถึงเคาน์เตอร์ใกล้ระยะสั้นสุด/ความเร็ว", () => {
    const sim = new Simulation(cafeLayout(), cafe({ customersPerHour: 1, seed: 2, walkSpeed: [1, 1] }));
    // บังคับให้มาถึงคนแรกทันที
    run(sim, 0.25);
    while (sim.getMetrics().arrived === 0) run(sim, 1);
    let t = 0;
    while (sim.debugAgents()[0]?.state === "to-counter") {
      run(sim, 0.25);
      t += 0.25;
    }
    // ประตูกลาง x≈1.85,y=6 → เคาน์เตอร์ (5–7.4, 0.5–1.2): ระยะตรง ≈ 5.6 ม.; เส้นทางจริงต้องไม่อ้อมเกิน 1.5 เท่า
    expect(t).toBeGreaterThan(4);
    expect(t).toBeLessThan(5.6 * 1.5);
  });

  it("ผลซ้ำได้ด้วย seed เดียวกัน", () => {
    const a = new Simulation(cafeLayout(), cafe({ seed: 42 }));
    const b = new Simulation(cafeLayout(), cafe({ seed: 42 }));
    run(a, 1800);
    run(b, 1800);
    expect(a.getMetrics()).toEqual(b.getMetrics());
    expect(a.agentBuffer()).toEqual(b.agentBuffer());
  });

  it("เก้าอี้ที่เดินไปไม่ถึงไม่ถูกใช้", () => {
    const ids = createSequentialIds();
    let layout: StoreLayout = cafeLayout(ids);
    layout = addTableSet(layout, "table-2-seats", { x: 6.75, y: 0.25 }, ids).layout;
    // ปิดล้อมโต๊ะชุดใหม่ (ทางลงทางเดียว) ด้วยครัว
    layout = { ...layout, objects: [...layout.objects, block("wall", 5, 1.25, 3, 0.5)] };
    const sim = new Simulation(layout, cafe());
    const chairs = layout.objects.filter((o) => o.type === "chair").length;
    expect(sim.seatCount).toBeLessThan(chairs);
  });

  it("touchingCells: ช่องว่างรอบวัตถุไม่เกิน 1 ช่อง", () => {
    const sim = new Simulation(cafeLayout(), cafe());
    const counter = cafeLayout().objects.find((o) => o.type === "counter")!;
    const cells = touchingCells(sim.grid, footprint(counter));
    expect(cells.length).toBeGreaterThan(10);
    for (const c of cells) expect(sim.grid.cells[c]).toBe(CELL_FREE);
  });

  it("agentBuffer เรียง id, x, y, state", () => {
    const sim = new Simulation(cafeLayout(), cafe({ customersPerHour: 600, seed: 1 }));
    run(sim, 60);
    const buf = sim.agentBuffer();
    expect(buf.length).toBe(sim.getMetrics().inStore * AGENT_STRIDE);
    expect(buf[0]).toBeGreaterThan(0);
  });
});

describe("SimulationWorkerRuntime — START / PAUSE / STOP / TICK", () => {
  const layout = cafeLayout();
  const validation = validateLayout(layout);

  function started(speed = 60) {
    const rt = new SimulationWorkerRuntime();
    expect(rt.handle({ type: "SYNC_LAYOUT", requestId: 1, payload: { layout, validation } }).response.type).toBe("STATUS");
    const res = rt.handle({ type: "START", requestId: 2, layoutRevision: validation.layoutRevision, config: { customersPerHour: 120, speed, seed: 9 } });
    expect(res.response).toMatchObject({ type: "STARTED", seats: 6, grid: { cols: 32, rows: 24 } });
    return rt;
  }

  it("START ก่อน sync → NOT_SYNCED; revision ไม่ตรง → STALE_VALIDATION", () => {
    const rt = new SimulationWorkerRuntime();
    expect(rt.handle({ type: "START", requestId: 1, layoutRevision: "x", config: { customersPerHour: 40, speed: 30 } }).response).toMatchObject({ code: "NOT_SYNCED" });
    rt.handle({ type: "SYNC_LAYOUT", requestId: 2, payload: { layout, validation } });
    expect(rt.handle({ type: "START", requestId: 3, layoutRevision: "rev-other", config: { customersPerHour: 40, speed: 30 } }).response).toMatchObject({ code: "STALE_VALIDATION" });
    expect(rt.tick(50)).toBeNull();
  });

  it("sync ผัง Blocked หลังจาก sync ผังดีไปแล้ว → START ไม่ได้", () => {
    const rt = new SimulationWorkerRuntime();
    rt.handle({ type: "SYNC_LAYOUT", requestId: 1, payload: { layout, validation } });
    const blocked = { ...layout, kitchenDoor: null };
    rt.handle({ type: "SYNC_LAYOUT", requestId: 2, payload: { layout: blocked, validation: validateLayout(blocked) } });
    expect(rt.handle({ type: "START", requestId: 3, layoutRevision: validation.layoutRevision, config: { customersPerHour: 40, speed: 30 } }).response).toMatchObject({ code: "NOT_SYNCED" });
  });

  it("TICK ส่ง agents ทุกครั้ง และ heatmap ทุก ๆ 5 tick", () => {
    const rt = started();
    const ticks: TickMessage[] = [];
    for (let i = 0; i < 2 * HEATMAP_EVERY; i++) ticks.push(rt.tick(50)!.response);
    expect(ticks.filter((t) => t.heatmap).length).toBe(2);
    expect(ticks.at(-1)!.metrics.time).toBeCloseTo(10 * 0.05 * 60, 5);
  });

  it("PAUSE หยุด tick, RESUME เดินต่อ, SET_SPEED เปลี่ยนความเร็ว, STOP รีเซ็ต", () => {
    const rt = started(10);
    rt.tick(100);
    expect(rt.handle({ type: "PAUSE", requestId: 5 }).response).toEqual({ type: "ACK", requestId: 5, command: "PAUSE" });
    expect(rt.tick(100)).toBeNull();
    rt.handle({ type: "RESUME", requestId: 6 });
    rt.handle({ type: "SET_SPEED", requestId: 7, speed: 100 });
    const t = rt.tick(100)!.response.metrics.time;
    expect(t).toBeCloseTo(1 + 10, 5);
    rt.handle({ type: "STOP", requestId: 8 });
    expect(rt.isRunning).toBe(false);
    expect(rt.tick(100)).toBeNull();
    expect(rt.handle({ type: "PAUSE", requestId: 9 }).response).toMatchObject({ code: "NOT_RUNNING" });
  });

  it("START ส่งค่าร้านอาหารได้ (feat-093) และค่าผิดช่วงถูกปฏิเสธ", () => {
    const rt = new SimulationWorkerRuntime();
    rt.handle({ type: "SYNC_LAYOUT", requestId: 1, payload: { layout, validation } });
    const config = {
      customersPerHour: 10,
      speed: 60,
      seed: 3,
      serviceStyle: "table-service",
      peak: { startSeconds: 3600, endSeconds: 7200, customersPerHour: 25 },
      closeSeconds: 36_000,
      frontStaff: 2,
      cooks: 2,
      cookMinutesPerDish: 6,
      dineMinutes: [15, 25],
      patienceMinutes: 15,
    };
    expect(rt.handle({ type: "START", requestId: 2, layoutRevision: validation.layoutRevision, config }).response.type).toBe("STARTED");
    expect(rt.tick(1000)!.response.metrics).toHaveProperty("avgFoodWaitMinutes");
    for (const bad of [{ cooks: 0 }, { frontStaff: 2.5 }, { serviceStyle: "buffet" }, { dineMinutes: [0, 10] }]) {
      const res = rt.handle({ type: "START", requestId: 3, layoutRevision: validation.layoutRevision, config: { ...config, ...bad } });
      expect(res.response).toMatchObject({ code: "INVALID_MESSAGE" });
    }
  });

  const dayInput = {
    openMinute: 600,
    closeMinute: 1200,
    dailyCustomers: 120,
    peakStartMinute: 690,
    peakEndMinute: 780,
    frontStaff: 2,
    cooks: 1,
    cookMinutesPerDish: 5,
    dineMinutes: [15, 25],
    patienceMinutes: 15,
  };

  it("ANALYZE_DAY ผ่าน P2 gate เดียวกับ START และคืนคำตอบ 3 ข้อ (feat-094)", { timeout: 30_000 }, () => {
    const rt = new SimulationWorkerRuntime();
    const ask = (requestId: number, extra: object = {}) =>
      rt.handle({ type: "ANALYZE_DAY", requestId, layoutRevision: validation.layoutRevision, input: { ...dayInput, ...extra } }).response;
    expect(ask(1)).toMatchObject({ code: "NOT_SYNCED" });
    rt.handle({ type: "SYNC_LAYOUT", requestId: 2, payload: { layout, validation } });
    expect(rt.handle({ type: "ANALYZE_DAY", requestId: 3, layoutRevision: "rev-other", input: dayInput }).response).toMatchObject({ code: "STALE_VALIDATION" });
    const res = ask(4);
    expect(res.type).toBe("ANALYSIS");
    if (res.type !== "ANALYSIS") throw new Error("unexpected");
    expect(res.analysis.seats).toBe(6);
    expect(res.analysis.staffing.recommended).not.toBeNull();
    expect(res.analysis.cookTime.currentMinutesPerDish).toBe(5);
    for (const bad of [{ closeMinute: 600 }, { dineMinutes: [30, 10] }, { cooks: 0 }, { openMinute: 1440 }]) {
      expect(ask(5, bad)).toMatchObject({ code: "INVALID_MESSAGE" });
    }
    // ผัง Blocked → sync ไม่ได้ → วิเคราะห์ไม่ได้
    const blocked = { ...layout, kitchenDoor: null };
    rt.handle({ type: "SYNC_LAYOUT", requestId: 6, payload: { layout: blocked, validation: validateLayout(blocked) } });
    expect(ask(7)).toMatchObject({ code: "NOT_SYNCED" });
  });

  it("START startAtSeconds/stopAtSeconds: เริ่มที่ต้นช่วงพีค หยุดเองตอนจบพีค", () => {
    const rt = new SimulationWorkerRuntime();
    rt.handle({ type: "SYNC_LAYOUT", requestId: 1, payload: { layout, validation } });
    const config = { customersPerHour: 10, speed: 600, seed: 2, startAtSeconds: 5400, stopAtSeconds: 5400 + 120 };
    rt.handle({ type: "START", requestId: 2, layoutRevision: validation.layoutRevision, config });
    const first = rt.tick(100)!.response;
    expect(first.metrics.time).toBeCloseTo(5400 + 60, 5);
    expect(first.metrics.arrived).toBeGreaterThan(0); // ลูกค้าตั้งแต่เปิดร้านจนถึงพีค
    const last = rt.tick(1000)!.response;
    expect(last.finished).toBe(true);
    expect(last.metrics.time).toBeCloseTo(5520, 5);
    expect(last.heatmap).toBeDefined();
    expect(rt.isRunning).toBe(false);
    expect(rt.tick(100)).toBeNull();
  });

  it("ค่าคอนฟิกนอกช่วง → INVALID_MESSAGE", () => {
    const rt = started();
    expect(rt.handle({ type: "SET_SPEED", requestId: 1, speed: 0 }).response).toMatchObject({ code: "INVALID_MESSAGE" });
  });
});
