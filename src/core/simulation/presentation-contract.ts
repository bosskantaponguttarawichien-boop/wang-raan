/**
 * Version 1 of the optional simulation → presentation metadata (feat-101).
 * Pure data only: no renderer, clocks, random draws or changes to simulation rules.
 * Protocol wiring and snapshot production belong to feat-113/114.
 */
export const PRESENTATION_VERSION = 1 as const;

export type FoodKind = "fried-rice" | "noodles" | "steak" | "salad" | "cake";
export type FoodProgress = "full" | "partial" | "empty";
export type CustomerActivity = "walking" | "waiting-order" | "waiting-food" | "eating" | "finished" | "leaving";
export type SeatingPhase = "approach" | "pull" | "sit" | "push" | "seated" | "rise-pull" | "rise" | "depart";
export type TableAvailability = "clean" | "occupied" | "dirty" | "cleaning";
export type TableSurface = "empty" | "served" | "eating" | "used" | "wiping" | "clean";
export type StaffActivity = "counter" | "walking" | "taking-order" | "pickup" | "carrying" | "put-down" | "wiping" | "clearing";
export type PresentationTaskKind = "deliver" | "pay" | "clean" | "take-order";

export type CustomerThoughtKind =
  | "queue-wait"
  | "queue-warning"
  | "queue-critical"
  | "order-wait"
  | "food-wait"
  | "food-warning"
  | "food-critical"
  | "eating"
  | "bill-wait";

export interface CustomerThought {
  readonly kind: CustomerThoughtKind;
  readonly waitSeconds: number;
  readonly severity: "normal" | "warning" | "critical";
}

export type StaffThoughtKind = "taking-order" | "serving" | "cleaning" | "resting";

export interface StaffThought {
  readonly kind: StaffThoughtKind;
}


/** Layout x/y in metres; Three.js maps (x, y) to (x, 0, z=y). */
export interface PresentationPoint { readonly x: number; readonly y: number }

export interface PresentationEnvelope {
  readonly version: typeof PRESENTATION_VERSION;
  /** Unique per START, including restarting the same layout/seed. */
  readonly runId: string;
  readonly layoutRevision: string;
  /** Strictly increasing within a run; initial snapshot is sequence 0. */
  readonly sequence: number;
  /** Seconds since opening; never wall-clock epoch time. */
  readonly simTimeSeconds: number;
}

export interface CustomerPresentation {
  readonly renderAgentId: number;
  readonly partyId: number;
  readonly memberIndex: number;
  /** Null before allocation; assigned chairs are unique among party members. */
  readonly tableId: string | null;
  readonly chairId: string | null;
  readonly serviceCycleId: string | null;
  readonly activity: CustomerActivity;
  readonly seatingPhase: SeatingPhase | null;
  readonly walkMetersPerSecond: number;
  readonly mealId: string | null;
  readonly thought?: CustomerThought | null;
}

export interface MealPresentation {
  readonly mealId: string;
  readonly ownerRenderAgentId: number;
  readonly tableId: string;
  readonly chairId: string;
  readonly serviceCycleId: string;
  readonly foodKind: FoodKind;
  /** Local tabletop x/y offset in metres; anchors are not persisted to P1. */
  readonly anchor: PresentationPoint;
  readonly progress: FoodProgress;
  /** 0 untouched → 1 consumed; independent of whether dishes were cleared. */
  readonly consumed: number;
  readonly placedAtSeconds: number | null;
}

export interface TablePresentation {
  readonly tableId: string;
  readonly serviceCycleId: string;
  readonly availability: TableAvailability;
  readonly surface: TableSurface;
  readonly mealIds: readonly string[];
  readonly stainAmount: number;
  readonly wipeProgress: number;
  /** Authoritative business completion, distinct from visual wipe end. */
  readonly cleanCompletedAtSeconds: number | null;
}

export interface StaffPresentation {
  readonly staffId: number;
  readonly taskId: string | null;
  readonly taskKind: PresentationTaskKind | null;
  readonly tableId: string | null;
  readonly serviceCycleId: string | null;
  readonly activity: StaffActivity;
  readonly walkMetersPerSecond: number;
  readonly carryMealIds: readonly string[];
  readonly servicePoint: PresentationPoint | null;
  readonly phaseStartedAtSeconds: number;
  readonly phaseEndsAtSeconds: number;
  readonly thought?: StaffThought | null;
}

/** All markers are absolute simulation times. Null means not scheduled/applicable. */
export interface ServiceMilestones {
  readonly taskId: string;
  readonly serviceCycleId: string;
  readonly pickedUpAtSeconds: number | null;
  readonly placedAtSeconds: number | null;
  readonly wipeStartedAtSeconds: number | null;
  readonly wipeFinishedAtSeconds: number | null;
  readonly clearedAtSeconds: number | null;
  readonly taskCompletedAtSeconds: number;
}

/** Full replaceable state; no replay-only events or unbounded history. */
export interface PresentationSnapshot extends PresentationEnvelope {
  readonly customers: readonly CustomerPresentation[];
  readonly meals: readonly MealPresentation[];
  readonly tables: readonly TablePresentation[];
  readonly staff: readonly StaffPresentation[];
  readonly milestones: readonly ServiceMilestones[];
}

/** The existing Float32Array buffers keep their four-value stride. */
export interface OptionalPresentationMetadata {
  readonly presentation?: PresentationSnapshot;
}
