/**
 * ค่าฟอร์ม "จำลองร้าน 1 วัน" (feat-094) → DayInput ของ core + ค่าที่คำนวณโชว์ในฟอร์ม
 * ค่าตั้งต้นยืนยันโดยเจ้าของผลิตภัณฑ์ 2026-10-23 (PRD §9 ข้อ 28): ร้านอาหารตามสั่ง แบบ A
 */
import { openHours, parseClock, planArrivals, type ArrivalPlan, type DayInput } from "@/core/simulation";

export interface DayConfig {
  /** "HH:MM" */
  openTime: string;
  closeTime: string;
  frontStaff: number;
  cooks: number;
  /** พ่อครัว 1 คน ทำ 1 จาน (นาที) */
  cookMinutesPerDish: number;
  dailyCustomers: number;
  peakStart: string;
  peakEnd: string;
  /** เวลานั่งกินเฉลี่ย (นาที) — ใช้ช่วง ± DINE_SPREAD */
  dineMinutes: number;
  /** รอได้ไม่เกิน (นาที) นับจากนั่งลงจนได้อาหาร */
  patienceMinutes: number;
}

export const DEFAULT_DAY_CONFIG: DayConfig = {
  openTime: "10:00",
  closeTime: "20:00",
  frontStaff: 2,
  cooks: 1,
  cookMinutesPerDish: 5,
  dailyCustomers: 120,
  peakStart: "11:30",
  peakEnd: "13:00",
  dineMinutes: 20,
  patienceMinutes: 15,
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
  const hours = openHours(open, close);
  const offset = (minute: number) => (minute - open + 1440) % 1440;
  if (offset(peakStart) >= offset(peakEnd) || offset(peakEnd) > hours * 60) {
    return { ok: false, reason: "ช่วงคนเยอะต้องอยู่ในเวลาเปิดร้าน และเวลาเริ่มต้องก่อนเวลาจบ" };
  }
  const input: DayInput = {
    openMinute: open,
    closeMinute: close,
    dailyCustomers: config.dailyCustomers,
    peakStartMinute: peakStart,
    peakEndMinute: peakEnd,
    frontStaff: config.frontStaff,
    cooks: config.cooks,
    cookMinutesPerDish: config.cookMinutesPerDish,
    dineMinutes: dineRange(config.dineMinutes),
    patienceMinutes: config.patienceMinutes,
  };
  return { ok: true, input, plan: planArrivals(input), hours };
}
