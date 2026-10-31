/**
 * ค่าฟอร์ม "จำลองร้าน 1 วัน" (feat-095) → DayInput ของ core + ค่าที่คำนวณโชว์ในฟอร์ม
 * ค่าตั้งต้นยืนยันโดยเจ้าของผลิตภัณฑ์ 2026-10-23 (PRD §9 ข้อ 28): ร้านอาหารตามสั่ง แบบ A
 */
import { openHours, parseClock, planArrivals, type ArrivalPlan, type DayInput, type PartyWeights } from "@/core/simulation";

export interface DayConfig {
  /** "HH:MM" */
  openTime: string;
  closeTime: string;
  frontStaff: number;
  cashiers: number;
  cooks: number;
  /** พ่อครัว 1 คน ทำ 1 จาน (นาที) */
  cookMinutesPerDish: number;
  dailyCustomers: number;
  peakStart: string;
  peakEnd: string;
  secondPeakEnabled: boolean;
  secondPeakStart: string;
  secondPeakEnd: string;
  /** เวลานั่งกินเฉลี่ย (นาที) — ใช้ช่วง ± DINE_SPREAD */
  dineMinutes: number;
  /** รอได้ไม่เกิน (นาที) นับจากนั่งลงจนได้อาหาร */
  patienceMinutes: number;
  tablePatienceMinutes: number;
  partyWeights: PartyWeights;
  varyPatience: boolean;
  queueBalkAt: number;
  varyMenuTimes: boolean;
  varyStaffSpeed: boolean;
  teamBreakEnabled: boolean;
  staggerBreak: boolean;
  teamBreakStart: string;
  teamBreakEnd: string;
  extraDishPercent: number;
}

export const DEFAULT_DAY_CONFIG: DayConfig = {
  openTime: "10:00",
  closeTime: "20:00",
  frontStaff: 2,
  cashiers: 0,
  cooks: 1,
  cookMinutesPerDish: 5,
  dailyCustomers: 120,
  peakStart: "11:30",
  peakEnd: "13:00",
  secondPeakEnabled: false,
  secondPeakStart: "17:30",
  secondPeakEnd: "19:00",
  dineMinutes: 20,
  patienceMinutes: 15,
  tablePatienceMinutes: 15,
  partyWeights: [1, 1, 1, 1],
  varyPatience: true,
  queueBalkAt: 0,
  varyMenuTimes: true,
  varyStaffSpeed: true,
  teamBreakEnabled: false,
  staggerBreak: false,
  teamBreakStart: "14:00",
  teamBreakEnd: "14:30",
  extraDishPercent: 0,
};

export const DINE_SPREAD = 5;
export const STAFF_LIMITS = { min: 1, max: 8 } as const;
export const DAILY_CUSTOMER_LIMITS = { min: 10, max: 500, step: 10 } as const;
export const COOK_MINUTE_LIMITS = { min: 1, max: 30, step: 0.5 } as const;
export const DINE_MINUTE_LIMITS = { min: 10, max: 120, step: 5 } as const;
export const PATIENCE_LIMITS = { min: 5, max: 30, step: 1 } as const;

export function dineRange(average: number): [number, number] {
  return [Math.max(1, average - DINE_SPREAD), average + DINE_SPREAD];
}

/** นาทีนับจากเที่ยงคืน → "HH:MM" (เกินวันวนกลับ) */
export function formatClock(minute: number): string {
  const m = ((Math.round(minute) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** นาทีเปิดร้าน + เวลาจำลอง (วินาที) → "HH:MM:SS" (เกินวันวนกลับ) */
export function formatClockSeconds(openMinute: number, elapsedSeconds: number): string {
  const totalSeconds = ((Math.floor(openMinute * 60 + elapsedSeconds + 1e-6) % 86400) + 86400) % 86400;
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * นาทีเปิดร้าน + เวลาจำลอง (วินาที) → "HH:MM" (ปัดลง, เกินวันวนกลับ)
 * นาฬิการะหว่างเล่นภาพโชว์แค่นาที: เวลาย่อแบบเกมอาจชะลอนาฬิกาเล็กน้อยให้ภาพไล่ทัน วินาทีที่วิ่งจะฟ้องจังหวะนั้น
 */
export function formatClockMinutes(openMinute: number, elapsedSeconds: number): string {
  return formatClock(Math.floor(openMinute + elapsedSeconds / 60 + 1e-6));
}

/** 1 ทศนิยม ตัด .0 ทิ้ง */
export const formatNumber = (value: number) => (Math.round(value * 10) / 10).toLocaleString("th-TH");

export type DayInputResult = { ok: true; input: DayInput; plan: ArrivalPlan; hours: number } | { ok: false; reason: string };

export function toDayInput(config: DayConfig): DayInputResult {
  const open = parseClock(config.openTime);
  const close = parseClock(config.closeTime);
  const peakStart = parseClock(config.peakStart);
  const peakEnd = parseClock(config.peakEnd);
  if (open === null || close === null) return { ok: false, reason: "ใส่เวลาเปิด–ปิดร้านให้ครบ" };
  if (open === close) return { ok: false, reason: "เวลาเปิดและปิดร้านต้องไม่ตรงกัน" };
  if (peakStart === null || peakEnd === null) return { ok: false, reason: "ใส่ช่วงที่คนเข้าเยอะที่สุดให้ครบ" };
  if (config.partyWeights.every((weight) => weight === 0)) return { ok: false, reason: "เลือกกลุ่มลูกค้าอย่างน้อยหนึ่งขนาด" };
  if (config.cashiers < 0 || config.cashiers >= config.frontStaff) return { ok: false, reason: "ต้องมีพนักงานบริการอย่างน้อย 1 คน" };
  const hours = openHours(open, close);
  const offset = (minute: number) => (minute - open + 1440) % 1440;
  if (offset(peakStart) >= offset(peakEnd) || offset(peakEnd) > hours * 60) {
    return { ok: false, reason: "ช่วงคนเยอะต้องอยู่ในเวลาเปิดร้าน และเวลาเริ่มต้องก่อนเวลาจบ" };
  }
  let secondPeak: DayInput["secondPeak"];
  if (config.secondPeakEnabled) {
    const start = parseClock(config.secondPeakStart);
    const end = parseClock(config.secondPeakEnd);
    if (start === null || end === null || offset(start) >= offset(end) || offset(end) > hours * 60) {
      return { ok: false, reason: "ช่วงคนเยอะที่สองต้องอยู่ในเวลาเปิดร้าน และเวลาเริ่มต้องก่อนเวลาจบ" };
    }
    if (offset(start) < offset(peakEnd) && offset(peakStart) < offset(end)) {
      return { ok: false, reason: "ช่วงคนเยอะทั้งสองช่วงต้องไม่ทับกัน" };
    }
    secondPeak = { startMinute: start, endMinute: end };
  }
  let teamBreak: DayInput["teamBreak"];
  if (config.teamBreakEnabled) {
    const start = parseClock(config.teamBreakStart), end = parseClock(config.teamBreakEnd);
    if (start === null || end === null || offset(start) >= offset(end) || offset(end) > hours * 60) {
      return { ok: false, reason: "ช่วงพักทีมต้องอยู่ในเวลาเปิดร้าน และเวลาเริ่มต้องก่อนเวลาจบ" };
    }
    teamBreak = { startSeconds: offset(start) * 60, endSeconds: offset(end) * 60 };
  }
  const input: DayInput = {
    openMinute: open,
    closeMinute: close,
    dailyCustomers: config.dailyCustomers,
    peakStartMinute: peakStart,
    peakEndMinute: peakEnd,
    secondPeak,
    frontStaff: config.frontStaff,
    cashiers: config.cashiers,
    cooks: config.cooks,
    cookMinutesPerDish: config.cookMinutesPerDish,
    dineMinutes: dineRange(config.dineMinutes),
    patienceMinutes: config.patienceMinutes,
    tablePatienceMinutes: config.tablePatienceMinutes,
    partyWeights: config.partyWeights,
    varyPatience: config.varyPatience,
    queueBalkAt: config.queueBalkAt,
    varyMenuTimes: config.varyMenuTimes,
    varyStaffSpeed: config.varyStaffSpeed,
    teamBreak,
    staggerBreak: config.staggerBreak,
    extraDishPercent: config.extraDishPercent,
  };
  return { ok: true, input, plan: planArrivals(input), hours };
}
