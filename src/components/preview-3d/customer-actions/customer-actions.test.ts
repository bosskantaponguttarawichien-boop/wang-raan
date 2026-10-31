import * as THREE from "three";
import { beforeEach, describe, expect, it } from "vitest";
import type { StoreLayout } from "@/core/layout/types";
import type { CustomerPresentation, MealPresentation, PresentationSnapshot } from "@/core/simulation/presentation-contract";
import type { SceneFeatureContext, SceneFrame } from "../runtime/contracts";
import type { TableDishPlacementInfo } from "../table-service";
import { CUSTOMER_CLIP_NAMES, type CustomerMarkerTable, type CustomerRig, type CustomerTableServicePort } from "./contracts";
import { createCustomerActionsFeature, type CustomerActionsFeature } from "./customer-actions";
import { EAT_PLATE_FORWARD } from "./customer-action-controller";

const MARKERS: CustomerMarkerTable = {
  Eat: [{ name: "seated", time: 0 }, { name: "food-contact", time: 0.14 }, { name: "hand-contact", time: 0.45 }],
  PullChair: [{ name: "hand-contact", time: 0.22 }],
  SitDown: [{ name: "hand-contact", time: 0.35 }, { name: "seated", time: 0.92 }],
  PushChair: [{ name: "hand-contact", time: 0.2 }, { name: "seated", time: 0 }],
  StandUp: [{ name: "seated", time: 0 }, { name: "hand-contact", time: 0.2 }],
};

const CLIP_DURATIONS: Record<string, number> = {
  Idle: 6, Walk: 0.95, Sit: 0.9, Eat: 3.2, PullChair: 1.1, SitDown: 0.9, PushChair: 0.9, StandUp: 0.9,
};

function buildRig(renderAgentId: number, clipNames: readonly string[] = CUSTOMER_CLIP_NAMES): CustomerRig {
  const model = new THREE.Group();
  model.name = `customer-${renderAgentId}`;
  const hips = new THREE.Bone();
  hips.name = "Hips";
  const right = new THREE.Bone();
  right.name = "RightHand";
  hips.add(right);
  model.add(hips);
  const clips = clipNames.map(name => new THREE.AnimationClip(name, CLIP_DURATIONS[name] ?? 1, [
    new THREE.QuaternionKeyframeTrack("Hips.quaternion", [0, CLIP_DURATIONS[name] ?? 1], [0, 0, 0, 1, 0, 0, 0, 1]),
  ]));
  return {
    renderAgentId, model, mixer: new THREE.AnimationMixer(model), clips, markers: MARKERS,
    walkCycleDistance: 0.9,
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

function customerOf(overrides: Partial<CustomerPresentation> = {}): CustomerPresentation {
  return {
    renderAgentId: 10, partyId: 1, memberIndex: 0,
    tableId: "table-1", chairId: "chair-1", serviceCycleId: "cycle-1",
    activity: "eating", seatingPhase: "seated", walkMetersPerSecond: 1.2, mealId: "meal-1", ...overrides,
  };
}

function mealOf(overrides: Partial<MealPresentation> = {}): MealPresentation {
  return {
    mealId: "meal-1", ownerRenderAgentId: 10, tableId: "table-1", chairId: "chair-1", serviceCycleId: "cycle-1",
    foodKind: "fried-rice", anchor: { x: 0, y: 0.2 }, progress: "full", consumed: 0.2, placedAtSeconds: 300, ...overrides,
  };
}

function snapshot(
  customers: readonly CustomerPresentation[],
  meals: readonly MealPresentation[],
  simTimeSeconds: number,
  sequence = 0,
): PresentationSnapshot {
  return {
    version: 1, runId: "run-1", layoutRevision: "rev-1", sequence, simTimeSeconds,
    customers, meals, tables: [], staff: [], milestones: [],
  };
}

function frameOf(presentation: PresentationSnapshot | undefined, overrides: Partial<SceneFrame> = {}): SceneFrame {
  return { nowMs: 0, realDeltaSeconds: 1 / 60, playbackRate: 1, simulating: true, paused: false, presentation, ...overrides };
}

const layout = (): StoreLayout => ({
  width: 8, height: 6,
  objects: [
    { id: "table-1", type: "table", x: 2, y: 2, width: 1, depth: 1, rotation: 0 },
    { id: "chair-1", type: "chair", x: 2.3, y: 3.1, width: 0.45, depth: 0.45, rotation: 0 },
  ],
} as unknown as StoreLayout);

class FakeTableService implements CustomerTableServicePort {
  dishes: TableDishPlacementInfo[] = [];
  getDishPlacements(tableId?: string): readonly TableDishPlacementInfo[] {
    return this.dishes.filter(dish => !tableId || dish.tableId === tableId);
  }
}

function dishAt(x: number, z: number): TableDishPlacementInfo {
  return { mealId: "meal-1", tableId: "table-1", worldPosition: new THREE.Vector3(x, 0.76, z) } as TableDishPlacementInfo;
}

describe("customer-actions feature", () => {
  let context: SceneFeatureContext & { root: THREE.Group };
  let rig: CustomerRig;
  let tableService: FakeTableService;
  let feature: CustomerActionsFeature;

  beforeEach(() => {
    context = buildContext();
    rig = buildRig(10);
    tableService = new FakeTableService();
    feature = createCustomerActionsFeature({ rigs: { listRigs: () => [rig] }, tableService })(context);
    feature.syncLayout(layout());
  });

  it("holds the menu's utensil in the right hand while eating and drops it when finished", () => {
    feature.update(frameOf(snapshot([customerOf()], [mealOf()], 310)));
    const hand = rig.getObject("RightHand")!;
    expect(hand.children.map(child => child.name)).toEqual(["CustomerUtensil-spoon"]);
    expect(feature.getReports()[0]).toMatchObject({ clip: "Eat", eating: true, tier: "eat" });

    feature.update(frameOf(snapshot([customerOf({ activity: "finished" })], [mealOf()], 320, 1)));
    expect(hand.children).toHaveLength(0);
    expect(feature.getStats().utensilCount).toBe(0);
  });

  it("attaches the utensil to the animated anchor when the rig has one", () => {
    const hand = rig.getObject("RightHand")!;
    const anchor = new THREE.Group();
    anchor.name = "EatUtensilAnchor";
    hand.add(anchor);
    feature.update(frameOf(snapshot([customerOf()], [mealOf()], 310)));
    expect(anchor.children.map(child => child.name)).toEqual(["CustomerUtensil-spoon"]);
    expect(anchor.children[0]!.position.z).toBeCloseTo(0.025);
    expect(anchor.children[0]!.position.x).toBe(0);
    expect(anchor.children[0]!.position.y).toBe(0);
    feature.update(frameOf(snapshot([customerOf({ activity: "finished" })], [mealOf()], 311, 1)));
    expect(anchor.children).toHaveLength(0);
  });

  it("uses the grip shape only while eating and restores it on release", () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0], 3));
    const grip = new THREE.Float32BufferAttribute([0, 0, 0], 3);
    grip.name = "EatGrip";
    geometry.morphAttributes.position = [grip];
    const body = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
    body.name = "MannequinBody";
    rig.model.add(body);
    feature.update(frameOf(snapshot([customerOf()], [mealOf()], 310)));
    expect(body.morphTargetInfluences![0]).toBe(1);
    feature.update(frameOf(snapshot([customerOf({ activity: "finished" })], [mealOf()], 311, 1)));
    expect(body.morphTargetInfluences![0]).toBe(0);
    feature.update(frameOf(snapshot([customerOf()], [mealOf()], 312, 2)));
    feature.reset();
    expect(body.morphTargetInfluences![0]).toBe(0);
    geometry.dispose();
    (body.material as THREE.Material).dispose();
  });

  it("swaps the utensil when the menu changes and reuses one template per kind", () => {
    feature.update(frameOf(snapshot([customerOf()], [mealOf({ foodKind: "noodles" })], 310)));
    expect(rig.getObject("RightHand")!.children[0]!.name).toBe("CustomerUtensil-chopsticks");
    feature.update(frameOf(snapshot([customerOf()], [mealOf({ foodKind: "steak" })], 311, 1)));
    expect(rig.getObject("RightHand")!.children.map(child => child.name)).toEqual(["CustomerUtensil-fork"]);
    feature.update(frameOf(snapshot([customerOf()], [mealOf({ foodKind: "salad" })], 312, 2)));
    expect(feature.getStats()).toMatchObject({ utensilCount: 1, utensilTemplateCount: 2 });
  });

  it("writes the bite position from simulation time, so the host mixer cannot drift it", () => {
    feature.update(frameOf(snapshot([customerOf()], [mealOf()], 301.6)));
    const action = rig.mixer.clipAction(rig.clips.find(clip => clip.name === "Eat")!);
    const expected = feature.getReports()[0]!.phase! * CLIP_DURATIONS.Eat!;
    expect(action.paused).toBe(true);
    expect(action.time).toBeCloseTo(expected, 6);
    rig.mixer.update(1.1);
    feature.update(frameOf(snapshot([customerOf()], [mealOf()], 301.6, 1)));
    expect(action.time).toBeCloseTo(expected, 6);
  });

  it("smooths bites between worker ticks and freezes the pose while paused", () => {
    const initial = snapshot([customerOf()], [mealOf()], 310, 0);
    feature.update(frameOf(initial));
    const before = feature.getReports()[0]!.phase!;
    const next = snapshot([customerOf()], [mealOf()], 310.15, 1);
    feature.update(frameOf(next, { realDeltaSeconds: 0.05, playbackRate: 1 }));
    const first = feature.getReports()[0]!.phase!;
    feature.update(frameOf(next, { realDeltaSeconds: 0.05, playbackRate: 1 }));
    const second = feature.getReports()[0]!.phase!;
    expect((first - before + 1) % 1).toBeCloseTo(0.05 / 3.2, 6);
    expect((second - first + 1) % 1).toBeCloseTo(0.05 / 3.2, 6);
    feature.update(frameOf(next, { paused: true, realDeltaSeconds: 1, playbackRate: 1 }));
    expect(feature.getReports()[0]!.phase).toBe(second);
    feature.update(frameOf(next, { realDeltaSeconds: 0.05, playbackRate: 1 }));
    expect((feature.getReports()[0]!.phase! - second + 1) % 1).toBeCloseTo(0.05 / 3.2, 6);
  });

  it("scales smoothing at 30× without advancing past the latest simulation time", () => {
    feature.update(frameOf(snapshot([customerOf()], [mealOf()], 310, 0)));
    const before = feature.getReports()[0]!.phase!;
    const next = snapshot([customerOf()], [mealOf()], 311.5, 1);
    feature.update(frameOf(next, { realDeltaSeconds: 0.01, playbackRate: 30 }));
    const first = feature.getReports()[0]!.phase!;
    expect((first - before + 1) % 1).toBeCloseTo(0.3 / 3.2, 6);
    feature.update(frameOf(next, { realDeltaSeconds: 1, playbackRate: 30 }));
    const caughtUp = feature.getReports()[0]!.phase;
    feature.update(frameOf(next, { realDeltaSeconds: 1, playbackRate: 30 }));
    expect(feature.getReports()[0]!.phase).toBe(caughtUp);
  });

  it("bites at the gesture pace (motionRate), not the 30× clock, and keep that pace when the clock slows", () => {
    const rates = { playbackRate: 30, motionRate: 1.75 };
    feature.update(frameOf(snapshot([customerOf()], [mealOf()], 310, 0), rates));
    const before = feature.getReports()[0]!.phase!;
    feature.update(frameOf(snapshot([customerOf()], [mealOf()], 311.5, 1), { realDeltaSeconds: 0.01, ...rates }));
    const first = feature.getReports()[0]!.phase!;
    // 0.01 วินาทีจริง = 0.3 วินาทีจำลองที่ 30× → ท่ากินขยับ 0.0175 วินาทีของคลิป (1.75×) ไม่ใช่ 0.3
    expect((first - before + 1) % 1).toBeCloseTo(0.01 * 1.75 / 3.2, 6);
    // นาฬิกาชะลอเหลือ 7.5× ท่ากินยังขยับเท่าเดิมต่อวินาทีจริง ไม่กระโดด
    const slow = { playbackRate: 7.5, motionRate: 1.75 };
    feature.update(frameOf(snapshot([customerOf()], [mealOf()], 312, 2), { realDeltaSeconds: 0.01, ...slow }));
    const second = feature.getReports()[0]!.phase!;
    expect((second - first + 1) % 1).toBeCloseTo(0.01 * 1.75 / 3.2, 6);
  });

  it("takes the seating pose feat-119 pushes in, and forgets it when told to", () => {
    feature.setSeatPose({ renderAgentId: 10, phase: "sit", clipPhase: 0.4, outwardOffset: 0.3, usesChairClips: true });
    feature.update(frameOf(snapshot([customerOf()], [mealOf()], 310)));
    expect(feature.getReports()[0]).toMatchObject({ clip: "SitDown", tier: "seating", phase: 0.4, eating: false });
    feature.clearSeatPose(10);
    feature.update(frameOf(snapshot([customerOf()], [mealOf()], 311, 1)));
    expect(feature.getReports()[0]).toMatchObject({ clip: "Eat", eating: true });
  });

  it("falls back to the pull-side seating port when nothing was pushed", () => {
    const pulled = createCustomerActionsFeature({
      rigs: { listRigs: () => [rig] }, tableService,
      pose: { getSeatPose: () => ({ renderAgentId: 10, phase: "rise", clipPhase: 0.2, outwardOffset: 0.3, usesChairClips: true }) },
    })(context);
    pulled.syncLayout(layout());
    pulled.update(frameOf(snapshot([customerOf()], [mealOf()], 310)));
    expect(pulled.getReports()[0]).toMatchObject({ clip: "StandUp", tier: "seating" });
    pulled.dispose();
  });

  it("measures the real dish distance and asks the host for the shift the clip needs", () => {
    // Chair faces north (rotation 0) so the customer's forward axis is −z in scene space.
    rig.model.position.set(2.3, 0, 2.9);
    tableService.dishes = [dishAt(2.3, 2.9 - EAT_PLATE_FORWARD)];
    feature.update(frameOf(snapshot([customerOf()], [mealOf()], 310)));
    const report = feature.getReports()[0]!;
    expect(report.plateLocalOffset).toEqual({ x: 0, y: EAT_PLATE_FORWARD });
    expect(report).toMatchObject({ plateForwardCorrection: 0, plateOutOfReach: false });

    tableService.dishes = [dishAt(2.3, 2.9 - 0.47)];
    feature.update(frameOf(snapshot([customerOf()], [mealOf()], 311, 1)));
    expect(feature.getReports()[0]).toMatchObject({ plateForwardCorrection: 0.13, plateOutOfReach: true });
  });

  it("keeps the same forward axis for a chair turned to another side of the table", () => {
    const turned = createCustomerActionsFeature({ rigs: { listRigs: () => [rig] }, tableService })(context);
    turned.syncLayout({
      width: 8, height: 6,
      objects: [
        { id: "table-1", type: "table", x: 2, y: 2, width: 1, depth: 1, rotation: 0 },
        { id: "chair-1", type: "chair", x: 1.2, y: 2.3, width: 0.45, depth: 0.45, rotation: 90 },
      ],
    } as unknown as StoreLayout);
    // Chair rotation 90 faces east (+x), so the dish sits at +x of the body.
    rig.model.position.set(1.4, 0, 2.5);
    tableService.dishes = [dishAt(1.4 + EAT_PLATE_FORWARD, 2.5)];
    turned.update(frameOf(snapshot([customerOf()], [mealOf()], 310)));
    expect(turned.getReports()[0]!.plateLocalOffset).toEqual({ x: 0, y: EAT_PLATE_FORWARD });
    turned.dispose();
  });

  it("reports no dish geometry when table-service has not mounted it yet", () => {
    feature.update(frameOf(snapshot([customerOf()], [mealOf()], 310)));
    expect(feature.getReports()[0]).toMatchObject({ plateLocalOffset: null, plateOutOfReach: false });
  });

  it("rebuilds the pose for a 3D view that joins in the middle of a run", () => {
    const late = createCustomerActionsFeature({ rigs: { listRigs: () => [rig] }, tableService })(context);
    late.syncLayout(layout());
    // First frame this feature ever sees is mid-meal; it must land on the same bite as a feature
    // that has been running all along.
    feature.update(frameOf(snapshot([customerOf()], [mealOf()], 300)));
    feature.update(frameOf(snapshot([customerOf()], [mealOf()], 317.4, 1)));
    late.update(frameOf(snapshot([customerOf()], [mealOf()], 317.4)));
    expect(late.getReports()[0]!.phase).toBeCloseTo(feature.getReports()[0]!.phase!, 6);
    late.dispose();
  });

  it("hands the rig back when a customer is cancelled, and clears its pushed pose", () => {
    feature.setSeatPose({ renderAgentId: 10, phase: "seated", clipPhase: null, outwardOffset: 0, usesChairClips: true });
    feature.update(frameOf(snapshot([customerOf()], [mealOf()], 310)));
    expect(feature.getStats().rigCount).toBe(1);
    feature.update(frameOf(snapshot([], [], 311, 1)));
    expect(feature.getStats()).toMatchObject({ rigCount: 0, utensilCount: 0 });
    expect(rig.getObject("RightHand")!.children).toHaveLength(0);
    // The stale pose must not come back if the same id is reused by a new run.
    feature.update(frameOf(snapshot([customerOf({ activity: "walking", seatingPhase: "approach" })], [], 1)));
    expect(feature.getReports()[0]).toMatchObject({ clip: "Idle", tier: "base" });
  });

  it("releases everything outside simulation and when the worker sends no metadata", () => {
    feature.update(frameOf(snapshot([customerOf()], [mealOf()], 310)));
    feature.update(frameOf(undefined));
    expect(feature.getStats().rigCount).toBe(0);
    feature.update(frameOf(snapshot([customerOf()], [mealOf()], 311, 1), { simulating: false }));
    expect(feature.getStats().rigCount).toBe(0);
    expect(rig.getObject("RightHand")!.children).toHaveLength(0);
  });

  it("disposes only its own utensil resources, once", () => {
    feature.update(frameOf(snapshot([customerOf()], [mealOf({ foodKind: "noodles" })], 310)));
    feature.update(frameOf(snapshot([customerOf()], [mealOf({ foodKind: "steak" })], 311, 1)));
    feature.dispose();
    const stats = feature.getStats();
    expect(stats.disposedGeometries).toBeGreaterThan(0);
    expect(stats.disposedMaterials).toBeGreaterThan(0);
    feature.dispose();
    expect(feature.getStats()).toMatchObject(stats);
    feature.update(frameOf(snapshot([customerOf()], [mealOf()], 312, 2)));
    expect(feature.getReports()).toHaveLength(0);
  });

  it("keeps a pre-feat-110 asset usable by substituting Sit for Eat", () => {
    const legacyRig = buildRig(10, ["Idle", "Walk", "Sit"]);
    const legacyFeature = createCustomerActionsFeature({ rigs: { listRigs: () => [legacyRig] }, tableService })(context);
    legacyFeature.syncLayout(layout());
    legacyFeature.update(frameOf(snapshot([customerOf()], [mealOf()], 310)));
    expect(legacyFeature.getReports()[0]).toMatchObject({ clip: "Sit", requestedClip: "Eat", eating: true });
    legacyFeature.dispose();
  });

  it("drives a party of four on separate bites in one frame", () => {
    const rigs = [0, 1, 2, 3].map(index => buildRig(10 + index));
    const party = createCustomerActionsFeature({ rigs: { listRigs: () => rigs }, tableService })(context);
    party.syncLayout(layout());
    party.update(frameOf(snapshot(
      rigs.map((entry, index) => customerOf({ renderAgentId: entry.renderAgentId, memberIndex: index, mealId: `meal-${index}` })),
      rigs.map((entry, index) => mealOf({ mealId: `meal-${index}`, ownerRenderAgentId: entry.renderAgentId, chairId: `chair-${index}` })),
      310,
    )));
    const phases = party.getReports().map(report => report.phase!);
    expect(phases).toHaveLength(4);
    expect(new Set(phases.map(value => value.toFixed(4))).size).toBe(4);
    expect(party.getReports().every(report => report.eating)).toBe(true);
    party.dispose();
  });

  it("preserves groundSpeed across frames when listRigs returns a fresh descriptor each frame", () => {
    const freshFeature = createCustomerActionsFeature({
      rigs: { listRigs: () => [{ ...rig }] },
      tableService,
    })(context);
    freshFeature.syncLayout(layout());
    const walkingCustomer = customerOf({ activity: "walking", seatingPhase: "approach", mealId: null });
    freshFeature.update(frameOf(snapshot([walkingCustomer], [], 10, 0)));
    rig.model.position.set(0.03, 0, 0);
    freshFeature.update(frameOf(snapshot([walkingCustomer], [], 10.02, 1)));
    expect(freshFeature.getReports()[0]).toMatchObject({ clip: "Walk", tier: "walk" });
    freshFeature.dispose();
  });
});
