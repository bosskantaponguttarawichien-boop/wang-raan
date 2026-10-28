import { describe, expect, it } from "vitest";
import { addTableSet, createCounter, createEmptyLayout, createEntrance, createKitchenDoor, createSequentialIds, type StoreLayout } from "@/core/layout";
import { cafeLayout } from "@/test/fixtures/layouts";
import { GOOD_NO_SEAT_RATE, GOOD_TOO_LONG_RATE, analyzeDay, simulateDay, type DayInput } from "./index";

/** 10:00–20:00 คนเยอะ 11:30–13:00 */
function day(input: Partial<DayInput> = {}): DayInput {
  return {
    openMinute: 600,
    closeMinute: 1200,
    dailyCustomers: 120,
    peakStartMinute: 690,
    peakEndMinute: 780,
    frontStaff: 2,
    cooks: 1,
    cookMinutesPerDish: 5,
    dineMinutes: [15, 25],
    patienceMinutes: 15,
    ...input,
  };
}

/** ร้าน 16×12 ม. โต๊ะ 4 ที่ 12 ชุด = 48 ที่นั่ง */
function bigLayout(): StoreLayout {
  const ids = createSequentialIds();
  let layout = createEmptyLayout({ width: 16, depth: 12 }, ids);
  layout = {
    ...layout,
    entrance: createEntrance(layout, { wall: "south", position: 1.25 }, ids),
    kitchenDoor: createKitchenDoor(layout, { wall: "north", position: 1 }, ids),
    objects: [createCounter({ position: { x: 11, y: 0.5 } }, ids)],
  };
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) layout = addTableSet(layout, "table-4-seats", { x: 2 + col * 3.25, y: 3 + row * 2.75 }, ids).layout;
  }
  return layout;
}

describe("วิเคราะห์ร้านทั้งวัน (feat-094)", () => {
  it("simulateDay: ลูกค้าทั้งวันใกล้ค่าที่ตั้ง และทุกคนออกจากร้านหลังปิด", () => {
    const { outcome, seats } = simulateDay(cafeLayout(), day({ cooks: 2 }));
    expect(seats).toBe(6);
    expect(outcome.arrived).toBeGreaterThan(90);
    expect(outcome.arrived).toBeLessThan(150);
    expect(outcome.fed + outcome.noSeat + outcome.abandoned).toBeCloseTo(outcome.arrived, 6);
    expect(outcome.unfinished).toBe(0);
  });

  it("ลูกค้าเยอะ → ต้องใช้พ่อครัวมากกว่าลูกค้าน้อย และจำนวนที่แนะนำผ่านเกณฑ์ ส่วนน้อยกว่า 1 คนไม่ผ่าน", { timeout: 30_000 }, () => {
    const small = analyzeDay(bigLayout(), day({ dailyCustomers: 80 }));
    const large = analyzeDay(bigLayout(), day({ dailyCustomers: 400 }));
    expect(small.staffing.recommended).not.toBeNull();
    expect(large.staffing.recommended).not.toBeNull();
    expect(large.staffing.recommended!.cooks).toBeGreaterThan(small.staffing.recommended!.cooks);
    expect(large.staffing.recommended!.frontStaff).toBeGreaterThanOrEqual(small.staffing.recommended!.frontStaff);

    const rec = large.staffing.recommended!;
    const at = (cooks: number) => large.staffing.cookOptions.find((o) => o.cooks === cooks)!;
    expect(at(rec.cooks).good).toBe(true);
    expect(at(rec.cooks).outcome.tooLongRate).toBeLessThanOrEqual(GOOD_TOO_LONG_RATE);
    expect(at(rec.cooks - 1).good).toBe(false);
    expect(at(rec.cooks - 1).outcome.avgFoodWaitMinutes).toBeGreaterThan(at(rec.cooks).outcome.avgFoodWaitMinutes);
  });

  it("อาหารต้องออกภายใน: พ่อครัวมากขึ้นทำจานช้าลงได้; ผ่านเกณฑ์ที่ค่านั้นแต่ไม่ผ่านที่ช้ากว่าอีกครึ่งนาที", { timeout: 30_000 }, () => {
    const one = analyzeDay(cafeLayout(), day({ cooks: 1 }));
    const two = analyzeDay(cafeLayout(), day({ cooks: 2 }));
    const limit = one.cookTime.maxMinutesPerDish!;
    expect(limit).toBeGreaterThan(1);
    expect(two.cookTime.maxMinutesPerDish!).toBeGreaterThan(limit);
    const rate = (minutes: number) => simulateDay(cafeLayout(), day({ cooks: 1, cookMinutesPerDish: minutes })).outcome.tooLongRate;
    expect(rate(limit)).toBeLessThanOrEqual(GOOD_TOO_LONG_RATE);
    expect(rate(limit + 0.5)).toBeGreaterThan(GOOD_TOO_LONG_RATE);
  });

  it("พนักงานไม่พอจนเร็วแค่ไหนก็รอเกิน → อาหารต้องออกภายใน = null", { timeout: 30_000 }, () => {
    const analysis = analyzeDay(bigLayout(), day({ dailyCustomers: 400, frontStaff: 1, cooks: 1 }));
    expect(analysis.currentGood).toBe(false);
    expect(analysis.cookTime.maxMinutesPerDish).toBeNull();
  });

  it("ที่นั่ง: คิวสั้นยังรองรับไหว แต่ร้านเล็กหรือกลุ่มเยอะเกินจำนวนโต๊ะต้องรายงานไม่พอ", { timeout: 30_000 }, () => {
    const cramped = analyzeDay(cafeLayout(), day({ dailyCustomers: 200 }));
    expect(cramped.seating.enough).toBe(false);
    expect(cramped.seating.maxEntranceQueue).toBeGreaterThan(20);
    expect(cramped.seating.capacityPerHour).toBeLessThan(cramped.seating.busiestCustomersPerHour);
    const roomy = analyzeDay(bigLayout(), day({ dailyCustomers: 200 }));
    expect(roomy.seating.basedOn).toBe("recommended");
    expect(roomy.seating.enough).toBe(true);
    expect(roomy.seating.maxEntranceQueue).toBeGreaterThan(0);
    expect(roomy.seating.maxEntranceQueue).toBeLessThanOrEqual(roomy.seats * GOOD_NO_SEAT_RATE);
    expect(roomy.seating.noSeat).toBe(0);
    // 48 เก้าอี้ไม่ได้แปลว่ารับได้ 48 กลุ่ม: ห้ามแชร์โต๊ะ จึงทดสอบภาระที่ล้น 12 โต๊ะด้วย
    const overloaded = analyzeDay(bigLayout(), day({ dailyCustomers: 300 }));
    expect(overloaded.seating.basedOn).toBe("recommended");
    expect(overloaded.seating.enough).toBe(false);
    expect(overloaded.seating.maxEntranceQueue).toBeGreaterThan(overloaded.seats * GOOD_NO_SEAT_RATE);
    expect(overloaded.seating.noSeat).toBeGreaterThan(0);
  });

  it("วิเคราะห์ซ้ำได้ผลเดิม", { timeout: 30_000 }, () => {
    expect(analyzeDay(cafeLayout(), day())).toEqual(analyzeDay(cafeLayout(), day()));
  });
});
