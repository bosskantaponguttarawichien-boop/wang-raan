import { describe, expect, it } from "vitest";
import { createTableSet } from "@/core/layout";
import type { Chair, StoreLayout, Table } from "@/core/layout/types";
import { CHAIR_PULL, GRIP_TRAVEL } from "../seat-motion";
import { CHAIR_BACK_CLEARANCE, chairAxes, chairFacing, chairPullSpace, chairSlideSeconds, offsetAlongOutward } from "./seating-geometry";

function emptyLayout(width = 10, depth = 10): StoreLayout {
  return {
    id: "layout-1", version: 1, units: "m", width, depth,
    entrance: null, kitchenDoor: null, objects: [],
  };
}

function chairAt(overrides: Partial<Chair> = {}): Chair {
  return {
    id: "chair-1", type: "chair", x: 4, y: 5, width: 0.5, depth: 0.5, rotation: 0,
    tableId: "table-1", ...overrides,
  } as Chair;
}

function tableAt(overrides: Partial<Table> = {}): Table {
  return {
    id: "table-1", type: "table", x: 3.5, y: 3.5, width: 1.2, depth: 1.2, rotation: 0,
    chairIds: ["chair-1"], ...overrides,
  } as Table;
}

describe("chair axes", () => {
  it.each([
    [0, { x: 0, y: -1 }],
    [90, { x: 1, y: 0 }],
    [180, { x: 0, y: 1 }],
    [270, { x: -1, y: 0 }],
  ] as const)("faces the table at rotation %i", (rotation, facing) => {
    expect(chairFacing(rotation)).toEqual(facing);
    const axes = chairAxes(chairAt({ rotation }), tableAt());
    expect(axes.facing).toEqual(facing);
    expect(axes.outward).toEqual({ x: 0 - facing.x || 0, y: 0 - facing.y || 0 });
    expect(Object.is(axes.outward.x, -0)).toBe(false);
    expect(Object.is(axes.outward.y, -0)).toBe(false);
  });

  it("measures the chair depth along the axis it actually travels", () => {
    expect(chairAxes(chairAt({ width: 0.5, depth: 0.45, rotation: 0 }), tableAt()).depthAlongOutward).toBe(0.45);
    expect(chairAxes(chairAt({ width: 0.5, depth: 0.45, rotation: 90 }), tableAt()).depthAlongOutward).toBe(0.45);
  });

  it("offsets a point along the outward axis without touching the chair record", () => {
    const chair = chairAt({ rotation: 0 });
    const axes = chairAxes(chair, tableAt());
    expect(offsetAlongOutward(axes, 0.3)).toEqual({ x: 4.25, y: 5.55 });
    expect(chair.x).toBe(4);
    expect(chair.y).toBe(5);
  });
});

describe("pull space", () => {
  it("gives the full pull when the floor behind the chair is clear", () => {
    const layout = emptyLayout();
    const space = chairPullSpace(layout, chairAt(), tableAt());
    expect(space.effectivePull).toBe(CHAIR_PULL);
    expect(space).toMatchObject({ usesChairClips: true, blockedBy: null });
  });

  it.each([0, 90, 180, 270] as const)("reaches the same conclusion from rotation %i", rotation => {
    const layout = emptyLayout();
    expect(chairPullSpace(layout, chairAt({ rotation }), tableAt()).effectivePull).toBe(CHAIR_PULL);
  });

  it("stops short of the room wall", () => {
    // Chair back edge at y = 5.5 and the wall at y = 5.7 leaves 0.2 m minus clearance.
    const layout = emptyLayout(10, 5.7);
    const space = chairPullSpace(layout, chairAt({ rotation: 0 }), tableAt());
    expect(space.available).toBeCloseTo(0.2 - CHAIR_BACK_CLEARANCE, 4);
    expect(space.effectivePull).toBeCloseTo(GRIP_TRAVEL, 4);
    expect(space).toMatchObject({ usesChairClips: false, blockedBy: "wall" });
  });

  it("stops short of another object behind the chair and names it", () => {
    const layout = emptyLayout();
    layout.objects.push({
      id: "counter-1", type: "counter", x: 3.6, y: 5.7, width: 2.4, depth: 0.7, rotation: 0,
    } as never);
    const space = chairPullSpace(layout, chairAt({ rotation: 0 }), tableAt());
    expect(space.available).toBeCloseTo(0.2 - CHAIR_BACK_CLEARANCE, 4);
    expect(space.blockedBy).toBe("counter-1");
  });

  it("ignores objects beside the chair and the chair's own table", () => {
    const layout = emptyLayout();
    layout.objects.push(tableAt() as never, {
      id: "chair-2", type: "chair", x: 4.8, y: 5, width: 0.5, depth: 0.5, rotation: 0, tableId: "table-1",
    } as never);
    const space = chairPullSpace(layout, chairAt(), tableAt());
    expect(space.effectivePull).toBe(CHAIR_PULL);
    expect(space.blockedBy).toBeNull();
  });

  it("never reports a pull below the grip travel the clip authored", () => {
    const layout = emptyLayout(10, 5.5);
    const space = chairPullSpace(layout, chairAt({ rotation: 0 }), tableAt());
    expect(space.available).toBe(0);
    expect(space.effectivePull).toBe(GRIP_TRAVEL);
    expect(space.usesChairClips).toBe(false);
  });

  it("handles every chair of a real 4-seat table set", () => {
    const layout = emptyLayout();
    let counter = 0;
    const set = createTableSet("table-4-seats", { x: 4, y: 4 }, kind => `${kind}-${(counter += 1)}`);
    const withSet: StoreLayout = { ...layout, objects: [set.table, ...set.chairs] };
    const chairObjects = set.chairs;
    const table = set.table;
    expect(chairObjects).toHaveLength(4);
    for (const chair of chairObjects) {
      const space = chairPullSpace(withSet, chair, table);
      expect(space.effectivePull, `chair ${chair.rotation}`).toBe(CHAIR_PULL);
      expect(space.usesChairClips).toBe(true);
    }
  });
});

describe("slide timing", () => {
  it("keeps the chair speed constant whatever the distance", () => {
    expect(chairSlideSeconds(CHAIR_PULL)).toBeCloseTo(0.45, 6);
    expect(chairSlideSeconds(CHAIR_PULL / 2)).toBeCloseTo(0.225, 6);
    expect(chairSlideSeconds(0)).toBe(0);
    expect(chairSlideSeconds(Number.NaN)).toBe(0);
  });
});
