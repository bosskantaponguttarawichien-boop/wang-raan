import { describe, expect, it } from "vitest";
import { STAFF_STATE_CODE } from "@/core/simulation";
import type {
  CustomerPresentation, MealPresentation, PresentationSnapshot, StaffPresentation, TablePresentation,
} from "@/core/simulation/presentation-contract";
import { DeliveryHold, PUT_DOWN_SECONDS } from "./delivery-hold";

const TABLE_POINT = { x: 4, y: 3 };
const SERVING = STAFF_STATE_CODE.serving;
const WALKING = STAFF_STATE_CODE.walking;

function staffOf(overrides: Partial<StaffPresentation>): StaffPresentation {
  return {
    staffId: 0, taskId: "task:1", taskKind: "deliver", tableId: "table-1", serviceCycleId: "cycle-1",
    activity: "carrying", walkMetersPerSecond: 1.2, carryMealIds: ["meal-1"], servicePoint: null,
    phaseStartedAtSeconds: 100, phaseEndsAtSeconds: 105, ...overrides,
  };
}

function snapshotOf(simTimeSeconds: number, staff: StaffPresentation, placedAtSeconds: number | null): PresentationSnapshot {
  const meal = {
    mealId: "meal-1", ownerRenderAgentId: 10, tableId: "table-1", chairId: "chair-1", serviceCycleId: "cycle-1",
    foodKind: "fried-rice", anchor: { x: 0, y: 0 }, progress: "full", consumed: 0, placedAtSeconds,
  } as MealPresentation;
  const table = {
    tableId: "table-1", serviceCycleId: "cycle-1", availability: "occupied", surface: placedAtSeconds === null ? "empty" : "served",
    mealIds: placedAtSeconds === null ? [] : ["meal-1"], stainAmount: 0, wipeProgress: 0, cleanCompletedAtSeconds: null,
  } as TablePresentation;
  const customer = {
    renderAgentId: 10, partyId: 1, memberIndex: 0, tableId: "table-1", chairId: "chair-1", serviceCycleId: "cycle-1",
    activity: placedAtSeconds === null ? "waiting-food" : "eating", seatingPhase: "seated", walkMetersPerSecond: 1.2, mealId: "meal-1",
  } as CustomerPresentation;
  return {
    version: 1, runId: "run-1", layoutRevision: "rev-1", sequence: 1, simTimeSeconds,
    customers: [customer], meals: [meal], tables: [table], staff: [staff], milestones: [],
  };
}

const drawn = (x: number, y: number, code: number) => new Float32Array([0, x, y, code]);

describe("DeliveryHold — จานไปพร้อมภาพพนักงาน", () => {
  it("การจำลองวางจานไปแล้วแต่ภาพยังเดินถือถาด → เห็นถาด จานยังไม่อยู่บนโต๊ะ ลูกค้ายังรอ", () => {
    const hold = new DeliveryHold();
    hold.apply(snapshotOf(100, staffOf({}), null), drawn(1, 1, SERVING), 0, 30);
    // การจำลองวางจานเสร็จแล้ว พนักงานเดินกลับ ขณะที่ภาพยังเดินถือถาดกลางทาง
    hold.apply(snapshotOf(103, staffOf({ activity: "put-down", carryMealIds: [], servicePoint: TABLE_POINT, phaseStartedAtSeconds: 102 }), null), drawn(2, 2, SERVING), 0.1, 30);
    expect(hold.newStops).toEqual([{ staffId: 0, point: TABLE_POINT }]);
    const shown = hold.apply(snapshotOf(110, staffOf({ activity: "walking", carryMealIds: [], phaseStartedAtSeconds: 107 }), 107), drawn(3, 2.5, SERVING), 0.2, 30);
    expect(shown.staff[0]).toMatchObject({ activity: "carrying", carryMealIds: ["meal-1"] });
    expect(shown.meals[0]!.placedAtSeconds).toBeNull();
    expect(shown.tables[0]!.mealIds).toEqual([]);
    expect(shown.customers[0]!.activity).toBe("waiting-food");
  });

  it("ภาพถึงโต๊ะ → เล่นท่าวางจาน แล้วจานปรากฏเมื่อมือปล่อยจาน", () => {
    const hold = new DeliveryHold();
    hold.apply(snapshotOf(100, staffOf({}), null), drawn(1, 1, SERVING), 0, 30);
    hold.apply(snapshotOf(103, staffOf({ activity: "put-down", carryMealIds: [], servicePoint: TABLE_POINT, phaseStartedAtSeconds: 102 }), null), drawn(2, 2, SERVING), 0.1, 30);
    const later = staffOf({ activity: "walking", carryMealIds: [], phaseStartedAtSeconds: 107 });
    const arriving = hold.apply(snapshotOf(120, later, 107), drawn(TABLE_POINT.x, TABLE_POINT.y, SERVING), 3, 30);
    expect(arriving.staff[0]).toMatchObject({ activity: "put-down", servicePoint: TABLE_POINT, phaseStartedAtSeconds: 120 });
    expect(arriving.staff[0]!.phaseEndsAtSeconds).toBeCloseTo(120 + PUT_DOWN_SECONDS * 30);
    expect(arriving.meals[0]!.placedAtSeconds).toBeNull();
    const released = hold.apply(snapshotOf(140, later, 107), drawn(TABLE_POINT.x, TABLE_POINT.y, SERVING), 3 + PUT_DOWN_SECONDS * 0.8, 30);
    expect(released.meals[0]!.placedAtSeconds).toBe(107);
    expect(released.staff[0]!.activity).toBe("put-down");
    const after = hold.apply(snapshotOf(160, later, 107), drawn(TABLE_POINT.x, TABLE_POINT.y, WALKING), 3 + PUT_DOWN_SECONDS + 0.01, 30);
    expect(after).toEqual(snapshotOf(160, later, 107));
  });

  it("ยังไม่ถึงช่วงถือถาดบนภาพ (เดินไปครัว) → ไม่โชว์ถาดก่อนรับอาหาร", () => {
    const hold = new DeliveryHold();
    const shown = hold.apply(snapshotOf(100, staffOf({}), null), drawn(1, 1, WALKING), 0, 30);
    expect(shown.staff[0]!.carryMealIds).toEqual([]);
  });

  it("ภาพถึงทันขณะการจำลองยังวางจาน (1×) → ปล่อยให้การจำลองเล่นเอง ไม่ซ้อนท่า", () => {
    const hold = new DeliveryHold();
    hold.apply(snapshotOf(100, staffOf({}), null), drawn(1, 1, SERVING), 0, 1);
    const putDown = staffOf({ activity: "put-down", carryMealIds: [], servicePoint: TABLE_POINT, phaseStartedAtSeconds: 102, phaseEndsAtSeconds: 107 });
    const live = snapshotOf(103, putDown, 107);
    expect(hold.apply(live, drawn(TABLE_POINT.x, TABLE_POINT.y, SERVING), 3, 1)).toEqual(live);
  });

  it("กันค้าง: ถือจานไว้ไม่เกิน 30 วินาทีจริงแม้ภาพไม่ถึง", () => {
    const hold = new DeliveryHold();
    hold.apply(snapshotOf(100, staffOf({}), null), drawn(1, 1, SERVING), 0, 30);
    const later = staffOf({ activity: "walking", carryMealIds: [], phaseStartedAtSeconds: 107 });
    expect(hold.apply(snapshotOf(900, later, 107), drawn(1, 1, SERVING), 31, 30).meals[0]!.placedAtSeconds).toBe(107);
  });
});
