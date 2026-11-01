"use client";

import { useEffect, useMemo, useState } from "react";
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
 * ระหว่างลาก/ปรับขนาด ตรวจผังเมื่อนิ้ว/เมาส์หยุดนิ่งเท่านี้ (ms) — ปล่อยนิ้วแล้วตรวจทันที
 *
 * ตรวจผังหนึ่งรอบต้องสร้าง walk grid ละเอียด 5 ซม. ทั้งร้านแล้วหาทางเดินทุกความกว้าง: ผัง 80 ที่นั่ง
 * ใช้ ~15 ms บน CPU เดสก์ท็อป และ ~70–90 ms บนมือถือ ถ้าตรวจทุก pointermove การลากบนมือถือ
 * จะเหลือ ~10 fps (วัดด้วย Chromium จำลองมือถือ CPU ช้าลง 4 เท่า: long task 60 ครั้ง สูงสุด 140 ms)
 */
export const DRAG_VALIDATION_SETTLE_MS = 120;

/**
 * ผังที่ควรตรวจตอนนี้: ปกติคือผังล่าสุด (ตรวจทันที) · ระหว่างลาก (interactionBase ไม่เป็น null)
 * คงผลของผังก่อนหน้าไว้จนกว่าจะหยุดขยับ `DRAG_VALIDATION_SETTLE_MS`
 */
function useLayoutToCheck(): StoreLayout {
  const layout = useLayoutStore((s) => s.layout);
  const interacting = useLayoutStore((s) => s.interactionBase !== null);
  const [settled, setSettled] = useState(layout);
  // ไม่ได้ลาก = ตามผังล่าสุดทันที (ปรับ state ระหว่าง render ตามแบบที่ React แนะนำ ไม่ต้องรอ effect)
  if (!interacting && settled !== layout) setSettled(layout);
  useEffect(() => {
    if (!interacting) return;
    const timer = setTimeout(() => setSettled(layout), DRAG_VALIDATION_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [interacting, layout]);
  return interacting ? settled : layout;
}

/**
 * Instant feedback (architecture.md §2): ตรวจผังแบบ synchronous ใน render เดียวกับที่ผังเปลี่ยน
 * ยกเว้นระหว่างลาก ที่ตรวจเมื่อหยุดขยับ (ดู `DRAG_VALIDATION_SETTLE_MS`)
 * ผลนี้ใช้แสดงสถานะเท่านั้น — การเริ่มจำลองต้อง runValidation() ซ้ำเสมอ (PRD §3.1 ข้อ 5)
 */
export function useLiveValidation(): LiveValidation {
  const layout = useLayoutToCheck();
  return useMemo(() => {
    const result = validateLayout(layout);
    return { result, ...summarizeIssues(result.issues, layout) };
  }, [layout]);
}
