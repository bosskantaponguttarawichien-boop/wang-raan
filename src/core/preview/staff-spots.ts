/**
 * จุดยืนของพนักงานหลังเคาน์เตอร์ (เพื่อแสดงในมุมมอง 3D เท่านั้น) — Pure TypeScript
 *
 * ฝั่งพนักงานของเคาน์เตอร์ (ตรงกับ createCounter ใน three-view):
 * - ก่อนหมุน ถ้า width ≥ depth ด้านยาวอยู่แนว x ฝั่งพนักงานคือเหนือ (−y); ถ้า depth > width ฝั่งพนักงานคือตะวันตก (−x)
 * - แล้วหมุนตามเข็มตาม `rotation` ของเคาน์เตอร์
 * พนักงานหันหน้าเข้าหาเคาน์เตอร์ ยืนห่างขอบ STAFF_STANDOFFS[0] ถ้ามีที่ ไม่พอก็ขยับเข้าใกล้
 * ใกล้สุดแล้วยังชนผนัง/วัตถุอื่นก็ไม่วาง
 * ไม่กระทบ validation; simulation กันช่องที่พนักงานยืนออกจากทางเดิน (occupancy-grid)
 */
import { footprint, objectCenter, rotatePoint } from "../layout/geometry";
import type { Counter, Meters, Point, Rect, StoreLayout } from "../layout/types";

/** ระยะจากขอบเคาน์เตอร์ถึงกลางตัวพนักงาน ไล่จากที่อยากได้ไปถึงชิดที่สุด */
export const STAFF_STANDOFFS: readonly Meters[] = [0.35, 0.3, 0.25];
/** รัศมีพื้นที่ยืนของพนักงาน (mannequin สูง 1.70 ม. ลำตัวหนาราว 0.23 ม. + ส้นเท้า) */
export const STAFF_RADIUS: Meters = 0.2;
/** เคาน์เตอร์ยาวตั้งแต่ค่านี้มีพนักงาน 2 คน */
export const TWO_STAFF_MIN_LENGTH: Meters = 2.4;

export interface StaffSpot {
  counterId: string;
  /** กลางตัวพนักงานบนผัง */
  position: Point;
  /** ทิศที่พนักงานหันหน้า (เวกเตอร์หน่วยบนผัง) — ชี้เข้าหาเคาน์เตอร์ */
  facing: Point;
}

const ORIGIN: Point = { x: 0, y: 0 };

/** แตะขอบไม่นับว่าทับ */
function squareHitsRect(center: Point, radius: Meters, rect: Rect) {
  return (
    center.x + radius > rect.x &&
    center.x - radius < rect.x + rect.width &&
    center.y + radius > rect.y &&
    center.y - radius < rect.y + rect.depth
  );
}

function spotsForCounter(counter: Counter, layout: StoreLayout): StaffSpot[] {
  const alongX = counter.width >= counter.depth;
  const long = Math.max(counter.width, counter.depth);
  const short = Math.min(counter.width, counter.depth);
  const back = rotatePoint(alongX ? { x: 0, y: -1 } : { x: -1, y: 0 }, ORIGIN, counter.rotation);
  const axis = rotatePoint(alongX ? { x: 1, y: 0 } : { x: 0, y: 1 }, ORIGIN, counter.rotation);
  const center = objectCenter(counter);
  const offsets = long >= TWO_STAFF_MIN_LENGTH ? [-long / 4, long / 4] : [0];
  const others = layout.objects.filter((o) => o.id !== counter.id).map(footprint);
  const fits = (position: Point) =>
    position.x - STAFF_RADIUS >= 0 &&
    position.y - STAFF_RADIUS >= 0 &&
    position.x + STAFF_RADIUS <= layout.width &&
    position.y + STAFF_RADIUS <= layout.depth &&
    !others.some((rect) => squareHitsRect(position, STAFF_RADIUS, rect));

  return offsets.flatMap((along) => {
    for (const standoff of STAFF_STANDOFFS) {
      const distance = short / 2 + standoff;
      const position = {
        x: center.x + axis.x * along + back.x * distance,
        y: center.y + axis.y * along + back.y * distance,
      };
      if (fits(position)) return [{ counterId: counter.id, position, facing: { x: -back.x || 0, y: -back.y || 0 } }];
    }
    return [];
  });
}

export function staffSpots(layout: StoreLayout): StaffSpot[] {
  return layout.objects.flatMap((o) => (o.type === "counter" ? spotsForCounter(o, layout) : []));
}

/** จอ POS อยู่ห่างปลายด้าน +x (แกนยาวในพิกัดท้องถิ่นของเคาน์เตอร์) เท่านี้ — ใช้ร่วมกับ createCounter ใน three-view */
export function posInset(long: Meters): Meters {
  return Math.min(0.35, long * 0.2);
}

/** จุดจ่ายเงินของเคาน์เตอร์หนึ่งตัว: ลูกค้ายืนหน้าจอ POS, พนักงานยืนหลังจอ POS */
export interface PaySpot {
  counterId: string;
  /** กลางตัวลูกค้าหน้าจอ POS (ฝั่งห้อง) */
  customer: Point;
  /** กลางตัวพนักงานหลังจอ POS — null เมื่อไม่มีที่ยืน (ชนผนัง/วัตถุ) */
  staff: Point | null;
  /** ตำแหน่งจอ POS บนท็อปเคาน์เตอร์ — ลูกค้าและพนักงานหันหน้าเข้าหาจุดนี้ตอนจ่าย/รับเงิน */
  pos: Point;
}

/**
 * ตำแหน่งจอ POS บนผัง — ตรงกับ createCounter: ก่อนหมุน ด้านยาวแกน x (ถ้า depth > width หมุน 90° จึงชี้ −y),
 * จอห่างปลาย +x ตาม posInset, ฝั่งลูกค้า +z (ใต้) แล้วหมุนตาม `rotation` ของเคาน์เตอร์
 */
function paySpotForCounter(counter: Counter, layout: StoreLayout): PaySpot {
  const alongX = counter.width >= counter.depth;
  const long = Math.max(counter.width, counter.depth);
  const short = Math.min(counter.width, counter.depth);
  const axis = rotatePoint(alongX ? { x: 1, y: 0 } : { x: 0, y: -1 }, ORIGIN, counter.rotation);
  const front = rotatePoint(alongX ? { x: 0, y: 1 } : { x: 1, y: 0 }, ORIGIN, counter.rotation);
  const center = objectCenter(counter);
  const along = long / 2 - posInset(long);
  const at = (side: number, standoff: Meters) => ({
    x: center.x + axis.x * along + front.x * side * (short / 2 + standoff),
    y: center.y + axis.y * along + front.y * side * (short / 2 + standoff),
  });
  const others = layout.objects.filter((o) => o.id !== counter.id).map(footprint);
  const fits = (position: Point) =>
    position.x - STAFF_RADIUS >= 0 && position.y - STAFF_RADIUS >= 0 &&
    position.x + STAFF_RADIUS <= layout.width && position.y + STAFF_RADIUS <= layout.depth &&
    !others.some((rect) => squareHitsRect(position, STAFF_RADIUS, rect));
  const staff = STAFF_STANDOFFS.map((standoff) => at(-1, standoff)).find(fits) ?? null;
  const pos = { x: center.x + axis.x * along, y: center.y + axis.y * along };
  return { counterId: counter.id, customer: at(1, STAFF_STANDOFFS[0]!), staff, pos };
}

export function paySpots(layout: StoreLayout): PaySpot[] {
  return layout.objects.flatMap((o) => (o.type === "counter" ? [paySpotForCounter(o, layout)] : []));
}

/**
 * จอ POS ที่ใช้รับเงินจริง (ตัวแรกที่มีจุดยืนฝั่งพนักงาน) — engine ให้ลูกค้าต่อคิวจ่ายที่จอนี้
 * และภาพพนักงานเดินไปหลังจอนี้ ผังที่มีหลายเคาน์เตอร์จึงจ่าย/รับเงินที่จอเดียวกันเสมอ
 */
export function cashierSpot(layout: StoreLayout): PaySpot | null {
  return paySpots(layout).find((spot) => spot.staff !== null) ?? null;
}
