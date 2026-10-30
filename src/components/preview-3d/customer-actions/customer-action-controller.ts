/**
 * feat-118 · Pure action resolution for one customer.
 *
 * Eating is gated on three independent facts, never on an animation finishing: the engine says the
 * customer is eating, the seating lane says the body is actually `seated`, and the meal has a
 * `placedAtSeconds` that has already passed. A customer waiting for an order or for food therefore
 * sits still, and a dish that is not on the table yet cannot start a bite (contract v1 §1 rule 2).
 *
 * Everything is derived from (snapshot, time, seat pose), so entering the 3D view in the middle of a
 * run rebuilds the pose exactly, and a cancelled customer leaves nothing behind.
 */
import type {
  CustomerPresentation,
  FoodKind,
  MealPresentation,
} from "@/core/simulation/presentation-contract";
import {
  type ClipMarker,
  type CustomerClipName,
  type CustomerMarkerTable,
  type CustomerSeatPose,
  LEGACY_CUSTOMER_CLIP_NAMES,
  type LegacyCustomerClipName,
  type UtensilSpec,
} from "./contracts";

/** Duration of one bite in the published Eat clip. */
export const EAT_CLIP_SECONDS = 3.2;
/** Distance from the palm surface to the utensil tip that the Eat clip locks in. */
export const EAT_TIP_REACH = 0.135;
/** Where the Eat clip expects the plate centre, in front of the seated customer. */
export const EAT_PLATE_FORWARD = 0.34;
/** Beyond this the clip visibly misses the dish and feat-122 must shift the seated body. */
export const EAT_REACH_TOLERANCE = 0.06;
/** Speed below which a walking rig is drawn standing, so the legs never cycle in place. */
export const STANDING_SPEED_EPSILON = 0.02;

/** Utensil per menu, locked by contract v1 §3 (scripts/character-clips/customer-eat.mjs). */
export const EAT_UTENSILS: Readonly<Record<FoodKind, { utensil: UtensilSpec["utensil"]; length: number }>> = Object.freeze({
  "fried-rice": { utensil: "spoon", length: 0.17 },
  noodles: { utensil: "chopsticks", length: 0.24 },
  steak: { utensil: "fork", length: 0.19 },
  salad: { utensil: "fork", length: 0.19 },
  cake: { utensil: "fork", length: 0.16 },
});

export function utensilFor(foodKind: FoodKind): UtensilSpec {
  const entry = EAT_UTENSILS[foodKind];
  return {
    foodKind, utensil: entry.utensil, length: entry.length,
    gripOffset: Number((entry.length - EAT_TIP_REACH).toFixed(4)),
  };
}

const clamp01 = (value: number) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);
const fract = (value: number) => value - Math.floor(value);

/**
 * Per-diner bite offset, identical to `eatPhaseOffset` in the feat-110 clip provider: FNV-1a over
 * the bytes of seed/party/member. Deterministic, and deliberately separate from the simulation RNG
 * so no extra random draw can shift arrivals, cooking or the metrics.
 */
export function eatPhaseOffset(seed: number, partyId: number, memberIndex: number): number {
  let hash = 0x811c9dc5;
  for (const value of [seed, partyId, memberIndex]) {
    const word = Math.trunc(value) >>> 0;
    for (let shift = 0; shift < 32; shift += 8) {
      hash ^= (word >>> shift) & 0xff;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  }
  return (hash >>> 8) / 0x01000000;
}

/** Stable numeric seed from the layout revision, so one layout always replays the same offsets. */
export function seedFromRevision(layoutRevision: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < layoutRevision.length; index += 1) {
    hash ^= layoutRevision.charCodeAt(index) & 0xff;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function markerTime(markers: CustomerMarkerTable, clip: string, name: string, fallback: number): number {
  const entry = (markers[clip] as readonly ClipMarker[] | undefined)?.find(marker => marker.name === name);
  return entry && Number.isFinite(entry.time) ? clamp01(entry.time) : fallback;
}

export type CustomerActionTier = "seating" | "eat" | "walk" | "base";

export interface CustomerActionDecision {
  readonly renderAgentId: number;
  readonly clip: CustomerClipName;
  readonly tier: CustomerActionTier;
  readonly loop: boolean;
  readonly phase: number | null;
  readonly timeScale: number;
  readonly seated: boolean;
  readonly eating: boolean;
  readonly mealId: string | null;
  readonly utensil: UtensilSpec | null;
}

export interface CustomerActionInput {
  readonly customer: CustomerPresentation;
  readonly meal?: MealPresentation | null;
  readonly seatPose?: CustomerSeatPose | null;
  readonly simTimeSeconds: number;
  readonly seed: number;
  readonly groundSpeed: number;
  readonly reducedMotion: boolean;
  readonly walkCycleDistance: number;
  readonly walkClipDuration: number;
  readonly eatClipDuration: number;
  readonly markers: CustomerMarkerTable;
}

/**
 * True only when the engine, the drawn seating pose and the dish all agree.
 * `finished` stops the bites even though the plate is still on the table.
 */
export function canEat(input: CustomerActionInput): boolean {
  const { customer, meal, seatPose, simTimeSeconds } = input;
  if (customer.activity !== "eating") return false;
  if (!customer.chairId || !customer.tableId || !customer.mealId) return false;
  const phase = seatPose?.phase ?? customer.seatingPhase;
  if (phase !== "seated") return false;
  if (!meal || meal.mealId !== customer.mealId) return false;
  if (meal.placedAtSeconds === null) return false;
  return simTimeSeconds + 1e-6 >= meal.placedAtSeconds;
}

/** Resolution order follows contract v1 §3: seating transition > served Eat > walk > idle. */
export function resolveCustomerAction(input: CustomerActionInput): CustomerActionDecision {
  const { customer, seatPose, reducedMotion } = input;
  const base = { renderAgentId: customer.renderAgentId, mealId: customer.mealId };
  const moving = input.groundSpeed > STANDING_SPEED_EPSILON;
  const walkTimeScale = () => {
    const cycleSpeed = input.walkCycleDistance / Math.max(input.walkClipDuration, 1e-6);
    if (!Number.isFinite(cycleSpeed) || cycleSpeed <= 0) return 1;
    return Math.max(0, input.groundSpeed) / cycleSpeed;
  };
  const onFoot = (tier: CustomerActionTier = moving ? "walk" : "base"): CustomerActionDecision => ({
    ...base, clip: moving ? "Walk" : "Idle", tier, loop: true,
    phase: reducedMotion ? 0 : null, timeScale: reducedMotion ? 0 : moving ? walkTimeScale() : 1,
    seated: false, eating: false, utensil: null,
  });
  const seating = (clip: CustomerClipName, phase: number | null, seated: boolean): CustomerActionDecision => ({
    ...base, clip, tier: "seating", loop: false,
    // The seating lane owns the timing, so its normalised phase is used verbatim.
    phase: phase === null ? null : clamp01(phase), timeScale: reducedMotion ? 0 : 1,
    seated, eating: false, utensil: null,
  });

  // No chair bound yet: never play a seated or eating pose, whatever the activity says.
  const phase = seatPose?.phase ?? customer.seatingPhase;
  if (!customer.chairId || phase === null) return onFoot();

  switch (phase) {
    case "approach":
    case "depart":
      return onFoot();
    case "pull":
      return seatPose?.usesChairClips === false
        ? seating("SitDown", 0, false)
        : seating("PullChair", seatPose?.clipPhase ?? 0, false);
    case "sit":
      return seating("SitDown", seatPose?.clipPhase ?? 0, true);
    case "push":
      return seatPose?.usesChairClips === false
        ? seating("Sit", 1, true)
        : seating("PushChair", seatPose?.clipPhase ?? 0, true);
    case "rise-pull":
      // Reverse of PushChair: still seated, pulling the chair back out from under the table.
      return seatPose?.usesChairClips === false
        ? seating("Sit", 1, true)
        : seating("PushChair", 1 - (seatPose?.clipPhase ?? 0), true);
    case "rise":
      return seating("StandUp", seatPose?.clipPhase ?? 0, true);
    case "seated":
      break;
  }

  if (!canEat(input)) {
    // Waiting for the order, waiting for food, or finished: hold the seated pose, no bites.
    return { ...base, clip: "Sit", tier: "base", loop: false, phase: 1, timeScale: 0, seated: true, eating: false, utensil: null };
  }

  const meal = input.meal!;
  const duration = input.eatClipDuration > 0 ? input.eatClipDuration : EAT_CLIP_SECONDS;
  const offset = eatPhaseOffset(input.seed, customer.partyId, customer.memberIndex);
  const elapsed = Math.max(0, input.simTimeSeconds - (meal.placedAtSeconds ?? input.simTimeSeconds));
  const bite = fract(offset + elapsed / duration);
  return {
    ...base, clip: "Eat", tier: "eat", loop: true,
    // Explicit time keeps every diner's bite deterministic and makes pause freeze it mid-bite.
    phase: reducedMotion ? markerTime(input.markers, "Eat", "seated", 0) : bite,
    timeScale: reducedMotion ? 0 : 1,
    seated: true, eating: true, utensil: utensilFor(meal.foodKind),
  };
}

/** Clip substitution for an asset built before feat-110/112 — state shows, motion degrades. */
const LEGACY_SUBSTITUTE: Record<CustomerClipName, LegacyCustomerClipName> = {
  Idle: "Idle", Walk: "Walk", Sit: "Sit",
  Eat: "Sit", PullChair: "Idle", SitDown: "Sit", PushChair: "Sit", StandUp: "Sit",
};

export function resolveClipName(requested: CustomerClipName, available: readonly string[]): string | null {
  if (available.includes(requested)) return requested;
  const substitute = LEGACY_SUBSTITUTE[requested];
  if (available.includes(substitute)) return substitute;
  for (const name of LEGACY_CUSTOMER_CLIP_NAMES) if (available.includes(name)) return name;
  return available[0] ?? null;
}

/**
 * How far the host must shift the seated body forward for the real dish to sit where the Eat clip
 * reaches. `forward` is the dish distance along the customer's facing axis, in metres.
 */
export function plateReach(forward: number | null): { correction: number; outOfReach: boolean } {
  if (forward === null || !Number.isFinite(forward)) return { correction: 0, outOfReach: false };
  const correction = Number((forward - EAT_PLATE_FORWARD).toFixed(4));
  return { correction, outOfReach: Math.abs(correction) > EAT_REACH_TOLERANCE };
}

/** The measured correction is relative to the current body, not its original seat. */
export function nextSeatReachShift(current: number, correction: number, limit: number): number {
  return Math.min(limit, Math.max(0, current + correction));
}
