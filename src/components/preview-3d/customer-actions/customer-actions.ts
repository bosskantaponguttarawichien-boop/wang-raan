/**
 * feat-118 · The `customer-actions` scene feature: it drives each customer rig the host hands over,
 * holds the utensil the menu calls for, and starts eating only when the engine, the seating pose and
 * the dish agree.
 *
 * Ownership rules (contract v1 §3–§4):
 * - The host owns the rig: position, rotation, scale and `mixer.update(delta)` stay with it. Clip
 *   time is written from simulation time every frame, so pause freezes the pose and playback rate
 *   cannot desynchronise it.
 * - The feature owns only the utensils it builds and disposes exactly those.
 * - table-service is read-only. It is consulted so the utensil aims at the dish that is really on
 *   the table, and so feat-122 learns how far the seated body still has to shift.
 */
import * as THREE from "three";
import type { StoreLayout } from "@/core/layout/types";
import type { MealPresentation, PresentationPoint, PresentationSnapshot } from "@/core/simulation/presentation-contract";
import type { SceneFeature, SceneFeatureContext, SceneFrame } from "../runtime/contracts";
import type {
  CustomerActionReport,
  CustomerActionsOptions,
  CustomerClipName,
  CustomerMarkerTable,
  CustomerRig,
  CustomerSeatPose,
  UtensilSpec,
} from "./contracts";
import {
  EAT_CLIP_SECONDS,
  EAT_TIP_REACH,
  plateReach,
  resolveClipName,
  resolveCustomerAction,
  seedFromRevision,
  type CustomerActionDecision,
} from "./customer-action-controller";

/** Palm-surface offset inside the Hand bone, shared by every clip provider. */
const PALM_LOCAL = Object.freeze({ x: -0.0099, y: -0.0864, z: -0.0253 });
/** The Eat clip points the handle along the hand's local −Y, from the palm towards the tip. */
const HANDLE_AXIS_SIGN = -1;
const HANDLE_RADIUS = 0.0045;

export interface CustomerActionsFeature extends SceneFeature {
  /** feat-119 pushes the pose it drew this frame; it overrides the pull port for that customer. */
  setSeatPose(pose: CustomerSeatPose): void;
  clearSeatPose(renderAgentId: number): void;
  getReports(): readonly CustomerActionReport[];
  getStats(): {
    readonly rigCount: number;
    readonly utensilCount: number;
    readonly utensilTemplateCount: number;
    readonly disposedGeometries: number;
    readonly disposedMaterials: number;
  };
}

interface RigState {
  rig: CustomerRig;
  readonly actions: Map<string, THREE.AnimationAction>;
  active: THREE.AnimationAction | null;
  activeName: string | null;
  utensil: THREE.Object3D | null;
  utensilKind: UtensilSpec["utensil"] | null;
  lastPosition: THREE.Vector3 | null;
  groundSpeed: number;
  /** ผิวตัวที่มี morph "EatGrip" — หาไว้ครั้งเดียวต่อ rig ไม่ไล่ชื่อทุกเฟรม */
  gripBody?: THREE.SkinnedMesh | null;
  gripIndex?: number;
}

const ZERO_SPEED_FRAME = 1e-4;

function markersOf(rig: CustomerRig): CustomerMarkerTable {
  return rig.markers ?? {};
}

export function createCustomerActionsFeature(options: CustomerActionsOptions) {
  return (context: SceneFeatureContext): CustomerActionsFeature => {
    const states = new Map<number, RigState>();
    const pushedPoses = new Map<number, CustomerSeatPose>();
    const reports: CustomerActionReport[] = [];
    const chairRotations = new Map<string, number>();
    const geometries: THREE.BufferGeometry[] = [];
    const materials: THREE.Material[] = [];
    const templates = new Map<UtensilSpec["utensil"], THREE.Object3D>();
    let disposedGeometries = 0;
    let disposedMaterials = 0;
    let disposed = false;
    let animationTime: number | null = null;
    let animationRun: string | null = null;

    // Follow the latest worker time from behind, spreading each tick over render frames.
    // The worker remains authoritative; never predict a future bite or replay a long pause.
    const smoothAnimationTime = (snapshot: PresentationSnapshot, frame: SceneFrame) => {
      const target = snapshot.simTimeSeconds;
      const rate = Math.max(0, frame.playbackRate);
      if (animationRun !== snapshot.runId || animationTime === null || target < animationTime || target - animationTime > Math.max(0.5 * rate, 0.5)) {
        animationRun = snapshot.runId;
        animationTime = target;
      } else if (!frame.paused) {
        animationTime = Math.min(target, animationTime + Math.max(0, frame.realDeltaSeconds) * rate);
      }
      return animationTime;
    };

    const keep = <T extends THREE.BufferGeometry>(geometry: T) => {
      geometries.push(geometry);
      return geometry;
    };
    const metal = () => {
      const material = new THREE.MeshStandardMaterial({ color: 0xcfd6de, roughness: 0.32, metalness: 0.55 });
      materials.push(material);
      return material;
    };
    const wood = () => {
      const material = new THREE.MeshStandardMaterial({ color: 0xb6896a, roughness: 0.74 });
      materials.push(material);
      return material;
    };

    /**
     * Builds one utensil in hand-local space: the handle runs along −Y from the palm, so the tip
     * lands exactly EAT_TIP_REACH away — the distance the Eat clip locks for every menu.
     */
    const buildUtensil = (spec: UtensilSpec): THREE.Object3D => {
      const existing = templates.get(spec.utensil);
      if (existing) return existing.clone(true);
      const group = new THREE.Group();
      group.name = `CustomerUtensil-${spec.utensil}`;
      const tipY = HANDLE_AXIS_SIGN * EAT_TIP_REACH;
      const centreY = HANDLE_AXIS_SIGN * (EAT_TIP_REACH - spec.length / 2);
      if (spec.utensil === "chopsticks") {
        const stick = keep(new THREE.CylinderGeometry(HANDLE_RADIUS * 0.7, HANDLE_RADIUS * 0.45, spec.length, 6));
        const material = wood();
        for (const offset of [-0.008, 0.008]) {
          const mesh = new THREE.Mesh(stick, material);
          mesh.position.set(offset, centreY, 0);
          group.add(mesh);
        }
      } else {
        const handle = keep(new THREE.CylinderGeometry(HANDLE_RADIUS, HANDLE_RADIUS * 0.8, spec.length, 8));
        const material = metal();
        const shaft = new THREE.Mesh(handle, material);
        shaft.position.set(0, centreY, 0);
        group.add(shaft);
        const head = spec.utensil === "spoon"
          ? new THREE.Mesh(keep(new THREE.SphereGeometry(0.019, 10, 6)), material)
          : new THREE.Mesh(keep(new THREE.BoxGeometry(0.026, 0.03, 0.004)), material);
        if (spec.utensil === "spoon") head.scale.set(1, 0.42, 1.25);
        head.position.set(0, tipY + HANDLE_AXIS_SIGN * -0.012, 0);
        group.add(head);
      }
      templates.set(spec.utensil, group);
      return group.clone(true);
    };

    const releaseRig = (state: RigState) => {
      setGrip(state, false);
      state.gripBody = undefined;
      state.gripIndex = undefined;
      for (const action of state.actions.values()) action.stop();
      state.actions.clear();
      state.active = null;
      state.activeName = null;
      state.utensil?.removeFromParent();
      state.utensil = null;
      state.utensilKind = null;
    };

    /**
     * เปิด/ปิด morph "EatGrip" ของผิวตัว — จำ mesh ที่หาได้ไว้ใน state
     * (การไล่หาชื่อในทุกเฟรมคือการเดินทั้ง subtree ของตัวละคร คูณจำนวนลูกค้าในร้าน)
     */
    const setGrip = (state: RigState, eating: boolean): number | null => {
      if (state.gripBody === undefined) {
        const found = state.rig.getObject("MannequinBody");
        const body = found instanceof THREE.SkinnedMesh ? found : null;
        state.gripBody = body;
        state.gripIndex = body?.morphTargetDictionary?.EatGrip;
      }
      const body = state.gripBody;
      const index = state.gripIndex;
      if (!body || index === undefined || !body.morphTargetInfluences) return null;
      const weight = eating ? 1 : 0;
      if (body.morphTargetInfluences[index] !== weight) body.morphTargetInfluences[index] = weight;
      return weight;
    };

    const stateFor = (rig: CustomerRig): RigState => {
      const existing = states.get(rig.renderAgentId);
      if (existing && existing.rig.model === rig.model && existing.rig.mixer === rig.mixer) {
        existing.rig = rig;
        return existing;
      }
      if (existing) releaseRig(existing);
      const state: RigState = {
        rig, actions: new Map(), active: null, activeName: null,
        utensil: null, utensilKind: null, lastPosition: null, groundSpeed: 0,
      };
      states.set(rig.renderAgentId, state);
      return state;
    };

    const actionFor = (state: RigState, name: string): THREE.AnimationAction | null => {
      const existing = state.actions.get(name);
      if (existing) return existing;
      const clip = state.rig.clips.find(candidate => candidate.name === name);
      if (!clip) return null;
      const action = state.rig.mixer.clipAction(clip);
      state.actions.set(name, action);
      return action;
    };

    const applyClip = (state: RigState, name: string, decision: CustomerActionDecision) => {
      const action = actionFor(state, name);
      if (!action) return;
      if (state.activeName !== name) {
        // Eat and the seating clips each own the hips and legs; blending them would fight.
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
        action.paused = true;
        action.time = Math.min(action.getClip().duration, Math.max(0, decision.phase * action.getClip().duration));
      } else {
        action.paused = decision.timeScale === 0;
      }
    };

    const syncUtensil = (state: RigState, utensil: UtensilSpec | null) => {
      if (!utensil) {
        state.utensil?.removeFromParent();
        state.utensil = null;
        state.utensilKind = null;
        return;
      }
      if (state.utensil && state.utensilKind === utensil.utensil) return;
      state.utensil?.removeFromParent();
      const object = buildUtensil(utensil);
      const hand = state.rig.getObject("RightHand");
      const anchor = state.rig.getObject("EatUtensilAnchor");
      (anchor ?? hand ?? context.root).add(object);
      if (!anchor && hand) object.position.set(PALM_LOCAL.x, PALM_LOCAL.y, PALM_LOCAL.z);
      // Move the spoon towards the index-finger side without changing the arm animation.
      if (utensil.utensil === "spoon") object.position.z += 0.025;
      state.utensil = object;
      state.utensilKind = utensil.utensil;
    };

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

    /**
     * Dish position in the customer's own frame: `y` is how far in front of the chest the plate
     * really sits, `x` is the lateral offset along the model's local +X. The model faces its local
     * +Z, which a yaw of `theta` sends to (sin theta, cos theta) in the scene.
     */
    const plateOffset = (rig: CustomerRig, chairId: string | null, meal: MealPresentation | null): PresentationPoint | null => {
      if (!meal || !options.tableService) return null;
      const dish = options.tableService.getDishPlacements(meal.tableId).find(entry => entry.mealId === meal.mealId);
      if (!dish) return null;
      const facing = chairId !== null ? chairRotations.get(chairId) : undefined;
      const yaw = facing ?? rig.model.rotation.y;
      const dx = dish.worldPosition.x - rig.model.position.x;
      const dz = dish.worldPosition.z - rig.model.position.z;
      return {
        x: Number((dx * Math.cos(yaw) - dz * Math.sin(yaw)).toFixed(4)),
        y: Number((dx * Math.sin(yaw) + dz * Math.cos(yaw)).toFixed(4)),
      };
    };

    const updateFrom = (snapshot: PresentationSnapshot, frame: SceneFrame) => {
      const rigs = options.rigs.listRigs();
      const live = new Set<number>();
      const reducedMotion = options.reducedMotion?.() ?? false;
      // ความเร็วเดินวัดเป็นเมตรต่อวินาทีจริง เพราะ mixer เดินด้วยเวลาจริง — ขาก้าวพอดีกับระยะที่เลื่อนบนจอ
      // แม้ภาพเดินช้ากว่าเวลาจำลองที่เร่งอยู่ (เวลาย่อแบบเกม)
      const deltaSeconds = Math.max(0, frame.realDeltaSeconds);
      const visualTime = smoothAnimationTime(snapshot, frame);
      const seed = seedFromRevision(snapshot.layoutRevision);
      const meals = new Map(snapshot.meals.map(meal => [meal.mealId, meal]));
      for (const rig of rigs) {
        if (rig.removed) continue;
        const customer = snapshot.customers.find(entry => entry.renderAgentId === rig.renderAgentId);
        if (!customer) continue;
        live.add(rig.renderAgentId);
        const state = stateFor(rig);
        const meal = customer.mealId ? meals.get(customer.mealId) ?? null : null;
        const seatPose = pushedPoses.get(rig.renderAgentId) ?? options.pose?.getSeatPose(rig.renderAgentId) ?? null;
        const eatClip = rig.clips.find(clip => clip.name === "Eat");
        const walkClip = rig.clips.find(clip => clip.name === "Walk");
        const decision = resolveCustomerAction({
          customer, meal, seatPose,
          simTimeSeconds: meal?.placedAtSeconds !== null && meal?.placedAtSeconds !== undefined && meal.placedAtSeconds <= snapshot.simTimeSeconds
            ? Math.max(visualTime, meal.placedAtSeconds) : visualTime,
          seed,
          groundSpeed: measureSpeed(state, deltaSeconds),
          reducedMotion,
          walkCycleDistance: rig.walkCycleDistance,
          walkClipDuration: walkClip?.duration ?? 0.95,
          // เร่งเวลาแล้วคำที่กินไม่รัว: หนึ่งคำกินเวลาจำลองนานขึ้นตามที่ยืด
          eatClipDuration: (eatClip?.duration ?? EAT_CLIP_SECONDS) * Math.max(1, frame.clipStretch ?? 1),
          markers: markersOf(rig),
        });
        const available = rig.clips.map(clip => clip.name);
        const resolved = resolveClipName(decision.clip, available);
        if (resolved) applyClip(state, resolved, decision);
        // The utensil only exists while a bite is actually being taken.
        syncUtensil(state, decision.eating ? decision.utensil : null);
        const gripWeight = setGrip(state, decision.eating);

        const offset = decision.eating ? plateOffset(rig, customer.chairId, meal) : null;
        const reach = plateReach(offset ? offset.y : null);
        reports.push({
          renderAgentId: rig.renderAgentId,
          clip: (resolved ?? decision.clip) as CustomerClipName,
          requestedClip: decision.clip,
          tier: decision.tier,
          phase: decision.phase,
          timeScale: decision.timeScale,
          seated: decision.seated,
          eating: decision.eating,
          gripWeight,
          mealId: decision.mealId,
          utensil: decision.utensil,
          plateLocalOffset: offset,
          plateForwardCorrection: reach.correction,
          plateOutOfReach: reach.outOfReach,
        });
      }
      for (const [renderAgentId, state] of states) if (!live.has(renderAgentId)) {
        releaseRig(state);
        states.delete(renderAgentId);
        pushedPoses.delete(renderAgentId);
      }
    };

    const feature: CustomerActionsFeature = {
      syncLayout(layout: StoreLayout) {
        chairRotations.clear();
        for (const object of layout.objects) {
          if (object.type !== "chair") continue;
          // Layout rotation 0 faces north, which is scene −z; the matching model yaw is pi − rot.
          chairRotations.set(object.id, Math.PI - THREE.MathUtils.degToRad(object.rotation));
        }
      },
      update(frame: SceneFrame) {
        if (disposed) return;
        reports.length = 0;
        const snapshot = frame.presentation;
        if (!frame.simulating || !snapshot) {
          if (states.size) {
            for (const state of states.values()) releaseRig(state);
            states.clear();
          }
          pushedPoses.clear();
          return;
        }
        updateFrom(snapshot, frame);
      },
      setSeatPose(pose: CustomerSeatPose) {
        pushedPoses.set(pose.renderAgentId, pose);
      },
      clearSeatPose(renderAgentId: number) {
        pushedPoses.delete(renderAgentId);
      },
      reset() {
        reports.length = 0;
        animationTime = null;
        animationRun = null;
        for (const state of states.values()) releaseRig(state);
        states.clear();
        pushedPoses.clear();
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        feature.reset();
        templates.clear();
        for (const geometry of geometries) {
          geometry.dispose();
          disposedGeometries += 1;
        }
        for (const material of materials) {
          material.dispose();
          disposedMaterials += 1;
        }
        geometries.length = 0;
        materials.length = 0;
        context.root.clear();
      },
      getReports: () => reports,
      getStats: () => ({
        rigCount: states.size,
        utensilCount: [...states.values()].filter(state => state.utensil !== null).length,
        utensilTemplateCount: templates.size,
        disposedGeometries,
        disposedMaterials,
      }),
    };
    return feature;
  };
}
