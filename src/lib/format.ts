/**
 * จัดรูปแบบข้อความภาษาไทยที่ใช้ร่วมกันทั้งฝั่ง Client และ Server (ไม่มี DOM / React)
 */

export const DAY_MS = 24 * 60 * 60 * 1000;

/** วันเวลาแบบไทย — "medium" สำหรับรายการในแผง, "long" สำหรับรายงาน/หน้าแชร์ */
export function formatDateTime(value: string | number | Date, dateStyle: "medium" | "long" = "medium"): string {
  return new Date(value).toLocaleString("th-TH", { dateStyle, timeStyle: "short" });
}

/** ตัวเลขแบบไทย ทศนิยมไม่เกิน 2 ตำแหน่ง (ขนาด/พื้นที่เป็นเมตร) */
export const formatNumber = (v: number) => v.toLocaleString("th-TH", { maximumFractionDigits: 2 });
