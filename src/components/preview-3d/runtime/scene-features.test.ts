import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { StoreLayout } from "@/core/layout/types";
import type { CustomerPresentation, MealPresentation, PresentationSnapshot, StaffPresentation, TablePresentation } from "@/core/simulation/presentation-contract";
import { SCENE_FEATURE_IDS, type SceneFrame } from "./contracts";
import { createSceneRuntime } from "./scene-runtime";
import { createSceneFeatureFactories } from "./scene-features";

function buildLayout(): StoreLayout {
  return {
    id: "layout-1", version: 1, units: "m", width: 10, depth: 10, entrance: null, kitchenDoor: null,
    objects: [
      { id: "table-1", type: "table", x: 3.5, y: 3.5, width: 1.2, depth: 1.2, rotation: 0, chairIds: ["chair-1"] },
      { id: "chair-1", type: "chair", x: 3.85, y: 4.6, width: 0.5, depth: 0.5, rotation: 0, tableId: "table-1" },
    ],
  } as unknown as StoreLayout;
}

const CLIPS = { Idle: 6, Walk: 0.95, Sit: 0.9, Work: 8, CarryIdle: 6, CarryWalk: 0.95, PickUp: 1.2, PutDown: 1.4, WipeTable: 4, Eat: 3.2, PullChair: 1.1, SitDown: 0.9, PushChair: 0.9, StandUp: 0.9 };

function buildRig(names: readonly string[]) {
  const model = new THREE.Group();
  const hips = new THREE.Bone();
  hips.name = "Hips";
  for (const name of ["LeftHand", "RightHand"]) {
    const bone = new THREE.Bone();
    bone.name = name;
    hips.add(bone);
  }
  model.add(hips);
  const tray = new THREE.Group();
  tray.name = "Tray";
  tray.visible = false;
  model.add(tray);
  const clips = names.map(name => new THREE.AnimationClip(name, CLIPS[name as keyof typeof CLIPS] ?? 1, [
    new THREE.QuaternionKeyframeTrack("Hips.quaternion", [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
  ]));
  return { model, tray, mixer: new THREE.AnimationMixer(model), clips, getObject: (name: string) => model.getObjectByName(name) ?? null };
}

function buildHost() {
  const layout = buildLayout();
  const staffRig = buildRig(["Idle", "Walk", "Sit", "Work", "CarryIdle", "CarryWalk", "PickUp", "PutDown", "WipeTable"]);
  const customerRig = buildRig(["Idle", "Walk", "Sit", "Eat", "PullChair", "SitDown", "PushChair", "StandUp"]);
  const chairObject = new THREE.Group();
  chairObject.position.set(4.1, 0, 4.85);
  return {
    layout, staffRig, customerRig, chairObject,
    host: {
      staffRigs: {
        listRigs: () => [{
          staffId: 1, model: staffRig.model, mixer: staffRig.mixer, clips: staffRig.clips,
          markers: {}, walkCycleDistance: 0.9, tray: staffRig.tray, getObject: staffRig.getObject,
        }],
      },
      customerRigs: {
        listRigs: () => [{
          renderAgentId: 10, model: customerRig.model, mixer: customerRig.mixer, clips: customerRig.clips,
          markers: {}, walkCycleDistance: 0.9, getObject: customerRig.getObject,
        }],
      },
      chairRigs: {
        listChairs: () => [{ chairId: "chair-1", object: chairObject, home: { x: 4.1, y: 0, z: 4.85 } }],
      },
      reducedMotion: () => false,
      tableService: { disableNetworkLoad: true },
    },
  };
}

function buildContext() {
  return {
    scene: new THREE.Scene(),
    camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100),
    getLayout: () => null,
    getQuality: () => ({ characterShadows: true, shadowMapSize: 1024, maxPixelRatio: 1 }) as never,
    invalidate: () => {},
    invalidateShadows: () => {},
  };
}

function snapshot(simTimeSeconds: number, sequence: number, overrides: {
  customer?: Partial<CustomerPresentation>;
  staff?: Partial<StaffPresentation>;
  table?: Partial<TablePresentation>;
  meal?: Partial<MealPresentation> | null;
} = {}): PresentationSnapshot {
  const meal: MealPresentation | null = overrides.meal === null ? null : {
    mealId: "meal-1", ownerRenderAgentId: 10, tableId: "table-1", chairId: "chair-1", serviceCycleId: "cycle-1",
    foodKind: "fried-rice", anchor: { x: 0, y: 0.3 }, progress: "full", consumed: 0, placedAtSeconds: 100,
    ...overrides.meal,
  };
  return {
    version: 1, runId: "run-1", layoutRevision: "rev-1", sequence, simTimeSeconds,
    customers: [{
      renderAgentId: 10, partyId: 1, memberIndex: 0, tableId: "table-1", chairId: "chair-1",
      serviceCycleId: "cycle-1", activity: "eating", seatingPhase: "seated", walkMetersPerSecond: 1.2,
      mealId: "meal-1", ...overrides.customer,
    }],
    meals: meal ? [meal] : [],
    tables: [{
      tableId: "table-1", serviceCycleId: "cycle-1", availability: "occupied", surface: "eating",
      mealIds: meal ? [meal.mealId] : [], stainAmount: 0, wipeProgress: 0, cleanCompletedAtSeconds: null,
      ...overrides.table,
    }],
    staff: [{
      staffId: 1, taskId: "task-1", taskKind: "deliver", tableId: "table-1", serviceCycleId: "cycle-1",
      activity: "counter", walkMetersPerSecond: 1.2, carryMealIds: [], servicePoint: null,
      phaseStartedAtSeconds: 0, phaseEndsAtSeconds: 10, ...overrides.staff,
    }],
    milestones: [],
  };
}

function frameOf(presentation: PresentationSnapshot | undefined, delta = 1 / 60): SceneFrame {
  return { nowMs: 0, realDeltaSeconds: delta, playbackRate: 1, simulating: true, paused: false, presentation };
}

describe("scene feature wiring", () => {
  it("installs the five implemented features and leaves the food slot a no-op", () => {
    const { host } = buildHost();
    const handles = createSceneFeatureFactories(host);
    expect(Object.keys(handles.factories).sort()).toEqual(
      ["customer-actions", "lighting", "seating", "staff-actions", "table-service"],
    );
    expect(handles.factories.food).toBeUndefined();
    // Every id the contract defines still exists, so the runtime fills the gap with a no-op.
    expect(SCENE_FEATURE_IDS).toContain("food");
  });

  it("resolves each feature handle once the runtime builds it", () => {
    const { host, layout } = buildHost();
    const handles = createSceneFeatureFactories(host);
    const runtime = createSceneRuntime(buildContext(), handles.factories);
    expect(handles.tableService).not.toBeNull();
    expect(handles.staffActions).not.toBeNull();
    expect(handles.customerActions).not.toBeNull();
    expect(handles.seating).not.toBeNull();
    expect(handles.lighting).not.toBeNull();
    runtime.syncLayout(layout);
    runtime.dispose();
  });

  it("runs a whole serve → eat → stain → wipe cycle across the wired features", () => {
    const { host, layout, customerRig, staffRig, chairObject } = buildHost();
    const handles = createSceneFeatureFactories(host);
    const runtime = createSceneRuntime(buildContext(), handles.factories);
    runtime.syncLayout(layout);

    // 1. Staff carries the dish to the table.
    runtime.update(frameOf(snapshot(90, 1, {
      staff: { activity: "carrying", carryMealIds: ["meal-1"] },
      meal: { placedAtSeconds: null },
      table: { surface: "empty", mealIds: [] },
      customer: { activity: "waiting-food" },
    })));
    expect(handles.staffActions!.getReports()[0]).toMatchObject({ clip: "CarryIdle", trayMealIds: ["meal-1"] });
    expect(staffRig.tray.visible).toBe(true);
    // Waiting for food means sitting still, never a bite.
    expect(handles.customerActions!.getReports()[0]).toMatchObject({ clip: "Sit", eating: false });

    // 2. The seating lane paces the sit-down in simulation seconds, so the bite only starts
    //    once the body has really finished sitting — not the moment the snapshot says "seated".
    runtime.update(frameOf(snapshot(105, 2, { staff: { activity: "counter" } })));
    expect(handles.customerActions!.getReports()[0]).toMatchObject({ clip: "PullChair", eating: false });
    for (let second = 0; second < 4; second += 1) {
      runtime.update(frameOf(snapshot(106 + second, 3 + second, { staff: { activity: "counter" } }), 1));
    }
    expect(handles.seating!.getSeatPose(10)).toMatchObject({ phase: "seated" });
    expect(handles.customerActions!.getReports()[0]).toMatchObject({ clip: "Eat", eating: true });
    expect(customerRig.getObject("RightHand")!.children.map(child => child.name)).toEqual(["CustomerUtensil-spoon"]);

    // 3. Customer leaves a dirty table; the stain is there and nothing has wiped it yet.
    runtime.update(frameOf(snapshot(200, 8, {
      customer: { activity: "finished" },
      table: { availability: "dirty", surface: "used", stainAmount: 0.6 },
      meal: { progress: "empty", consumed: 1 },
    })));
    expect(handles.tableService!.getTableStainInfo("table-1")?.stainAmount).toBeCloseTo(0.6, 6);

    // 4. Staff wipes it; the stain only fades across the wipe stroke.
    runtime.update(frameOf(snapshot(210, 9, {
      staff: { activity: "wiping", taskKind: "clean", phaseStartedAtSeconds: 205, phaseEndsAtSeconds: 215, servicePoint: { x: 4.1, y: 4.8 } },
      customer: { activity: "leaving", seatingPhase: "depart" },
      table: { availability: "cleaning", surface: "wiping", stainAmount: 0.6, wipeProgress: 0.5 },
    })));
    const wiping = handles.staffActions!.getReports()[0]!;
    expect(wiping).toMatchObject({ clip: "WipeTable", tableId: "table-1" });
    expect(wiping.wipeProgress).toBeGreaterThan(0);
    expect(wiping.wipeProgress).toBeLessThan(1);
    expect(staffRig.getObject("RightHand")!.children.map(child => child.name)).toContain("StaffWipeCloth");

    // 5. Clean table: no dishes, no stain, and the chair is back where the layout has it.
    runtime.update(frameOf(snapshot(230, 10, {
      customer: { activity: "leaving", seatingPhase: "depart" },
      table: { availability: "clean", surface: "clean", mealIds: [], cleanCompletedAtSeconds: 225 },
      meal: null,
      staff: { activity: "counter" },
    })));
    expect(handles.tableService!.getDishPlacements("table-1")).toHaveLength(0);
    expect(handles.tableService!.getTableStainInfo("table-1")).toBeNull();
    // The chair stays out while the body is still rising — the engine freeing the table does not
    // end the stand-up — and only travels home once the customer has stepped clear.
    expect(chairObject.position.z).toBeGreaterThan(4.85);
    for (let second = 0; second < 4; second += 1) {
      runtime.update(frameOf(snapshot(231 + second, 11 + second, {
        customer: { activity: "leaving", seatingPhase: "depart" },
        table: { availability: "clean", surface: "clean", mealIds: [], cleanCompletedAtSeconds: 225 },
        meal: null,
        staff: { activity: "counter" },
      }), 1));
    }
    expect(chairObject.position.z).toBeCloseTo(4.85, 6);
    runtime.dispose();
  });

  it("lets the seating lane drive the customer pose through the pull port", () => {
    const { host, layout } = buildHost();
    const handles = createSceneFeatureFactories(host);
    const runtime = createSceneRuntime(buildContext(), handles.factories);
    runtime.syncLayout(layout);
    runtime.update(frameOf(snapshot(100, 1, {
      customer: { activity: "walking", seatingPhase: "pull" },
      meal: { placedAtSeconds: null },
    })));
    const pose = handles.seating!.getSeatPose(10);
    expect(pose).toMatchObject({ phase: "pull", usesChairClips: true });
    // customer-actions must have followed the seating phase rather than the snapshot alone.
    expect(handles.customerActions!.getReports()[0]).toMatchObject({ clip: "PullChair", tier: "seating" });
    runtime.dispose();
  });

  it("adopts the host's existing lights instead of adding a second sun", () => {
    const { host, layout } = buildHost();
    const sunLight = new THREE.DirectionalLight("#ffffff", 1);
    const skyGroundLight = new THREE.HemisphereLight("#ffffff", "#cccccc", 1);
    const handles = createSceneFeatureFactories({ ...host, lighting: { existingLights: { sunLight, skyGroundLight } } });
    const context = buildContext();
    const runtime = createSceneRuntime(context, handles.factories);
    runtime.syncLayout(layout);
    expect(handles.lighting!.sunLight).toBe(sunLight);
    expect(handles.lighting!.skyGroundLight).toBe(skyGroundLight);
    runtime.dispose();
    // The adopted lights belong to the host, so disposing the feature must not detach them.
    expect(sunLight.parent === null || sunLight.parent === context.scene).toBe(true);
  });

  it("hands every rig back when the worker stops sending metadata", () => {
    const { host, layout, staffRig, customerRig } = buildHost();
    const handles = createSceneFeatureFactories(host);
    const runtime = createSceneRuntime(buildContext(), handles.factories);
    runtime.syncLayout(layout);
    runtime.update(frameOf(snapshot(105, 1, { staff: { activity: "carrying", carryMealIds: ["meal-1"] } })));
    expect(staffRig.tray.visible).toBe(true);
    runtime.update(frameOf(undefined));
    expect(staffRig.tray.visible).toBe(false);
    expect(customerRig.getObject("RightHand")!.children).toHaveLength(0);
    expect(handles.staffActions!.getStats().rigCount).toBe(0);
    expect(handles.customerActions!.getStats().rigCount).toBe(0);
    runtime.dispose();
  });

  it("clears transient state on reset and disposes every feature once", () => {
    const { host, layout, staffRig, chairObject } = buildHost();
    const handles = createSceneFeatureFactories(host);
    const runtime = createSceneRuntime(buildContext(), handles.factories);
    runtime.syncLayout(layout);
    runtime.update(frameOf(snapshot(105, 1, {
      staff: { activity: "carrying", carryMealIds: ["meal-1"] },
      customer: { activity: "walking", seatingPhase: "pull" },
    })));
    runtime.reset();
    expect(staffRig.tray.visible).toBe(false);
    expect(chairObject.position.z).toBeCloseTo(4.85, 6);
    expect(handles.seating!.getStats().occupantCount).toBe(0);
    runtime.dispose();
    runtime.dispose();
    expect(handles.staffActions!.getStats()).toMatchObject({ rigCount: 0, propMeshCount: 0 });
  });
});
