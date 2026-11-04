import React, { useState } from "react";
import type { CustomerThought, StaffThought } from "@/core/simulation/presentation-contract";

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
    case "resting":
      return { emoji: "☕", label: "กำลังพัก", severity: "normal" };
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
    normal: { fill: "#f8fafc", stroke: "#cbd5e1", badge: "bg-slate-700" },
    warning: { fill: "#fffbeb", stroke: "#fbbf24", badge: "bg-amber-600" },
    critical: { fill: "#fff1f2", stroke: "#fb7185", badge: "bg-rose-600" },
  }[config.severity];

  return (
    <div
      className={`relative inline-flex h-9 w-9 items-center justify-center select-none pointer-events-auto cursor-pointer ${className}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      role="status"
      aria-label={config.label}
    >
      <div
        className="flex h-9 w-9 items-center justify-center rounded-full border shadow-sm"
        style={{ backgroundColor: colors.fill, borderColor: colors.stroke }}
      >
        <span className="text-[15px] leading-none" role="img" aria-hidden="true">
          {config.emoji}
        </span>
      </div>

      {config.badgeText && (
        <span
          className={`absolute -bottom-1 -right-2 rounded-full px-1 py-px text-[9px] font-bold leading-3 text-white shadow-sm ${colors.badge}`}
          aria-hidden="true"
        >
          {config.badgeText}
        </span>
      )}

      {showTooltip && hovered && (
        <div
          className="absolute bottom-full mb-1 z-30 whitespace-nowrap rounded-md bg-slate-900/95 px-2.5 py-1 text-xs font-medium text-white shadow-lg pointer-events-none"
          role="tooltip"
        >
          {config.label}
        </div>
      )}
    </div>
  );
}
