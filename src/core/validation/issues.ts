import type { IssueCategory, IssueSeverity, LayoutObjectType, ValidationIssue } from "../layout/types";

/** ชื่อเรียกวัตถุภาษาไทยสำหรับข้อความ issue */
export const OBJECT_LABEL: Record<LayoutObjectType, string> = {
  kitchen: "ครัว",
  counter: "เคาน์เตอร์",
  table: "โต๊ะ",
  chair: "เก้าอี้",
};

/**
 * สร้าง ValidationIssue ที่มี id คงที่ (deterministic) จาก category, code และวัตถุที่เกี่ยวข้อง
 * รูปแบบ id: `<category>/<code>[/<objectId>+<objectId>]`
 */
export function createIssue(
  category: IssueCategory,
  code: string,
  severity: IssueSeverity,
  objectIds: string[],
  message: string,
): ValidationIssue {
  const suffix = objectIds.length > 0 ? `/${objectIds.join("+")}` : "";
  return { id: `${category}/${code}${suffix}`, category, severity, objectIds, message };
}

/** code ของ issue (ส่วนกลางของ id) — ใช้ในเทสต์และ UI */
export function issueCode(issue: Pick<ValidationIssue, "id">): string {
  return issue.id.split("/")[1] ?? "";
}
