/**
 * feat-119 · Typed ports for the seating scene feature.
 *
 * The host owns the chair meshes and the customer models; this lane owns where along the chair's
 * outward axis each of them belongs this frame. It publishes `CustomerSeatPose` (the type feat-118
 * defined) so customer-actions can pull the pose without either lane importing the other's
 * implementation.
 */
import type * as THREE from "three";
import type { Point } from "@/core/layout/types";
import type { CustomerSeatPose } from "../customer-actions";
import type { SeatSequencePhase } from "./seat-sequence";

/** One chair mesh the host built from the layout. The feature only moves it along its own axis. */
export interface ChairRig {
  readonly chairId: string;
  readonly object: THREE.Object3D;
  /** Scene position of the chair as the layout places it; the feature always returns it here. */
  readonly home: { readonly x: number; readonly y: number; readonly z: number };
  readonly removed?: boolean;
}

export interface ChairRigPort {
  listChairs(): readonly ChairRig[];
}

export interface SeatingOptions {
  readonly chairs: ChairRigPort;
  /** prefers-reduced-motion: the chair and the body move to their end states without travelling. */
  readonly reducedMotion?: () => boolean;
}

/** Where the host should draw one customer's body this frame. */
export interface SeatBodyPlacement {
  readonly renderAgentId: number;
  readonly chairId: string;
  /** Layout point for the body, already offset along the chair's outward axis. */
  readonly point: Point;
  /** Metres out from the layout chair position. */
  readonly outwardOffset: number;
  /** Direction the body faces, towards the table. */
  readonly facing: Point;
  readonly seated: boolean;
}

export interface SeatingReport {
  readonly renderAgentId: number;
  readonly chairId: string;
  readonly tableId: string | null;
  readonly phase: SeatSequencePhase;
  readonly clipPhase: number | null;
  readonly chairPull: number;
  readonly outwardOffset: number;
  readonly effectivePull: number;
  readonly usesChairClips: boolean;
  readonly handOnBackrest: boolean;
  readonly bodyClear: boolean;
  /** What limited the pull distance, when anything did. */
  readonly blockedBy: string | null;
}

export type { CustomerSeatPose };
