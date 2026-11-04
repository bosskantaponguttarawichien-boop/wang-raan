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

export interface ThoughtBadgeTheme {
  fill: string;
  /** Warm rim keeps the marker separate from the pale isometric floor. */
  rim: string;
  icon: string;
}

/**
 * The marker colour describes the current service step, not urgency. Urgency
 * stays on the small elapsed-time pill so the scene does not turn red/yellow
 * as soon as several guests wait at once.
 */
export function getThoughtBadgeTheme(thought: CustomerThought | StaffThought): ThoughtBadgeTheme {
  switch (thought.kind) {
    case "queue-wait":
    case "queue-warning":
    case "queue-critical":
      return { fill: "#8fb8d7", rim: "#f8f0e2", icon: "#374151" };
    case "order-wait":
    case "taking-order":
      return { fill: "#d98e87", rim: "#f8f0e2", icon: "#3f3635" };
    case "food-wait":
    case "food-warning":
    case "food-critical":
    case "serving":
      return { fill: "#d8b765", rim: "#f8f0e2", icon: "#4b4130" };
    case "eating":
    case "cleaning":
      return { fill: "#8fbe9d", rim: "#f8f0e2", icon: "#31483b" };
    case "bill-wait":
      return { fill: "#aa9bd0", rim: "#f8f0e2", icon: "#403957" };
    case "resting":
      return { fill: "#dea17c", rim: "#f8f0e2", icon: "#513a31" };
  }
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
  const svg = (body: string) => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

  switch (icon) {
    case "queue-wait":
    case "queue-warning":
      return svg('<path d="M4 13h6v5H4z" fill="#f28a2f" stroke="#f28a2f"/><path d="M5 18v2m4-2v2M4 13l2-3h4v3M14 12h6v6h-6z" fill="#f28a2f" stroke="#f28a2f"/><path d="M15 18v2m4-2v2m-5-8 2-2h4v2"/>');
    case "queue-critical":
      return svg('<path d="M4 13h6v5H4z" fill="#f28a2f" stroke="#f28a2f"/><path d="M5 18v2m4-2v2M4 13l2-3h4v3M14 12h6v6h-6z" fill="#f28a2f" stroke="#f28a2f"/><path d="M15 18v2m4-2h4v2"/><path d="M12 4v3m-2-1 2-2 2 2" stroke="#fff7ea" stroke-width="2"/>');
    case "food-warning":
    case "food-critical":
    case "food-wait":
    case "serving":
      return svg('<path d="M4 16h16" stroke="#6a5b53" stroke-width="2"/><path d="M6 16a6 6 0 0 1 12 0" fill="#fff7ea" stroke="#6a5b53"/><path d="M12 9V7"/><path d="M8 5c1-1 1-2 0-3m4 3c1-1 1-2 0-3m4 3c1-1 1-2 0-3" stroke="#fff7ea"/>');
    case "order-wait":
    case "taking-order":
      return svg('<rect x="6" y="4" width="11" height="15" rx="1.5" fill="#fff7ea" stroke="#564942"/><path d="M9 4V3h5v1M9 9h5M9 12h5"/><circle cx="8" cy="9" r=".8" fill="#e86d65" stroke="none"/><circle cx="8" cy="12" r=".8" fill="#e86d65" stroke="none"/><path d="m15 17 4-5 1.5 1.3-4 5-2 .7z" fill="#f28a2f" stroke="#f28a2f"/>');
    case "eating":
      return svg('<ellipse cx="12" cy="15" rx="7" ry="3.5" fill="#fff7ea" stroke="#5d514b"/><path d="M5 6v5m3-5v5M5 8h3m-1.5 3v8M18 5v14m0-14c3 2 3 6 0 8"/><path d="M10 14c1-2 3-2 4 0" stroke="#70a96e"/>');
    case "bill-wait":
      return svg('<rect x="4" y="7" width="14" height="10" rx="2" fill="#fff7ea" stroke="#514951"/><path d="M4 11h14" stroke="#514951"/><path d="M15 14h5v4h-5z" fill="#ffd05a" stroke="#c58e25"/>');
    case "cleaning":
      return svg('<path d="m6 18 6-12"/><path d="m10 17 5 3"/><path d="m9 19 5-3"/><path d="m16 5 .01 0"/><path d="m19 8 .01 0"/>');
    case "resting":
      return svg('<path d="M5 8h12v8H5z"/><path d="M17 10h2a2 2 0 0 1 0 4h-2"/><path d="M8 5v2M11 5v2"/>');
  }
  return svg('<circle cx="12" cy="12" r="6"/>');
}

function MinimalStatusIcon({ thought, color }: { thought: CustomerThought | StaffThought; color: string }) {
  return <span className="flex h-[18px] w-[18px] items-center justify-center" style={{ color }} dangerouslySetInnerHTML={{ __html: getMinimalIconSvg(thought) }} />;
}

export function CharacterThoughtBubble({
  thought,
  className = "",
  showTooltip = true,
}: CharacterThoughtBubbleProps) {
  const [hovered, setHovered] = useState(false);
  const config = getEmoteConfig(thought);
  const theme = getThoughtBadgeTheme(thought);
  const urgencyColor = config.severity === "critical" ? "#b94c54" : config.severity === "warning" ? "#a66d19" : "#536170";

  return (
    <div
      className={`relative inline-flex h-9 w-8 items-center justify-center select-none pointer-events-auto cursor-pointer ${className}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      role="status"
      aria-label={config.label}
    >
      <div
        className="absolute inset-0 grid place-items-center shadow-sm"
        style={{ background: theme.rim, clipPath: "polygon(50% 100%, 8% 54%, 0 33%, 5% 15%, 22% 3%, 50% 0, 78% 3%, 95% 15%, 100% 33%, 92% 54%)" }}
      >
        <div
          className="grid place-items-center"
          style={{ width: "calc(100% - 3px)", height: "calc(100% - 3px)", background: theme.fill, clipPath: "polygon(50% 100%, 8% 54%, 0 33%, 5% 15%, 22% 3%, 50% 0, 78% 3%, 95% 15%, 100% 33%, 92% 54%)" }}
        >
          <MinimalStatusIcon thought={thought} color={theme.icon} />
        </div>
      </div>

      {config.badgeText && (
        <span
          className="absolute -bottom-1 -right-2 rounded-full px-1 py-px text-[9px] font-bold leading-3 text-white shadow-sm"
          style={{ backgroundColor: urgencyColor }}
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
