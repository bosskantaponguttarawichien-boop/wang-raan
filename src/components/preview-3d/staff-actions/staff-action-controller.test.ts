import { describe, expect, it } from "vitest";
import type { StaffPresentation } from "@/core/simulation/presentation-contract";
import type { StaffMarkerTable } from "./contracts";
import {
  STANDING_SPEED_EPSILON,
  markerTime,
  phaseProgress,
  resolveClipName,
  resolveStaffAction,
  wipeReach,
} from "./staff-action-controller";

/** The marker table published inside cafe-staff.glb (feat-109/111). */
const MARKERS: StaffMarkerTable = {
  CarryIdle: [{ name: "hand-contact", time: 0 }],
  CarryWalk: [{ name: "hand-contact", time: 0 }],
  PickUp: [{ name: "hand-contact", time: 0.4 }, { name: "food-contact", time: 0.58 }],
  PutDown: [{ name: "hand-contact", time: 0.26 }, { name: "food-contact", time: 0.62 }],
  WipeTable: [{ name: "hand-contact", time: 0.12 }, { name: "wipe-contact", time: 0.3 }, { name: "clear-complete", time: 0.82 }],
};

function staffMember(overrides: Partial<StaffPresentation> = {}): StaffPresentation {
  return {
    staffId: 1, taskId: "task-1", taskKind: "deliver", tableId: "table-1", serviceCycleId: "cycle-1",
    activity: "counter", walkMetersPerSecond: 1.2, carryMealIds: [], servicePoint: null,
    phaseStartedAtSeconds: 100, phaseEndsAtSeconds: 110, ...overrides,
  };
}

function decide(staff: StaffPresentation, simTimeSeconds: number, overrides: { groundSpeed?: number; reducedMotion?: boolean } = {}) {
  return resolveStaffAction({
    staff, simTimeSeconds, markers: MARKERS,
    groundSpeed: overrides.groundSpeed ?? 0,
    reducedMotion: overrides.reducedMotion ?? false,
    walkCycleDistance: 0.9, walkClipDuration: 0.95,
  });
}

describe("staff phase progress", () => {
  it("maps the phase window onto 0..1 and clamps outside it", () => {
    const staff = staffMember({ phaseStartedAtSeconds: 20, phaseEndsAtSeconds: 24 });
    expect(phaseProgress(staff, 19)).toBe(0);
    expect(phaseProgress(staff, 22)).toBe(0.5);
    expect(phaseProgress(staff, 99)).toBe(1);
  });

  it("treats a zero-length window as finished only once time reaches it", () => {
    const staff = staffMember({ phaseStartedAtSeconds: 20, phaseEndsAtSeconds: 20 });
    expect(phaseProgress(staff, 19.9)).toBe(0);
    expect(phaseProgress(staff, 20)).toBe(1);
  });
});

describe("staff action priority", () => {
  it("stands at the counter and works at a table without a dedicated clip", () => {
    expect(decide(staffMember(), 100)).toMatchObject({ clip: "Work", tier: "base", loop: true, phase: null });
    expect(decide(staffMember({ activity: "taking-order" }), 100)).toMatchObject({ clip: "Work", tier: "task" });
  });

  it("walks empty-handed and carries when meals are on the tray", () => {
    expect(decide(staffMember({ activity: "walking" }), 100, { groundSpeed: 1.2 })).toMatchObject({ clip: "Walk", tier: "walk" });
    const carrying = decide(staffMember({ activity: "carrying", carryMealIds: ["meal-1"] }), 100, { groundSpeed: 1.2 });
    expect(carrying).toMatchObject({ clip: "CarryWalk", tier: "carry" });
    expect(carrying.props).toMatchObject({ tray: true, trayMealIds: ["meal-1"] });
  });

  it("holds the tray still instead of cycling the legs when the rig is not moving", () => {
    const standing = decide(staffMember({ activity: "carrying", carryMealIds: ["meal-1"] }), 100, { groundSpeed: STANDING_SPEED_EPSILON });
    expect(standing).toMatchObject({ clip: "CarryIdle", tier: "carry", timeScale: 1 });
    expect(decide(staffMember({ activity: "walking" }), 100, { groundSpeed: 0 }).clip).toBe("Work");
  });

  it("scales the walk cycle to the drawn speed so the feet do not slide", () => {
    // 0.9 m per 0.95 s cycle ⇒ 0.947 m/s at timeScale 1.
    const fast = decide(staffMember({ activity: "walking" }), 100, { groundSpeed: 1.2 });
    expect(fast.timeScale).toBeCloseTo((1.2 * 0.95) / 0.9, 6);
    const slow = decide(staffMember({ activity: "walking" }), 100, { groundSpeed: 0.6 });
    expect(slow.timeScale).toBeCloseTo((0.6 * 0.95) / 0.9, 6);
  });

  it("task interaction outranks carrying: put-down wins while meals are still held", () => {
    const staff = staffMember({ activity: "put-down", carryMealIds: ["meal-1"] });
    expect(decide(staff, 100, { groundSpeed: 1.2 })).toMatchObject({ clip: "PutDown", tier: "task" });
  });
});

describe("pick up and put down follow the clip markers", () => {
  it("keeps the hands empty until the kitchen tray reaches food-contact", () => {
    const staff = staffMember({ activity: "pickup", carryMealIds: ["meal-1"] });
    expect(decide(staff, 105).props.tray).toBe(false);
    const after = decide(staff, 100 + 10 * 0.6);
    expect(after.phase).toBeCloseTo(0.6, 6);
    expect(after.props).toMatchObject({ tray: true, trayMealIds: ["meal-1"] });
  });

  it("releases the dish exactly at food-contact and stops carrying it", () => {
    const staff = staffMember({ activity: "put-down", carryMealIds: ["meal-1"] });
    const reaching = decide(staff, 100 + 10 * 0.3);
    expect(reaching.props).toMatchObject({ plateInHand: true, dishReleased: false, trayMealIds: ["meal-1"] });
    const placed = decide(staff, 100 + 10 * 0.62);
    expect(placed.props).toMatchObject({ plateInHand: false, dishReleased: true, trayMealIds: [] });
    // The left hand still supports the tray, so it does not tip while the right hand returns.
    expect(placed.props.tray).toBe(true);
  });

  it("never reports a dish as placed before the clip reaches the table", () => {
    const staff = staffMember({ activity: "put-down", carryMealIds: ["meal-1"] });
    for (const t of [0, 0.1, 0.25, 0.26, 0.4, 0.61]) {
      expect(decide(staff, 100 + 10 * t).props.dishReleased, `phase ${t}`).toBe(false);
    }
  });
});

describe("wiping a table", () => {
  const clean = (activity: StaffPresentation["activity"]) =>
    staffMember({ activity, taskKind: "clean", carryMealIds: [], phaseStartedAtSeconds: 0, phaseEndsAtSeconds: 10 });

  it("collects the dirty plate during the clearing phase without fading the stain", () => {
    const start = decide(clean("clearing"), 0);
    expect(start).toMatchObject({ clip: "WipeTable", tier: "task" });
    expect(start.props).toMatchObject({ cloth: true, collectedPlate: false, wipeProgress: 0 });
    const end = decide(clean("clearing"), 10);
    expect(end.phase).toBeCloseTo(0.3, 6);
    expect(end.props).toMatchObject({ collectedPlate: true, wipeProgress: 0 });
  });

  it("fades the stain only across wipe-contact..clear-complete", () => {
    expect(decide(clean("wiping"), 0).props.wipeProgress).toBe(0);
    expect(decide(clean("wiping"), 5).props.wipeProgress).toBeCloseTo(0.5, 6);
    const finished = decide(clean("wiping"), 10);
    expect(finished.phase).toBeCloseTo(0.82, 6);
    expect(finished.props.wipeProgress).toBeCloseTo(1, 6);
  });

  it("stands back up after the wipe without re-running the stroke", () => {
    const after = decide(clean("walking"), 10);
    expect(after.clip).toBe("Work");
    expect(after.props.wipeProgress).toBe(0);
  });
});

describe("reduced motion", () => {
  it("freezes looping clips and keeps semantic stops for one-shots", () => {
    const options = { reducedMotion: true, groundSpeed: 1.2 };
    expect(decide(staffMember({ activity: "walking" }), 100, options)).toMatchObject({ clip: "Walk", phase: 0, timeScale: 0 });
    const reaching = decide(staffMember({ activity: "put-down", carryMealIds: ["meal-1"] }), 103, options);
    expect(reaching.phase).toBe(0.26);
    expect(reaching.props.dishReleased).toBe(false);
    const placed = decide(staffMember({ activity: "put-down", carryMealIds: ["meal-1"] }), 107, options);
    expect(placed.phase).toBe(1);
    expect(placed.props.dishReleased).toBe(true);
  });

  it("still clears the stain at the end of the wipe phase", () => {
    const wiping = staffMember({ activity: "wiping", taskKind: "clean", phaseStartedAtSeconds: 0, phaseEndsAtSeconds: 10 });
    const frozen = decide(wiping, 10, { reducedMotion: true });
    expect(frozen.timeScale).toBe(0);
    expect(frozen.phase).toBe(0.3);
    expect(frozen.props.wipeProgress).toBe(0);
  });
});

describe("asset fallback", () => {
  const legacy = ["Idle", "Walk", "Sit", "Work"];
  it.each([
    ["CarryIdle", "Idle"],
    ["CarryWalk", "Walk"],
    ["PickUp", "Work"],
    ["PutDown", "Work"],
    ["WipeTable", "Work"],
  ] as const)("substitutes %s with %s on a pre-feat-109 asset", (requested, expected) => {
    expect(resolveClipName(requested, legacy)).toBe(expected);
  });

  it("prefers the real clip when the asset has it and degrades to anything usable", () => {
    expect(resolveClipName("WipeTable", [...legacy, "WipeTable"])).toBe("WipeTable");
    expect(resolveClipName("WipeTable", ["Idle"])).toBe("Idle");
    expect(resolveClipName("WipeTable", [])).toBeNull();
  });

  it("falls back to the published marker times when the asset carries none", () => {
    expect(markerTime({}, "PutDown", "food-contact", 0.62)).toBe(0.62);
    expect(markerTime({ PutDown: [{ name: "food-contact", time: 4 }] }, "PutDown", "food-contact", 0.62)).toBe(1);
  });
});

describe("wipe reach", () => {
  it("accepts a service point inside the sweep and flags one that is too far", () => {
    expect(wipeReach({ x: 1, y: 1 }, { x: 1, y: 1.3 }, 0.44)).toEqual({ point: { x: 1, y: 1 }, outOfReach: false });
    expect(wipeReach({ x: 1, y: 1 }, { x: 1, y: 1.9 }, 0.44)).toEqual({ point: { x: 1, y: 1 }, outOfReach: true });
  });

  it("reports nothing to wipe when the task offers no service point", () => {
    expect(wipeReach(null, { x: 1, y: 1 }, 0.44)).toEqual({ point: null, outOfReach: false });
  });
});
