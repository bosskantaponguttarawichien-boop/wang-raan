import { describe, expect, it } from "vitest";
import { cafeLayout } from "@/test/fixtures/layouts";
import { PEAK_FACTOR, Simulation, openHours, parseClock, planArrivals, type SimulationConfig } from "./index";

function run(sim: Simulation, seconds: number) {
  for (let t = 0; t < seconds; t += 1) sim.step(1);
}

/** แบบ A ร้านอาหาร — ค่าที่ทำให้ครัวเป็นคอขวด (ที่นั่งพอ ลูกค้าไม่ล้น) */
function restaurant(config: Partial<SimulationConfig> = {}) {
  return new Simulation(cafeLayout(), { serviceStyle: "table-service", customersPerHour: 12, seed: 4, ...config });
}

describe("แผนลูกค้าทั้งวัน (feat-093)", () => {
  it("parseClock / openHours", () => {
    expect(parseClock("10:30")).toBe(630);
    expect(parseClock("9:05")).toBe(545);
    expect(parseClock("24:00")).toBeNull();
    expect(parseClock("abc")).toBeNull();
    expect(openHours(600, 1200)).toBe(10);
    expect(openHours(1080, 120)).toBe(8); // 18:00–02:00 ข้ามเที่ยงคืน
  });

  it("120 คน เปิด 10 ชม. พีค 1.5 ชม. → ปกติ ~9.8 คน/ชม. พีค ~24.5 คน/ชม. รวมได้ 120", () => {
    const plan = planArrivals({ openMinute: 600, closeMinute: 1200, dailyCustomers: 120, peakStartMinute: 690, peakEndMinute: 780 });
    expect(plan.closeSeconds).toBe(36_000);
    expect(plan.customersPerHour).toBeCloseTo(120 / 12.25, 6);
    expect(plan.peak).toEqual({ startSeconds: 5400, endSeconds: 10_800, customersPerHour: (120 / 12.25) * PEAK_FACTOR });
    const total = plan.customersPerHour * (10 - 1.5) + plan.peak!.customersPerHour * 1.5;
    expect(total).toBeCloseTo(120, 6);
  });

  it("ช่วงพีคนอกเวลาเปิดถูกตัดทิ้ง → อัตราเดียวทั้งวัน", () => {
    const plan = planArrivals({ openMinute: 600, closeMinute: 1200, dailyCustomers: 100, peakStartMinute: 1260, peakEndMinute: 1320 });
    expect(plan.peak).toBeNull();
    expect(plan.customersPerHour).toBeCloseTo(10, 6);
  });
});

describe("ร้านอาหารแบบ A: นั่งก่อน พนักงานมารับออร์เดอร์ (feat-093)", () => {
  it("ครบวงจร: นั่ง → ได้อาหาร → จ่ายเงิน → ออก และเก้าอี้หนึ่งตัวมีคนเดียว", () => {
    const sim = restaurant({ cooks: 2 });
    const seen = new Set<string>();
    for (let t = 0; t < 4 * 3600; t++) {
      sim.step(1);
      const chairs = sim.debugAgents().filter((a) => a.chairId).map((a) => a.chairId);
      expect(new Set(chairs).size).toBe(chairs.length);
      for (const a of sim.debugAgents()) seen.add(a.state);
    }
    const m = sim.getMetrics();
    for (const state of ["to-seat", "waiting-order", "waiting-food", "seated", "to-counter", "ordering", "leaving"]) {
      expect(seen).toContain(state);
    }
    expect(m.fed).toBeGreaterThan(20);
    expect(m.served).toBeGreaterThan(15);
    expect(m.served).toBeLessThanOrEqual(m.fed);
    expect(m.avgFoodWaitMinutes).toBeGreaterThan(5); // อย่างน้อยเวลาทำ 1 จาน
    expect(m.frontStaffBusy).toBeGreaterThan(0);
    expect(m.kitchenBusy).toBeGreaterThan(0);
    expect(m.kitchenBusy).toBeLessThanOrEqual(1);
  });

  it("พ่อครัวมากขึ้น → ลูกค้ารออาหารน้อยลง และคนรอเกินลดลง", () => {
    const waits = [1, 2, 3].map((cooks) => {
      const sim = restaurant({ cooks, cookMinutesPerDish: 8 });
      run(sim, 4 * 3600);
      return sim.getMetrics();
    });
    expect(waits[0]!.avgFoodWaitMinutes).toBeGreaterThan(waits[1]!.avgFoodWaitMinutes);
    // มีเพียง 2 โต๊ะ จึงมีเพดานที่พ่อครัวมากกว่า 2 คนอาจไม่ช่วยเพิ่มอีก
    expect(waits[1]!.avgFoodWaitMinutes).toBeGreaterThanOrEqual(waits[2]!.avgFoodWaitMinutes);
    expect(waits[0]!.waitedTooLong).toBeGreaterThan(waits[2]!.waitedTooLong);
    expect(waits[0]!.kitchenBusy).toBeGreaterThan(waits[2]!.kitchenBusy);
  });

  it("ทำจานละนานขึ้น → รออาหารนานขึ้น", () => {
    const wait = (cookMinutesPerDish: number) => {
      const sim = restaurant({ cooks: 2, cookMinutesPerDish });
      run(sim, 3 * 3600);
      return sim.getMetrics().avgFoodWaitMinutes;
    };
    expect(wait(10)).toBeGreaterThan(wait(4) + 5);
  });

  it("พนักงานหน้าร้านน้อย → รับออร์เดอร์ช้า รออาหารนานขึ้น", () => {
    const wait = (frontStaff: number) => {
      const sim = restaurant({ cooks: 3, frontStaff, customersPerHour: 30, takeOrderSeconds: [150, 210] });
      run(sim, 3 * 3600);
      return sim.getMetrics();
    };
    const one = wait(1);
    const three = wait(3);
    expect(one.avgFoodWaitMinutes).toBeGreaterThan(three.avgFoodWaitMinutes);
    expect(one.frontStaffBusy).toBeGreaterThan(three.frontStaffBusy);
  });

  it("ไม่มีโต๊ะสะอาดว่าง → รอหน้าเข้าได้ แต่กลับเมื่อเกิน patience", () => {
    const sim = restaurant({ customersPerHour: 300, cooks: 3, patienceMinutes: 1 });
    run(sim, 3600);
    const m = sim.getMetrics();
    expect(m.noSeat).toBeGreaterThan(0);
    expect(m.maxEntranceQueue).toBeGreaterThan(0);
    expect(m.seated).toBeLessThanOrEqual(sim.seatCount);
  });

  it("กลุ่มหนึ่งคนละหนึ่งจาน: ครัวต้องทำครบทั้งกลุ่มก่อนเริ่มทาน", () => {
    const oneCook = restaurant({ customersPerHour: 30, cooks: 1, cookMinutesPerDish: 4, patienceMinutes: 60 });
    const manyCooks = restaurant({ customersPerHour: 30, cooks: 4, cookMinutesPerDish: 4, patienceMinutes: 60 });
    run(oneCook, 3 * 3600);
    run(manyCooks, 3 * 3600);
    expect(oneCook.getMetrics().avgFoodWaitMinutes).toBeGreaterThan(manyCooks.getMetrics().avgFoodWaitMinutes);
    expect(oneCook.getMetrics().kitchenBusy).toBeGreaterThan(manyCooks.getMetrics().kitchenBusy);
  });

  it("หนึ่งโต๊ะรองรับได้เพียงหนึ่งกลุ่ม และต้องเก็บก่อนจึงส่งกลุ่มถัดไปเข้า", () => {
    const sim = restaurant({
      customersPerHour: 120,
      cooks: 3,
      takeOrderSeconds: [1, 1],
      paySeconds: [1, 1],
      cookMinutesPerDish: 0.5,
      dineMinutes: [0.2, 0.2],
      cleanTableSeconds: [60, 60],
    });
    let sawWait = false;
    for (let t = 0; t < 30 * 60; t++) {
      sim.step(1);
      const occupied = sim.debugAgents().filter((agent) => agent.tableId);
      expect(new Set(occupied.map((agent) => agent.tableId)).size).toBe(occupied.length);
      sawWait ||= sim.debugAgents().some((agent) => agent.state === "waiting-entrance");
    }
    expect(sawWait).toBe(true);
    expect(sim.getMetrics().served).toBeGreaterThan(0);
  });

  it("ช่วงพีคมีคนเข้ามากกว่าช่วงปกติตามสัดส่วน และหลังปิดร้านไม่มีคนเข้าใหม่", () => {
    const hour = 3600;
    const sim = new Simulation(cafeLayout(), {
      serviceStyle: "table-service",
      seed: 8,
      customersPerHour: 20,
      peak: { startSeconds: 2 * hour, endSeconds: 4 * hour, customersPerHour: 20 * PEAK_FACTOR },
      closeSeconds: 6 * hour,
      dineMinutes: [1, 2],
      cooks: 4,
    });
    const arrivedAt = (seconds: number) => {
      run(sim, seconds - sim.getMetrics().time);
      return sim.getMetrics().arrived;
    };
    const normal = arrivedAt(2 * hour);
    const peak = arrivedAt(4 * hour) - normal;
    const rest = arrivedAt(6 * hour) - normal - peak;
    const afterClose = arrivedAt(8 * hour) - normal - peak - rest;
    expect(peak / ((normal + rest) / 2)).toBeGreaterThan(1.8);
    expect(peak / ((normal + rest) / 2)).toBeLessThan(3.4);
    expect(afterClose).toBe(0);
    expect(sim.rateAt(3 * hour)).toBe(50);
    expect(sim.rateAt(7 * hour)).toBe(0);
  });

  it("ผลซ้ำได้ด้วย seed เดียวกัน", () => {
    const a = restaurant({ seed: 21 });
    const b = restaurant({ seed: 21 });
    run(a, 3600);
    run(b, 3600);
    expect(a.getMetrics()).toEqual(b.getMetrics());
    expect(a.agentBuffer()).toEqual(b.agentBuffer());
  });
});
