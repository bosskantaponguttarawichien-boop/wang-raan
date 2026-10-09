/**
 * Clearance — PRD.md §5.5 (ตรวจเฉพาะพื้นที่ที่จำเป็นต่อการเดินและใช้งาน)
 * - ทางเดินหลัก (Entrance → Counter) แคบกว่า 1.20 ม. → Blocked
 * - ทางเดินรอง (Entrance → Table / Kitchen) แคบกว่า 0.90 ม. → Blocked
 * - พื้นที่เข้าถึง Chair (ด้านหลังหรือด้านข้างอย่างน้อย 1 ด้าน) แคบกว่า 0.60 ม. → Blocked
 * กรณีเดินไปไม่ถึงเลย เป็นหน้าที่ของ Accessibility (ไม่รายงานซ้ำที่นี่)
 */
import { CLEARANCE } from "../layout/constants";
import { directionVector, footprint, rectsIntersect } from "../layout/geometry";
import type { Chair, LayoutObject, Rect, StoreLayout, ValidationIssue } from "../layout/types";
import { isInsideRoom } from "./collision";
import { OBJECT_LABEL, createIssue } from "./issues";
import { analyzeRoutes, type RouteAnalysis } from "./routes";

const EPSILON = 1e-9;

/**
 * แถบพื้นที่เข้าถึงเก้าอี้ลึก 0.60 ม.: ด้านหลัง และด้านข้างสองฝั่ง
 * แถบด้านข้างนับเฉพาะส่วนของเก้าอี้ที่ไม่ได้สอดอยู่ใต้โต๊ะของตัวเอง
 */
export function chairAccessStrips(chair: Chair, ownTable?: LayoutObject): Rect[] {
  const c = footprint(chair);
  const depth = CLEARANCE.chairAccess;
  const f = directionVector(chair.rotation);
  const t = ownTable ? footprint(ownTable) : null;

  if (f.x === 0) {
    // หันเหนือ/ใต้: ด้านหลังอยู่ตามแกน y, ด้านข้างอยู่ตามแกน x
    const back: Rect = f.y < 0 ? { x: c.x, y: c.y + c.depth, width: c.width, depth } : { x: c.x, y: c.y - depth, width: c.width, depth };
    let y0 = c.y;
    let y1 = c.y + c.depth;
    if (t) {
      if (f.y < 0) y0 = Math.max(y0, Math.min(y1, t.y + t.depth));
      else y1 = Math.min(y1, Math.max(y0, t.y));
    }
    const sides: Rect[] =
      y1 - y0 > EPSILON
        ? [
            { x: c.x - depth, y: y0, width: depth, depth: y1 - y0 },
            { x: c.x + c.width, y: y0, width: depth, depth: y1 - y0 },
          ]
        : [];
    return [back, ...sides];
  }

  const back: Rect = f.x < 0 ? { x: c.x + c.width, y: c.y, width: depth, depth: c.depth } : { x: c.x - depth, y: c.y, width: depth, depth: c.depth };
  let x0 = c.x;
  let x1 = c.x + c.width;
  if (t) {
    if (f.x < 0) x0 = Math.max(x0, Math.min(x1, t.x + t.width));
    else x1 = Math.min(x1, Math.max(x0, t.x));
  }
  const sides: Rect[] =
    x1 - x0 > EPSILON
      ? [
          { x: x0, y: c.y - depth, width: x1 - x0, depth },
          { x: x0, y: c.y + c.depth, width: x1 - x0, depth },
        ]
      : [];
  return [back, ...sides];
}

/** เก้าอี้มีแถบเข้าถึงที่ว่างอย่างน้อย 1 แถบ (อยู่ในร้านและไม่ทับวัตถุใด) */
export function hasChairAccess(layout: StoreLayout, chair: Chair): boolean {
  const ownTable = layout.objects.find((o) => o.id === chair.tableId && o.type === "table");
  const others = layout.objects.filter((o) => o.id !== chair.id).map((o) => footprint(o));
  return chairAccessStrips(chair, ownTable).some(
    (strip) => isInsideRoom(strip, layout) && !others.some((r) => rectsIntersect(strip, r)),
  );
}

const AISLE_MESSAGE = {
  main: (label: string) => `ทางเดินหลักจากทางเข้าไป${label}แคบกว่า ${CLEARANCE.mainAisle.toFixed(2)} ม.`,
  secondary: (label: string) => `ทางเดินรองจากทางเข้าไป${label}แคบกว่า ${CLEARANCE.secondaryAisle.toFixed(2)} ม.`,
} as const;

export function checkClearance(
  layout: StoreLayout,
  analysis: RouteAnalysis | null = analyzeRoutes(layout),
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const obj of layout.objects) {
    if (obj.type === "chair" && !hasChairAccess(layout, obj)) {
      issues.push(
        createIssue(
          "clearance",
          "chair-access",
          "blocked",
          [obj.id],
          `พื้นที่เข้าถึงเก้าอี้ด้านหลังและด้านข้างแคบกว่า ${CLEARANCE.chairAccess.toFixed(2)} ม.`,
        ),
      );
    }
  }

  if (analysis?.entranceConnected) {
    for (const route of analysis.routes) {
      if (route.status !== "narrow" || route.aisle === "chair") continue;
      const code = route.aisle === "main" ? "main-aisle" : "secondary-aisle";
      issues.push(
        createIssue("clearance", code, "blocked", [route.object.id], AISLE_MESSAGE[route.aisle](OBJECT_LABEL[route.object.type])),
      );
    }
  }
  return issues;
}
