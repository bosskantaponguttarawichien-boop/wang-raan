"use client";

/**
 * ปุ่มบนแถบหัวของ Playground: สถานะร่างที่บันทึก + ย้อนกลับ / ทำซ้ำ
 * (ย้ายมาจากหัวข้อ "ประวัติการแก้ไข" เดิม ให้กดได้ตลอดไม่ว่าแถบซ้ายจะเปิดหัวข้อไหน)
 */
import * as React from "react";
import { StatusDot } from "@/components/ui";
import { useDraftStatus } from "@/lib/draft-autosave";
import { layoutActions as actions, selectCanRedo, selectCanUndo, useLayoutStore } from "@/store/use-layout-store";

const SAVE_TEXT = {
  idle: "ยังไม่มีการแก้ไข",
  saving: "กำลังบันทึกร่าง…",
  saved: "บันทึกร่างในเบราว์เซอร์แล้ว",
  error: "บันทึกร่างไม่สำเร็จ (พื้นที่เบราว์เซอร์เต็มหรือถูกปิด)",
} as const;

export function DraftStatusText() {
  const status = useDraftStatus((s) => s.status);
  const layoutId = useLayoutStore((s) => s.layoutId);
  const isOnline = layoutId !== null;

  const text = isOnline
    ? {
        idle: "บันทึกในบัญชีแล้ว",
        saving: "กำลังบันทึกออนไลน์…",
        saved: "บันทึกในบัญชีแล้ว",
        error: "บันทึกออนไลน์ไม่สำเร็จ",
      }[status]
    : SAVE_TEXT[status];

  const tone = status === "saved" ? "bg-[var(--save-saved-dot)]" : status === "error" ? "bg-status-blocked" : status === "saving" ? "bg-[var(--save-saving)]" : "bg-[#c5cfdd]";
  return (
    <StatusDot tone={tone} data-testid="draft-status" data-status={status}>
      {text}
    </StatusDot>
  );
}

const ICON = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const ICON_BUTTON =
  "grid size-[34px] place-items-center rounded-[8px] text-[#4e627c] transition-colors duration-[180ms] hover:bg-blue-soft hover:text-blue disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[#4e627c] motion-reduce:transition-none focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus";

export function HeaderActions() {
  const canUndo = useLayoutStore(selectCanUndo);
  const canRedo = useLayoutStore(selectCanRedo);
  return (
    <div className="flex items-center gap-1.5 border-l border-[#e5eaf2] pl-3 max-[700px]:ml-auto max-[700px]:border-l-0 max-[700px]:pl-0">
      <span className="mr-2 whitespace-nowrap text-[12px] text-secondary max-[1280px]:hidden">
        <DraftStatusText />
      </span>
      <button
        type="button"
        aria-label="ย้อนกลับ"
        title="ย้อนกลับ (Ctrl+Z)"
        aria-keyshortcuts="Control+Z Meta+Z"
        disabled={!canUndo}
        onClick={() => actions().undo()}
        className={ICON_BUTTON}
      >
        <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden="true" {...ICON}>
          <path d="M9 14 4 9l5-5" />
          <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
        </svg>
      </button>
      <button
        type="button"
        aria-label="ทำซ้ำ"
        title="ทำซ้ำ (Ctrl+Shift+Z)"
        aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z"
        disabled={!canRedo}
        onClick={() => actions().redo()}
        className={ICON_BUTTON}
      >
        <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden="true" {...ICON}>
          <path d="m15 14 5-5-5-5" />
          <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
        </svg>
      </button>
    </div>
  );
}
