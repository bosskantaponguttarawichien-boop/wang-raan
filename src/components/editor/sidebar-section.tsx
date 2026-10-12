"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

export interface SidebarSectionProps {
  /** คีย์ของหัวข้อ (ใช้ทำ id และ data-section ให้เทสต์/ลิงก์หาเจอ) */
  id: string;
  title: string;
  /** บรรทัดสรุปใต้ชื่อหัวข้อ — เห็นได้แม้หัวข้อพับอยู่ */
  summary: React.ReactNode;
  icon: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

/**
 * หัวข้อในแถบซ้ายของ Playground (Accordion) — กดหัวข้อเพื่อเปิด/ปิด เปิดหลายหัวข้อพร้อมกันได้
 * เนื้อหาที่พับอยู่ยังคง mount ไว้ (ซ่อนด้วย hidden) เพื่อไม่ให้ค่าที่กรอกหรือข้อมูลที่โหลดไว้หาย
 */
export function SidebarSection({ id, title, summary, icon, open, onToggle, children }: SidebarSectionProps) {
  const bodyId = `section-${id}`;
  const titleId = `section-${id}-title`;
  const summaryId = `section-${id}-summary`;
  return (
    <section className="border-b border-line" data-section={id} aria-label={title}>
      <h2 className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          // ชื่อปุ่ม = ชื่อหัวข้อเท่านั้น บรรทัดสรุปเป็นคำอธิบายเสริม (ไม่ให้ชื่อไปชนกับปุ่มในหัวข้อ)
          aria-labelledby={titleId}
          aria-describedby={summaryId}
          onClick={onToggle}
          data-section-toggle={id}
          className={cn(
            "flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors duration-[180ms] motion-reduce:transition-none",
            "focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus focus-visible:-outline-offset-3",
            open ? "bg-blue-tint-3" : "bg-white hover:bg-[#fafbff]",
          )}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className={cn("size-3.5 shrink-0 transition-transform duration-[180ms] motion-reduce:transition-none", open ? "rotate-90 text-blue" : "text-muted")}
            fill="none"
            stroke="currentColor"
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m9 6 6 6-6 6" />
          </svg>
          <span aria-hidden="true" className={cn("grid size-7 shrink-0 place-items-center rounded-[7px]", open ? "bg-blue text-white" : "bg-blue-soft text-blue")}>
            {icon}
          </span>
          <span className="min-w-0 flex-1">
            <span id={titleId} className="block text-[13px] font-semibold leading-[1.5] text-ink">
              {title}
            </span>
            <span id={summaryId} className="block truncate text-[11px] font-normal leading-[1.55] text-secondary-strong">
              {summary}
            </span>
          </span>
        </button>
      </h2>
      <div id={bodyId} hidden={!open} className="px-4 pb-4 pt-2">
        {children}
      </div>
    </section>
  );
}

const ICON = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export const SECTION_ICONS = {
  selected: (
    <svg viewBox="0 0 24 24" className="size-4" {...ICON}>
      <path d="M5 3v16l5-5 4 7 3-2-4-7 7-1z" />
    </svg>
  ),
  room: (
    <svg viewBox="0 0 24 24" className="size-4" {...ICON}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 12h9V3" />
    </svg>
  ),
  add: (
    <svg viewBox="0 0 24 24" className="size-4" {...ICON}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  simulation: (
    <svg viewBox="0 0 24 24" className="size-4" {...ICON}>
      <circle cx="9" cy="7" r="3" />
      <path d="M3 20v-2a6 6 0 0 1 12 0v2M16 4a3 3 0 0 1 0 6M21 20v-2a6 6 0 0 0-3-5" />
    </svg>
  ),
  file: (
    <svg viewBox="0 0 24 24" className="size-4" {...ICON}>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <path d="M14 3v6h6" />
    </svg>
  ),
  cloud: (
    <svg viewBox="0 0 24 24" className="size-4" {...ICON}>
      <path d="M7 18a5 5 0 1 1 .9-9.9A6 6 0 0 1 19 10a4 4 0 0 1-1 8z" />
    </svg>
  ),
} as const;
