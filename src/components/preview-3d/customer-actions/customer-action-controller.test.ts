import { describe, expect, it } from "vitest";
import type { CustomerPresentation, MealPresentation, SeatingPhase } from "@/core/simulation/presentation-contract";
import type { CustomerMarkerTable, CustomerSeatPose } from "./contracts";
import {
  EAT_PLATE_FORWARD,
  EAT_TIP_REACH,
  canEat,
  eatPhaseOffset,
  nextSeatReachShift,
  plateReach,
  resolveClipName,
  resolveCustomerAction,
  seedFromRevision,
  utensilFor,
} from "./customer-action-controller";

/** The marker table published inside cafe-customer.glb (feat-110/112). */
const MARKERS: CustomerMarkerTable = {
  Eat: [{ name: "seated", time: 0 }, { name: "food-contact", time: 0.14 }, { name: "hand-contact", time: 0.45 }],
  PullChair: [{ name: "hand-contact", time: 0.22 }],
  SitDown: [{ name: "hand-contact", time: 0.35 }, { name: "seated", time: 0.92 }],
  PushChair: [{ name: "hand-contact", time: 0.2 }, { name: "seated", time: 0 }],
  StandUp: [{ name: "seated", time: 0 }, { name: "hand-contact", time: 0.2 }],
};

function customerOf(overrides: Partial<CustomerPresentation> = {}): CustomerPresentation {
  return {
    renderAgentId: 10, partyId: 1, memberIndex: 0,
    tableId: "table-1", chairId: "chair-1", serviceCycleId: "cycle-1",
    activity: "eating", seatingPhase: "seated", walkMetersPerSecond: 1.2, mealId: "meal-1", ...overrides,
  };
}

function mealOf(overrides: Partial<MealPresentation> = {}): MealPresentation {
  return {
    mealId: "meal-1", ownerRenderAgentId: 10, tableId: "table-1", chairId: "chair-1", serviceCycleId: "cycle-1",
    foodKind: "fried-rice", anchor: { x: 0, y: 0.2 }, progress: "full", consumed: 0, placedAtSeconds: 300, ...overrides,
  };
}

function decide(
  customer: CustomerPresentation,
  options: {
    meal?: MealPresentation | null;
    seatPose?: CustomerSeatPose | null;
    simTimeSeconds?: number;
    groundSpeed?: number;
    reducedMotion?: boolean;
    seed?: number;
  } = {},
) {
  return resolveCustomerAction({
    customer,
    meal: options.meal === undefined ? mealOf() : options.meal,
    seatPose: options.seatPose ?? null,
    simTimeSeconds: options.simTimeSeconds ?? 360,
    seed: options.seed ?? 7,
    groundSpeed: options.groundSpeed ?? 0,
    reducedMotion: options.reducedMotion ?? false,
    walkCycleDistance: 0.9, walkClipDuration: 0.95, eatClipDuration: 3.2,
    markers: MARKERS,
  });
}

const pose = (phase: SeatingPhase, overrides: Partial<CustomerSeatPose> = {}): CustomerSeatPose => ({
  renderAgentId: 10, phase, clipPhase: 0, outwardOffset: 0, usesChairClips: true, ...overrides,
});

describe("eat gating", () => {
  it("eats only when the engine, the seated pose and the placed dish all agree", () => {
    expect(canEat({
      customer: customerOf(), meal: mealOf(), seatPose: pose("seated"), simTimeSeconds: 360,
      seed: 1, groundSpeed: 0, reducedMotion: false, walkCycleDistance: 0.9, walkClipDuration: 0.95,
      eatClipDuration: 3.2, markers: MARKERS,
    })).toBe(true);
  });

  it("sits still while waiting for the order or for the food", () => {
    for (const activity of ["waiting-order", "waiting-food"] as const) {
      const decision = decide(customerOf({ activity }));
      expect(decision, activity).toMatchObject({ clip: "Sit", eating: false, seated: true, timeScale: 0 });
      expect(decision.utensil).toBeNull();
    }
  });

  it("does not eat before the dish is on the table", () => {
    expect(decide(customerOf(), { meal: mealOf({ placedAtSeconds: null }) }).eating).toBe(false);
    expect(decide(customerOf(), { meal: mealOf({ placedAtSeconds: 400 }), simTimeSeconds: 360 }).eating).toBe(false);
    expect(decide(customerOf(), { meal: mealOf({ placedAtSeconds: 360 }), simTimeSeconds: 360 }).eating).toBe(true);
  });

  it("does not eat while the body is still sitting down, even once the dish has landed", () => {
    expect(decide(customerOf({ seatingPhase: "sit" })).eating).toBe(false);
    expect(decide(customerOf(), { seatPose: pose("sit") }).eating).toBe(false);
    expect(decide(customerOf(), { seatPose: pose("seated") }).eating).toBe(true);
  });

  it("stops taking bites once the customer is finished, keeping the seated pose", () => {
    const finished = decide(customerOf({ activity: "finished" }));
    expect(finished).toMatchObject({ clip: "Sit", eating: false, seated: true });
  });

  it("never plays a seated or eating pose before a chair is bound", () => {
    const unseated = decide(customerOf({ chairId: null, seatingPhase: null, activity: "walking" }), { groundSpeed: 1.2 });
    expect(unseated).toMatchObject({ clip: "Walk", seated: false, eating: false });
    // An engine still reporting "eating" with no chair must not produce a bite.
    expect(decide(customerOf({ chairId: null, seatingPhase: null })).eating).toBe(false);
  });

  it("refuses a meal that belongs to another customer", () => {
    expect(decide(customerOf({ mealId: "meal-9" }), { meal: mealOf() }).eating).toBe(false);
  });
});

describe("seating phases map onto the feat-112 clips", () => {
  it.each([
    ["pull", "PullChair", false],
    ["sit", "SitDown", true],
    ["push", "PushChair", true],
    ["rise", "StandUp", true],
  ] as const)("plays %s as %s", (phase, clip, seated) => {
    const decision = decide(customerOf({ activity: "walking", seatingPhase: phase }), { seatPose: pose(phase, { clipPhase: 0.5 }) });
    expect(decision).toMatchObject({ clip, tier: "seating", seated, phase: 0.5 });
  });

  it("walks while approaching and departing, and stands when not moving", () => {
    expect(decide(customerOf({ activity: "walking", seatingPhase: "approach" }), { groundSpeed: 1.2 }).clip).toBe("Walk");
    expect(decide(customerOf({ activity: "leaving", seatingPhase: "depart" }), { groundSpeed: 0 }).clip).toBe("Idle");
  });

  it("runs PushChair backwards to pull the chair out again before rising", () => {
    const decision = decide(customerOf({ seatingPhase: "rise-pull" }), { seatPose: pose("rise-pull", { clipPhase: 0.25 }) });
    expect(decision).toMatchObject({ clip: "PushChair", tier: "seating", phase: 0.75 });
  });

  it("uses the seated fallback where the space is too tight for the chair clips", () => {
    const tight = { usesChairClips: false, clipPhase: 0.4 };
    expect(decide(customerOf({ seatingPhase: "pull" }), { seatPose: pose("pull", tight) }).clip).toBe("SitDown");
    expect(decide(customerOf({ seatingPhase: "push" }), { seatPose: pose("push", tight) }).clip).toBe("Sit");
    expect(decide(customerOf({ seatingPhase: "rise-pull" }), { seatPose: pose("rise-pull", tight) }).clip).toBe("Sit");
  });

  it("lets the seating lane override a stale snapshot phase", () => {
    const decision = decide(customerOf({ seatingPhase: "seated" }), { seatPose: pose("rise", { clipPhase: 0.1 }) });
    expect(decision).toMatchObject({ clip: "StandUp", tier: "seating" });
  });
});

describe("bites", () => {
  it("keeps the corrected seated position stable instead of bouncing each frame", () => {
    let shift = 0;
    for (let frame = 0; frame < 100; frame++) {
      const correction = 0.08 - shift;
      shift = nextSeatReachShift(shift, correction, 0.1);
      expect(shift).toBeCloseTo(0.08);
    }
    expect(nextSeatReachShift(0.1, 0.2, 0.1)).toBe(0.1);
    expect(nextSeatReachShift(0.08, -0.2, 0.1)).toBe(0);
  });
  it("advances one bite per clip duration and wraps seamlessly", () => {
    const first = decide(customerOf(), { simTimeSeconds: 300 });
    const later = decide(customerOf(), { simTimeSeconds: 300 + 3.2 });
    expect(first.phase).toBeCloseTo(later.phase!, 6);
    const middle = decide(customerOf(), { simTimeSeconds: 300 + 1.6 });
    expect(Math.abs(middle.phase! - first.phase!)).toBeGreaterThan(0.1);
  });

  it("offsets each party member so a table does not chew in unison", () => {
    const phases = [0, 1, 2, 3].map(memberIndex =>
      decide(customerOf({ memberIndex, renderAgentId: 10 + memberIndex }), { simTimeSeconds: 300 }).phase!);
    expect(new Set(phases.map(value => value.toFixed(4))).size).toBe(4);
  });

  it("is reproducible from the layout revision alone", () => {
    expect(seedFromRevision("rev-1")).toBe(seedFromRevision("rev-1"));
    expect(seedFromRevision("rev-1")).not.toBe(seedFromRevision("rev-2"));
  });

  it("matches the offsets the feat-110 clip provider publishes", async () => {
    const provider = await import("../../../../scripts/character-clips/customer-eat.mjs");
    const cases: readonly [number, number, number][] = [[0, 0, 0], [7, 1, 2], [4242, 31, 3], [99, 7, 1]];
    for (const [seed, partyId, memberIndex] of cases) {
      expect(eatPhaseOffset(seed, partyId, memberIndex)).toBe(provider.eatPhaseOffset(seed, partyId, memberIndex));
    }
  });
});

describe("utensils", () => {
  it("gives every menu its own utensil with the handle slid to a common tip reach", () => {
    expect(utensilFor("fried-rice")).toEqual({ foodKind: "fried-rice", utensil: "spoon", length: 0.17, gripOffset: 0.035 });
    expect(utensilFor("noodles")).toMatchObject({ utensil: "chopsticks", gripOffset: 0.105 });
    for (const kind of ["fried-rice", "noodles", "steak", "salad", "cake"] as const) {
      const spec = utensilFor(kind);
      expect(spec.length - spec.gripOffset).toBeCloseTo(EAT_TIP_REACH, 6);
    }
  });

  it("matches the utensil table and grip offsets of the feat-110 provider", async () => {
    const provider = await import("../../../../scripts/character-clips/customer-eat.mjs");
    for (const kind of ["fried-rice", "noodles", "steak", "salad", "cake"] as const) {
      expect(utensilFor(kind).gripOffset).toBe(provider.utensilGripOffset(kind));
      expect(utensilFor(kind).utensil).toBe(provider.EAT_UTENSILS[kind]?.utensil);
    }
  });

  it("holds a utensil only while eating", () => {
    expect(decide(customerOf()).utensil).not.toBeNull();
    expect(decide(customerOf({ activity: "finished" })).utensil).toBeNull();
  });
});

describe("reduced motion", () => {
  it("freezes the bite at the seated marker and stops the walk cycle", () => {
    const eating = decide(customerOf(), { reducedMotion: true });
    expect(eating).toMatchObject({ clip: "Eat", phase: 0, timeScale: 0, eating: true });
    const walking = decide(customerOf({ activity: "walking", seatingPhase: "approach" }), { groundSpeed: 1.2, reducedMotion: true });
    expect(walking).toMatchObject({ clip: "Walk", phase: 0, timeScale: 0 });
  });
});

describe("walk timing and asset fallback", () => {
  it("scales the walk cycle to the drawn speed", () => {
    const decision = decide(customerOf({ activity: "walking", seatingPhase: "approach" }), { groundSpeed: 1.1 });
    expect(decision.timeScale).toBeCloseTo((1.1 * 0.95) / 0.9, 6);
  });

  it.each([
    ["Eat", "Sit"],
    ["SitDown", "Sit"],
    ["PushChair", "Sit"],
    ["StandUp", "Sit"],
    ["PullChair", "Idle"],
  ] as const)("substitutes %s with %s on a pre-feat-110 asset", (requested, expected) => {
    expect(resolveClipName(requested, ["Idle", "Walk", "Sit"])).toBe(expected);
  });

  it("prefers the published clip and degrades only as far as it must", () => {
    expect(resolveClipName("Eat", ["Idle", "Walk", "Sit", "Eat"])).toBe("Eat");
    expect(resolveClipName("Eat", ["Walk"])).toBe("Walk");
    expect(resolveClipName("Eat", [])).toBeNull();
  });
});

describe("plate reach", () => {
  it("reports how far the seated body must shift for the clip to reach the dish", () => {
    expect(plateReach(EAT_PLATE_FORWARD)).toEqual({ correction: 0, outOfReach: false });
    expect(plateReach(0.38)).toMatchObject({ outOfReach: false });
    expect(plateReach(0.45)).toMatchObject({ correction: 0.11, outOfReach: true });
    expect(plateReach(0.2)).toMatchObject({ outOfReach: true });
  });

  it("stays silent when no dish position is known", () => {
    expect(plateReach(null)).toEqual({ correction: 0, outOfReach: false });
  });
});
