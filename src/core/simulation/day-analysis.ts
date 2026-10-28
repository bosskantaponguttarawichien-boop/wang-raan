/**
 * วิเคราะห์ร้านทั้งวันเบื้องหลัง (feat-094) — Pure TypeScript (รันใน Web Worker)
 * จำลองทั้งวันหลายรอบด้วย seed คงที่ (ลูกค้าชุดเดิมทุกรอบ) เพื่อตอบคำถามเจ้าของร้าน 3 ข้อ:
 * 1. ต้องจ้างพนักงานหน้าร้าน/พ่อครัวกี่คน — จำนวนน้อยที่สุดที่ลูกค้ารอเกิน ≤ GOOD_TOO_LONG_RATE
 * 2. อาหารต้องออกภายในกี่นาที (พ่อครัว 1 คน ทำ 1 จาน) ด้วยจำนวนพนักงานที่ตั้งไว้ ถึงจะผ่านเกณฑ์เดียวกัน
 * 3. ลูกค้านั่งนานแบบนี้ ที่นั่งพอไหม
 * เกณฑ์ "กำลังดี" ยืนยันโดยเจ้าของผลิตภัณฑ์ 2026-10-23 (PRD §9 ข้อ 28)
 */
import type { StoreLayout } from "../layout/types";
import { planArrivals, type ArrivalPlan, type DayPlanInput } from "./day-plan";
import { Simulation, prepareStore, type PreparedStore, type SimulationMetrics } from "./engine";

/** ลูกค้ารออาหารเกินเวลาที่ยอมได้ไม่เกินสัดส่วนนี้ = "กำลังดี" */
export const GOOD_TOO_LONG_RATE = 0.1;
/** ลูกค้ากลับเพราะไม่มีที่นั่งไม่เกินสัดส่วนนี้ = "ที่นั่งพอ" */
export const GOOD_NO_SEAT_RATE = 0.1;
/** ไล่หาจำนวนพนักงานต่อตำแหน่งได้ถึงเท่านี้ */
export const MAX_STAFF_SEARCH = 8;
/** ช่วงค้นหาเวลาต่อจาน (นาที) และความละเอียด */
export const COOK_MINUTES_RANGE: [number, number] = [0.5, 60];
export const COOK_MINUTES_STEP = 0.5;
/** seed คงที่ — ผลวิเคราะห์ซ้ำได้ และเฉลี่ยหลายชุดลดการแกว่ง */
export const ANALYSIS_SEEDS: readonly number[] = [11, 23];
/** หลังปิดร้านให้ลูกค้าที่ค้างอยู่ทานจนเสร็จได้ไม่เกินเท่านี้ */
const DRAIN_SECONDS = 4 * 3600;

export interface DayInput extends DayPlanInput {
  frontStaff: number;
  cooks: number;
  cookMinutesPerDish: number;
  dineMinutes: [number, number];
  patienceMinutes: number;
}

export interface DayOutcome {
  arrived: number;
  fed: number;
  noSeat: number;
  /** ออกจากร้านเพราะรออาหารนานเกินกำหนด */
  abandoned: number;
  /** คนที่ยังอยู่ในระบบเมื่อครบเวลาระบายคิวหลังร้านปิด */
  unfinished: number;
  /** จำนวนคนสูงสุดที่ยืนรอโต๊ะสะอาดหน้าร้าน */
  maxEntranceQueue: number;
  avgFoodWaitMinutes: number;
  /** สัดส่วนคนที่รออาหารเกินเวลาที่ยอมได้ (ของคนที่ได้อาหาร) */
  tooLongRate: number;
  /** สัดส่วนลูกค้าที่กลับเพราะไม่มีที่นั่ง */
  noSeatRate: number;
  avgVisitMinutes: number;
  frontStaffBusy: number;
  kitchenBusy: number;
}

export interface StaffOption {
  frontStaff: number;
  cooks: number;
  outcome: DayOutcome;
  good: boolean;
}

export interface DayAnalysis {
  plan: ArrivalPlan;
  seats: number;
  /** ผลตามค่าที่ผู้ใช้ตั้ง */
  current: DayOutcome;
  currentGood: boolean;
  staffing: {
    /** null = ถึง MAX_STAFF_SEARCH แล้วยังไม่ผ่านเกณฑ์ */
    recommended: { frontStaff: number; cooks: number } | null;
    /** เทียบพ่อครัว −1 / แนะนำ / +1 (พนักงานหน้าร้านตามที่แนะนำ) */
    cookOptions: StaffOption[];
    /** เทียบพนักงานหน้าร้าน −1 / แนะนำ / +1 (พ่อครัวตามที่แนะนำ) */
    frontOptions: StaffOption[];
  };
  cookTime: {
    /** นาทีต่อจานที่ช้าที่สุดที่ยังผ่านเกณฑ์ด้วยจำนวนพนักงานที่ตั้งไว้; null = เร็วแค่ไหนก็ไม่ผ่าน (คอขวดอยู่ที่อื่น) */
    maxMinutesPerDish: number | null;
    currentMinutesPerDish: number;
  };
  seating: {
    /** ผลที่ใช้ประเมิน: พนักงานจำนวนที่แนะนำ หรือตามที่ตั้ง (เมื่อหาจำนวนแนะนำไม่ได้) */
    basedOn: "recommended" | "current";
    noSeat: number;
    noSeatRate: number;
    maxEntranceQueue: number;
    /** เวลาเฉลี่ยในร้าน (นาที) ที่ใช้คำนวณ */
    avgVisitMinutes: number;
    /** ที่นั่งรับลูกค้าได้ราวกี่คน/ชม. (ที่นั่ง × 60 ÷ เวลาเฉลี่ยในร้าน) */
    capacityPerHour: number;
    /** ลูกค้าช่วงคนเยอะ (หรือช่วงปกติถ้าไม่มีพีค) คน/ชม. */
    busiestCustomersPerHour: number;
    enough: boolean;
  };
}

function runOnce(store: PreparedStore, input: DayInput, plan: ArrivalPlan, seed: number): { metrics: SimulationMetrics; seats: number } {
  const sim = new Simulation(store, {
    serviceStyle: "table-service",
    customersPerHour: plan.customersPerHour,
    peak: plan.peak,
    closeSeconds: plan.closeSeconds,
    frontStaff: input.frontStaff,
    cooks: input.cooks,
    cookMinutesPerDish: input.cookMinutesPerDish,
    dineMinutes: input.dineMinutes,
    patienceMinutes: input.patienceMinutes,
    seed,
  });
  const limit = plan.closeSeconds + DRAIN_SECONDS;
  while (sim.getMetrics().time < plan.closeSeconds) sim.step(60);
  while (sim.getMetrics().inStore > 0 && sim.getMetrics().time < limit) sim.step(60);
  return { metrics: sim.getMetrics(), seats: sim.seatCount };
}

/** จำลองทั้งวัน (เปิดร้านจนลูกค้าคนสุดท้ายออก หรือครบเวลาระบายคิว) เฉลี่ยจาก ANALYSIS_SEEDS */
export function simulateDay(store: StoreLayout | PreparedStore, input: DayInput): { outcome: DayOutcome; seats: number } {
  const prepared = "grid" in store ? store : prepareStore(store);
  const plan = planArrivals(input);
  const runs = ANALYSIS_SEEDS.map((seed) => runOnce(prepared, input, plan, seed));
  const mean = (pick: (m: SimulationMetrics) => number) => runs.reduce((sum, r) => sum + pick(r.metrics), 0) / runs.length;
  const rate = (pick: (m: SimulationMetrics) => [number, number]) =>
    runs.reduce((sum, r) => {
      const [part, whole] = pick(r.metrics);
      return sum + (whole > 0 ? part / whole : 0);
    }, 0) / runs.length;
  return {
    seats: runs[0]!.seats,
    outcome: {
      arrived: mean((m) => m.arrived),
      fed: mean((m) => m.fed),
      noSeat: mean((m) => m.noSeat),
      abandoned: mean((m) => m.abandoned),
      unfinished: mean((m) => m.inStore),
      maxEntranceQueue: mean((m) => m.maxEntranceQueue),
      avgFoodWaitMinutes: mean((m) => m.avgFoodWaitMinutes),
      // นับทั้งคนที่รอนานแล้วได้อาหาร, ยกเลิกเพราะรอ, และยังค้างหลังเวลาระบายคิว
      tooLongRate: rate((m) => [m.waitedTooLong + m.abandoned + m.inStore, m.arrived]),
      noSeatRate: rate((m) => [m.noSeat, m.arrived]),
      avgVisitMinutes: mean((m) => m.avgVisitMinutes),
      frontStaffBusy: mean((m) => m.frontStaffBusy),
      kitchenBusy: mean((m) => m.kitchenBusy),
    },
  };
}

export const isGood = (outcome: DayOutcome) => outcome.tooLongRate <= GOOD_TOO_LONG_RATE && outcome.unfinished === 0;

export function analyzeDay(layout: StoreLayout, input: DayInput): DayAnalysis {
  const store = prepareStore(layout);
  const cache = new Map<string, DayOutcome>();
  let seats = 0;
  const outcomeOf = (frontStaff: number, cooks: number, cookMinutesPerDish = input.cookMinutesPerDish) => {
    const key = `${frontStaff}|${cooks}|${cookMinutesPerDish}`;
    let outcome = cache.get(key);
    if (!outcome) {
      const result = simulateDay(store, { ...input, frontStaff, cooks, cookMinutesPerDish });
      seats = result.seats;
      outcome = result.outcome;
      cache.set(key, outcome);
    }
    return outcome;
  };
  const option = (frontStaff: number, cooks: number): StaffOption => {
    const outcome = outcomeOf(frontStaff, cooks);
    return { frontStaff, cooks, outcome, good: isGood(outcome) };
  };
  const firstGood = (test: (n: number) => boolean): number | null => {
    for (let n = 1; n <= MAX_STAFF_SEARCH; n++) if (test(n)) return n;
    return null;
  };

  const current = outcomeOf(input.frontStaff, input.cooks);

  // 1. หาพ่อครัวก่อน (ให้พนักงานหน้าร้านเต็มที่ ครัวจะได้เป็นตัวแปรเดียว) แล้วหาพนักงานหน้าร้านด้วยพ่อครัวจำนวนนั้น
  const cooks = firstGood((n) => isGood(outcomeOf(MAX_STAFF_SEARCH, n)));
  const front = cooks === null ? null : firstGood((n) => isGood(outcomeOf(n, cooks)));
  const recommended = cooks !== null && front !== null ? { frontStaff: front, cooks } : null;
  const around = (n: number) => [n - 1, n, n + 1].filter((k) => k >= 1 && k <= MAX_STAFF_SEARCH);
  const cookOptions = recommended ? around(recommended.cooks).map((n) => option(recommended.frontStaff, n)) : [];
  const frontOptions = recommended ? around(recommended.frontStaff).map((n) => option(n, recommended.cooks)) : [];

  // 2. เวลาต่อจานที่ช้าที่สุดที่ยังผ่าน (ถือว่ายิ่งช้ายิ่งรอนาน) — binary search บนตารางทีละ COOK_MINUTES_STEP
  const [low, high] = COOK_MINUTES_RANGE;
  const steps = Math.round((high - low) / COOK_MINUTES_STEP);
  const minutesAt = (k: number) => low + k * COOK_MINUTES_STEP;
  const goodAt = (k: number) => isGood(outcomeOf(input.frontStaff, input.cooks, minutesAt(k)));
  let maxMinutesPerDish: number | null = null;
  if (goodAt(0)) {
    let lo = 0;
    let hi = steps;
    if (goodAt(hi)) lo = hi;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (goodAt(mid)) lo = mid;
      else hi = mid;
    }
    maxMinutesPerDish = minutesAt(lo);
  }

  // 3. ที่นั่ง — ดูจากพนักงานจำนวนที่แนะนำ (ถ้ามี) เพื่อไม่ให้ครัวช้าทำให้ดูเหมือนโต๊ะไม่พอ
  const plan = planArrivals(input);
  const basedOn = recommended ? "recommended" : "current";
  const seatingOutcome = recommended ? outcomeOf(recommended.frontStaff, recommended.cooks) : current;
  const visit = seatingOutcome.avgVisitMinutes > 0 ? seatingOutcome.avgVisitMinutes : (input.dineMinutes[0] + input.dineMinutes[1]) / 2;
  const capacityPerHour = (seats * 60) / visit;

  return {
    plan,
    seats,
    current,
    currentGood: isGood(current),
    staffing: { recommended, cookOptions, frontOptions },
    cookTime: { maxMinutesPerDish, currentMinutesPerDish: input.cookMinutesPerDish },
    seating: {
      basedOn,
      noSeat: seatingOutcome.noSeat,
      noSeatRate: seatingOutcome.noSeatRate,
      maxEntranceQueue: seatingOutcome.maxEntranceQueue,
      avgVisitMinutes: visit,
      capacityPerHour,
      busiestCustomersPerHour: plan.peak?.customersPerHour ?? plan.customersPerHour,
      // คิวสั้นชั่วคราวระหว่างพนักงานเก็บโต๊ะไม่ใช่สัญญาณว่าโต๊ะไม่พอ;
      // เกิน 10% ของที่นั่งจึงถือว่าเป็นคิวที่มีนัยสำคัญ
      enough: seatingOutcome.maxEntranceQueue <= Math.max(1, seats * GOOD_NO_SEAT_RATE),
    },
  };
}
