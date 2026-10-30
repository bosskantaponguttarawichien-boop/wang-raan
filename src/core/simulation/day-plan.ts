/**
 * แผนลูกค้าทั้งวัน — Pure TypeScript
 * แปลง "เปิด–ปิดร้าน + ลูกค้าทั้งวัน + ช่วงคนเยอะ" เป็นอัตราลูกค้าเข้าต่อชั่วโมง
 * ช่วงคนเยอะมีลูกค้าเข้าหนาแน่นกว่าช่วงอื่น PEAK_FACTOR เท่า (ค่าตั้งต้นที่เจ้าของผลิตภัณฑ์เลือก 2026-10-23)
 * เวลาในไฟล์นี้เป็น "นาทีนับจากเที่ยงคืน" ส่วนผลลัพธ์เป็น "วินาทีนับจากเปิดร้าน" ตามนาฬิกาของ Simulation
 */

export const PEAK_FACTOR = 2.5;

export interface DayPlanInput {
  /** นาทีนับจากเที่ยงคืน เช่น 10:00 = 600 */
  openMinute: number;
  closeMinute: number;
  /** ลูกค้าที่อยากให้เข้าทั้งวัน */
  dailyCustomers: number;
  peakStartMinute: number;
  peakEndMinute: number;
  secondPeak?: { startMinute: number; endMinute: number };
}

export interface ArrivalPlan {
  /** วินาทีที่ร้านปิด (นับจากเปิดร้าน) — หลังจากนี้ไม่มีลูกค้าเข้าใหม่ */
  closeSeconds: number;
  /** ลูกค้าต่อชั่วโมงช่วงปกติ */
  customersPerHour: number;
  /** ช่วงคนเยอะ (วินาทีนับจากเปิดร้าน); null = ไม่มีช่วงคนเยอะที่อยู่ในเวลาเปิด */
  peak: { startSeconds: number; endSeconds: number; customersPerHour: number } | null;
  peaks: { startSeconds: number; endSeconds: number; customersPerHour: number }[];
}

/** "10:30" → 630; รูปแบบผิดคืน null */
export function parseClock(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** ชั่วโมงที่เปิดร้าน (ปิดเลยเที่ยงคืนนับข้ามวัน) */
export function openHours(openMinute: number, closeMinute: number): number {
  const span = closeMinute > openMinute ? closeMinute - openMinute : closeMinute + 24 * 60 - openMinute;
  return span / 60;
}

export function planArrivals(input: DayPlanInput): ArrivalPlan {
  const hours = openHours(input.openMinute, input.closeMinute);
  const closeSeconds = hours * 3600;
  // ตัดช่วงคนเยอะให้อยู่ในเวลาเปิด (นับจากเปิดร้าน)
  const toOffset = (minute: number) => {
    const offset = (minute - input.openMinute + 24 * 60) % (24 * 60);
    return Math.min(offset * 60, closeSeconds);
  };
  const windows = [
    { startSeconds: toOffset(input.peakStartMinute), endSeconds: toOffset(input.peakEndMinute) },
    ...(input.secondPeak ? [{ startSeconds: toOffset(input.secondPeak.startMinute), endSeconds: toOffset(input.secondPeak.endMinute) }] : []),
  ].filter((interval) => interval.endSeconds > interval.startSeconds).sort((a, b) => a.startSeconds - b.startSeconds);
  // รวมช่วงที่ทับกันเพื่อไม่ให้นับเวลาหรือความหนาแน่นซ้ำ แม้เรียก core โดยตรง
  const merged: typeof windows = [];
  for (const interval of windows) {
    const previous = merged.at(-1);
    if (previous && interval.startSeconds <= previous.endSeconds) previous.endSeconds = Math.max(previous.endSeconds, interval.endSeconds);
    else merged.push({ ...interval });
  }
  const peakHours = merged.reduce((sum, interval) => sum + interval.endSeconds - interval.startSeconds, 0) / 3600;

  // ลูกค้าทั้งวัน = ปกติ × (ชม.ทั้งหมด − ชม.พีค) + ปกติ × PEAK_FACTOR × ชม.พีค
  const base = hours > 0 ? input.dailyCustomers / (hours + (PEAK_FACTOR - 1) * peakHours) : 0;
  const peaks = merged.map((interval) => ({ ...interval, customersPerHour: base * PEAK_FACTOR }));
  return {
    closeSeconds,
    customersPerHour: base,
    peak: peaks[0] ?? null,
    peaks,
  };
}
