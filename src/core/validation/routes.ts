/**
 * Route analysis — นิยาม "เส้นทางที่จำเป็น" ของ V1 (PRD §5.5 / §9 เปิดให้ implementation กำหนด)
 *
 * | เส้นทาง                      | ปลายทาง (แตะ bounding box) | ความกว้างที่ต้องการ |
 * | ทางเดินหลัก (ลูกค้าสั่ง/จ่าย) | Entrance → Counter          | 1.20 ม.            |
 * | ทางเดินรอง (ลูกค้า/พนักงาน)   | Entrance → Table, Kitchen   | 0.90 ม.            |
 * | ทางเข้าถึงเก้าอี้              | Entrance → Chair            | 0.60 ม.            |
 *
 * ผลของแต่ละปลายทาง:
 * - ok          : วงกลมกว้างตามที่ต้องการเดินจากทางเข้าไปแตะได้
 * - narrow      : เดินถึงได้ด้วยความกว้างขั้นต่ำ 0.60 ม. แต่แคบกว่าที่ต้องการ → Clearance
 * - unreachable : แม้ 0.60 ม. ก็เดินไปไม่ถึง → Accessibility
 */
import { CLEARANCE } from "../layout/constants";
import { footprint } from "../layout/geometry";
import type { LayoutObject, LayoutObjectType, Meters, StoreLayout } from "../layout/types";
import {
  buildWalkGrid,
  entranceStartIndices,
  reachableFromEntrance,
  touchingReachablePoints,
  type WalkGrid,
} from "./walk-grid";

export type AisleKind = "main" | "secondary" | "chair";

export const ROUTE_REQUIREMENTS: Record<LayoutObjectType, { aisle: AisleKind; width: Meters }> = {
  counter: { aisle: "main", width: CLEARANCE.mainAisle },
  table: { aisle: "secondary", width: CLEARANCE.secondaryAisle },
  kitchen: { aisle: "secondary", width: CLEARANCE.secondaryAisle },
  chair: { aisle: "chair", width: CLEARANCE.chairAccess },
};

/** ความกว้างขั้นต่ำที่ถือว่า "ยังเดินได้" */
export const MIN_WALK_WIDTH: Meters = CLEARANCE.chairAccess;

export type RouteStatus = "ok" | "narrow" | "unreachable";

export interface RouteResult {
  object: LayoutObject;
  aisle: AisleKind;
  requiredWidth: Meters;
  status: RouteStatus;
}

export interface RouteAnalysis {
  grid: WalkGrid;
  /** ทางเข้าอยู่บนผนังจริง */
  entranceOnWall: boolean;
  /** วงกลมกว้างขั้นต่ำเข้าจากประตูมายืนในร้านได้ */
  entranceConnected: boolean;
  /** พื้นที่ที่เดินถึงได้ แยกตามความกว้าง */
  reachable: Map<Meters, Uint8Array>;
  routes: RouteResult[];
}

/** วิเคราะห์เส้นทางทั้งหมด (null เมื่อยังไม่มีทางเข้า — Completeness รายงานแล้ว) */
export function analyzeRoutes(layout: StoreLayout): RouteAnalysis | null {
  if (!layout.entrance) return null;
  const grid = buildWalkGrid(layout);
  const widths = [...new Set([MIN_WALK_WIDTH, ...Object.values(ROUTE_REQUIREMENTS).map((r) => r.width)])];
  const reachable = new Map(widths.map((w) => [w, reachableFromEntrance(grid, w)] as const));
  const entranceOnWall = grid.opening !== null;
  const entranceConnected = entranceStartIndices(grid, MIN_WALK_WIDTH).length > 0;

  const touches = (obj: LayoutObject, width: Meters) =>
    touchingReachablePoints(grid, reachable.get(width)!, footprint(obj), width).length > 0;

  const routes = layout.objects.map((object): RouteResult => {
    const { aisle, width } = ROUTE_REQUIREMENTS[object.type];
    const status: RouteStatus = touches(object, width)
      ? "ok"
      : width > MIN_WALK_WIDTH && touches(object, MIN_WALK_WIDTH)
        ? "narrow"
        : "unreachable";
    return { object, aisle, requiredWidth: width, status };
  });

  return { grid, entranceOnWall, entranceConnected, reachable, routes };
}
