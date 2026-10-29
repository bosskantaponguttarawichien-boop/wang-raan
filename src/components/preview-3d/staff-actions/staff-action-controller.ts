/**
 * feat-117 · Pure action resolution for one staff member.
 *
 * Every field below is derived from the frozen snapshot plus clip metadata, so the result is a
 * function of (snapshot, time, asset) alone: no latches, no mixer-finished callbacks and no
 * animation events. A cancelled task or a restarted run therefore cannot leave a stale pose,
 * and pausing simply stops `simTimeSeconds` from advancing (contract v1 §2–§3).
 */
import type { PresentationPoint, ServiceMilestones, StaffPresentation } from "@/core/simulation/presentation-contract";
import {
  type ClipMarker,
  LEGACY_STAFF_CLIP_NAMES,
  type LegacyStaffClipName,
  type StaffClipName,
  type StaffMarkerTable,
} from "./contracts";

export type StaffActionTier = "task" | "carry" | "walk" | "base";

export interface StaffPropState {
  /** Tray parented to the model root (legacy serving props), not to a hand bone. */
  readonly tray: boolean;
  readonly trayMealIds: readonly string[];
  /** Plate gripped in the right hand between PutDown hand-contact and food-contact. */
  readonly plateInHand: boolean;
  /** Dish handed over to table-service; the tray must not keep showing it. */
  readonly dishReleased: boolean;
  /** Cloth in the right hand for the whole WipeTable clip. */
  readonly cloth: boolean;
  /** Dirty plate collected into the left hand from WipeTable hand-contact onwards. */
  readonly collectedPlate: boolean;
  /** 0 → 1 across wipe-contact..clear-complete; 1 never arrives before the wipe phase ends. */
  readonly wipeProgress: number;
}

export interface StaffActionDecision {
  readonly staffId: number;
  readonly clip: StaffClipName;
  readonly tier: StaffActionTier;
  readonly loop: boolean;
  /** Normalised clip position for one-shots; null means the mixer owns the time (looping). */
  readonly phase: number | null;
  readonly timeScale: number;
  readonly props: StaffPropState;
  readonly taskId: string | null;
  readonly tableId: string | null;
  readonly serviceCycleId: string | null;
}

export interface StaffActionInput {
  readonly staff: StaffPresentation;
  readonly simTimeSeconds: number;
  readonly milestones?: ServiceMilestones | null;
  /** Speed of the drawn model this frame; the pose must follow what is on screen, not the plan. */
  readonly groundSpeed: number;
  readonly reducedMotion: boolean;
  /** Metres per Walk cycle at timeScale 1. */
  readonly walkCycleDistance: number;
  readonly walkClipDuration: number;
  readonly markers: StaffMarkerTable;
}

const EMPTY_MEALS: readonly string[] = Object.freeze([]);
const clamp01 = (value: number) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);

/** Speed below which a walking rig is treated as standing, so Walk never slides the feet in place. */
export const STANDING_SPEED_EPSILON = 0.02;

/** Marker lookup with an explicit fallback: an older asset without markers must still be drivable. */
export function markerTime(markers: StaffMarkerTable, clip: string, name: string, fallback: number): number {
  const entry = (markers[clip] as readonly ClipMarker[] | undefined)?.find(marker => marker.name === name);
  return entry && Number.isFinite(entry.time) ? clamp01(entry.time) : fallback;
}

/** Fraction of the staff phase window that has elapsed at `simTimeSeconds`. */
export function phaseProgress(staff: StaffPresentation, simTimeSeconds: number): number {
  const span = staff.phaseEndsAtSeconds - staff.phaseStartedAtSeconds;
  if (!Number.isFinite(span) || span <= 0) return simTimeSeconds >= staff.phaseEndsAtSeconds ? 1 : 0;
  return clamp01((simTimeSeconds - staff.phaseStartedAtSeconds) / span);
}

/** WipeTable holds three consecutive jobs in one clip, so each activity owns its own segment. */
function wipeSegment(markers: StaffMarkerTable, activity: StaffPresentation["activity"]): [number, number] {
  const hand = markerTime(markers, "WipeTable", "hand-contact", 0.12);
  const wipe = markerTime(markers, "WipeTable", "wipe-contact", 0.3);
  const clear = markerTime(markers, "WipeTable", "clear-complete", 0.82);
  if (activity === "clearing") return [0, Math.max(hand, wipe)];
  if (activity === "wiping") return [Math.max(hand, wipe), Math.max(clear, wipe)];
  return [clear, 1];
}

function trayProps(mealIds: readonly string[], visible: boolean): StaffPropState {
  return {
    tray: visible && mealIds.length > 0,
    trayMealIds: visible ? mealIds : EMPTY_MEALS,
    plateInHand: false, dishReleased: false, cloth: false, collectedPlate: false, wipeProgress: 0,
  };
}

const IDLE_PROPS: StaffPropState = Object.freeze(trayProps(EMPTY_MEALS, false));

/**
 * Resolves the clip, its position and the props for one staff member.
 * Priority follows contract v1 §3: task interaction > carry > walk > idle/work.
 */
export function resolveStaffAction(input: StaffActionInput): StaffActionDecision {
  const { staff, markers, reducedMotion } = input;
  const base = {
    staffId: staff.staffId, taskId: staff.taskId, tableId: staff.tableId, serviceCycleId: staff.serviceCycleId,
  };
  const meals = staff.carryMealIds;
  const progress = phaseProgress(staff, input.simTimeSeconds);
  const walkTimeScale = () => {
    const cycleSpeed = input.walkCycleDistance / Math.max(input.walkClipDuration, 1e-6);
    if (!Number.isFinite(cycleSpeed) || cycleSpeed <= 0) return 1;
    return Math.max(0, input.groundSpeed) / cycleSpeed;
  };
  /** Reduced motion keeps the semantic stops and drops everything between them. */
  const at = (phase: number, snapped: number) => (reducedMotion ? snapped : phase);

  switch (staff.activity) {
    case "pickup": {
      // Hands are empty until the kitchen puts the tray on them at food-contact.
      const contact = markerTime(markers, "PickUp", "food-contact", 0.58);
      const phase = at(progress, progress >= contact ? 1 : 0);
      return { ...base, clip: "PickUp", tier: "task", loop: false, phase, timeScale: reducedMotion ? 0 : 1,
        props: trayProps(meals, phase >= contact) };
    }
    case "put-down": {
      const hand = markerTime(markers, "PutDown", "hand-contact", 0.26);
      const contact = markerTime(markers, "PutDown", "food-contact", 0.62);
      const phase = at(progress, progress >= contact ? 1 : hand);
      const released = phase >= contact;
      return { ...base, clip: "PutDown", tier: "task", loop: false, phase, timeScale: reducedMotion ? 0 : 1,
        props: {
          // The left hand keeps the tray level for the whole clip; only the placed dish leaves it.
          tray: meals.length > 0, trayMealIds: released ? EMPTY_MEALS : meals,
          plateInHand: phase >= hand && !released, dishReleased: released,
          cloth: false, collectedPlate: false, wipeProgress: 0,
        } };
    }
    case "wiping":
    case "clearing": {
      const [from, to] = wipeSegment(markers, staff.activity);
      const hand = markerTime(markers, "WipeTable", "hand-contact", 0.12);
      const wipe = markerTime(markers, "WipeTable", "wipe-contact", 0.3);
      const clear = markerTime(markers, "WipeTable", "clear-complete", 0.82);
      const phase = at(from + progress * (to - from), staff.activity === "clearing" ? hand : wipe);
      return { ...base, clip: "WipeTable", tier: "task", loop: false, phase, timeScale: reducedMotion ? 0 : 1,
        props: {
          tray: false, trayMealIds: EMPTY_MEALS, plateInHand: false, dishReleased: false,
          cloth: true, collectedPlate: phase >= hand,
          // Stains may only fade across the wipe stroke, never on clip entry or at task completion.
          wipeProgress: clamp01((phase - wipe) / Math.max(clear - wipe, 1e-6)),
        } };
    }
    case "taking-order":
      return { ...base, clip: "Work", tier: "task", loop: true, phase: reducedMotion ? 0 : null,
        timeScale: reducedMotion ? 0 : 1, props: IDLE_PROPS };
    case "carrying":
    case "walking": {
      const moving = input.groundSpeed > STANDING_SPEED_EPSILON;
      if (meals.length > 0) {
        return { ...base, clip: moving ? "CarryWalk" : "CarryIdle", tier: "carry", loop: true,
          phase: reducedMotion ? 0 : null, timeScale: reducedMotion ? 0 : moving ? walkTimeScale() : 1,
          props: trayProps(meals, true) };
      }
      return { ...base, clip: moving ? "Walk" : "Work", tier: moving ? "walk" : "base", loop: true,
        phase: reducedMotion ? 0 : null, timeScale: reducedMotion ? 0 : moving ? walkTimeScale() : 1,
        props: IDLE_PROPS };
    }
    case "counter":
    default:
      return { ...base, clip: "Work", tier: "base", loop: true, phase: reducedMotion ? 0 : null,
        timeScale: reducedMotion ? 0 : 1, props: IDLE_PROPS };
  }
}

/** Clip substitution for an asset built before feat-109/111 — state still shows, motion degrades. */
const LEGACY_SUBSTITUTE: Record<StaffClipName, LegacyStaffClipName> = {
  Idle: "Idle", Walk: "Walk", Sit: "Sit", Work: "Work",
  CarryIdle: "Idle", CarryWalk: "Walk", PickUp: "Work", PutDown: "Work", WipeTable: "Work",
};

export function resolveClipName(requested: StaffClipName, available: readonly string[]): string | null {
  if (available.includes(requested)) return requested;
  const substitute = LEGACY_SUBSTITUTE[requested];
  if (available.includes(substitute)) return substitute;
  for (const name of LEGACY_STAFF_CLIP_NAMES) if (available.includes(name)) return name;
  return available[0] ?? null;
}

/**
 * Picks the table side a staff member can actually wipe from. A service point further from the
 * table centre than the clip can reach is reported instead of faked, so feat-122/123 can see
 * that an oversized table needs a second pass from another side.
 */
export function wipeReach(
  servicePoint: PresentationPoint | null,
  tableCenter: PresentationPoint | null,
  radiusFar: number,
): { point: PresentationPoint | null; outOfReach: boolean } {
  if (!servicePoint) return { point: null, outOfReach: false };
  if (!tableCenter) return { point: servicePoint, outOfReach: false };
  const distance = Math.hypot(tableCenter.x - servicePoint.x, tableCenter.y - servicePoint.y);
  return { point: servicePoint, outOfReach: distance > radiusFar };
}
