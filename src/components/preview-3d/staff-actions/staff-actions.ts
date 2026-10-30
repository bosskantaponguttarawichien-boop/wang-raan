/**
 * feat-117 · The `staff-actions` scene feature: it drives each staff rig the host hands over and
 * attaches the props the carry/clean clips expect.
 *
 * Ownership rules this file keeps to (contract v1 §3–§4):
 * - The host owns the rig: position, rotation, scale and `mixer.update(delta)` stay with it, so the
 *   feature configures actions but never advances time. One-shot clips are positioned from
 *   simulation time every frame, so they are immune to mixer drift, pause and playback rate.
 * - The feature owns only the props it creates (cloth, collected plate) and disposes exactly those.
 *   The legacy tray belongs to the host, so only its `visible` flag is touched and it is restored.
 * - table-service is read-only: dishes and stains are never mutated here. A dish stops riding the
 *   tray once feat-116 reports it on the target table, which is why the food never blinks out.
 */
import * as THREE from "three";
import { objectCenter } from "@/core/layout";
import type { StoreLayout } from "@/core/layout/types";
import type { PresentationPoint, PresentationSnapshot } from "@/core/simulation/presentation-contract";
import type { SceneFeature, SceneFeatureContext, SceneFrame } from "../runtime/contracts";
import {
  type StaffActionsOptions,
  type StaffActionReport,
  type StaffClipName,
  type StaffMarkerTable,
  type StaffRig,
  type WipeFootprint,
} from "./contracts";
import {
  markerTime,
  resolveClipName,
  resolveStaffAction,
  type StaffActionDecision,
  wipeReach,
} from "./staff-action-controller";

/** Reach of the WipeTable sweep, mirroring WIPE_FOOTPRINT in scripts/character-clips/staff-clean.mjs. */
export const DEFAULT_WIPE_FOOTPRINT: WipeFootprint = Object.freeze({
  bounds: Object.freeze([-0.0498, 0.362, 0.3598, 0.59]) as unknown as readonly [number, number, number, number],
  radiusFar: 0.43,
});

/** Cloth and plate sizes follow the clip comments: cloth 30 mm thick, plate 25 mm. */
const CLOTH_SIZE = Object.freeze({ width: 0.17, height: 0.03, depth: 0.14 });
const PLATE_SIZE = Object.freeze({ radius: 0.105, height: 0.025 });
/** Inner palm surface in each hand's local frame. */
const PALM_LOCAL = Object.freeze({ x: -0.014, y: -0.065, z: 0.008 });

export interface StaffActionsFeature extends SceneFeature {
  /** What the feature decided for every rig in the last update — used by feat-122/123. */
  getReports(): readonly StaffActionReport[];
  getStats(): {
    readonly rigCount: number;
    readonly propMeshCount: number;
    readonly disposedGeometries: number;
    readonly disposedMaterials: number;
  };
}

interface RigState {
  rig: StaffRig;
  /** Actions this feature created, so release only stops what it started. */
  readonly actions: Map<string, THREE.AnimationAction>;
  active: THREE.AnimationAction | null;
  activeName: string | null;
  cloth: THREE.Mesh | null;
  plate: THREE.Mesh | null;
  trayVisibleBefore: boolean | null;
  lastPosition: THREE.Vector3 | null;
  groundSpeed: number;
}

const ZERO_SPEED_FRAME = 1e-4;

function clipOf(rig: StaffRig, name: string): THREE.AnimationClip | null {
  return rig.clips.find(clip => clip.name === name) ?? null;
}

function markersOf(rig: StaffRig): StaffMarkerTable {
  return rig.markers ?? {};
}

/**
 * Creates the staff-actions feature. Pass the host's rig port plus, when available, feat-116's
 * table-service; both stay injected so this lane never imports another lane's implementation.
 */
export function createStaffActionsFeature(options: StaffActionsOptions) {
  return (context: SceneFeatureContext): StaffActionsFeature => {
    const footprint = options.wipeFootprint ?? DEFAULT_WIPE_FOOTPRINT;
    const states = new Map<number, RigState>();
    const reports: StaffActionReport[] = [];
    const tableCenters = new Map<string, PresentationPoint>();
    let clothGeometry: THREE.BoxGeometry | null = null;
    let plateGeometry: THREE.CylinderGeometry | null = null;
    let clothMaterial: THREE.MeshStandardMaterial | null = null;
    let plateMaterial: THREE.MeshStandardMaterial | null = null;
    let disposedGeometries = 0;
    let disposedMaterials = 0;
    let disposed = false;

    const clothMesh = () => {
      clothGeometry ??= new THREE.BoxGeometry(CLOTH_SIZE.width, CLOTH_SIZE.height, CLOTH_SIZE.depth);
      clothMaterial ??= new THREE.MeshStandardMaterial({ color: 0x88adb8, roughness: 0.9 });
      const mesh = new THREE.Mesh(clothGeometry, clothMaterial);
      mesh.name = "StaffWipeCloth";
      return mesh;
    };
    const plateMesh = () => {
      plateGeometry ??= new THREE.CylinderGeometry(PLATE_SIZE.radius, PLATE_SIZE.radius * 0.82, PLATE_SIZE.height, 18);
      plateMaterial ??= new THREE.MeshStandardMaterial({ color: 0xf2f3f5, roughness: 0.45 });
      const mesh = new THREE.Mesh(plateGeometry, plateMaterial);
      mesh.name = "StaffCollectedPlate";
      return mesh;
    };

    /** Props hang off the hand bones, so they follow the authored palm path exactly. */
    const attachProp = (rig: StaffRig, mesh: THREE.Mesh, hand: "LeftHand" | "RightHand", lift: number) => {
      const bone = rig.getObject(hand);
      (bone ?? context.root).add(mesh);
      if (bone) {
        const side = hand === "RightHand" ? 1 : -1;
        // The hand mesh is thin along X; its inner surface faces -X on the right.
        mesh.position.set(side * (PALM_LOCAL.x - lift), PALM_LOCAL.y, PALM_LOCAL.z);
        mesh.rotation.z = -side * Math.PI / 2;
      }
      mesh.castShadow = false;
      return mesh;
    };

    const detachProp = (mesh: THREE.Mesh | null) => {
      mesh?.removeFromParent();
    };

    /** Gives the rig back to the host exactly as it was handed over. */
    const releaseRig = (state: RigState) => {
      for (const action of state.actions.values()) action.stop();
      state.actions.clear();
      state.active = null;
      state.activeName = null;
      detachProp(state.cloth);
      detachProp(state.plate);
      state.cloth = null;
      state.plate = null;
      if (state.rig.tray && state.trayVisibleBefore !== null) state.rig.tray.visible = state.trayVisibleBefore;
    };

    const stateFor = (rig: StaffRig): RigState => {
      let state = states.get(rig.staffId);
      if (state && state.rig.model === rig.model && state.rig.mixer === rig.mixer) {
        state.rig = rig;
        if (state.trayVisibleBefore === null && rig.tray) state.trayVisibleBefore = rig.tray.visible;
        return state;
      }
      if (state) releaseRig(state);
      state = {
        rig, actions: new Map(), active: null, activeName: null, cloth: null, plate: null,
        trayVisibleBefore: rig.tray ? rig.tray.visible : null,
        lastPosition: null, groundSpeed: 0,
      };
      states.set(rig.staffId, state);
      return state;
    };

    const actionFor = (state: RigState, name: string): THREE.AnimationAction | null => {
      const existing = state.actions.get(name);
      if (existing) return existing;
      const clip = clipOf(state.rig, name);
      if (!clip) return null;
      const action = state.rig.mixer.clipAction(clip);
      state.actions.set(name, action);
      return action;
    };

    const applyClip = (state: RigState, name: string, decision: StaffActionDecision) => {
      const action = actionFor(state, name);
      if (!action) return;
      if (state.activeName !== name) {
        // Carry and walk share the lower body; a crossfade would make the arms fight, so swap.
        if (!state.active) state.rig.mixer.stopAllAction();
        else if (state.active !== action) state.active.stop();
        action.reset();
        action.play();
        state.active = action;
        state.activeName = name;
      }
      action.setLoop(decision.loop ? THREE.LoopRepeat : THREE.LoopOnce, decision.loop ? Infinity : 1);
      action.clampWhenFinished = !decision.loop;
      action.setEffectiveWeight(1);
      action.setEffectiveTimeScale(decision.timeScale);
      action.enabled = true;
      if (decision.phase !== null) {
        // Simulation time owns the pose: no catch-up, no drift and pause freezes it in place.
        action.paused = true;
        action.time = Math.min(action.getClip().duration, Math.max(0, decision.phase * action.getClip().duration));
      } else {
        action.paused = decision.timeScale === 0;
      }
    };

    const syncProps = (state: RigState, decision: StaffActionDecision, trayVisible: boolean) => {
      const { rig } = state;
      if (rig.tray) rig.tray.visible = trayVisible;
      if (decision.props.cloth) state.cloth ??= attachProp(rig, clothMesh(), "RightHand", CLOTH_SIZE.height / 2);
      else {
        detachProp(state.cloth);
        state.cloth = null;
      }
      if (decision.props.collectedPlate) state.plate ??= attachProp(rig, plateMesh(), "LeftHand", PLATE_SIZE.height / 2);
      else {
        detachProp(state.plate);
        state.plate = null;
      }
    };

    /** Ground speed of the drawn model, so CarryWalk/Walk never cycle while the rig stands still. */
    const measureSpeed = (state: RigState, deltaSeconds: number) => {
      const position = state.rig.model.position;
      if (!state.lastPosition) {
        state.lastPosition = position.clone();
        return 0;
      }
      const moved = Math.hypot(position.x - state.lastPosition.x, position.z - state.lastPosition.z);
      state.lastPosition.copy(position);
      if (deltaSeconds <= ZERO_SPEED_FRAME) return state.groundSpeed;
      state.groundSpeed = moved / deltaSeconds;
      return state.groundSpeed;
    };

    const updateFrom = (snapshot: PresentationSnapshot, frame: SceneFrame) => {
      const rigs = options.rigs.listRigs();
      const live = new Set<number>();
      const reducedMotion = options.reducedMotion?.() ?? false;
      // ความเร็วเดินวัดเป็นเมตรต่อวินาทีจริง เพราะ mixer เดินด้วยเวลาจริง — ขาก้าวพอดีกับระยะที่เลื่อนบนจอ
      // แม้ภาพเดินช้ากว่าเวลาจำลองที่เร่งอยู่ (เวลาย่อแบบเกม)
      const deltaSeconds = Math.max(0, frame.realDeltaSeconds);
      const milestones = new Map(snapshot.milestones.map(entry => [entry.taskId, entry]));
      for (const rig of rigs) {
        if (rig.removed) continue;
        const staff = snapshot.staff.find(member => member.staffId === rig.staffId);
        if (!staff) continue;
        live.add(rig.staffId);
        const state = stateFor(rig);
        const walkClip = clipOf(rig, "Walk");
        const decision = resolveStaffAction({
          staff,
          simTimeSeconds: snapshot.simTimeSeconds,
          milestones: staff.taskId ? milestones.get(staff.taskId) ?? null : null,
          groundSpeed: measureSpeed(state, deltaSeconds),
          reducedMotion,
          walkCycleDistance: rig.walkCycleDistance,
          walkClipDuration: walkClip?.duration ?? 0.95,
          markers: markersOf(rig),
        });
        const available = rig.clips.map(clip => clip.name);
        const resolved = resolveClipName(decision.clip, available);
        if (resolved) applyClip(state, resolved, decision);

        // The tray keeps the food until feat-116 actually shows that dish on the target table,
        // so a slow asset load can never make a meal disappear between the hand and the tabletop.
        const placed = decision.tableId && options.tableService
          ? new Set(options.tableService.getDishPlacements(decision.tableId).map(dish => dish.mealId))
          : new Set<string>();
        const pending = staff.carryMealIds.filter(mealId => !placed.has(mealId));
        const trayVisible = decision.props.tray && (!decision.props.dishReleased || pending.length > 0);
        syncProps(state, decision, trayVisible);

        const reach = wipeReach(
          staff.servicePoint,
          decision.tableId ? tableCenters.get(decision.tableId) ?? null : null,
          footprint.radiusFar,
        );
        const wiping = decision.clip === "WipeTable";
        reports.push({
          staffId: rig.staffId,
          clip: (resolved ?? decision.clip) as StaffClipName,
          requestedClip: decision.clip,
          tier: decision.tier,
          phase: decision.phase,
          timeScale: decision.timeScale,
          taskId: decision.taskId,
          tableId: decision.tableId,
          serviceCycleId: decision.serviceCycleId,
          trayMealIds: decision.props.dishReleased ? pending : decision.props.trayMealIds,
          wipeProgress: decision.props.wipeProgress,
          dishReleased: decision.props.dishReleased,
          wipeServicePoint: wiping ? reach.point : null,
          wipeOutOfReach: wiping && reach.outOfReach,
        });
      }
      // A cancelled staff member or a fresh run drops its rig state; nothing is left half-posed.
      for (const [staffId, state] of states) if (!live.has(staffId)) {
        releaseRig(state);
        states.delete(staffId);
      }
    };

    const feature: StaffActionsFeature = {
      syncLayout(layout: StoreLayout) {
        tableCenters.clear();
        for (const object of layout.objects) {
          if (object.type !== "table") continue;
          tableCenters.set(object.id, objectCenter(object));
        }
      },
      update(frame: SceneFrame) {
        if (disposed) return;
        reports.length = 0;
        const snapshot = frame.presentation;
        if (!frame.simulating || !snapshot) {
          // Legacy worker or edit mode: hand everything back rather than guessing a pose.
          if (states.size) {
            for (const state of states.values()) releaseRig(state);
            states.clear();
          }
          return;
        }
        updateFrom(snapshot, frame);
      },
      reset() {
        reports.length = 0;
        for (const state of states.values()) releaseRig(state);
        states.clear();
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        feature.reset();
        for (const geometry of [clothGeometry, plateGeometry]) {
          if (!geometry) continue;
          geometry.dispose();
          disposedGeometries += 1;
        }
        for (const material of [clothMaterial, plateMaterial]) {
          if (!material) continue;
          material.dispose();
          disposedMaterials += 1;
        }
        clothGeometry = null;
        plateGeometry = null;
        clothMaterial = null;
        plateMaterial = null;
        context.root.clear();
      },
      getReports: () => reports,
      getStats: () => ({
        rigCount: states.size,
        propMeshCount: [...states.values()].reduce((total, state) => total + (state.cloth ? 1 : 0) + (state.plate ? 1 : 0), 0),
        disposedGeometries,
        disposedMaterials,
      }),
    };
    return feature;
  };
}

/** Marker times of the published staff clips, for callers that only need the timing table. */
export function staffMarkerTimes(markers: StaffMarkerTable) {
  return {
    pickUpFoodContact: markerTime(markers, "PickUp", "food-contact", 0.58),
    putDownHandContact: markerTime(markers, "PutDown", "hand-contact", 0.26),
    putDownFoodContact: markerTime(markers, "PutDown", "food-contact", 0.62),
    wipeHandContact: markerTime(markers, "WipeTable", "hand-contact", 0.12),
    wipeContact: markerTime(markers, "WipeTable", "wipe-contact", 0.3),
    wipeClearComplete: markerTime(markers, "WipeTable", "clear-complete", 0.82),
  };
}
