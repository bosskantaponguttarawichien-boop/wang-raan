/**
 * Accessibility — PRD.md §5.6
 * - Entrance ไม่อยู่บนผนัง หรือไม่เชื่อมกับพื้นที่เดินภายใน → Blocked
 *   (ไม่รายงานปลายทางทีละชิ้นซ้ำ เพราะทุกชิ้นจะเข้าไม่ถึงตามกัน)
 * - ลูกค้าเดินจาก Entrance ไปถึง Chair ไม่ได้ → Blocked
 * - พนักงานเข้าถึงจุดบริการของ Table / Kitchen / Counter ไม่ได้ → Blocked
 * การเข้าถึงใช้ความกว้างเดินขั้นต่ำ 0.60 ม. และใช้ทิศ/มุมหมุนจริงผ่าน footprint ของวัตถุ
 */
import type { StoreLayout, ValidationIssue } from "../layout/types";
import { createIssue } from "./issues";
import { analyzeRoutes, type RouteAnalysis } from "./routes";

const UNREACHABLE_MESSAGE = {
  chair: "ลูกค้าเดินจากทางเข้าไปถึงเก้าอี้ตัวนี้ไม่ได้",
  table: "พนักงานเข้าถึงจุดบริการของโต๊ะนี้ไม่ได้",
  kitchen: "พนักงานเข้าถึงครัวไม่ได้",
  counter: "พนักงานเข้าถึงเคาน์เตอร์ไม่ได้",
} as const;

export function checkAccessibility(
  layout: StoreLayout,
  analysis: RouteAnalysis | null = analyzeRoutes(layout),
): ValidationIssue[] {
  if (!analysis || !layout.entrance) return [];
  const entranceId = layout.entrance.id;

  if (!analysis.entranceOnWall) {
    return [createIssue("accessibility", "entrance-off-wall", "blocked", [entranceId], "ทางเข้าอยู่เลยแนวผนังร้าน")];
  }
  if (!analysis.entranceConnected) {
    return [
      createIssue(
        "accessibility",
        "entrance-disconnected",
        "blocked",
        [entranceId],
        "ทางเข้าไม่เชื่อมกับพื้นที่เดินภายในร้าน",
      ),
    ];
  }

  return analysis.routes
    .filter((route) => route.status === "unreachable")
    .map((route) =>
      createIssue(
        "accessibility",
        `unreachable-${route.object.type}`,
        "blocked",
        [route.object.id],
        UNREACHABLE_MESSAGE[route.object.type],
      ),
    );
}
