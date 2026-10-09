"use client";

import { useMemo } from "react";
import type { IssueSeverity, ValidationIssue, ValidationResult } from "@/core/layout";
import { validateLayout } from "@/core/validation";
import { useLayoutStore } from "@/store/use-layout-store";

export interface LiveValidation {
  result: ValidationResult;
  /** ระดับปัญหาที่หนักที่สุดของแต่ละวัตถุ/ทางเข้า (ใช้วาด Issue Rings) */
  severityById: Map<string, IssueSeverity>;
  /** ข้อความปัญหาแรกของแต่ละวัตถุ (ใช้ใน aria-label) */
  messageById: Map<string, string>;
  blockedCount: number;
  warningCount: number;
}

export function summarizeIssues(issues: ValidationIssue[]) {
  const severityById = new Map<string, IssueSeverity>();
  const messageById = new Map<string, string>();
  for (const issue of issues) {
    for (const id of issue.objectIds) {
      const current = severityById.get(id);
      // ข้อความของปัญหาที่หนักที่สุดและพบก่อน (blocked แรก หรือ warning แรกถ้าไม่มี blocked)
      if (current === undefined || (current === "warning" && issue.severity === "blocked")) {
        severityById.set(id, issue.severity);
        messageById.set(id, issue.message);
      }
    }
  }
  return {
    severityById,
    messageById,
    blockedCount: issues.filter((i) => i.severity === "blocked").length,
    warningCount: issues.filter((i) => i.severity === "warning").length,
  };
}

/**
 * Instant feedback (architecture.md §2): ตรวจผังแบบ synchronous ใน render เดียวกับที่ผังเปลี่ยน
 * ผลนี้ใช้แสดงสถานะเท่านั้น — การเริ่มจำลองต้อง runValidation() ซ้ำเสมอ (PRD §3.1 ข้อ 5)
 */
export function useLiveValidation(): LiveValidation {
  const layout = useLayoutStore((s) => s.layout);
  return useMemo(() => {
    const result = validateLayout(layout);
    return { result, ...summarizeIssues(result.issues) };
  }, [layout]);
}
