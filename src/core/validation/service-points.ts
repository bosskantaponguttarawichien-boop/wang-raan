/**
 * Service Points — คำนวณจุดบริการอัตโนมัติจาก Bounding Box (architecture.md §6)
 * จุดบริการของวัตถุ = จุดที่คนกว้าง 0.60 ม. เดินมาจากทางเข้าได้และยืนแตะขอบ bounding box
 * (ด้านใดก็ได้) — เลือกจุดที่ใกล้ศูนย์กลางวัตถุที่สุดเป็นจุดตัวแทนสำหรับ P2
 * ครัวเป็นห้องแยก: จุดบริการของครัวคือจุดหน้าประตูครัว (objectId = id ของประตูครัว)
 */
import { footprint, objectCenter } from "../layout/geometry";
import type { LayoutObject, Point, Rect, StoreLayout } from "../layout/types";
import { MIN_WALK_WIDTH, analyzeRoutes, doorRect, type RouteAnalysis } from "./routes";
import { touchingReachablePoints } from "./walk-grid";

export type ServiceObjectType = "table" | "kitchen" | "counter";

export interface ServicePoint {
  objectId: string;
  type: ServiceObjectType;
  /** null = ไม่มีจุดที่เข้าถึงได้ */
  point: Point | null;
  /** จำนวนจุดบน lattice ที่เข้าถึงได้รอบวัตถุ */
  candidates: number;
}

function isServiceObject(obj: LayoutObject): obj is LayoutObject & { type: ServiceObjectType } {
  return obj.type === "table" || obj.type === "counter";
}

export function computeServicePoints(
  layout: StoreLayout,
  analysis: RouteAnalysis | null = analyzeRoutes(layout),
): ServicePoint[] {
  const pointFor = (objectId: string, type: ServiceObjectType, rect: Rect | null, center: Point): ServicePoint => {
    if (!analysis || !rect) return { objectId, type, point: null, candidates: 0 };
    const points = touchingReachablePoints(analysis.grid, analysis.reachable.get(MIN_WALK_WIDTH)!, rect, MIN_WALK_WIDTH);
    let best: Point | null = null;
    let bestDistance = Infinity;
    for (const p of points) {
      const d = Math.hypot(p.x - center.x, p.y - center.y);
      if (d < bestDistance - 1e-12) {
        best = p;
        bestDistance = d;
      }
    }
    return { objectId, type, point: best, candidates: points.length };
  };

  const result = layout.objects
    .filter(isServiceObject)
    .map((obj) => pointFor(obj.id, obj.type, footprint(obj), objectCenter(obj)));
  if (layout.kitchenDoor) {
    const rect = doorRect(layout, layout.kitchenDoor);
    const center = rect ? { x: rect.x + rect.width / 2, y: rect.y + rect.depth / 2 } : { x: 0, y: 0 };
    result.push(pointFor(layout.kitchenDoor.id, "kitchen", rect, center));
  }
  return result;
}
