/**
 * สรุปผังร้าน (feat-025) — ตัวเลขสำหรับรายงาน/การพิมพ์: จำนวนชิ้น ที่นั่ง พื้นที่ และผลตรวจ
 */
import type { IssueCategory, StoreLayout, ValidationResult, ValidationStatus } from "../layout/types";

export interface LayoutSummary {
  width: number;
  depth: number;
  /** ตร.ม. */
  area: number;
  entrance: { wall: string; position: number; width: number } | null;
  counts: { kitchen: number; counter: number; table: number; chair: number };
  tables: { twoSeats: number; fourSeats: number; custom: number };
  /** เก้าอี้ที่ใช้งานได้ (สังกัดโต๊ะที่มีอยู่จริงและโต๊ะระบุเก้าอี้ตัวนั้น) */
  seats: number;
  /** ตร.ม. ต่อที่นั่ง (null เมื่อไม่มีที่นั่ง) */
  areaPerSeat: number | null;
  status: ValidationStatus;
  issues: { blocked: number; warning: number; byCategory: Record<IssueCategory, number> };
}

export function summarizeLayout(layout: StoreLayout, validation: ValidationResult): LayoutSummary {
  const counts = { kitchen: 0, counter: 0, table: 0, chair: 0 };
  const tables = { twoSeats: 0, fourSeats: 0, custom: 0 };
  const tableChairs = new Map<string, Set<string>>();
  for (const obj of layout.objects) {
    counts[obj.type]++;
    if (obj.type !== "table") continue;
    tableChairs.set(obj.id, new Set(obj.chairIds));
    if (obj.preset === "table-2-seats") tables.twoSeats++;
    else if (obj.preset === "table-4-seats") tables.fourSeats++;
    else tables.custom++;
  }
  const seats = layout.objects.filter((o) => o.type === "chair" && tableChairs.get(o.tableId)?.has(o.id)).length;
  const area = Math.round(layout.width * layout.depth * 100) / 100;
  const byCategory: Record<IssueCategory, number> = { completeness: 0, collision: 0, clearance: 0, accessibility: 0 };
  for (const issue of validation.issues) byCategory[issue.category]++;

  return {
    width: layout.width,
    depth: layout.depth,
    area,
    entrance: layout.entrance && { wall: layout.entrance.wall, position: layout.entrance.position, width: layout.entrance.width },
    counts,
    tables,
    seats,
    areaPerSeat: seats > 0 ? Math.round((area / seats) * 100) / 100 : null,
    status: validation.status,
    issues: {
      blocked: validation.issues.filter((i) => i.severity === "blocked").length,
      warning: validation.issues.filter((i) => i.severity === "warning").length,
      byCategory,
    },
  };
}
