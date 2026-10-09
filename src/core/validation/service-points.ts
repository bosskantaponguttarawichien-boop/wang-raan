/**
 * Service Points — คำนวณจุดบริการอัตโนมัติจาก Bounding Box (architecture.md §6)
 * จุดบริการของวัตถุ = จุดที่คนกว้าง 0.60 ม. เดินมาจากทางเข้าได้และยืนแตะขอบ bounding box
 * (ด้านใดก็ได้) — เลือกจุดที่ใกล้ศูนย์กลางวัตถุที่สุดเป็นจุดตัวแทนสำหรับ P2
 */
import { footprint, objectCenter } from "../layout/geometry";
import type { LayoutObject, Point, StoreLayout } from "../layout/types";
import { MIN_WALK_WIDTH, analyzeRoutes, type RouteAnalysis } from "./routes";
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
  return obj.type === "table" || obj.type === "kitchen" || obj.type === "counter";
}

export function computeServicePoints(
  layout: StoreLayout,
  analysis: RouteAnalysis | null = analyzeRoutes(layout),
): ServicePoint[] {
  return layout.objects.filter(isServiceObject).map((obj) => {
    if (!analysis) return { objectId: obj.id, type: obj.type, point: null, candidates: 0 };
    const points = touchingReachablePoints(
      analysis.grid,
      analysis.reachable.get(MIN_WALK_WIDTH)!,
      footprint(obj),
      MIN_WALK_WIDTH,
    );
    const center = objectCenter(obj);
    let best: Point | null = null;
    let bestDistance = Infinity;
    for (const p of points) {
      const d = Math.hypot(p.x - center.x, p.y - center.y);
      if (d < bestDistance - 1e-12) {
        best = p;
        bestDistance = d;
      }
    }
    return { objectId: obj.id, type: obj.type, point: best, candidates: points.length };
  });
}
