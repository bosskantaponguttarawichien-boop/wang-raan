import React, { useState } from "react";
import type { CustomerThought, StaffThought } from "@/core/simulation/presentation-contract";

export const CLOUD_PATH =
  "M 62 50 C 55 55 45 55 38 51 C 30 55 20 53 14 46 C 6 45 2 36 4 27 C 2 18 10 10 18 11 C 23 4 35 3 43 7 C 49 2 61 3 67 7 C 75 3 85 7 88 15 C 97 17 101 27 98 36 C 102 44 94 53 84 51 C 77 56 68 55 62 50 Z";

export interface CharacterThoughtBubbleProps {
  thought: CustomerThought | StaffThought;
  agentId?: number;
  className?: string;
  showTooltip?: boolean;
}

export interface EmoteConfig {
  emoji: string;
  label: string;
  badgeText?: string;
  severity: "normal" | "warning" | "critical";
}

export function getEmoteConfig(thought: CustomerThought | StaffThought): EmoteConfig {
  if ("waitSeconds" in thought) {
    const mins = Math.max(0, Math.floor(thought.waitSeconds / 60));
    switch (thought.kind) {
      case "queue-wait":
        return {
          emoji: "📱",
          label: `รอคิวหน้าร้าน (${mins} นาที)`,
          badgeText: mins > 0 ? `${mins}น.` : undefined,
          severity: thought.severity,
        };
      case "queue-warning":
        return {
          emoji: "⏳",
          label: `รอคิวนานกว่าปกติ (${mins} นาที)`,
          badgeText: `${mins}น.`,
          severity: "warning",
        };
      case "queue-critical":
        return {
          emoji: "💢",
          label: `รอคิวนานวิกฤต เสี่ยงเดินหนี (${mins} นาที)`,
          badgeText: `${mins}น.!`,
          severity: "critical",
        };
      case "order-wait":
        return {
          emoji: "🙋‍♂️",
          label: "รอสั่งอาหาร",
          severity: thought.severity,
        };
      case "food-wait":
        return {
          emoji: "🍽️",
          label: `รออาหาร (${mins} นาที)`,
          badgeText: mins > 0 ? `${mins}น.` : undefined,
          severity: thought.severity,
        };
      case "food-warning":
        return {
          emoji: "⏳",
          label: `รออาหารนาน (${mins} นาที)`,
          badgeText: `${mins}น.`,
          severity: "warning",
        };
      case "food-critical":
        return {
          emoji: "😤",
          label: `รออาหารนานมาก (${mins} นาที)`,
          badgeText: `${mins}น.!`,
          severity: "critical",
        };
      case "eating":
        return {
          emoji: "😋",
          label: "กำลังรับประทานอาหาร",
          severity: "normal",
        };
      case "bill-wait":
        return {
          emoji: "💳",
          label: "พร้อมชำระเงิน",
          severity: "normal",
        };
    }
  }

  // Staff Thought
  switch (thought.kind) {
    case "taking-order":
      return { emoji: "📝", label: "กำลังรับออร์เดอร์", severity: "normal" };
    case "serving":
      return { emoji: "🍲", label: "กำลังถือเสิร์ฟอาหาร", severity: "normal" };
    case "cleaning":
      return { emoji: "🧹", label: "กำลังเช็ดทำความสะอาดโต๊ะ", severity: "normal" };
  }
}

export function CharacterThoughtBubble({
  thought,
  className = "",
  showTooltip = true,
}: CharacterThoughtBubbleProps) {
  const [hovered, setHovered] = useState(false);
  const config = getEmoteConfig(thought);

  const colors = {
    normal: {
      fill: "#ffffff",
      stroke: "#64748b",
      badgeText: "text-slate-600",
    },
    warning: {
      fill: "#fffbeb",
      stroke: "#f59e0b",
      badgeText: "text-amber-800",
    },
    critical: {
      fill: "#fff1f2",
      stroke: "#f43f5e",
      badgeText: "text-rose-800",
    },
  }[config.severity];

  const animateClass = config.severity === "critical" ? "animate-bounce" : "";

  return (
    <div
      className={`relative inline-flex items-center justify-center select-none pointer-events-auto cursor-pointer transition-transform duration-150 hover:scale-110 ${animateClass} ${className}`}
      style={{ width: 80, height: 64 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      role="status"
      aria-label={config.label}
    >
      {/* Cartoon Thought Cloud SVG matching user sketch */}
      <svg
        viewBox="0 0 108 86"
        className="absolute inset-0 w-full h-full overflow-visible drop-shadow-[0_2px_4px_rgba(0,0,0,0.08)]"
      >
        <path
          d={CLOUD_PATH}
          fill={colors.fill}
          stroke={colors.stroke}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle
          cx="66"
          cy="66"
          r="4.2"
          fill={colors.fill}
          stroke={colors.stroke}
          strokeWidth="1.3"
        />
        <circle
          cx="75"
          cy="77"
          r="2.6"
          fill={colors.fill}
          stroke={colors.stroke}
          strokeWidth="1.3"
        />
      </svg>

      {/* Content centered in the cloud body */}
      <div
        className="absolute left-0 top-0 z-10 flex items-center justify-center gap-1"
        style={{ width: 78, height: 42 }}
      >
        <span className="text-[15px] leading-none" role="img" aria-hidden="true">
          {config.emoji}
        </span>
        {config.badgeText && (
          <span className={`text-[11px] font-semibold tracking-tight ${colors.badgeText}`}>
            {config.badgeText}
          </span>
        )}
      </div>

      {/* Interactive Tooltip on hover */}
      {showTooltip && hovered && (
        <div
          className="absolute bottom-full mb-1 z-30 whitespace-nowrap rounded-md bg-slate-900/95 px-2.5 py-1 text-xs font-medium text-white shadow-lg pointer-events-none transition-opacity duration-150"
          role="tooltip"
        >
          {config.label}
        </div>
      )}
    </div>
  );
}
