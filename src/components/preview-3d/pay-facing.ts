import type { PaySpot } from "@/core/preview/staff-spots";

/** ลูกค้าที่ยืนต่อคิว/จ่ายเงินห่างจอ POS ไม่เกินนี้ (ม.) หันหน้าเข้าหาจอ */
export const PAY_QUEUE_REACH = 3;
/** พนักงานยืนห่างจุดหลังจอ POS ไม่เกินนี้ (ม.) ถือว่ายืนรับเงินอยู่ */
export const CASHIER_REACH = 0.3;

/**
 * มุม rotation.y (แบบเดียวกับ Math.atan2(dx, dz) ในฉาก) ที่หันหน้าเข้าหาจอ POS ที่ใกล้ที่สุด
 * null เมื่อไม่มีจอ POS อยู่ใกล้ (x, z) ภายใน `within` เมตร
 * @param from จุดอ้างอิงที่ใช้วัดระยะ: "pos" = ตัวจอ, "staff" = จุดยืนพนักงานหลังจอ
 */
export function facingTowardPos(spots: readonly PaySpot[], x: number, z: number, within: number, from: "pos" | "staff" = "pos"): number | null {
  let best: PaySpot | null = null;
  let bestDistance = within;
  for (const spot of spots) {
    const anchor = from === "staff" ? spot.staff : spot.pos;
    if (!anchor) continue;
    const distance = Math.hypot(anchor.x - x, anchor.y - z);
    if (distance <= bestDistance) { best = spot; bestDistance = distance; }
  }
  return best ? Math.atan2(best.pos.x - x, best.pos.y - z) : null;
}
