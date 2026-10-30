/**
 * feat-119 · Pure geometry for pulling a chair out and sitting down.
 *
 * Nothing here writes to the layout: the pull distance is a presentation value derived from the
 * chair, its table and the free floor behind it, so snapping, validation and Undo/Redo are
 * untouched. A chair with no room to move is reported, not forced — the caller then plays the
 * fallback pose the feat-112 clips document.
 */
import { footprint, objectCenter } from "@/core/layout";
import type { Chair, LayoutObject, Point, StoreLayout, Table } from "@/core/layout/types";
import { CHAIR_PULL, CHAIR_SLIDE_SECONDS, GRIP_TRAVEL } from "../seat-motion";

/** Clearance kept between the moving chair and whatever is behind it. */
export const CHAIR_BACK_CLEARANCE = 0.05;

export interface ChairAxes {
  readonly chairId: string;
  readonly tableId: string | null;
  /** Chair centre in layout metres. */
  readonly center: Point;
  /** Unit vector from the chair towards its table — the direction the sitter faces. */
  readonly facing: Point;
  /** Unit vector away from the table; the chair and the body both travel along it. */
  readonly outward: Point;
  /** Chair rotation in layout degrees, as stored. */
  readonly rotationDegrees: number;
  /** Chair footprint depth along the outward axis. */
  readonly depthAlongOutward: number;
}

export interface ChairPullSpace {
  /** Free floor behind the chair, in metres, after clearance. */
  readonly available: number;
  /** Distance the chair will actually travel: clamped to [GRIP_TRAVEL, CHAIR_PULL]. */
  readonly effectivePull: number;
  /**
   * False when even the grip travel does not fit; the caller must then skip PullChair/PushChair
   * and play SitDown/StandUp directly (SEAT_MOTION_PROFILE.fallback).
   */
  readonly usesChairClips: boolean;
  /** Id of whatever limited the space, for evidence and for feat-123. */
  readonly blockedBy: string | null;
}

const EPSILON = 1e-6;

/** Layout rotation 0 faces north (−y); the facing vector is (sin r, −cos r). */
export function chairFacing(rotationDegrees: number): Point {
  const radians = (rotationDegrees * Math.PI) / 180;
  const sin = Math.sin(radians);
  const cos = Math.cos(radians);
  const round = (value: number) => (Math.abs(value) < EPSILON ? 0 : Number(value.toFixed(6)));
  return { x: round(sin), y: round(-cos) };
}

export function chairAxes(chair: Chair, table: Table | null): ChairAxes {
  const facing = chairFacing(chair.rotation);
  const size = footprint(chair);
  const alongY = Math.abs(facing.y) > Math.abs(facing.x);
  // Negate through `0 - value` so an axis component never comes back as -0.
  const outward = { x: 0 - facing.x || 0, y: 0 - facing.y || 0 };
  return {
    chairId: chair.id,
    tableId: table?.id ?? chair.tableId ?? null,
    center: objectCenter(chair),
    facing,
    outward,
    rotationDegrees: chair.rotation,
    depthAlongOutward: alongY ? size.depth : size.width,
  };
}

/** Signed extent of a rectangle projected onto a unit axis, measured from `origin`. */
function projectedRange(rect: { x: number; y: number; width: number; depth: number }, origin: Point, axis: Point) {
  let min = Infinity;
  let max = -Infinity;
  for (const x of [rect.x, rect.x + rect.width]) {
    for (const y of [rect.y, rect.y + rect.depth]) {
      const distance = (x - origin.x) * axis.x + (y - origin.y) * axis.y;
      min = Math.min(min, distance);
      max = Math.max(max, distance);
    }
  }
  return { min, max };
}

/** True when the rectangle overlaps the chair's own width band, i.e. it is really in the way. */
function overlapsLaterally(
  rect: { x: number; y: number; width: number; depth: number },
  axes: ChairAxes,
  chairRect: { x: number; y: number; width: number; depth: number },
) {
  const lateral: Point = { x: -axes.outward.y, y: axes.outward.x };
  const own = projectedRange(chairRect, axes.center, lateral);
  const other = projectedRange(rect, axes.center, lateral);
  return Math.min(own.max, other.max) - Math.max(own.min, other.min) > EPSILON;
}

/**
 * How far this chair can slide away from its table before it hits the room wall, another object,
 * or the chair set of the table behind it.
 */
export function chairPullSpace(layout: StoreLayout, chair: Chair, table: Table | null): ChairPullSpace {
  const axes = chairAxes(chair, table);
  const chairRect = footprint(chair);
  const back = axes.depthAlongOutward / 2;

  // Room wall along the outward axis.
  const wallDistance = axes.outward.x > 0
    ? layout.width - (axes.center.x + back)
    : axes.outward.x < 0
      ? axes.center.x - back
      : axes.outward.y > 0
        ? layout.depth - (axes.center.y + back)
        : axes.center.y - back;
  let available = Math.max(0, wallDistance - CHAIR_BACK_CLEARANCE);
  let blockedBy: string | null = available < CHAIR_PULL ? "wall" : null;

  for (const object of layout.objects as readonly LayoutObject[]) {
    if (object.id === chair.id || object.id === table?.id) continue;
    const rect = footprint(object);
    if (!overlapsLaterally(rect, axes, chairRect)) continue;
    const range = projectedRange(rect, axes.center, axes.outward);
    // Only things in front of the chair's back edge can limit the slide.
    if (range.max <= back + EPSILON) continue;
    const gap = Math.max(0, range.min - back - CHAIR_BACK_CLEARANCE);
    if (gap < available) {
      available = gap;
      blockedBy = object.id;
    }
  }

  const effectivePull = Math.min(CHAIR_PULL, available);
  return {
    available: Number(available.toFixed(4)),
    effectivePull: Number(Math.max(GRIP_TRAVEL, effectivePull).toFixed(4)),
    usesChairClips: effectivePull >= GRIP_TRAVEL - EPSILON,
    blockedBy,
  };
}

/** Seconds the chair needs to travel `distance`, at the same speed as the full pull. */
export function chairSlideSeconds(distance: number): number {
  if (!Number.isFinite(distance) || distance <= 0) return 0;
  return (Math.min(distance, CHAIR_PULL) / CHAIR_PULL) * CHAIR_SLIDE_SECONDS;
}

/** Layout point offset along the outward axis — used for both the chair and the body. */
export function offsetAlongOutward(axes: ChairAxes, metres: number): Point {
  return {
    x: Number((axes.center.x + axes.outward.x * metres).toFixed(6)),
    y: Number((axes.center.y + axes.outward.y * metres).toFixed(6)),
  };
}
