import * as THREE from "three";
import { beforeEach, describe, expect, it } from "vitest";
import type { Chair, StoreLayout, Table } from "@/core/layout/types";
import type { CustomerPresentation, PresentationSnapshot, SeatingPhase } from "@/core/simulation/presentation-contract";
import type { SceneFeatureContext, SceneFrame } from "../runtime/contracts";
import { CHAIR_PULL, CHAIR_RETURN_DELAY, GRIP_TRAVEL, SEAT_CLIP_SECONDS } from "../seat-motion";
import type { ChairRig } from "./contracts";
import { createSeatingFeature, type SeatingFeature } from "./seating";

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

/** Table at (3.5, 3.5) 1.2 × 1.2 with one chair per side, tucked 0.10 m under it. */
function buildLayout(rotations: readonly number[] = [0], roomDepth = 10): StoreLayout {
  const table: Table = {
    id: "table-1", type: "table", x: 3.5, y: 3.5, width: 1.2, depth: 1.2, rotation: 0,
    chairIds: rotations.map((_, index) => `chair-${index + 1}`),
  } as Table;
  const positions: Record<number, { x: number; y: number }> = {
    0: { x: 3.85, y: 4.6 },
    180: { x: 3.85, y: 2.4 },
    90: { x: 2.4, y: 3.85 },
    270: { x: 4.6, y: 3.85 },
  };
  const chairs: Chair[] = rotations.map((rotation, index) => ({
    id: `chair-${index + 1}`, type: "chair", width: 0.5, depth: 0.5, rotation,
    tableId: "table-1", ...positions[rotation]!,
  } as Chair));
  return {
    id: "layout-1", version: 1, units: "m", width: 10, depth: roomDepth,
    entrance: null, kitchenDoor: null, objects: [table, ...chairs],
  };
}

function buildChairRig(chairId: string, layout: StoreLayout): ChairRig {
  const chair = layout.objects.find(object => object.id === chairId) as Chair;
  const object = new THREE.Group();
  object.name = chairId;
  const home = { x: chair.x + chair.width / 2, y: 0, z: chair.y + chair.depth / 2 };
  object.position.set(home.x, home.y, home.z);
  return { chairId, object, home };
}

function customerOf(overrides: Partial<CustomerPresentation> = {}): CustomerPresentation {
  return {
    renderAgentId: 10, partyId: 1, memberIndex: 0,
    tableId: "table-1", chairId: "chair-1", serviceCycleId: "cycle-1",
    activity: "waiting-food", seatingPhase: "seated", walkMetersPerSecond: 1.2, mealId: null, ...overrides,
  };
}

function snapshot(customers: readonly CustomerPresentation[], simTimeSeconds: number, sequence = 0): PresentationSnapshot {
  return {
    version: 1, runId: "run-1", layoutRevision: "rev-1", sequence, simTimeSeconds,
    customers, meals: [], tables: [], staff: [], milestones: [],
  };
}

function frameOf(presentation: PresentationSnapshot | undefined, delta = 1 / 60, overrides: Partial<SceneFrame> = {}): SceneFrame {
  return { nowMs: 0, realDeltaSeconds: delta, playbackRate: 1, simulating: true, paused: false, presentation, ...overrides };
}

/** Drives the feature for `seconds` at `fps`, keeping the same customers throughout. */
function drive(feature: SeatingFeature, seconds: number, fps: number, customers: readonly CustomerPresentation[], from = 0) {
  const dt = 1 / fps;
  let sequence = from;
  for (let step = 0; step < Math.round(seconds * fps); step += 1) {
    sequence += 1;
    feature.update(frameOf(snapshot(customers, sequence * dt, sequence), dt));
  }
}

const SIT_TOTAL = SEAT_CLIP_SECONDS.PullChair + SEAT_CLIP_SECONDS.SitDown + SEAT_CLIP_SECONDS.PushChair;

describe("seating feature", () => {
  let context: SceneFeatureContext & { root: THREE.Group };
  let layout: StoreLayout;
  let rigs: ChairRig[];
  let feature: SeatingFeature;

  beforeEach(() => {
    context = buildContext();
    layout = buildLayout([0]);
    rigs = [buildChairRig("chair-1", layout)];
    feature = createSeatingFeature({ chairs: { listChairs: () => rigs } })(context);
    feature.syncLayout(layout);
  });

  it("pulls the chair out along its own outward axis and brings it back under the table", () => {
    const rig = rigs[0]!;
    drive(feature, 0.6, 60, [customerOf()]);
    const pulled = feature.getReports()[0]!;
    expect(pulled.phase).toBe("pull");
    expect(rig.object.position.z).toBeGreaterThan(rig.home.z);
    expect(rig.object.position.x).toBeCloseTo(rig.home.x, 6);

    drive(feature, SIT_TOTAL, 60, [customerOf()]);
    expect(feature.getReports()[0]!.phase).toBe("seated");
    expect(rig.object.position.z).toBeCloseTo(rig.home.z, 4);
  });

  it("publishes a pose feat-118 can pull, and nothing for a customer it does not seat", () => {
    drive(feature, 0.4, 60, [customerOf()]);
    expect(feature.getSeatPose(10)).toMatchObject({ renderAgentId: 10, phase: "pull", usesChairClips: true });
    expect(feature.getSeatPose(99)).toBeNull();
  });

  it("places the body out on the chair while sitting, then back under the table", () => {
    drive(feature, SEAT_CLIP_SECONDS.PullChair + SEAT_CLIP_SECONDS.SitDown, 120, [customerOf()]);
    const sitting = feature.getBodyPlacements()[0]!;
    expect(sitting.outwardOffset).toBeCloseTo(CHAIR_PULL, 2);
    // Chair rotation 0 faces north, so the body moves to larger y as it sits out.
    expect(sitting.point.y).toBeGreaterThan(4.85);
    expect(sitting).toMatchObject({ chairId: "chair-1", seated: true, facing: { x: 0, y: -1 } });

    drive(feature, SEAT_CLIP_SECONDS.PushChair + 0.2, 120, [customerOf()]);
    expect(feature.getBodyPlacements()[0]!.outwardOffset).toBeCloseTo(0, 4);
  });

  it.each([0, 90, 180, 270] as const)("works from a chair on the %i side of the table", rotation => {
    const sided = buildLayout([rotation]);
    const rig = buildChairRig("chair-1", sided);
    const sideFeature = createSeatingFeature({ chairs: { listChairs: () => [rig] } })(context);
    sideFeature.syncLayout(sided);
    drive(sideFeature, SIT_TOTAL + 0.2, 60, [customerOf()]);
    expect(sideFeature.getReports()[0]).toMatchObject({ phase: "seated", effectivePull: CHAIR_PULL, usesChairClips: true });
    expect(rig.object.position.x).toBeCloseTo(rig.home.x, 4);
    expect(rig.object.position.z).toBeCloseTo(rig.home.z, 4);
    sideFeature.dispose();
  });

  it("takes the same simulated time at 15 fps and at 120 fps", () => {
    const seatedAfter = (fps: number) => {
      const rig = buildChairRig("chair-1", layout);
      const paced = createSeatingFeature({ chairs: { listChairs: () => [rig] } })(context);
      paced.syncLayout(layout);
      let frames = 0;
      const dt = 1 / fps;
      while (frames < fps * 10) {
        frames += 1;
        paced.update(frameOf(snapshot([customerOf()], frames * dt, frames), dt));
        if (paced.getReports()[0]?.phase === "seated") break;
      }
      paced.dispose();
      return frames * dt;
    };
    expect(seatedAfter(15)).toBeCloseTo(seatedAfter(120), 1);
  });

  it("keeps a natural sitting pace when simulated time runs 30× (motionRate caps the gesture)", () => {
    const seatedAfter = (overrides: Partial<SceneFrame>) => {
      const rig = buildChairRig("chair-1", layout);
      const paced = createSeatingFeature({ chairs: { listChairs: () => [rig] } })(context);
      paced.syncLayout(layout);
      let frames = 0;
      const dt = 1 / 60;
      while (frames < 600) {
        frames += 1;
        paced.update(frameOf(snapshot([customerOf()], frames * dt, frames), dt, overrides));
        if (paced.getReports()[0]?.phase === "seated") break;
      }
      paced.dispose();
      return frames * dt;
    };
    const natural = seatedAfter({ playbackRate: 1 });
    // ภาพนั่งที่ 30× ใช้เวลาจริงเท่ากับเล่นท่าทางที่ 1.75× ไม่ใช่วูบเดียวแบบ 30×
    expect(seatedAfter({ playbackRate: 30, motionRate: 1.75 })).toBeCloseTo(natural / 1.75, 1);
    expect(seatedAfter({ playbackRate: 30 })).toBeLessThan(natural / 10);
  });

  it("freezes the chair and the body while the host reports no elapsed time", () => {
    drive(feature, 0.6, 60, [customerOf()]);
    const before = { ...feature.getReports()[0]! };
    const rig = rigs[0]!;
    const position = rig.object.position.clone();
    for (let step = 0; step < 30; step += 1) feature.update(frameOf(snapshot([customerOf()], 0.6, 100 + step), 0, { paused: true }));
    expect(feature.getReports()[0]).toMatchObject({ phase: before.phase, chairPull: before.chairPull });
    expect(rig.object.position.equals(position)).toBe(true);
  });

  it("gives each party member their own chair and never lets two claim one", () => {
    const four = buildLayout([0, 90, 180, 270]);
    const chairRigs = ["chair-1", "chair-2", "chair-3", "chair-4"].map(id => buildChairRig(id, four));
    const party = createSeatingFeature({ chairs: { listChairs: () => chairRigs } })(context);
    party.syncLayout(four);
    const members = [0, 1, 2, 3].map(index => customerOf({
      renderAgentId: 10 + index, memberIndex: index, chairId: `chair-${index + 1}`,
    }));
    drive(party, SIT_TOTAL + 0.2, 60, members);
    expect(party.getReports()).toHaveLength(4);
    expect(new Set(party.getReports().map(report => report.chairId)).size).toBe(4);
    expect(party.getStats().occupantCount).toBe(4);

    // A fifth customer asking for an occupied chair is refused rather than sharing it.
    drive(party, 0.2, 60, [...members, customerOf({ renderAgentId: 99, chairId: "chair-1" })]);
    expect(party.getReports().filter(report => report.chairId === "chair-1")).toHaveLength(1);
    expect(party.getSeatPose(99)).toBeNull();
    party.dispose();
  });

  it("moves an occupant to a new chair and sends the old one home", () => {
    const two = buildLayout([0, 180]);
    const chairRigs = ["chair-1", "chair-2"].map(id => buildChairRig(id, two));
    const moved = createSeatingFeature({ chairs: { listChairs: () => chairRigs } })(context);
    moved.syncLayout(two);
    drive(moved, 0.6, 60, [customerOf({ chairId: "chair-1" })]);
    expect(chairRigs[0]!.object.position.z).toBeGreaterThan(chairRigs[0]!.home.z);

    drive(moved, 0.6, 60, [customerOf({ chairId: "chair-2" })], 100);
    expect(moved.getReports()[0]!.chairId).toBe("chair-2");
    expect(moved.getStats().occupantCount).toBe(1);
    drive(moved, CHAIR_RETURN_DELAY + 0.2, 60, [customerOf({ chairId: "chair-2" })], 200);
    expect(chairRigs[0]!.object.position.z).toBeCloseTo(chairRigs[0]!.home.z, 4);
    moved.dispose();
  });

  it("sends an abandoned chair home when its customer is cancelled mid-pull", () => {
    const rig = rigs[0]!;
    drive(feature, 0.8, 60, [customerOf()]);
    expect(rig.object.position.z).toBeGreaterThan(rig.home.z);
    drive(feature, CHAIR_RETURN_DELAY + 0.2, 60, [], 100);
    expect(feature.getStats()).toMatchObject({ occupantCount: 0, returningChairCount: 0 });
    expect(rig.object.position.z).toBeCloseTo(rig.home.z, 4);
  });

  it("stands the customer up and only then returns the chair", () => {
    drive(feature, SIT_TOTAL + 0.2, 120, [customerOf()]);
    const leaving = customerOf({ activity: "leaving", seatingPhase: "rise-pull" });
    const rig = rigs[0]!;
    drive(feature, SEAT_CLIP_SECONDS.PushChair + 0.1, 120, [leaving], 500);
    expect(feature.getReports()[0]!.phase).toBe("rise");
    expect(rig.object.position.z).toBeGreaterThan(rig.home.z + 0.2);
    drive(feature, SEAT_CLIP_SECONDS.StandUp + CHAIR_RETURN_DELAY + 0.2, 120, [leaving], 900);
    expect(rig.object.position.z).toBeCloseTo(rig.home.z, 3);
  });

  it("reduces the pull where a wall is close behind the chair", () => {
    // Chair back edge at y = 5.1; a room 5.3 m deep leaves 0.2 m minus clearance.
    const tight = buildLayout([0], 5.3);
    const rig = buildChairRig("chair-1", tight);
    const tightFeature = createSeatingFeature({ chairs: { listChairs: () => [rig] } })(context);
    tightFeature.syncLayout(tight);
    drive(tightFeature, SIT_TOTAL + 0.2, 60, [customerOf()]);
    const report = tightFeature.getReports()[0]!;
    expect(report.effectivePull).toBeCloseTo(GRIP_TRAVEL, 4);
    expect(report).toMatchObject({ usesChairClips: false, blockedBy: "wall", phase: "seated" });
    tightFeature.dispose();
  });

  it("skips the chair clips entirely when the fallback is in use", () => {
    const tight = buildLayout([0], 5.3);
    const rig = buildChairRig("chair-1", tight);
    const tightFeature = createSeatingFeature({ chairs: { listChairs: () => [rig] } })(context);
    tightFeature.syncLayout(tight);
    drive(tightFeature, 0.6, 60, [customerOf()]);
    expect(rig.object.position.z).toBeCloseTo(rig.home.z, 6);
    expect(tightFeature.getSeatPose(10)).toMatchObject({ usesChairClips: false, outwardOffset: 0 });
    tightFeature.dispose();
  });

  it("jumps straight to the end state under reduced motion", () => {
    const rig = buildChairRig("chair-1", layout);
    const still = createSeatingFeature({ chairs: { listChairs: () => [rig] }, reducedMotion: () => true })(context);
    still.syncLayout(layout);
    still.update(frameOf(snapshot([customerOf()], 1 / 60, 1), 1 / 60));
    expect(still.getReports()[0]).toMatchObject({ phase: "seated", chairPull: 0, outwardOffset: 0 });
    expect(rig.object.position.z).toBeCloseTo(rig.home.z, 6);
    still.dispose();
  });

  it("returns every chair to its layout position on reset and leaves no occupant", () => {
    const rig = rigs[0]!;
    drive(feature, 0.8, 60, [customerOf()]);
    expect(rig.object.position.z).not.toBeCloseTo(rig.home.z, 4);
    feature.reset();
    expect(feature.getStats()).toEqual({ occupantCount: 0, movingChairCount: 0, returningChairCount: 0 });
    expect(rig.object.position.equals(new THREE.Vector3(rig.home.x, rig.home.y, rig.home.z))).toBe(true);
    expect(feature.getSeatPose(10)).toBeNull();
    expect(feature.getBodyPlacements()).toHaveLength(0);
  });

  it("releases everything outside simulation and on a worker with no metadata", () => {
    const rig = rigs[0]!;
    drive(feature, 0.8, 60, [customerOf()]);
    feature.update(frameOf(undefined));
    expect(feature.getStats().occupantCount).toBe(0);
    expect(rig.object.position.z).toBeCloseTo(rig.home.z, 6);
    drive(feature, 0.8, 60, [customerOf()], 200);
    feature.update(frameOf(snapshot([customerOf()], 99, 999), 1 / 60, { simulating: false }));
    expect(feature.getStats().occupantCount).toBe(0);
  });

  it("does not touch the layout: chairs keep their stored coordinates and rotation", () => {
    const before = JSON.stringify(layout);
    drive(feature, SIT_TOTAL + 0.2, 60, [customerOf()]);
    const leaving = customerOf({ activity: "leaving", seatingPhase: "rise" });
    drive(feature, 1.5, 60, [leaving], 500);
    expect(JSON.stringify(layout)).toBe(before);
  });

  it("ignores a customer whose chair is not in this layout", () => {
    drive(feature, 0.4, 60, [customerOf({ chairId: "chair-missing" })]);
    expect(feature.getReports()).toHaveLength(0);
    expect(feature.getStats().occupantCount).toBe(0);
  });

  it("drops transient state when the layout itself changes", () => {
    const rig = rigs[0]!;
    drive(feature, 0.8, 60, [customerOf()]);
    feature.syncLayout(buildLayout([0, 180]));
    expect(feature.getStats().occupantCount).toBe(0);
    expect(rig.object.position.z).toBeCloseTo(rig.home.z, 6);
  });

  it("stops driving chairs once disposed", () => {
    const rig = rigs[0]!;
    drive(feature, 0.8, 60, [customerOf()]);
    feature.dispose();
    expect(rig.object.position.z).toBeCloseTo(rig.home.z, 6);
    drive(feature, 0.8, 60, [customerOf()], 300);
    expect(feature.getReports()).toHaveLength(0);
    expect(rig.object.position.z).toBeCloseTo(rig.home.z, 6);
    feature.dispose();
  });

  it.each(["approach", "depart"] as const satisfies readonly SeatingPhase[])("leaves the chair alone during %s", phase => {
    const rig = rigs[0]!;
    drive(feature, 1, 60, [customerOf({ activity: "walking", seatingPhase: phase })]);
    expect(rig.object.position.z).toBeCloseTo(rig.home.z, 6);
    expect(feature.getReports()[0]!.chairPull).toBe(0);
  });
});
