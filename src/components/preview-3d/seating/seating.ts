/**
 * feat-119 · The `seating` scene feature: it moves each chair along its own outward axis and tells
 * the host and feat-118 where the body and the clip should be.
 *
 * What it never does: write to the layout, re-snap a coordinate, touch validation or Undo/Redo, or
 * guess a chair. Chairs come from `party.chairIds` through the snapshot, one occupant each, and
 * `reset()` puts every chair back exactly where the layout has it.
 */
import { objectCenter } from "@/core/layout";
import type { Chair, Point, StoreLayout, Table } from "@/core/layout/types";
import type { PresentationSnapshot } from "@/core/simulation/presentation-contract";
import type { SceneFeature, SceneFeatureContext, SceneFrame } from "../runtime/contracts";
import { CHAIR_RETURN_DELAY } from "../seat-motion";
import type {
  ChairRig,
  CustomerSeatPose,
  SeatBodyPlacement,
  SeatingOptions,
  SeatingReport,
} from "./contracts";
import {
  advanceSeatSequence,
  createSeatSequence,
  describeSeatSequence,
  type SeatIntent,
  type SeatSequenceState,
} from "./seat-sequence";
import {
  chairAxes,
  chairPullSpace,
  offsetAlongOutward,
  type ChairAxes,
  type ChairPullSpace,
} from "./seating-geometry";

export interface SeatingFeature extends SceneFeature {
  /** feat-118's pull port: the pose for one customer, or null when they are not seated here. */
  getSeatPose(renderAgentId: number): CustomerSeatPose | null;
  /** Where the host should draw each seated or seating body. */
  getBodyPlacements(): readonly SeatBodyPlacement[];
  getReports(): readonly SeatingReport[];
  getStats(): {
    readonly occupantCount: number;
    readonly movingChairCount: number;
    readonly returningChairCount: number;
  };
}

interface IndexedChair {
  readonly chair: Chair;
  readonly axes: ChairAxes;
  readonly space: ChairPullSpace;
}

interface Occupant {
  readonly renderAgentId: number;
  readonly chairId: string;
  sequence: SeatSequenceState;
}

const SEATED_PHASES = new Set(["pull", "sit", "push", "seated"]);
const LEAVING_PHASES = new Set(["rise-pull", "rise", "depart"]);

/** Layout (x, y) maps to scene (x, 0, z = y). */
function sceneOffset(axes: ChairAxes, metres: number) {
  return { x: axes.outward.x * metres, z: axes.outward.y * metres };
}

export function createSeatingFeature(options: SeatingOptions) {
  return (context: SceneFeatureContext): SeatingFeature => {
    const chairs = new Map<string, IndexedChair>();
    const occupants = new Map<number, Occupant>();
    /** chairId → renderAgentId, so two customers can never claim the same chair. */
    const claims = new Map<string, number>();
    /** Chairs travelling home after their occupant vanished: chairId → { pull, remaining }. */
    const returning = new Map<string, { pull: number; remaining: number }>();
    const reports: SeatingReport[] = [];
    const placements: SeatBodyPlacement[] = [];
    const poses = new Map<number, CustomerSeatPose>();
    let disposed = false;

    const indexLayout = (layout: StoreLayout) => {
      chairs.clear();
      const tables = new Map<string, Table>();
      for (const object of layout.objects) if (object.type === "table") tables.set(object.id, object);
      for (const object of layout.objects) {
        if (object.type !== "chair") continue;
        const table = tables.get(object.tableId) ?? null;
        chairs.set(object.id, {
          chair: object,
          axes: chairAxes(object, table),
          space: chairPullSpace(layout, object, table),
        });
      }
    };

    const applyChairPull = (rig: ChairRig, pull: number) => {
      const indexed = chairs.get(rig.chairId);
      if (!indexed) return;
      const offset = sceneOffset(indexed.axes, pull);
      rig.object.position.set(rig.home.x + offset.x, rig.home.y, rig.home.z + offset.z);
    };

    const restoreChairs = () => {
      for (const rig of options.chairs.listChairs()) {
        if (rig.removed) continue;
        rig.object.position.set(rig.home.x, rig.home.y, rig.home.z);
      }
    };

    const releaseOccupant = (occupant: Occupant) => {
      if (claims.get(occupant.chairId) === occupant.renderAgentId) claims.delete(occupant.chairId);
      poses.delete(occupant.renderAgentId);
      // A cancelled customer still leaves a chair standing out; it travels home on its own.
      if (occupant.sequence.chairPull > 1e-6) {
        returning.set(occupant.chairId, { pull: occupant.sequence.chairPull, remaining: CHAIR_RETURN_DELAY });
      }
      occupants.delete(occupant.renderAgentId);
    };

    const intentOf = (phase: string | null, activity: string): SeatIntent => {
      if (phase && LEAVING_PHASES.has(phase)) return "leave";
      if (activity === "leaving") return "leave";
      if (phase && SEATED_PHASES.has(phase)) return "sit";
      return "approach";
    };

    const updateFrom = (snapshot: PresentationSnapshot, frame: SceneFrame) => {
      const reducedMotion = options.reducedMotion?.() ?? false;
      // ท่าดึงเก้าอี้/นั่ง/ลุกเล่นตามเพดานท่าทาง ไม่เร่งตามเวลาจำลอง
      const deltaSeconds = Math.max(0, frame.realDeltaSeconds) * Math.max(frame.motionRate ?? frame.playbackRate, 1e-6);
      const rigs = new Map(options.chairs.listChairs().filter(rig => !rig.removed).map(rig => [rig.chairId, rig]));
      const live = new Set<number>();

      for (const customer of snapshot.customers) {
        const chairId = customer.chairId;
        if (!chairId) continue;
        const indexed = chairs.get(chairId);
        if (!indexed) continue;
        const claimedBy = claims.get(chairId);
        if (claimedBy !== undefined && claimedBy !== customer.renderAgentId) continue;

        let occupant = occupants.get(customer.renderAgentId);
        if (occupant && occupant.chairId !== chairId) {
          // Reassigned to another chair: the old one goes home, the new sequence starts clean.
          releaseOccupant(occupant);
          occupant = undefined;
        }
        if (!occupant) {
          occupant = { renderAgentId: customer.renderAgentId, chairId, sequence: createSeatSequence() };
          occupants.set(customer.renderAgentId, occupant);
        }
        claims.set(chairId, customer.renderAgentId);
        returning.delete(chairId);
        live.add(customer.renderAgentId);

        const sequenceOptions = { effectivePull: indexed.space.effectivePull, usesChairClips: indexed.space.usesChairClips };
        const intent = intentOf(customer.seatingPhase, customer.activity);
        // Reduced motion: jump through the travel so the end state is reached without sliding.
        const step = reducedMotion ? Number.POSITIVE_INFINITY : deltaSeconds;
        occupant.sequence = Number.isFinite(step)
          ? advanceSeatSequence(occupant.sequence, step, intent, sequenceOptions)
          : advanceSeatSequence(occupant.sequence, 1e6, intent, sequenceOptions);
        const state = describeSeatSequence(occupant.sequence, sequenceOptions);
        occupant.sequence = state;

        const rig = rigs.get(chairId);
        if (rig) applyChairPull(rig, state.chairPull);

        const point: Point = offsetAlongOutward(indexed.axes, state.outwardOffset);
        poses.set(customer.renderAgentId, {
          renderAgentId: customer.renderAgentId,
          phase: state.phase,
          clipPhase: state.clipPhase,
          outwardOffset: state.outwardOffset,
          usesChairClips: state.usesChairClips,
        });
        placements.push({
          renderAgentId: customer.renderAgentId, chairId, point,
          outwardOffset: state.outwardOffset, facing: indexed.axes.facing,
          seated: !state.bodyClear,
        });
        reports.push({
          renderAgentId: customer.renderAgentId, chairId, tableId: indexed.axes.tableId,
          phase: state.phase, clipPhase: state.clipPhase, chairPull: state.chairPull,
          outwardOffset: state.outwardOffset, effectivePull: indexed.space.effectivePull,
          usesChairClips: state.usesChairClips, handOnBackrest: state.handOnBackrest,
          bodyClear: state.bodyClear, blockedBy: indexed.space.blockedBy,
        });
      }

      for (const occupant of [...occupants.values()]) if (!live.has(occupant.renderAgentId)) releaseOccupant(occupant);

      for (const [chairId, entry] of [...returning]) {
        const rig = rigs.get(chairId);
        entry.remaining = reducedMotion ? 0 : Math.max(0, entry.remaining - deltaSeconds);
        const pull = entry.remaining <= 0 ? 0 : entry.pull * (entry.remaining / CHAIR_RETURN_DELAY);
        if (rig) applyChairPull(rig, pull);
        if (pull <= 1e-6) returning.delete(chairId);
      }
    };

    const feature: SeatingFeature = {
      syncLayout(layout: StoreLayout) {
        indexLayout(layout);
        // A layout change invalidates every pull distance, so transient seating state is dropped.
        feature.reset();
      },
      update(frame: SceneFrame) {
        if (disposed) return;
        reports.length = 0;
        placements.length = 0;
        const snapshot = frame.presentation;
        if (!frame.simulating || !snapshot) {
          if (occupants.size || returning.size) feature.reset();
          return;
        }
        updateFrom(snapshot, frame);
      },
      getSeatPose: (renderAgentId: number) => poses.get(renderAgentId) ?? null,
      getBodyPlacements: () => placements,
      getReports: () => reports,
      getStats: () => ({
        occupantCount: occupants.size,
        movingChairCount: [...occupants.values()].filter(entry => entry.sequence.chairPull > 1e-6).length,
        returningChairCount: returning.size,
      }),
      reset() {
        reports.length = 0;
        placements.length = 0;
        occupants.clear();
        claims.clear();
        returning.clear();
        poses.clear();
        restoreChairs();
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        feature.reset();
        chairs.clear();
        context.root.clear();
      },
    };
    return feature;
  };
}

/** Chair centre in layout metres, for hosts that only hold the chair object. */
export function chairCenter(chair: Chair): Point {
  return objectCenter(chair);
}
