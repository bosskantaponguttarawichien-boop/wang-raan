/**
 * feat-118 · Typed ports for the customer-actions scene feature.
 *
 * The seating lane (feat-119) owns where the body and the chair actually are; this lane owns which
 * clip plays and where the utensil is. The two meet only through `CustomerSeatPose`, which feat-119
 * either pushes in (`setSeatPose`) or serves through `CustomerPosePort` — no lane imports the
 * other's implementation (contract v1 §4).
 */
import type * as THREE from "three";
import type { FoodKind, PresentationPoint, SeatingPhase } from "@/core/simulation/presentation-contract";
import type { TableDishPlacementInfo } from "../table-service";

/** Clip names present in cafe-customer[-lite].glb after feat-110/112 registration. */
export const CUSTOMER_CLIP_NAMES = ["Idle", "Walk", "Sit", "Eat", "PullChair", "SitDown", "PushChair", "StandUp"] as const;
export type CustomerClipName = typeof CUSTOMER_CLIP_NAMES[number];

/** Clips a pre-feat-110 asset is guaranteed to have. */
export const LEGACY_CUSTOMER_CLIP_NAMES = ["Idle", "Walk", "Sit"] as const;
export type LegacyCustomerClipName = typeof LEGACY_CUSTOMER_CLIP_NAMES[number];

export interface ClipMarker {
  readonly name: string;
  /** Normalised [0, 1] position inside the clip. */
  readonly time: number;
}

export type CustomerMarkerTable = Readonly<Record<string, readonly ClipMarker[]>>;

/**
 * One customer the host already placed in the scene. This lane reads the rig, drives the mixer and
 * parents the utensil to a hand bone; it never moves, rotates, scales or disposes the model.
 */
export interface CustomerRig {
  readonly renderAgentId: number;
  readonly model: THREE.Object3D;
  readonly mixer: THREE.AnimationMixer;
  readonly clips: readonly THREE.AnimationClip[];
  readonly markers: CustomerMarkerTable;
  readonly walkCycleDistance: number;
  /** Uniform scale the host applied to the rig, so prop offsets stay in metres. */
  readonly modelScale?: number;
  getObject(name: string): THREE.Object3D | null;
  readonly removed?: boolean;
}

export interface CustomerRigPort {
  listRigs(): readonly CustomerRig[];
}

/**
 * Where feat-119 has actually put the body and the chair this frame. `phase` repeats the snapshot's
 * seating phase so a late-joining 3D view can rebuild the pose from one object.
 */
export interface CustomerSeatPose {
  readonly renderAgentId: number;
  readonly phase: SeatingPhase;
  /** Normalised position inside the seating clip; null lets the mixer own looping clips. */
  readonly clipPhase: number | null;
  /** Metres the body sits out from its layout chair position along the chair outward axis. */
  readonly outwardOffset: number;
  /** False when the space is too tight for PullChair/PushChair and the fallback pose is used. */
  readonly usesChairClips: boolean;
}

export interface CustomerPosePort {
  getSeatPose(renderAgentId: number): CustomerSeatPose | null;
}

/** Read-only slice of feat-116's table-service: the utensil must aim at the real dish. */
export interface CustomerTableServicePort {
  getDishPlacements(tableId?: string): readonly TableDishPlacementInfo[];
}

export interface UtensilSpec {
  readonly foodKind: FoodKind;
  readonly utensil: "spoon" | "fork" | "chopsticks";
  /** Handle length in metres (scripts/character-clips/customer-eat.mjs EAT_UTENSILS). */
  readonly length: number;
  /** Metres the handle slides into the palm so every tip reaches the same point. */
  readonly gripOffset: number;
}

export interface CustomerActionsOptions {
  readonly rigs: CustomerRigPort;
  readonly tableService?: CustomerTableServicePort | null;
  /** Pull-side seating port; `setSeatPose` pushes override it for the same customer. */
  readonly pose?: CustomerPosePort | null;
  readonly reducedMotion?: () => boolean;
}

/** What the feature decided for one customer this frame — read by feat-119/122/123. */
export interface CustomerActionReport {
  readonly renderAgentId: number;
  readonly clip: CustomerClipName | LegacyCustomerClipName;
  readonly requestedClip: CustomerClipName;
  readonly tier: "seating" | "eat" | "walk" | "base";
  readonly phase: number | null;
  readonly timeScale: number;
  readonly seated: boolean;
  readonly eating: boolean;
  /** Current blend of the customer-only eating grip, or null on older assets. */
  readonly gripWeight: number | null;
  readonly mealId: string | null;
  readonly utensil: UtensilSpec | null;
  /** Dish position in the customer's own frame (+y forward), from feat-116 when available. */
  readonly plateLocalOffset: PresentationPoint | null;
  /**
   * Metres the host would have to shift the seated body forward for the dish to land where the Eat
   * clip reaches it. feat-122 applies it; a large value means the table geometry cannot be served.
   */
  readonly plateForwardCorrection: number;
  readonly plateOutOfReach: boolean;
}
