/**
 * Completeness Gate — PRD.md §5.3
 * ขาด Entrance / Kitchen / Counter / Table / Chair ที่ใช้งานได้ → Blocked
 * Chair ที่ไม่มีโต๊ะแม่หรืออยู่นอกความสัมพันธ์ที่ตรวจได้ ไม่นับเป็นเก้าอี้ที่ใช้งานได้ (PRD §4.3) → Blocked
 */
import { checkTableSetIntegrity } from "../layout/table-set";
import type { StoreLayout, ValidationIssue } from "../layout/types";
import { createIssue } from "./issues";

/** id ของเก้าอี้ที่ "ใช้งานได้": อ้างโต๊ะที่มีอยู่ ถูกระบุใน chairIds ของโต๊ะนั้น และไม่ซ้ำหลายโต๊ะ */
export function getUsableChairIds(layout: StoreLayout): Set<string> {
  const broken = new Set<string>();
  for (const problem of checkTableSetIntegrity(layout)) {
    if ("chairId" in problem) broken.add(problem.chairId);
  }
  return new Set(
    layout.objects.filter((o) => o.type === "chair" && !broken.has(o.id)).map((o) => o.id),
  );
}

export function checkCompleteness(layout: StoreLayout): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const count = (type: string) => layout.objects.filter((o) => o.type === type).length;

  if (!layout.entrance) {
    issues.push(createIssue("completeness", "missing-entrance", "blocked", [], "ยังไม่มีทางเข้าร้าน"));
  }
  if (count("kitchen") === 0) {
    issues.push(createIssue("completeness", "missing-kitchen", "blocked", [], "ยังไม่มีครัว"));
  }
  if (count("counter") === 0) {
    issues.push(createIssue("completeness", "missing-counter", "blocked", [], "ยังไม่มีเคาน์เตอร์"));
  }
  if (count("table") === 0) {
    issues.push(createIssue("completeness", "missing-table", "blocked", [], "ยังไม่มีชุดโต๊ะ"));
  }

  const usable = getUsableChairIds(layout);
  if (usable.size === 0) {
    issues.push(createIssue("completeness", "missing-chair", "blocked", [], "ยังไม่มีเก้าอี้ที่ใช้งานได้"));
  }

  for (const problem of checkTableSetIntegrity(layout)) {
    switch (problem.kind) {
      case "orphan-chair":
        issues.push(
          createIssue("completeness", "orphan-chair", "blocked", [problem.chairId], "เก้าอี้ตัวนี้ไม่ได้สังกัดโต๊ะใด"),
        );
        break;
      case "chair-not-listed":
        issues.push(
          createIssue(
            "completeness",
            "chair-not-listed",
            "blocked",
            [problem.chairId, problem.tableId],
            "เก้าอี้ตัวนี้ไม่อยู่ในรายการเก้าอี้ของโต๊ะที่สังกัด",
          ),
        );
        break;
      case "chair-in-multiple-tables":
        issues.push(
          createIssue(
            "completeness",
            "chair-in-multiple-tables",
            "blocked",
            [problem.chairId, ...problem.tableIds],
            "เก้าอี้ตัวเดียวสังกัดได้เพียงโต๊ะเดียว",
          ),
        );
        break;
      case "missing-chair":
        issues.push(
          createIssue(
            "completeness",
            "dangling-chair-ref",
            "blocked",
            [problem.tableId],
            "โต๊ะอ้างถึงเก้าอี้ที่ไม่มีอยู่ในผัง",
          ),
        );
        break;
      case "table-without-chairs":
        // PRD กำหนดให้ "มีเก้าอี้ใช้งานได้อย่างน้อยหนึ่งตัวในระดับผัง" — โต๊ะเปล่าจึงเป็นเพียงคำเตือน
        issues.push(
          createIssue("completeness", "table-without-chairs", "warning", [problem.tableId], "โต๊ะตัวนี้ไม่มีเก้าอี้"),
        );
        break;
    }
  }
  return issues;
}
