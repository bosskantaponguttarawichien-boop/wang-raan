/**
 * Validation Engine — รวมผล 4 ด้านและสรุปสถานะ (PRD.md §5.1, §6)
 * Pure TypeScript: รันได้ทั้ง Client (instant feedback), BFF Route Handler และ Web Worker
 */
import type {
  IssueCategory,
  StoreLayout,
  ValidationIssue,
  ValidationResult,
  ValidationStatus,
} from "../layout/types";
import { checkAccessibility } from "./accessibility";
import { checkClearance } from "./clearance";
import { checkCollisions } from "./collision";
import { checkCompleteness } from "./completeness";
import { computeLayoutRevision } from "./revision";
import { analyzeRoutes } from "./routes";

const CATEGORY_ORDER: IssueCategory[] = ["completeness", "collision", "clearance", "accessibility"];

export interface ValidateOptions {
  /** นาฬิกาที่ inject ได้ (ค่าเริ่มต้น new Date()) */
  now?: () => Date;
}

/** Blocked ≥ 1 → blocked; ไม่มี Blocked แต่มี Warning → warning; ไม่เช่นนั้น ready */
export function summarizeStatus(issues: ReadonlyArray<Pick<ValidationIssue, "severity">>): ValidationStatus {
  if (issues.some((i) => i.severity === "blocked")) return "blocked";
  if (issues.some((i) => i.severity === "warning")) return "warning";
  return "ready";
}

export function collectIssues(layout: StoreLayout): ValidationIssue[] {
  const analysis = analyzeRoutes(layout);
  const issues = [
    ...checkCompleteness(layout),
    ...checkCollisions(layout),
    ...checkClearance(layout, analysis),
    ...checkAccessibility(layout, analysis),
  ];
  // เรียงตามหมวด แล้ว Blocked ก่อน Warning (stable)
  return issues
    .map((issue, index) => ({ issue, index }))
    .sort(
      (a, b) =>
        CATEGORY_ORDER.indexOf(a.issue.category) - CATEGORY_ORDER.indexOf(b.issue.category) ||
        (a.issue.severity === b.issue.severity ? 0 : a.issue.severity === "blocked" ? -1 : 1) ||
        a.index - b.index,
    )
    .map(({ issue }) => issue);
}

export function validateLayout(layout: StoreLayout, options: ValidateOptions = {}): ValidationResult {
  const issues = collectIssues(layout);
  return {
    layoutRevision: computeLayoutRevision(layout),
    status: summarizeStatus(issues),
    issues,
    validatedAt: (options.now?.() ?? new Date()).toISOString(),
  };
}

/** ผลตรวจยังใช้ได้กับผังปัจจุบันหรือไม่ (C-07) */
export function isValidationFresh(result: ValidationResult | null, layout: StoreLayout): result is ValidationResult {
  return result !== null && result.layoutRevision === computeLayoutRevision(layout);
}

/** P2 Gate: เริ่มจำลองได้เมื่อผลตรวจสดใหม่และเป็น Ready / Warning เท่านั้น */
export function canStartSimulation(result: ValidationResult | null, layout: StoreLayout): boolean {
  return isValidationFresh(result, layout) && result.status !== "blocked";
}
