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
  // These are compact illustrations, rather than generic line icons. The
  // high-contrast shapes still read at the 30px mobile size used in the 3D
  // scene, while keeping the friendly pastel badge language.
  const svg = (body: string) => `<svg viewBox="0 0 48 48" width="30" height="30" fill="none" aria-hidden="true">${body}</svg>`;

  switch (icon) {
    case "queue-wait":
    case "queue-warning":
      return svg('<path d="M7 24 17 18v14L7 37z" fill="#ff8b2b"/><path d="m17 18 9 5v14l-9-5z" fill="#f37720"/><path d="m7 24 10 5 9-6-9-5z" fill="#fff8eb"/><path d="M10 36v8m12-7v7" stroke="#554c51" stroke-width="4" stroke-linecap="round"/><path d="M28 25 38 19v14l-10 5z" fill="#ff8b2b"/><path d="m28 25 10 5 4-3-10-5z" fill="#fff8eb"/><path d="M31 37v7m8-12v7" stroke="#554c51" stroke-width="4" stroke-linecap="round"/>');
    case "queue-critical":
      return svg('<path d="M7 24 17 18v14L7 37z" fill="#ff8b2b"/><path d="m17 18 9 5v14l-9-5z" fill="#f37720"/><path d="m7 24 10 5 9-6-9-5z" fill="#fff8eb"/><path d="M10 36v8m12-7v7" stroke="#554c51" stroke-width="4" stroke-linecap="round"/><path d="M35 7v12M29 13h12" stroke="#fff8eb" stroke-width="4" stroke-linecap="round"/>');
    case "food-warning":
    case "food-critical":
    case "food-wait":
    case "serving":
      return svg('<path d="M7 35h34" stroke="#8b7c74" stroke-width="5" stroke-linecap="round"/><path d="M10 34c0-11 7-18 14-18s14 7 14 18Z" fill="#fff9ef"/><circle cx="24" cy="13" r="4" fill="#fff9ef"/><path d="M14 11c-3-4 1-7 0-10m10 9c-3-4 1-7 0-10m10 11c-3-4 1-7 0-10" stroke="#fff9ef" stroke-width="4" stroke-linecap="round"/>');
    case "order-wait":
    case "taking-order":
      return svg('<rect x="10" y="9" width="23" height="31" rx="4" fill="#fff9ef" stroke="#594d4a" stroke-width="4"/><path d="M18 9c0-5 7-5 7 0" stroke="#594d4a" stroke-width="4" stroke-linecap="round"/><circle cx="17" cy="20" r="3" fill="#eb6e68"/><path d="M23 20h6M17 28h12M17 34h8" stroke="#8b817e" stroke-width="4" stroke-linecap="round"/><path d="m31 34 9-12 5 4-9 12-6 2z" fill="#ff8b2b" stroke="#fff9ef" stroke-width="3" stroke-linejoin="round"/>');
    case "eating":
      return svg('<ellipse cx="25" cy="31" rx="13" ry="8" fill="#fff9ef"/><ellipse cx="25" cy="31" rx="8" ry="4" fill="#9c633d"/><path d="M7 13v13m-4-13v9m8-9v9m-4 4v15M41 12v29m0-29c6 5 5 13 0 17" stroke="#fff9ef" stroke-width="4" stroke-linecap="round"/>');
    case "bill-wait":
      return svg('<rect x="6" y="14" width="27" height="19" rx="4" fill="#fff9ef"/><path d="M6 20h27" stroke="#554b52" stroke-width="4"/><rect x="10" y="25" width="9" height="4" rx="2" fill="#ffc94d"/><ellipse cx="35" cy="32" rx="8" ry="5" fill="#f2ae2e"/><ellipse cx="35" cy="28" rx="8" ry="5" fill="#ffd45c"/>');
    case "cleaning":
      return svg('<path d="m12 41 17-30" stroke="#6d5544" stroke-width="5" stroke-linecap="round"/><path d="m7 36 13 8 6-8-13-8z" fill="#fff9ef"/><path d="m31 11 5-4m1 11 6-1" stroke="#fff9ef" stroke-width="4" stroke-linecap="round"/>');
    case "resting":
      return svg('<path d="M8 20h25v15H8z" fill="#fff9ef"/><path d="M33 23h5c5 0 5 9 0 9h-5" stroke="#fff9ef" stroke-width="4"/><path d="M14 14c-3-4 1-7 0-10m9 10c-3-4 1-7 0-10" stroke="#fff9ef" stroke-width="4" stroke-linecap="round"/>');
  }
  return svg('<circle cx="12" cy="12" r="6"/>');
}

function MinimalStatusIcon({ thought, color }: { thought: CustomerThought | StaffThought; color: string }) {
  return <span className="flex h-[30px] w-[30px] items-center justify-center" style={{ color }} dangerouslySetInnerHTML={{ __html: getMinimalIconSvg(thought) }} />;
}

export function CharacterThoughtBubble({
  thought,
  className = "",
  showTooltip = true,
}: CharacterThoughtBubbleProps) {
  const [hovered, setHovered] = useState(false);
  const config = getEmoteConfig(thought);
  const theme = getThoughtBadgeTheme(thought);

  return (
    <div
      className={`relative inline-flex h-[50px] w-[42px] items-center justify-center select-none pointer-events-auto cursor-pointer ${className}`}
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
