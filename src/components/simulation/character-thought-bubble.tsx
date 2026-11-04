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

export function getMinimalIconSvg(thought: CustomerThought | StaffThought): string {
  const icon = thought.kind;
  const svg = (body: string) => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

  switch (icon) {
    case "queue-wait":
    case "queue-warning":
    case "food-warning":
      return svg('<circle cx="12" cy="12" r="7"/><path d="M12 8v4l3 2"/>');
    case "queue-critical":
    case "food-critical":
      return svg('<path d="M12 4 20 19H4L12 4Z"/><path d="M12 9v4"/><path d="M12 16h.01"/>');
    case "food-wait":
    case "eating":
      return svg('<path d="M5 4v6"/><path d="M8 4v6"/><path d="M5 7h3"/><path d="M6.5 10v10"/><path d="M16 4v16"/><path d="M16 4c3 2 3 6 0 8"/>');
    case "order-wait":
    case "taking-order":
      return svg('<rect x="7" y="5" width="10" height="14" rx="1.5"/><path d="M10 5.5V4h4v1.5"/><path d="M10 10h4M10 14h4"/>');
    case "bill-wait":
      return svg('<rect x="4" y="7" width="16" height="11" rx="2"/><path d="M4 11h16"/><path d="M8 15h3"/>');
    case "serving":
      return svg('<path d="M4 15h16"/><path d="M6 15a6 6 0 0 1 12 0"/><path d="M12 7v-1"/>');
    case "cleaning":
      return svg('<path d="m6 18 6-12"/><path d="m10 17 5 3"/><path d="m9 19 5-3"/><path d="m16 5 .01 0"/><path d="m19 8 .01 0"/>');
    case "resting":
      return svg('<path d="M5 8h12v8H5z"/><path d="M17 10h2a2 2 0 0 1 0 4h-2"/><path d="M8 5v2M11 5v2"/>');
  }
}

function MinimalStatusIcon({ thought }: { thought: CustomerThought | StaffThought }) {
  return <span className="flex h-4 w-4 items-center justify-center text-slate-700" dangerouslySetInnerHTML={{ __html: getMinimalIconSvg(thought) }} />;
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
        <MinimalStatusIcon thought={thought} />
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
