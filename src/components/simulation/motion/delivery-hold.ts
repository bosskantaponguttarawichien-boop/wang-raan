import { STAFF_STATE_CODE } from "@/core/simulation";
import type { PresentationPoint, PresentationSnapshot, StaffPresentation } from "@/core/simulation/presentation-contract";

/**
 * เสิร์ฟอาหารตามภาพ ไม่ใช่ตามเวลาจำลอง (เวลาย่อแบบเกม feat-159)
 *
 * ที่ 30× การจำลองวางจานเสร็จในเสี้ยววินาที ขณะที่ภาพพนักงานยังเดินถือถาดจากครัวไม่ถึงโต๊ะ ผลคือจานโผล่บนโต๊ะ
 * ก่อนพนักงานมาถึง และพนักงานเดินมือเปล่า — DeliveryHold จำจานที่พนักงานแต่ละคนกำลังเสิร์ฟ แล้ว:
 * - ระหว่างภาพเดินถือถาด (รหัส serving) ให้เห็นถาดพร้อมจานนั้น
 * - ซ่อนจานจากโต๊ะ และลูกค้ายังรออาหาร จนภาพพนักงานไปถึงโต๊ะ
 * - ถึงโต๊ะแล้วเล่นท่าวางจาน PUT_DOWN_SECONDS วินาทีจริง จานปรากฏบนโต๊ะเมื่อมือปล่อยจาน
 * ตัวเลขผลจำลองไม่เปลี่ยน — แก้เฉพาะสิ่งที่วาด
 */

/** ท่าวางจานบนภาพยาวเท่านี้ (วินาทีจริง) */
export const PUT_DOWN_SECONDS = 1.2;
/** จานออกจากมือที่ช่วงนี้ของท่าวาง (ตรงกับ marker food-contact ค่าเริ่มต้นของ PutDown) */
const FOOD_CONTACT = 0.62;
/** ภาพพนักงานอยู่ใกล้จุดวางเท่านี้ (ม.) ถือว่าถึงแล้ว (ตรงกับ alignPresentation) */
const AT_SERVICE_POINT = 0.12;
/** กันค้าง: ถือจานไว้ไม่เกินเท่านี้ (วินาทีจริง) แม้ภาพยังไม่ถึง (เช่นงานถูกยกเลิกกลางทาง) */
const MAX_HOLD_SECONDS = 30;

interface Delivery {
  taskId: string;
  mealIds: readonly string[];
  /** จุดวางจาน — รู้เมื่อการจำลองถึงช่วงวางจาน (ช่วงถือถาดเป็นเส้นทาง ไม่มีจุดเดียว) */
  point: PresentationPoint | null;
  /** วินาทีจริงที่เริ่มจำ */
  since: number;
  /** วินาทีจริงที่ภาพถึงโต๊ะและเริ่มท่าวาง (null = ยังเดิน) */
  putDownAt: number | null;
}

export class DeliveryHold {
  private readonly deliveries = new Map<number, Delivery[]>();
  /** งานเสิร์ฟที่จำแล้ว — ไม่จำซ้ำหลังส่งเสร็จ ขณะการจำลองยังรายงานงานเดิมอยู่ */
  private readonly seen = new Set<string>();

  reset() {
    this.deliveries.clear();
    this.seen.clear();
  }

  /**
   * จุดวางจานที่เพิ่งรู้ในรอบนี้ — controller ใช้สั่งให้ภาพพนักงานหยุดที่จุดนั้นระหว่างท่าวาง
   * (คืนแต่ละจุดครั้งเดียว)
   */
  readonly newStops: { staffId: number; point: PresentationPoint }[] = [];

  /**
   * @param staff ตำแหน่งพนักงานที่วาดจริง (index, x, y, code)
   * @param now วินาทีจริง (monotonic)
   * @param rate วินาทีจำลองต่อวินาทีจริงตอนนี้
   */
  apply(snapshot: PresentationSnapshot, staff: Float32Array, now: number, rate: number): PresentationSnapshot {
    this.newStops.length = 0;
    this.capture(snapshot, now);
    const positions = new Map<number, { x: number; y: number; code: number }>();
    for (let offset = 0; offset < staff.length; offset += 4) positions.set(staff[offset]!, { x: staff[offset + 1]!, y: staff[offset + 2]!, code: staff[offset + 3]! });

    const held = new Set<string>();
    const overrides = new Map<number, Partial<StaffPresentation>>();
    const members = new Map(snapshot.staff.map(member => [member.staffId, member]));
    for (const [staffId, queue] of this.deliveries) {
      const position = positions.get(staffId);
      const member = members.get(staffId);
      while (queue.length > 0) {
        const delivery = queue[0]!;
        if (delivery.putDownAt === null && delivery.point && position &&
          Math.hypot(position.x - delivery.point.x, position.y - delivery.point.y) <= AT_SERVICE_POINT) {
          // ภาพถึงทันขณะการจำลองยังวางจานอยู่ (เช่นที่ 1×) — ให้การจำลองเล่นท่าวางเองตามเวลาจริงของมัน
          if (member?.taskId === delivery.taskId && member.activity === "put-down") { queue.shift(); continue; }
          delivery.putDownAt = now;
        }
        const finished = delivery.putDownAt !== null && now - delivery.putDownAt >= PUT_DOWN_SECONDS;
        if (finished || now - delivery.since > MAX_HOLD_SECONDS) { queue.shift(); continue; }
        break;
      }
      if (queue.length === 0) { this.deliveries.delete(staffId); continue; }
      for (const delivery of queue) {
        const released = delivery.putDownAt !== null && now - delivery.putDownAt >= PUT_DOWN_SECONDS * FOOD_CONTACT;
        if (!released) for (const mealId of delivery.mealIds) held.add(mealId);
      }
      const current = queue[0]!;
      if (current.putDownAt !== null && current.point) {
        // ท่าวางจานเดินตามเวลาจริง: แปลงเป็นช่วงเวลาจำลองที่ตัวเลือกท่าใช้คำนวณ progress
        const start = snapshot.simTimeSeconds - (now - current.putDownAt) * rate;
        overrides.set(staffId, {
          activity: "put-down", carryMealIds: current.mealIds, servicePoint: current.point,
          phaseStartedAtSeconds: start, phaseEndsAtSeconds: start + PUT_DOWN_SECONDS * Math.max(rate, 1e-6),
        });
      } else if (position?.code === STAFF_STATE_CODE.serving) {
        overrides.set(staffId, { activity: "carrying", carryMealIds: current.mealIds });
      } else {
        // ยังเดินไปครัว/อยู่ในครัว: alignPresentation จัดท่าเดินหรือรับอาหารเอง ห้ามโชว์ถาดก่อนรับ
        overrides.set(staffId, { carryMealIds: [] });
      }
    }
    if (overrides.size === 0 && held.size === 0) return snapshot;

    return {
      ...snapshot,
      staff: snapshot.staff.map(member => {
        const override = overrides.get(member.staffId);
        return override ? { ...member, ...override } : member;
      }),
      meals: snapshot.meals.map(meal => held.has(meal.mealId) ? { ...meal, placedAtSeconds: null } : meal),
      tables: snapshot.tables.map(table => table.mealIds.some(id => held.has(id))
        ? { ...table, mealIds: table.mealIds.filter(id => !held.has(id)) }
        : table),
      customers: snapshot.customers.map(customer => customer.mealId && held.has(customer.mealId) && customer.activity === "eating"
        ? { ...customer, activity: "waiting-food" }
        : customer),
    };
  }

  /** จำงานเสิร์ฟ: จานจากช่วงถือถาด และจุดวางจากช่วงวางจาน */
  private capture(snapshot: PresentationSnapshot, now: number) {
    for (const member of snapshot.staff) {
      const taskId = member.taskId;
      if (!taskId || member.taskKind !== "deliver") continue;
      const queue = this.deliveries.get(member.staffId) ?? [];
      let delivery = queue.find(entry => entry.taskId === taskId);
      if (!delivery && !this.seen.has(taskId)) {
        // ปกติเห็นช่วงถือถาดก่อน; ถ้า TICK ข้ามช่วงนั้นไป ใช้จานของรอบโต๊ะนี้ที่วางในช่วงวางจานนี้แทน
        const mealIds = member.activity === "carrying" ? member.carryMealIds
          : member.activity === "put-down" ? snapshot.meals.filter(meal => meal.serviceCycleId === member.serviceCycleId &&
            meal.placedAtSeconds !== null && meal.placedAtSeconds >= member.phaseStartedAtSeconds - 1e-6).map(meal => meal.mealId)
          : [];
        if (mealIds.length === 0) continue;
        this.seen.add(taskId);
        delivery = { taskId, mealIds: [...mealIds], point: null, since: now, putDownAt: null };
        queue.push(delivery);
        this.deliveries.set(member.staffId, queue);
      }
      if (delivery && !delivery.point && member.activity === "put-down" && member.servicePoint) {
        delivery.point = member.servicePoint;
        this.newStops.push({ staffId: member.staffId, point: member.servicePoint });
      }
    }
  }
}
