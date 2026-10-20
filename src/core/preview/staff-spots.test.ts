import { describe, expect, it } from "vitest";
import { createSampleCafeLayout } from "../layout/sample-layout";
import type { Counter, LayoutObject, StoreLayout } from "../layout/types";
import { STAFF_STANDOFFS, staffSpots } from "./staff-spots";

const STAFF_STANDOFF = STAFF_STANDOFFS[0]!;

const room = (objects: LayoutObject[]): StoreLayout => ({
  id: "room",
  version: 1,
  units: "m",
  width: 8,
  depth: 6,
  entrance: null,
  kitchenDoor: null,
  objects,
});

const counter = (patch: Partial<Counter> = {}): Counter => ({
  id: "c1",
  type: "counter",
  x: 3,
  y: 2,
  width: 2,
  depth: 0.7,
  rotation: 0,
  ...patch,
});

describe("Staff spots (พนักงานหลังเคาน์เตอร์)", () => {
  it("ยืนฝั่งเหนือของเคาน์เตอร์ rotation 0 หันหน้าลงใต้เข้าหาเคาน์เตอร์", () => {
    const [spot, ...rest] = staffSpots(room([counter()]));
    expect(rest).toHaveLength(0);
    expect(spot!.position.x).toBeCloseTo(4);
    expect(spot!.position.y).toBeCloseTo(2 - STAFF_STANDOFF);
    expect(spot!.facing).toEqual({ x: 0, y: 1 });
  });

  it("หมุนตามเคาน์เตอร์: 90° ฝั่งพนักงานไปทางตะวันออก, 180° ไปทางใต้", () => {
    // rotation 90: footprint 0.7 × 2 ที่ (3, 2) → กลาง (3.35, 3)
    const [east] = staffSpots(room([counter({ rotation: 90 })]));
    expect(east!.position.x).toBeCloseTo(3.35 + 0.35 + STAFF_STANDOFF);
    expect(east!.position.y).toBeCloseTo(3);
    expect(east!.facing.x).toBeCloseTo(-1);
    const [south] = staffSpots(room([counter({ rotation: 180 })]));
    expect(south!.position.y).toBeCloseTo(2.7 + STAFF_STANDOFF);
    expect(south!.facing.y).toBeCloseTo(-1);
  });

  it("เคาน์เตอร์วางตามแนวลึก (depth > width) ฝั่งพนักงานคือตะวันตก", () => {
    const [spot] = staffSpots(room([counter({ width: 0.7, depth: 2 })]));
    expect(spot!.position.x).toBeCloseTo(3 - STAFF_STANDOFF);
    expect(spot!.position.y).toBeCloseTo(3);
    expect(spot!.facing.x).toBeCloseTo(1);
  });

  it("เคาน์เตอร์ยาวมีพนักงาน 2 คนกระจายตามแนวยาว", () => {
    const spots = staffSpots(room([counter({ width: 3 })]));
    expect(spots.map((s) => s.position.x)).toEqual([3.75, 5.25]);
  });

  it("ที่หลังเคาน์เตอร์แคบ ขยับเข้าใกล้เคาน์เตอร์แทน", () => {
    // ขอบเคาน์เตอร์ห่างผนัง 0.5 ม. → กลางตัวห่างขอบได้ไม่เกิน 0.35 ม.
    const [spot] = staffSpots(room([counter({ y: 0.5 })]));
    expect(spot!.position.y).toBeCloseTo(0.15);
  });

  it("ข้ามจุดที่ชิดผนังจนยืนไม่ได้ หรือทับวัตถุอื่น", () => {
    expect(staffSpots(room([counter({ y: 0.1 })]))).toHaveLength(0);
    const blocker: LayoutObject = { id: "t", type: "table", x: 3.5, y: 1.25, width: 0.8, depth: 0.75, rotation: 0, chairIds: [] };
    expect(staffSpots(room([counter(), blocker]))).toHaveLength(0);
  });

  it("ผังตัวอย่างมีพนักงานยืนหลังเคาน์เตอร์", () => {
    const layout = createSampleCafeLayout();
    const counters = layout.objects.filter((o) => o.type === "counter");
    expect(counters.length).toBeGreaterThan(0);
    expect(staffSpots(layout).length).toBeGreaterThan(0);
  });
});
