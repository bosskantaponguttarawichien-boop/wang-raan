/**
 * จุดยืนของพนักงานหลังเคาน์เตอร์ (เพื่อแสดงในมุมมอง 3D เท่านั้น) — Pure TypeScript
 *
 * ฝั่งพนักงานของเคาน์เตอร์ (ตรงกับ createCounter ใน three-view):
 * - ก่อนหมุน ถ้า width ≥ depth ด้านยาวอยู่แนว x ฝั่งพนักงานคือเหนือ (−y); ถ้า depth > width ฝั่งพนักงานคือตะวันตก (−x)
 * - แล้วหมุนตามเข็มตาม `rotation` ของเคาน์เตอร์
 * พนักงานหันหน้าเข้าหาเคาน์เตอร์ ยืนห่างขอบได้ไกลสุด STAFF_STANDOFFS[0] ถ้ามีที่ (mannequin สูง ~0.94 ม. เตี้ยกว่าท็อป
 * เคาน์เตอร์ 1.05 ม. — ยืนชิดไปกล้องมุมสูงจะเห็นแค่หมวก) ไม่พอก็ขยับเข้าใกล้ ใกล้สุดแล้วยังชนผนัง/วัตถุอื่นก็ไม่วาง
 * ไม่กระทบ validation และ simulation (ลูกค้ายังเดินตาม flow field เดิม)
 */
import { footprint, objectCenter, rotatePoint } from "../layout/geometry";
import type { Counter, Meters, Point, Rect, StoreLayout } from "../layout/types";

/** ระยะจากขอบเคาน์เตอร์ถึงกลางตัวพนักงาน ไล่จากที่อยากได้ไปถึงชิดที่สุด */
export const STAFF_STANDOFFS: readonly Meters[] = [0.45, 0.4, 0.35, 0.3, 0.25];
/** รัศมีพื้นที่ยืนของพนักงาน (mannequin สูง ~0.94 ม. กว้างราว 0.3 ม.) */
export const STAFF_RADIUS: Meters = 0.15;
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
