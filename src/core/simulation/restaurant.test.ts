import { describe, expect, it } from "vitest";
import { cafeLayout } from "@/test/fixtures/layouts";
import { MENU_COOK_FACTORS, PEAK_FACTOR, Simulation, extraDishFor, openHours, parseClock, patienceFactor, planArrivals, staffTimeFactor, type SimulationConfig } from "./index";

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

  it("สองช่วงพีคกระจายลูกค้าทั้งวันครบ และรองรับช่วงข้ามเที่ยงคืน", () => {
    const plan = planArrivals({ openMinute: 18 * 60, closeMinute: 2 * 60, dailyCustomers: 160,
      peakStartMinute: 19 * 60, peakEndMinute: 20 * 60, secondPeak: { startMinute: 0, endMinute: 60 } });
    expect(plan.peaks).toHaveLength(2);
    const hours = plan.closeSeconds / 3600;
    const peakHours = plan.peaks.reduce((sum, peak) => sum + (peak.endSeconds - peak.startSeconds) / 3600, 0);
    expect(plan.customersPerHour * (hours - peakHours) + plan.peaks[0]!.customersPerHour * peakHours).toBeCloseTo(160);
    const sim = new Simulation(cafeLayout(), { customersPerHour: plan.customersPerHour, peak: plan.peak, peaks: plan.peaks });
    expect(sim.rateAt(1.5 * 3600)).toBe(plan.peaks[0]!.customersPerHour);
    expect(sim.rateAt(6.5 * 3600)).toBe(plan.peaks[1]!.customersPerHour);
    expect(sim.rateAt(4 * 3600)).toBe(plan.customersPerHour);
  });
});

describe("ร้านอาหารแบบ A: นั่งก่อน พนักงานมารับออร์เดอร์ (feat-093)", () => {
  it("จานเพิ่มเข้าคิวครัวและปรากฏเป็นสองจานของลูกค้าคนเดียวกัน", () => {
    expect(extraDishFor(11, 1, 0, 0)).toBe(false);
    expect(extraDishFor(11, 1, 0, 100)).toBe(true);
    const config: Partial<SimulationConfig> = { customersPerHour: 15, seed: 11, frontStaff: 2, cooks: 1,
      partyWeights: [1, 0, 0, 0], cookMinutesPerDish: 5, patienceMinutes: 60 };
    const fixed = restaurant({ ...config, extraDishPercent: 0 });
    const extra = restaurant({ ...config, extraDishPercent: 100 });
    let sawTwoDishes = false;
    for (let t = 0; t < 4 * 3600; t += 10) {
      fixed.step(10); extra.step(10);
      const snapshot = extra.presentationSnapshot({ runId: "test", layoutRevision: "test", sequence: t });
      sawTwoDishes ||= snapshot.meals.some((meal) => snapshot.meals.filter((other) => other.ownerRenderAgentId === meal.ownerRenderAgentId).length === 2);
    }
    expect(sawTwoDishes).toBe(true);
    expect(extra.getMetrics().arrived).toBe(fixed.getMetrics().arrived);
    expect(extra.getMetrics().avgFoodWaitMinutes).toBeGreaterThan(fixed.getMetrics().avgFoodWaitMinutes);
  });
  it("ช่วงพักไม่เริ่มงานใหม่และกลับมาบริการหลังพัก", () => {
    const sim = restaurant({ customersPerHour: 600, frontStaff: 2, cooks: 2, patienceMinutes: 60,
      takeOrderSeconds: [1, 1], cookMinutesPerDish: 0.5, dineMinutes: [1, 2], teamBreak: { startSeconds: 0, endSeconds: 600 } });
    run(sim, 599);
    expect(sim.getMetrics().arrived).toBeGreaterThan(0);
    expect(sim.getMetrics().fed).toBe(0);
    expect(sim.getMetrics().kitchenBusy).toBe(0);
    expect(sim.presentationSnapshot({ runId: "test", layoutRevision: "test", sequence: 0 }).staff.every((staff) => staff.thought?.kind === "resting")).toBe(true);
    run(sim, 1800);
    expect(sim.getMetrics().fed).toBeGreaterThan(0);
  });

  it("ทยอยพักทีละคนในแต่ละทีม และคนเดียวพักตลอดช่วง", () => {
    const config = { customersPerHour: 0, teamBreak: { startSeconds: 0, endSeconds: 600 }, staggerBreak: true };
    const staggered = restaurant({ ...config, frontStaff: 2, cooks: 2 });
    const staffAt = () => staggered.presentationSnapshot({ runId: "test", layoutRevision: "test", sequence: 0 }).staff;
    run(staggered, 1);
    expect(staffAt().map((member) => member.thought?.kind)).toEqual(["resting", undefined]);
    run(staggered, 300);
    expect(staffAt().map((member) => member.thought?.kind)).toEqual([undefined, "resting"]);
    run(staggered, 300);
    expect(staffAt().every((member) => member.thought?.kind !== "resting")).toBe(true);
    const solo = restaurant({ ...config, frontStaff: 1 });
    run(solo, 599);
    expect(solo.presentationSnapshot({ runId: "test", layoutRevision: "test", sequence: 0 }).staff[0]!.thought?.kind).toBe("resting");
  });

  it("ทยอยพักแล้วยังมีคนทำงานในครัวและหน้าร้าน", () => {
    const config = { customersPerHour: 120, frontStaff: 2, cooks: 2, patienceMinutes: 60,
      takeOrderSeconds: [1, 1] as [number, number], cookMinutesPerDish: 0.5, teamBreak: { startSeconds: 0, endSeconds: 600 } };
    const all = restaurant(config);
    const staggered = restaurant({ ...config, staggerBreak: true });
    run(all, 599); run(staggered, 599);
    expect(all.getMetrics().fed).toBe(0);
    expect(staggered.getMetrics().fed).toBeGreaterThan(0);
  });

  it("ช่วงพักให้งานที่เริ่มแล้วทำจนเสร็จ แต่ไม่มอบงานใหม่", () => {
    const sim = restaurant({ customersPerHour: 600, frontStaff: 1, cooks: 2, patienceMinutes: 60,
      takeOrderSeconds: [120, 120], teamBreak: { startSeconds: 300, endSeconds: 900 } });
    run(sim, 299);
    const before = sim.presentationSnapshot({ runId: "test", layoutRevision: "test", sequence: 0 }).staff[0]!.taskId;
    expect(before).not.toBeNull();
    for (let t = 300; t < 900; t++) {
      sim.step(1);
      const current = sim.presentationSnapshot({ runId: "test", layoutRevision: "test", sequence: t }).staff[0]!.taskId;
      expect(current === before || current === null).toBe(true);
    }
  });
  it("พนักงานแต่ละคนใช้เวลางานต่างกันโดยไม่เปลี่ยนจำนวนลูกค้าที่เข้าร้าน", () => {
    expect(staffTimeFactor(0, 1)).toBe(1);
    expect(staffTimeFactor(0, 2)).toBeCloseTo(0.8);
    expect(staffTimeFactor(1, 2)).toBeCloseTo(1.2);
    const config = { frontStaff: 2, cooks: 2, customersPerHour: 50, seed: 15, patienceMinutes: 30 };
    const fixed = restaurant({ ...config, varyStaffSpeed: false });
    const varied = restaurant({ ...config, varyStaffSpeed: true });
    const repeat = restaurant({ ...config, varyStaffSpeed: true });
    run(fixed, 7200); run(varied, 7200); run(repeat, 7200);
    expect(varied.getMetrics().arrived).toBe(fixed.getMetrics().arrived);
    expect(varied.getMetrics()).not.toEqual(fixed.getMetrics());
    expect(varied.getMetrics()).toEqual(repeat.getMetrics());
  });

  it("แต่ละบทบาทมีคนเดียวใช้เวลามาตรฐาน แม้เปิดความเร็วต่างกัน", () => {
    const config = { frontStaff: 2, cashiers: 1, cooks: 1, customersPerHour: 30, seed: 15 };
    const fixed = restaurant({ ...config, varyStaffSpeed: false });
    const varied = restaurant({ ...config, varyStaffSpeed: true });
    run(fixed, 3600); run(varied, 3600);
    expect(varied.getMetrics()).toEqual(fixed.getMetrics());
  });
  it("พนักงานประจำรับเงินไม่ไปรับงานบริการ และพนักงานบริการไม่รับเงิน", () => {
    const sim = restaurant({ frontStaff: 2, cashiers: 1, cooks: 3, customersPerHour: 30,
      takeOrderSeconds: [1, 1], cookMinutesPerDish: 0.5, dineMinutes: [1, 2], paySeconds: [20, 20], patienceMinutes: 60 });
    const seen = new Set<string>();
    for (let t = 0; t < 3 * 3600; t += 5) {
      sim.step(5);
      const staff = sim.presentationSnapshot({ runId: "test", layoutRevision: "test", sequence: t }).staff;
      expect([null, "pay"]).toContain(staff[0]!.taskKind);
      expect(staff[1]!.taskKind).not.toBe("pay");
      for (const member of staff) if (member.taskKind) seen.add(member.taskKind);
    }
    expect(seen.has("pay")).toBe(true);
    expect(seen.has("take-order")).toBe(true);
    expect(seen.has("deliver")).toBe(true);
  });
  it("เวลาปรุงแต่ละจานอิงชนิดอาหารที่แสดงและเปลี่ยนผลการจำลองได้", () => {
    expect(MENU_COOK_FACTORS.steak).toBeGreaterThan(MENU_COOK_FACTORS["fried-rice"]);
    expect(MENU_COOK_FACTORS.cake).toBeLessThan(MENU_COOK_FACTORS["fried-rice"]);
    const config = { customersPerHour: 35, seed: 11, patienceMinutes: 45, cookMinutesPerDish: 5 };
    const fixed = restaurant({ ...config, varyMenuTimes: false });
    const varied = restaurant({ ...config, varyMenuTimes: true });
    const repeat = restaurant({ ...config, varyMenuTimes: true });
    run(fixed, 7200); run(varied, 7200); run(repeat, 7200);
    expect(varied.getMetrics()).not.toEqual(fixed.getMetrics());
    expect(varied.getMetrics()).toEqual(repeat.getMetrics());
  });
  it("ความอดทนต่างกันในช่วง 80–120% และซ้ำได้ด้วย seed กับกลุ่มเดิม", () => {
    const factors = Array.from({ length: 30 }, (_, i) => patienceFactor(11, i + 1));
    expect(factors.every((factor) => factor >= 0.8 && factor <= 1.2)).toBe(true);
    expect(new Set(factors).size).toBeGreaterThan(1);
    expect(factors).toEqual(Array.from({ length: 30 }, (_, i) => patienceFactor(11, i + 1)));
  });

  it("ปิดความอดทนที่ต่างกันให้ผลเหมือนโหมดเดิม และเปิดแล้วใช้ค่ารายกลุ่ม", () => {
    const base = { customersPerHour: 60, seed: 21, patienceMinutes: 3, tablePatienceMinutes: 2 };
    const legacy = restaurant(base);
    const fixed = restaurant({ ...base, varyPatience: false });
    const varied = restaurant({ ...base, varyPatience: true });
    run(legacy, 3600); run(fixed, 3600); run(varied, 3600);
    expect(fixed.getMetrics()).toEqual(legacy.getMetrics());
    expect(varied.getMetrics()).not.toEqual(fixed.getMetrics());
  });
  it("สัดส่วนกลุ่มกำหนดขนาดลูกค้า และยังรักษาอัตราคนต่อชั่วโมง", () => {
    const sim = restaurant({ customersPerHour: 60, partyWeights: [1, 0, 0, 0], seed: 12 });
    for (let t = 0; t < 3600; t++) {
      sim.step(1);
      for (const agent of sim.debugAgents()) expect(agent.partySize).toBe(1);
    }
    expect(sim.getMetrics().arrived).toBeGreaterThan(40);
    expect(sim.getMetrics().arrived).toBeLessThan(80);
  });
  it("กลุ่มเล็กเลือกโต๊ะเล็กที่สุดที่ว่าง เพื่อเก็บโต๊ะใหญ่ไว้ให้กลุ่มใหญ่", () => {
    const layout = cafeLayout();
    const small = layout.objects.find((o) => o.type === "table" && o.chairIds.length === 2);
    if (!small) throw new Error("expected two-seat table");
    let checked = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const sim = new Simulation(layout, { serviceStyle: "table-service", customersPerHour: 60, seed });
      while (sim.getMetrics().arrived === 0) sim.step(1);
      const first = sim.debugAgents()[0]!;
      if (first.partySize <= 2) {
        expect(first.tableId).toBe(small.id);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
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
    expect(m.fed).toBeGreaterThan(0);
    expect(m.served).toBeGreaterThan(0);
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
    // ลูกค้าที่เกิน patience จะออก จึงวัดผลจากจำนวนที่ยกเลิกแทนค่าเฉลี่ยของเฉพาะคนที่ได้อาหาร
    expect(waits[0]!.abandoned).toBeGreaterThan(waits[2]!.abandoned);
    expect(waits[0]!.kitchenBusy).toBeGreaterThan(waits[2]!.kitchenBusy);
  });

  it("ทำจานละนานขึ้น → รออาหารนานขึ้น", () => {
    const abandoned = (cookMinutesPerDish: number) => {
      const sim = restaurant({ cooks: 2, cookMinutesPerDish });
      run(sim, 3 * 3600);
      return sim.getMetrics().abandoned;
    };
    expect(abandoned(10)).toBeGreaterThan(abandoned(4));
  });

  it("พนักงานหน้าร้านน้อย → รับออร์เดอร์ช้า รออาหารนานขึ้น", () => {
    const wait = (frontStaff: number) => {
      // ครัวเร็วและทานสั้นเพื่อให้พนักงานหน้าร้านเป็นคอขวดจริง แทนที่จะติดโต๊ะสองชุดเต็ม
      const sim = restaurant({
        cooks: 3, frontStaff, customersPerHour: 30, takeOrderSeconds: [150, 210],
        cookMinutesPerDish: 0.5, dineMinutes: [1, 2], patienceMinutes: 6,
      });
      run(sim, 3 * 3600);
      return sim.getMetrics();
    };
    const one = wait(1);
    const three = wait(3);
    expect(one.abandoned).toBeGreaterThan(three.abandoned);
    expect(one.frontStaffBusy).toBeGreaterThan(three.frontStaffBusy);
    expect(one.fed).toBeGreaterThan(0);
    expect(three.fed).toBeGreaterThan(one.fed);
  });

  it("ไม่มีโต๊ะสะอาดว่าง → รอหน้าเข้าได้ แต่กลับเมื่อเกิน patience", () => {
    const sim = restaurant({ customersPerHour: 300, cooks: 3, patienceMinutes: 1 });
    run(sim, 3600);
    const m = sim.getMetrics();
    expect(m.noSeat).toBeGreaterThan(0);
    expect(m.tableWaitTimeout).toBeGreaterThan(0);
    expect(m.noSeat).toBe(m.tableWaitTimeout + m.noSuitableTable + m.balked);
    expect(m.maxEntranceQueue).toBeGreaterThan(0);
    expect(m.seated).toBeLessThanOrEqual(sim.seatCount);
  });

  it("เปลี่ยนเวลารอโต๊ะโดยไม่เปลี่ยนเวลารออาหาร", () => {
    const outcome = (tablePatienceMinutes: number) => {
      const sim = restaurant({ customersPerHour: 120, cooks: 3, patienceMinutes: 15, tablePatienceMinutes });
      run(sim, 2 * 3600);
      return sim.getMetrics();
    };
    expect(outcome(1).noSeat).toBeGreaterThan(outcome(30).noSeat);
  });

  it("เมื่อคิวยาว บางกลุ่มกลับทันที และนับเป็นส่วนหนึ่งของคนที่ไม่มีโต๊ะ", () => {
    const make = (queueBalkAt: number) => restaurant({ customersPerHour: 180, cooks: 2, tablePatienceMinutes: 30, queueBalkAt, seed: 8 });
    const enabled = make(1);
    const disabled = make(0);
    const repeat = make(1);
    run(enabled, 3600); run(disabled, 3600); run(repeat, 3600);
    expect(enabled.getMetrics().balked).toBeGreaterThan(0);
    expect(enabled.getMetrics().balked).toBeLessThanOrEqual(enabled.getMetrics().noSeat);
    expect(enabled.getMetrics().noSeat).toBe(enabled.getMetrics().tableWaitTimeout + enabled.getMetrics().noSuitableTable + enabled.getMetrics().balked);
    expect(disabled.getMetrics().balked).toBe(0);
    expect(repeat.getMetrics()).toEqual(enabled.getMetrics());
  });

  it("แยกกลุ่มที่ไม่มีโต๊ะขนาดรองรับจากกลุ่มที่รอโต๊ะไม่ไหว", () => {
    const layout = cafeLayout();
    const large = layout.objects.find((object) => object.type === "table" && object.chairIds.length === 4);
    if (!large || large.type !== "table") throw new Error("fixture missing table");
    const smallOnly = { ...layout, objects: layout.objects.filter((object) => object.id !== large.id && !(object.type === "chair" && object.tableId === large.id)) };
    const sim = new Simulation(smallOnly, { serviceStyle: "table-service", customersPerHour: 80, partyWeights: [0, 0, 0, 1], seed: 7 });
    run(sim, 3600);
    const metrics = sim.getMetrics();
    expect(metrics.noSuitableTable).toBeGreaterThan(0);
    expect(metrics.noSuitableTable).toBe(metrics.noSeat);
    expect(metrics.tableWaitTimeout).toBe(0);
  });

  it("ลูกค้าที่รอรับออร์เดอร์เกินเวลาที่กำหนดออกจากร้านได้ แม้พนักงานยังไม่รับเสร็จ", () => {
    const sim = restaurant({ customersPerHour: 30, frontStaff: 1, cooks: 1, patienceMinutes: 1, takeOrderSeconds: [600, 600] });
    run(sim, 15 * 60);
    expect(sim.getMetrics().abandoned).toBeGreaterThan(0);
    expect(sim.getMetrics().fed).toBe(0);
    expect(sim.getMetrics().wastedDishes).toBe(0);
  });

  it("นับเฉพาะจานที่ปรุงเสร็จและถูกยกเลิก โดยไม่นับจานที่ยังรอครัว", () => {
    const sim = restaurant({ customersPerHour: 12, frontStaff: 2, cooks: 1, patienceMinutes: 1,
      takeOrderSeconds: [1, 1], partyWeights: [0, 0, 0, 1], cookMinutesPerDish: 3 });
    run(sim, 3600);
    const metrics = sim.getMetrics();
    expect(metrics.abandoned).toBeGreaterThan(0);
    expect(metrics.wastedDishes).toBeGreaterThan(0);
    expect(metrics.wastedDishes).toBeLessThan(metrics.abandoned);
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

  it("เปลี่ยนจำนวนพนักงานไม่เปลี่ยนลำดับลูกค้าเข้าร้าน", () => {
    const slow = restaurant({ seed: 16, customersPerHour: 90, frontStaff: 1, cooks: 1 });
    const fast = restaurant({ seed: 16, customersPerHour: 90, frontStaff: 4, cooks: 4 });
    for (let t = 0; t < 2 * 3600; t += 60) {
      run(slow, 60); run(fast, 60);
      expect(slow.getMetrics().arrived).toBe(fast.getMetrics().arrived);
    }
  });
});
