/**
 * feat-117 · Typed ports for the staff-actions scene feature.
 *
 * The feature owns no characters and no dishes: the host (feat-122) supplies the staff rigs it
 * already builds, and feat-116's table-service is injected read-only. Everything here is a port,
 * so the lane never imports another lane's private implementation (contract v1 §4).
 */
import type * as THREE from "three";
import type { PresentationPoint } from "@/core/simulation/presentation-contract";
import type { TableDishPlacementInfo, TableStainClusterInfo } from "../table-service";

/** Clip names present in cafe-staff[-lite].glb after feat-109/111 registration. */
export const STAFF_CLIP_NAMES = ["Idle", "Walk", "Sit", "Work", "CarryIdle", "CarryWalk", "PickUp", "PutDown", "WipeTable"] as const;
export type StaffClipName = typeof STAFF_CLIP_NAMES[number];

/** Clips a pre-feat-109 asset is guaranteed to have; used when the new clips are missing. */
export const LEGACY_STAFF_CLIP_NAMES = ["Idle", "Walk", "Sit", "Work"] as const;
export type LegacyStaffClipName = typeof LEGACY_STAFF_CLIP_NAMES[number];

export interface ClipMarker {
  readonly name: string;
  /** Normalised [0, 1] position inside the clip — never a mixer-finished callback. */
  readonly time: number;
}

/** `CafeMannequin.userData.animationMarkers` as written by scripts/model-generation/build.mjs. */
export type StaffMarkerTable = Readonly<Record<string, readonly ClipMarker[]>>;

/**
 * One staff character the host already placed in the scene. The feature reads the rig, drives the
 * mixer and parents props to it; it never moves, rotates, scales or disposes the model.
 */
export interface StaffRig {
  readonly staffId: number;
  readonly model: THREE.Object3D;
  readonly mixer: THREE.AnimationMixer;
  readonly clips: readonly THREE.AnimationClip[];
  readonly markers: StaffMarkerTable;
  /** Metres covered by one Walk cycle at timeScale 1 (userData.walkCycleDistance × scale). */
  readonly walkCycleDistance: number;
  /** Legacy tray parented to the model root; the feature only toggles visibility. */
  readonly tray: THREE.Object3D | null;
  /** Bone/object lookup inside the rig for prop anchoring. */
  getObject(name: string): THREE.Object3D | null;
  /** True once the host released the rig; the feature then drops its per-rig state. */
  readonly removed?: boolean;
}

export interface StaffRigPort {
  /** Rigs alive this frame, in any order. */
  listRigs(): readonly StaffRig[];
}

/** Read-only slice of feat-116's TableServiceFeature. The feature never mutates dishes or stains. */
export interface TableServicePort {
  getDishPlacements(tableId?: string): readonly TableDishPlacementInfo[];
  getTableStainInfo(tableId: string): TableStainClusterInfo | null;
}

/** Reach envelope of the WipeTable clip in model space (scripts/character-clips/staff-clean.mjs). */
export interface WipeFootprint {
  /** [xMin, xMax, zMin, zMax] relative to the staff member, +Z forward. */
  readonly bounds: readonly [number, number, number, number];
  readonly radiusFar: number;
}

export interface StaffActionsOptions {
  readonly rigs: StaffRigPort;
  readonly tableService?: TableServicePort | null;
  /** prefers-reduced-motion: states still change, continuous motion does not play. */
  readonly reducedMotion?: () => boolean;
  readonly wipeFootprint?: WipeFootprint;
}

/** What the feature decided this frame — read by feat-122/123 for wiring and evidence. */
export interface StaffActionReport {
  readonly staffId: number;
  readonly clip: StaffClipName | LegacyStaffClipName;
  readonly requestedClip: StaffClipName;
  readonly tier: "task" | "carry" | "walk" | "base";
  readonly phase: number | null;
  readonly timeScale: number;
  readonly taskId: string | null;
  readonly tableId: string | null;
  readonly serviceCycleId: string | null;
  readonly trayMealIds: readonly string[];
  readonly wipeProgress: number;
  readonly dishReleased: boolean;
  /** Service point actually used for wiping, null when nothing in reach was offered. */
  readonly wipeServicePoint: PresentationPoint | null;
  readonly wipeOutOfReach: boolean;
}
