import * as React from "react";
import { cn } from "@/lib/cn";

export type LayoutStatus = "ready" | "warning" | "blocked";

// ข้อความไทยของสถานะ (PRD §5.1) — บอกสถานะด้วยข้อความเสมอ ไม่พึ่งสีอย่างเดียว
export const STATUS_LABEL: Record<LayoutStatus, string> = {
  ready: "พร้อมจำลอง",
  warning: "มีข้อควรระวัง",
  blocked: "ยังจำลองไม่ได้",
};

const DOT: Record<LayoutStatus, string> = {
  ready: "bg-status-ready",
  warning: "bg-status-warning",
  blocked: "bg-status-blocked",
};

export interface StatusBadgeProps {
  status: LayoutStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <span
      role="status"
      aria-live="polite"
      data-status={status}
      className={cn(
        "inline-flex items-center gap-2 rounded-pill border border-[var(--status-border)] bg-[var(--status-bg)] px-3 py-1 text-[13px] leading-[1.55] text-ink shadow-status",
        className,
      )}
    >
      <span aria-hidden="true" className={cn("size-2 rounded-full", DOT[status])} />
      สถานะผัง: {STATUS_LABEL[status]}
    </span>
  );
}
