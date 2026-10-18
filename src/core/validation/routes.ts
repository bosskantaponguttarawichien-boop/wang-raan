/**
 * Route analysis — นิยาม "เส้นทางที่จำเป็น" ของ V1 (PRD §5.5 / §9 เปิดให้ implementation กำหนด)
 *
 * | เส้นทาง                      | ปลายทาง (แตะ bounding box) | ความกว้างที่ต้องการ |
 * | ทางเดินหลัก (ลูกค้าสั่ง/จ่าย) | Entrance → Counter          | 1.20 ม.            |
 * | ทางเดินรอง (ลูกค้า/พนักงาน)   | Entrance → Table, ประตูครัว | 0.90 ม.            |
 * | ทางเข้าถึงเก้าอี้              | Entrance → Chair            | 0.60 ม.            |
 *
 * ผลของแต่ละปลายทาง:
 * - ok          : วงกลมกว้างตามที่ต้องการเดินจากทางเข้าไปแตะได้
 * - narrow      : เดินถึงได้ด้วยความกว้างขั้นต่ำ 0.60 ม. แต่แคบกว่าที่ต้องการ → Clearance
 * - unreachable : แม้ 0.60 ม. ก็เดินไปไม่ถึง → Accessibility
 */
import { CLEARANCE } from "../layout/constants";
import { footprint } from "../layout/geometry";
import type { KitchenDoor, LayoutObject, LayoutObjectType, Meters, Rect, StoreLayout } from "../layout/types";
import {
  buildWalkGrid,
  entranceSegment,
  entranceStartIndices,
  reachableFromEntrance,
  touchingReachablePoints,
  type WalkGrid,
} from "./walk-grid";

export type AisleKind = "main" | "secondary" | "chair";

/** นิยามเส้นทางที่จำเป็น — ยืนยันโดยเจ้าของผลิตภัณฑ์ 2026-10-10 (PRD §9 ข้อ 7, feat-034) */
export const ROUTE_REQUIREMENTS: Record<LayoutObjectType, { aisle: AisleKind; width: Meters }> = {
  counter: { aisle: "main", width: CLEARANCE.mainAisle },
  table: { aisle: "secondary", width: CLEARANCE.secondaryAisle },
  chair: { aisle: "chair", width: CLEARANCE.chairAccess },
};

/** ประตูครัว (ครัวเป็นห้องแยก) — พนักงานใช้ทางเดินรอง */
export const KITCHEN_DOOR_ROUTE: { aisle: AisleKind; width: Meters } = {
  aisle: "secondary",
  width: CLEARANCE.secondaryAisle,
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
  /** เส้นทางไปหน้าประตูครัว (null = ยังไม่มีประตูครัว — Completeness รายงานแล้ว) */
  kitchenDoor: KitchenDoorRoute | null;
}

export interface KitchenDoorRoute {
  door: KitchenDoor;
  /** ช่องประตูอยู่บนผนังจริง (false → ไม่วัดเส้นทาง) */
  onWall: boolean;
  requiredWidth: Meters;
  status: RouteStatus;
}

/** ช่องประตูบนผนังในรูป Rect หนา 0 (ใช้หาจุดที่ยืนแตะหน้าประตูได้) */
export function doorRect(layout: Pick<StoreLayout, "width" | "depth">, door: KitchenDoor): Rect | null {
  const seg = entranceSegment(layout, door);
  if (!seg) return null;
  return {
    x: Math.min(seg.a.x, seg.b.x),
    y: Math.min(seg.a.y, seg.b.y),
    width: Math.abs(seg.b.x - seg.a.x),
    depth: Math.abs(seg.b.y - seg.a.y),
  };
}

/** วิเคราะห์เส้นทางทั้งหมด (null เมื่อยังไม่มีทางเข้า — Completeness รายงานแล้ว) */
export function analyzeRoutes(layout: StoreLayout): RouteAnalysis | null {
  if (!layout.entrance) return null;
  const grid = buildWalkGrid(layout);
  const widths = [...new Set([MIN_WALK_WIDTH, ...Object.values(ROUTE_REQUIREMENTS).map((r) => r.width)])];
  const reachable = new Map(widths.map((w) => [w, reachableFromEntrance(grid, w)] as const));
  const entranceOnWall = grid.opening !== null;
  const entranceConnected = entranceStartIndices(grid, MIN_WALK_WIDTH).length > 0;

  const touches = (rect: Rect, width: Meters) =>
    touchingReachablePoints(grid, reachable.get(width)!, rect, width).length > 0;
  const statusOf = (rect: Rect, width: Meters): RouteStatus =>
    touches(rect, width) ? "ok" : width > MIN_WALK_WIDTH && touches(rect, MIN_WALK_WIDTH) ? "narrow" : "unreachable";

  const routes = layout.objects.map((object): RouteResult => {
    const { aisle, width } = ROUTE_REQUIREMENTS[object.type];
    return { object, aisle, requiredWidth: width, status: statusOf(footprint(object), width) };
  });

  let kitchenDoor: KitchenDoorRoute | null = null;
  if (layout.kitchenDoor) {
    const rect = doorRect(layout, layout.kitchenDoor);
    const width = KITCHEN_DOOR_ROUTE.width;
    kitchenDoor = {
      door: layout.kitchenDoor,
      onWall: rect !== null,
      requiredWidth: width,
      status: rect ? statusOf(rect, width) : "unreachable",
    };
  }

  return { grid, entranceOnWall, entranceConnected, reachable, routes, kitchenDoor };
}
