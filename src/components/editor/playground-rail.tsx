"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { layoutActions as actions, useLayoutStore, type PlaygroundTab } from "@/store/use-layout-store";
import { useSimulationStore } from "@/store/use-simulation-store";
import type { LiveValidation } from "@/components/validation/use-live-validation";

const ICON = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export interface PlaygroundRailProps {
  live: LiveValidation;
  sheetOpen?: boolean;
  onToggleSheet?: () => void;
}

export function PlaygroundRail({ live, sheetOpen = true, onToggleSheet }: PlaygroundRailProps) {
  const activeTab = useLayoutStore((s) => s.activeTab);
  const simStatus = useSimulationStore((s) => s.status);
  const simActive = simStatus === "running" || simStatus === "paused";

  if (simActive) return null;

  const { blockedCount, warningCount } = live;

  const tabs: Array<{ key: PlaygroundTab; name: string; icon: React.ReactNode; badge?: React.ReactNode }> = [
    {
      key: "add",
      name: "เพิ่ม",
      icon: (
        <svg viewBox="0 0 24 24" className="size-5 shrink-0" aria-hidden="true" {...ICON}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      ),
    },
    {
      key: "shop",
      name: "ร้าน",
      icon: (
        <svg viewBox="0 0 24 24" className="size-5 shrink-0" aria-hidden="true" {...ICON}>
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      ),
    },
    {
      key: "check",
      name: "จำลอง",
      icon: (
        <svg viewBox="0 0 24 24" className="size-5 shrink-0" aria-hidden="true" {...ICON}>
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
      ),
      badge:
        blockedCount > 0 ? (
          <span
            className="absolute right-1.5 top-0.5 grid min-h-[17px] min-w-[17px] place-items-center rounded-full bg-status-blocked px-1 text-[10px] font-semibold leading-none text-white"
            aria-label={`มีปัญหาต้องแก้ ${blockedCount} ข้อ`}
          >
            {blockedCount}
          </span>
        ) : warningCount > 0 ? (
          <span
            className="absolute right-1.5 top-0.5 grid min-h-[17px] min-w-[17px] place-items-center rounded-full bg-status-warning px-1 text-[10px] font-semibold leading-none text-ink"
            aria-label={`มีคำแนะนำ ${warningCount} ข้อ`}
          >
            {warningCount}
          </span>
        ) : null,
    },
  ];

  return (
    <nav
      id="rail"
      aria-label="เครื่องมือ"
      className={cn(
        "[grid-area:rail] flex flex-col items-center gap-1.5 border-r border-line bg-white py-2.5",
        "max-[767px]:flex-row max-[767px]:justify-around max-[767px]:border-r-0 max-[767px]:border-t max-[767px]:py-1",
      )}
    >
      {tabs.map((tab) => {
        const selected = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            data-tab={tab.key}
            aria-pressed={selected}
            aria-label={tab.name}
            onClick={() => {
              if (selected && onToggleSheet) {
                onToggleSheet();
              } else {
                actions().setActiveTab(tab.key);
                if (!sheetOpen && onToggleSheet) {
                  onToggleSheet();
                }
              }
            }}
            className={cn(
              "relative flex w-[58px] flex-col items-center gap-0.5 rounded-[10px] py-2 text-[11px] font-medium leading-[1.3] text-secondary",
              "transition-colors duration-[180ms] hover:bg-surface hover:text-ink focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus",
              selected && sheetOpen && "bg-blue-soft text-[#183cbd] font-semibold hover:bg-blue-soft hover:text-[#183cbd]",
            )}
          >
            {tab.icon}
            <span>{tab.name}</span>
            {tab.badge}
          </button>
        );
      })}
    </nav>
  );
}
