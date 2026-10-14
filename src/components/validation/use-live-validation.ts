"use client";

import { useMemo } from "react";
import type { IssueSeverity, StoreLayout, ValidationIssue, ValidationResult } from "@/core/layout";
import { formatIssueHuman, validateLayout, type FormattedIssue } from "@/core/validation";
import { useLayoutStore } from "@/store/use-layout-store";

export type HumanizedIssue = ValidationIssue & FormattedIssue;

export interface LiveValidation {
  result: ValidationResult;
  /** ระดับปัญหาที่หนักที่สุดของแต่ละวัตถุ/ทางเข้า (ใช้วาด Issue Rings) */
  severityById: Map<string, IssueSeverity>;
  /** ข้อความปัญหาแรกของแต่ละวัตถุ (ใช้ใน aria-label) */
  messageById: Map<string, string>;
  blockedCount: number;
  warningCount: number;
  /** รายการปัญหาทั้งหมดพร้อมหัวข้อและคำแนะนำภาษาไทย */
  humanIssues: HumanizedIssue[];
}

export function summarizeIssues(issues: ValidationIssue[], layout?: StoreLayout) {
  const severityById = new Map<string, IssueSeverity>();
  const messageById = new Map<string, string>();
  const humanIssues: HumanizedIssue[] = issues.map((issue) => {
    const formatted = formatIssueHuman(issue, layout);
    return {
      ...issue,
      ...formatted,
    };
  });

  for (const item of humanIssues) {
    for (const id of item.objectIds) {
      const current = severityById.get(id);
      // ข้อความของปัญหาที่หนักที่สุดและพบก่อน (blocked แรก หรือ warning แรกถ้าไม่มี blocked)
      if (current === undefined || (current === "warning" && item.severity === "blocked")) {
        severityById.set(id, item.severity);
        messageById.set(id, item.message);
      }
    }
  }
  return {
    severityById,
    messageById,
    blockedCount: issues.filter((i) => i.severity === "blocked").length,
    warningCount: issues.filter((i) => i.severity === "warning").length,
    humanIssues,
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
    return { result, ...summarizeIssues(result.issues, layout) };
  }, [layout]);
}

