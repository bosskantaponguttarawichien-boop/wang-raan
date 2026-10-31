"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { layoutActions as actions, useLayoutStore } from "@/store/use-layout-store";
import { useSimulationStore } from "@/store/use-simulation-store";
import { getSimulationController } from "@/components/simulation/simulation-controller";
import { formatSimTime } from "@/components/simulation/simulation-panel";
import { parseClock } from "@/core/simulation";
import { formatClockMinutes } from "@/lib/day-config";
import type { LiveValidation } from "@/components/validation/use-live-validation";

const ICON = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export interface PlaygroundStatusBarProps {
  live: LiveValidation;
  onFocusIssue?: (index: number) => void;
  /** มือถือ: กางแผงด้านล่างขึ้นมาเมื่อพาไปแท็บ "จำลอง" (ถ้าแผงพับอยู่จะมองไม่เห็นข้อที่ต้องแก้) */
  onRevealPanel?: () => void;
}

export function PlaygroundStatusBar({ live, onFocusIssue, onRevealPanel }: PlaygroundStatusBarProps) {
  const activeTab = useLayoutStore((s) => s.activeTab);
  const layout = useLayoutStore((s) => s.layout);
  const simStatus = useSimulationStore((s) => s.status);
  const simMetrics = useSimulationStore((s) => s.metrics);
  const simAnalysis = useSimulationStore((s) => s.analysis);
  const simOpenMinute = useSimulationStore((s) => parseClock(s.config.openTime) ?? 0);

  const { result, blockedCount, warningCount } = live;
  const isSim = simStatus === "running" || simStatus === "paused";
  const hasTables = layout.objects.some((o) => o.type === "table");
  const isReady = hasTables && result.status === "ready";

  const handleNextIssue = () => {
    actions().setActiveTab("check");
    onRevealPanel?.();
    if (onFocusIssue) {
      onFocusIssue(0);
    }
  };

  const handleCta = () => {
    actions().setActiveTab("check");
    onRevealPanel?.();
    if (!isReady && onFocusIssue && result.issues.length > 0) {
      onFocusIssue(0);
    }
  };

  const handleBackToEdit = async () => {
    await getSimulationController().stop("กลับมาที่โหมดจัดผัง");
    actions().setActiveTab("add");
  };

  let dotColor = "bg-[#8492a5]";
  let statusText: React.ReactNode = "ยังไม่มีโต๊ะ — เพิ่มชุดโต๊ะอย่างน้อย 1 ชุด";
  let actionBtn: React.ReactNode = null;

  if (isSim) {
    dotColor = "bg-[#1d9e75]";
    statusText = (
      <span>
        {simStatus === "paused" ? "หยุดชั่วคราว" : "กำลังจำลอง"} ·{" "}
        {simAnalysis ? `${formatClockMinutes(simOpenMinute, simMetrics?.time ?? 0)} น.` : formatSimTime(simMetrics?.time ?? 0)}
      </span>
    );
  } else if (simStatus === "starting") {
    // ผังใหญ่ใช้เวลาคำนวณทั้งวันหลายวินาที — บอกว่ากำลังทำงาน ไม่ใช่ "พร้อมจำลอง" ค้างไว้
    dotColor = "bg-[#1d9e75]";
    statusText = <span>กำลังคำนวณทั้งวัน…</span>;
  } else if (!hasTables) {
    dotColor = "bg-[#8492a5]";
    statusText = <span>ยังไม่มีโต๊ะ — เพิ่มชุดโต๊ะอย่างน้อย 1 ชุด</span>;
  } else if (blockedCount > 0) {
    dotColor = "bg-status-blocked";
    statusText = <span>ต้องแก้อีก {blockedCount} ข้อก่อนจำลอง</span>;
    actionBtn = (
      <button
        type="button"
        onClick={handleNextIssue}
        className="inline-flex items-center gap-1 rounded-[6px] px-2 py-0.5 text-[12px] font-medium text-blue hover:bg-blue-soft focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus"
      >
        {activeTab === "check" ? "ข้อถัดไป" : "พาไปดู"}
        <svg viewBox="0 0 24 24" className="size-3.5" aria-hidden="true" {...ICON}>
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      </button>
    );
  } else if (warningCount > 0) {
    dotColor = "bg-status-warning";
    statusText = <span>พร้อมจำลอง · มีคำแนะนำ {warningCount} ข้อ</span>;
    actionBtn = (
      <button
        type="button"
        onClick={handleNextIssue}
        className="inline-flex items-center gap-1 rounded-[6px] px-2 py-0.5 text-[12px] font-medium text-blue hover:bg-blue-soft focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus"
      >
        ดูคำแนะนำ
      </button>
    );
  } else {
    dotColor = "bg-status-ready";
    statusText = <span>พร้อมจำลอง</span>;
  }

  // CTA button on the right
  let cta: React.ReactNode = null;
  if (isSim) {
    cta = (
      <button
        type="button"
        onClick={handleBackToEdit}
        className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[10px] border border-line bg-white px-3 py-1.5 text-[13px] font-medium text-ink hover:border-[#c8d2e2] hover:bg-surface focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus"
      >
        <svg viewBox="0 0 24 24" className="size-3.5 text-secondary" aria-hidden="true" {...ICON}>
          <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
        </svg>
        กลับไปแก้ผัง
      </button>
    );
  } else if (activeTab !== "check") {
    cta = (
      <button
        type="button"
        onClick={handleCta}
        aria-disabled={!isReady}
        className={cn(
          "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[10px] px-3.5 py-1.5 text-[13px] font-medium transition-colors focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus",
          isReady
            ? "bg-blue text-white hover:bg-blue-hover"
            : "border border-line bg-white text-secondary hover:bg-surface hover:text-ink",
        )}
      >
        {isReady ? (
          <svg viewBox="0 0 24 24" className="size-3.5 fill-current" aria-hidden="true">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="size-3.5 text-muted" aria-hidden="true" {...ICON}>
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        )}
        <span>{isReady ? "ไปตั้งค่าจำลอง" : "เริ่มจำลองลูกค้า"}</span>
        <svg viewBox="0 0 24 24" className="size-3.5" aria-hidden="true" {...ICON}>
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      </button>
    );
  }

  return (
    <footer
      id="status"
      data-testid="validation-status-bar"
      data-status={result.status}
      className={cn(
        "[grid-area:status] flex h-[52px] items-center justify-between gap-3 border-t border-line bg-white px-4 max-[767px]:h-11 max-[767px]:gap-2 max-[767px]:px-3 max-[767px]:[&_#stMsg]:text-[12px]",
        // มือถือตอนจัดผัง: ซ่อนเพื่อเหลือที่ให้ผัง — สถานะดูได้จาก badge แท็บ "จำลอง" และกดแท็บนั้นไปจำลองได้
        // ตอนจำลองยังแสดง เพราะแถบเมนูล่างถูกซ่อน เหลือแค่ตรงนี้ที่มีเวลาจำลองและปุ่ม "กลับไปแก้ผัง"
        !isSim && "max-[767px]:hidden",
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 text-[13px] text-ink" id="stMsg">
        <span aria-hidden="true" className={cn("size-2.5 shrink-0 rounded-full", dotColor)} />
        {/* นาฬิกาบนจอโชว์แค่นาที (feat-156) — เทสต์วัดอัตราเวลาจากวินาทีจำลองใน data-sim-seconds */}
        <span className="truncate" data-testid="simulation-status" data-sim-seconds={isSim ? Math.floor(simMetrics?.time ?? 0) : undefined}>{statusText}</span>
        {actionBtn}
      </div>
      {cta}
    </footer>
  );
}
