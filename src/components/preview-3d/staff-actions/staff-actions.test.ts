import * as THREE from "three";
import { beforeEach, describe, expect, it } from "vitest";
import type { StoreLayout } from "@/core/layout/types";
import type { PresentationSnapshot, StaffPresentation } from "@/core/simulation/presentation-contract";
import type { SceneFeatureContext, SceneFrame } from "../runtime/contracts";
import type { TableDishPlacementInfo, TableStainClusterInfo } from "../table-service";
import { STAFF_CLIP_NAMES, type StaffMarkerTable, type StaffRig, type TableServicePort } from "./contracts";
import { createStaffActionsFeature, type StaffActionsFeature } from "./staff-actions";

const MARKERS: StaffMarkerTable = {
  CarryIdle: [{ name: "hand-contact", time: 0 }],
  CarryWalk: [{ name: "hand-contact", time: 0 }],
  PickUp: [{ name: "hand-contact", time: 0.4 }, { name: "food-contact", time: 0.58 }],
  PutDown: [{ name: "hand-contact", time: 0.26 }, { name: "food-contact", time: 0.62 }],
  WipeTable: [{ name: "hand-contact", time: 0.12 }, { name: "wipe-contact", time: 0.3 }, { name: "clear-complete", time: 0.82 }],
};

const CLIP_DURATIONS: Record<string, number> = {
  Idle: 6, Walk: 0.95, Sit: 0.9, Work: 8, CarryIdle: 6, CarryWalk: 0.95, PickUp: 1.2, PutDown: 1.4, WipeTable: 4,
};

function buildRig(staffId: number, clipNames: readonly string[] = STAFF_CLIP_NAMES): StaffRig & { tray: THREE.Object3D } {
  const model = new THREE.Group();
  model.name = `staff-${staffId}`;
  const hips = new THREE.Bone();
  hips.name = "Hips";
  const left = new THREE.Bone();
  left.name = "LeftHand";
  const right = new THREE.Bone();
  right.name = "RightHand";
  hips.add(left, right);
  model.add(hips);
  const tray = new THREE.Group();
  tray.name = "Tray";
  tray.visible = false;
  model.add(tray);
  const clips = clipNames.map(name => new THREE.AnimationClip(name, CLIP_DURATIONS[name] ?? 1, [
    new THREE.QuaternionKeyframeTrack("Hips.quaternion", [0, CLIP_DURATIONS[name] ?? 1], [0, 0, 0, 1, 0, 0, 0, 1]),
  ]));
  return {
    staffId, model, mixer: new THREE.AnimationMixer(model), clips, markers: MARKERS,
    walkCycleDistance: 0.9, tray,
    getObject: (name: string) => model.getObjectByName(name) ?? null,
  };
}

function buildContext(): SceneFeatureContext & { root: THREE.Group } {
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  scene.add(root);
  return {
    scene, root,
    camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100),
    getLayout: () => null,
    getQuality: () => ({ characterShadows: true }) as never,
    invalidate: () => {},
    invalidateShadows: () => {},
  };
}

function staffMember(overrides: Partial<StaffPresentation> = {}): StaffPresentation {
  return {
    staffId: 1, taskId: "task-1", taskKind: "deliver", tableId: "table-1", serviceCycleId: "cycle-1",
    activity: "counter", walkMetersPerSecond: 1.2, carryMealIds: [], servicePoint: null,
    phaseStartedAtSeconds: 0, phaseEndsAtSeconds: 10, ...overrides,
  };
}

function snapshot(staff: readonly StaffPresentation[], simTimeSeconds: number, sequence = 0): PresentationSnapshot {
  return {
    version: 1, runId: "run-1", layoutRevision: "rev-1", sequence, simTimeSeconds,
    customers: [], meals: [], tables: [], staff, milestones: [],
  };
}

function frameOf(presentation: PresentationSnapshot | undefined, overrides: Partial<SceneFrame> = {}): SceneFrame {
  return {
    nowMs: 0, realDeltaSeconds: 1 / 60, playbackRate: 1, simulating: true, paused: false, presentation, ...overrides,
  };
}

const layout = (tableId = "table-1"): StoreLayout => ({
  width: 8, height: 6,
  objects: [{ id: tableId, type: "table", x: 2, y: 2, width: 1, depth: 1, rotation: 0 }],
} as unknown as StoreLayout);

class FakeTableService implements TableServicePort {
  placed = new Set<string>();
  calls: (string | undefined)[] = [];
  getDishPlacements(tableId?: string): readonly TableDishPlacementInfo[] {
    this.calls.push(tableId);
    return [...this.placed].map(mealId => ({ mealId, tableId: tableId ?? "table-1" } as TableDishPlacementInfo));
  }
  getTableStainInfo(): TableStainClusterInfo | null {
    return null;
  }
}

describe("staff-actions feature", () => {
  let context: SceneFeatureContext & { root: THREE.Group };
  let rig: ReturnType<typeof buildRig>;
  let tableService: FakeTableService;
  let feature: StaffActionsFeature;

  beforeEach(() => {
    context = buildContext();
    rig = buildRig(1);
    tableService = new FakeTableService();
    feature = createStaffActionsFeature({ rigs: { listRigs: () => [rig] }, tableService })(context);
    feature.syncLayout(layout());
  });

  it("drives the carry clip and shows the host tray while meals are aboard", () => {
    feature.update(frameOf(snapshot([staffMember({ activity: "carrying", carryMealIds: ["meal-1"] })], 1)));
    expect(feature.getReports()[0]).toMatchObject({ clip: "CarryIdle", tier: "carry", trayMealIds: ["meal-1"] });
    expect(rig.tray.visible).toBe(true);
  });

  it("switches to CarryWalk once the host moves the model and back when it stops", () => {
    const member = staffMember({ activity: "carrying", carryMealIds: ["meal-1"] });
    feature.update(frameOf(snapshot([member], 1)));
    rig.model.position.set(0.02, 0, 0);
    feature.update(frameOf(snapshot([member], 1.1, 1)));
    expect(feature.getReports()[0]?.clip).toBe("CarryWalk");
    feature.update(frameOf(snapshot([member], 1.2, 2)));
    expect(feature.getReports()[0]?.clip).toBe("CarryIdle");
  });

  it("positions a one-shot clip from simulation time instead of letting the mixer run", () => {
    const member = staffMember({ activity: "put-down", carryMealIds: ["meal-1"], phaseStartedAtSeconds: 0, phaseEndsAtSeconds: 2 });
    feature.update(frameOf(snapshot([member], 1)));
    const action = rig.mixer.clipAction(rig.clips.find(clip => clip.name === "PutDown")!);
    expect(action.paused).toBe(true);
    expect(action.time).toBeCloseTo(0.5 * CLIP_DURATIONS.PutDown!, 6);
    // Advancing the host mixer must not move a time the simulation owns.
    rig.mixer.update(0.5);
    feature.update(frameOf(snapshot([member], 1, 1)));
    expect(action.time).toBeCloseTo(0.5 * CLIP_DURATIONS.PutDown!, 6);
  });

  it("keeps the dish on the tray until table-service reports it on the target table", () => {
    const member = staffMember({ activity: "put-down", carryMealIds: ["meal-1"], phaseStartedAtSeconds: 0, phaseEndsAtSeconds: 10 });
    feature.update(frameOf(snapshot([member], 7)));
    expect(feature.getReports()[0]).toMatchObject({ dishReleased: true, trayMealIds: ["meal-1"] });
    expect(rig.tray.visible).toBe(true);
    tableService.placed.add("meal-1");
    feature.update(frameOf(snapshot([member], 8, 1)));
    expect(feature.getReports()[0]).toMatchObject({ dishReleased: true, trayMealIds: [] });
    expect(rig.tray.visible).toBe(false);
    expect(tableService.calls).toContain("table-1");
  });

  it("attaches the cloth and the collected plate across a clean task, then removes them", () => {
    const wiping = staffMember({ activity: "wiping", taskKind: "clean", phaseStartedAtSeconds: 0, phaseEndsAtSeconds: 10 });
    feature.update(frameOf(snapshot([wiping], 5)));
    expect(rig.getObject("RightHand")?.children.map(child => child.name)).toContain("StaffWipeCloth");
    expect(rig.getObject("LeftHand")?.children.map(child => child.name)).toContain("StaffCollectedPlate");
    for (const [hand, name, palmX, thickness] of [
      ["RightHand", "StaffWipeCloth", -0.014, 0.03],
      ["LeftHand", "StaffCollectedPlate", 0.014, 0.025],
    ] as const) {
      const prop = rig.getObject(hand)!.getObjectByName(name)!;
      const top = new THREE.Vector3(0, thickness / 2, 0).applyQuaternion(prop.quaternion).add(prop.position);
      expect(top.distanceTo(new THREE.Vector3(palmX, -0.065, 0.008))).toBeLessThan(0.00001);
      const normal = new THREE.Vector3(0, 1, 0).applyQuaternion(prop.quaternion);
      expect(normal.distanceTo(new THREE.Vector3(hand === "RightHand" ? 1 : -1, 0, 0))).toBeLessThan(0.00001);
    }
    expect(feature.getStats().propMeshCount).toBe(2);
    expect(feature.getReports()[0]?.wipeProgress).toBeCloseTo(0.5, 6);

    feature.update(frameOf(snapshot([staffMember({ activity: "counter" })], 11, 1)));
    expect(rig.getObject("RightHand")?.children).toHaveLength(0);
    expect(rig.getObject("LeftHand")?.children).toHaveLength(0);
    expect(feature.getStats().propMeshCount).toBe(0);
  });

  it("never mutates dishes or stains — table-service is read-only", () => {
    const service = new FakeTableService();
    const readOnly = createStaffActionsFeature({ rigs: { listRigs: () => [rig] }, tableService: service })(context);
    readOnly.syncLayout(layout());
    readOnly.update(frameOf(snapshot([staffMember({ activity: "wiping", taskKind: "clean" })], 5)));
    expect(service.placed.size).toBe(0);
    readOnly.dispose();
  });

  it("flags a service point the wipe clip cannot reach", () => {
    const near = staffMember({ activity: "wiping", taskKind: "clean", servicePoint: { x: 2.5, y: 2.2 } });
    feature.update(frameOf(snapshot([near], 5)));
    expect(feature.getReports()[0]).toMatchObject({ wipeOutOfReach: false, wipeServicePoint: { x: 2.5, y: 2.2 } });
    const far = staffMember({ activity: "wiping", taskKind: "clean", servicePoint: { x: 2.5, y: 1.4 } });
    feature.update(frameOf(snapshot([far], 5, 1)));
    expect(feature.getReports()[0]?.wipeOutOfReach).toBe(true);
  });

  it("hands the rig back when the staff member is cancelled mid-task", () => {
    const member = staffMember({ activity: "carrying", carryMealIds: ["meal-1"] });
    feature.update(frameOf(snapshot([member], 1)));
    expect(feature.getStats().rigCount).toBe(1);
    feature.update(frameOf(snapshot([], 2, 1)));
    expect(feature.getStats().rigCount).toBe(0);
    expect(rig.tray.visible).toBe(false);
    expect(feature.getReports()).toHaveLength(0);
  });

  it("releases everything outside simulation and on a legacy worker with no metadata", () => {
    feature.update(frameOf(snapshot([staffMember({ activity: "carrying", carryMealIds: ["meal-1"] })], 1)));
    feature.update(frameOf(undefined, { simulating: true }));
    expect(feature.getStats().rigCount).toBe(0);
    expect(rig.tray.visible).toBe(false);
    feature.update(frameOf(snapshot([staffMember({ activity: "carrying", carryMealIds: ["meal-1"] })], 2, 1)));
    expect(feature.getStats().rigCount).toBe(1);
    feature.update(frameOf(snapshot([staffMember()], 3, 2), { simulating: false }));
    expect(feature.getStats().rigCount).toBe(0);
  });

  it("restores the tray and clears its own props on reset", () => {
    feature.update(frameOf(snapshot([staffMember({ activity: "wiping", taskKind: "clean" })], 5)));
    feature.reset();
    expect(feature.getStats()).toMatchObject({ rigCount: 0, propMeshCount: 0 });
    expect(rig.tray.visible).toBe(false);
    expect(rig.getObject("RightHand")?.children).toHaveLength(0);
  });

  it("disposes only its own geometry and material, once", () => {
    feature.update(frameOf(snapshot([staffMember({ activity: "wiping", taskKind: "clean" })], 5)));
    feature.dispose();
    expect(feature.getStats()).toMatchObject({ disposedGeometries: 2, disposedMaterials: 2 });
    feature.dispose();
    expect(feature.getStats()).toMatchObject({ disposedGeometries: 2, disposedMaterials: 2 });
    // A disposed feature stops touching the host rig.
    feature.update(frameOf(snapshot([staffMember({ activity: "carrying", carryMealIds: ["meal-1"] })], 6, 1)));
    expect(feature.getReports()).toHaveLength(0);
    expect(rig.tray.visible).toBe(false);
  });

  it("keeps a pre-feat-109 asset usable by substituting the legacy clips", () => {
    const legacyRig = buildRig(1, ["Idle", "Walk", "Sit", "Work"]);
    const legacyFeature = createStaffActionsFeature({ rigs: { listRigs: () => [legacyRig] } })(context);
    legacyFeature.syncLayout(layout());
    legacyFeature.update(frameOf(snapshot([staffMember({ activity: "wiping", taskKind: "clean" })], 5)));
    expect(legacyFeature.getReports()[0]).toMatchObject({ clip: "Work", requestedClip: "WipeTable" });
    legacyFeature.dispose();
  });

  it("drives several staff members independently in one frame", () => {
    const other = buildRig(2);
    const many = createStaffActionsFeature({ rigs: { listRigs: () => [rig, other] }, tableService })(context);
    many.syncLayout(layout());
    many.update(frameOf(snapshot([
      staffMember({ staffId: 1, activity: "carrying", carryMealIds: ["meal-1"] }),
      staffMember({ staffId: 2, activity: "wiping", taskKind: "clean", tableId: "table-1" }),
    ], 5)));
    expect(many.getReports().map(report => report.clip)).toEqual(["CarryIdle", "WipeTable"]);
    expect(rig.tray.visible).toBe(true);
    expect(other.tray.visible).toBe(false);
    many.dispose();
  });

  it("keeps ground speed and walk cycle progress when listRigs returns a fresh descriptor each frame", () => {
    const preStartedWork = rig.mixer.clipAction(rig.clips.find(clip => clip.name === "Work")!);
    preStartedWork.play();
    const freshListFeature = createStaffActionsFeature({
      rigs: { listRigs: () => [{ ...rig }] },
      tableService,
    })(context);
    freshListFeature.syncLayout(layout());

    const walking = staffMember({ activity: "walking", carryMealIds: [] });
    freshListFeature.update(frameOf(snapshot([walking], 1.0, 0)));
    expect(preStartedWork.isRunning()).toBe(true);

    // Move the model across frames while listRigs() returns a new wrapper object every frame.
    rig.model.position.set(0.02, 0, 0);
    freshListFeature.update(frameOf(snapshot([walking], 1.02, 1)));
    expect(freshListFeature.getReports()[0]).toMatchObject({ clip: "Walk", tier: "walk" });
    expect(preStartedWork.isRunning()).toBe(false);

    const walkAction = rig.mixer.clipAction(rig.clips.find(clip => clip.name === "Walk")!);
    rig.mixer.update(0.1);
    const timeAfterFirstStep = walkAction.time;
    expect(timeAfterFirstStep).toBeGreaterThan(0);

    // Next frame continues walking: action must not reset to t=0.
    rig.model.position.set(0.04, 0, 0);
    freshListFeature.update(frameOf(snapshot([walking], 1.04, 2)));
    expect(freshListFeature.getReports()[0]?.clip).toBe("Walk");
    expect(walkAction.time).toBeCloseTo(timeAfterFirstStep, 5);
    freshListFeature.dispose();
  });
});
