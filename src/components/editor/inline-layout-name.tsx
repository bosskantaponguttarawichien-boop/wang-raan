"use client";

import * as React from "react";
import { api } from "@/lib/api-client";
import { useLayoutStore } from "@/store/use-layout-store";

export interface InlineLayoutNameProps {
  onToast?: (message: string) => void;
  className?: string;
}

export function InlineLayoutName({ onToast, className = "" }: InlineLayoutNameProps) {
  const layoutName = useLayoutStore((s) => s.layoutName);
  const setLayoutName = useLayoutStore((s) => s.setLayoutName);
  const layoutId = useLayoutStore((s) => s.layoutId);
  const layout = useLayoutStore((s) => s.layout);

  const [isEditing, setIsEditing] = React.useState(false);
  const [draftName, setDraftName] = React.useState(layoutName);
  const [saving, setSaving] = React.useState(false);

  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!isEditing) {
      setDraftName(layoutName);
    }
  }, [layoutName, isEditing]);

  const handleStartEdit = () => {
    setDraftName(layoutName);
    setIsEditing(true);
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 10);
  };

  const handleCancel = () => {
    setDraftName(layoutName);
    setIsEditing(false);
  };

  const handleSave = async () => {
    const trimmed = draftName.trim();
    setIsEditing(false);

    // ถ้าค่าว่างหรือไม่เปลี่ยน → คืนชื่อเดิม ไม่ต้องยิง request
    if (!trimmed || trimmed === layoutName) {
      setDraftName(layoutName);
      return;
    }

    const finalName = trimmed.slice(0, 80);
    setLayoutName(finalName);

    // ถ้าเป็นผังออนไลน์ ให้บันทึกชื่อกลับผ่าน PUT
    if (layoutId) {
      setSaving(true);
      try {
        await api.updateLayout(layout, finalName);
        onToast?.(`เปลี่ยนชื่อผังเป็น “${finalName}” แล้ว`);
      } catch {
        onToast?.("บันทึกชื่อผังออนไลน์ไม่สำเร็จ");
      } finally {
        setSaving(false);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleCancel();
    }
  };

  if (isEditing) {
    return (
      <div className={`inline-flex items-center ${className}`}>
        <input
          ref={inputRef}
          id="inlineLayoutNameInput"
          type="text"
          maxLength={80}
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleSave}
          aria-label="แก้ไขชื่อผัง"
          className="h-8 w-44 sm:w-56 rounded-[6px] border border-[#3b62f4] bg-white px-2 text-[13px] font-medium text-[#1e2b40] shadow-sm outline-none focus-visible:outline-2 focus-visible:outline-[#a4b6ff]"
        />
      </div>
    );
  }

  return (
    // หดได้ถึงแค่ปุ่มดินสอ (จอ 320px) — ต่ำกว่านั้นดินสอจะล้นไปทับปุ่มเมนู
    <div className={`inline-flex items-center gap-1 min-w-[30px] ${className}`}>
      <button
        type="button"
        id="inlineLayoutNameBtn"
        onClick={handleStartEdit}
        aria-label={`ชื่อผัง ${layoutName} (คลิกเพื่อแก้ไข)`}
        title="คลิกเพื่อแก้ไขชื่อผัง (Enter บันทึก, Esc ยกเลิก)"
        className="group flex items-center gap-1.5 rounded-[6px] px-1.5 py-1 text-left text-[13px] font-semibold text-[#1e2b40] hover:bg-[#f7f9fc] focus-visible:outline-3 focus-visible:outline-[#a4b6ff] focus-visible:outline-offset-1 transition-colors cursor-pointer min-w-[30px] max-w-[200px] sm:max-w-[260px]"
      >
        <span className="truncate">{layoutName}</span>
        <svg
          className="size-3.5 shrink-0 text-[#8596ad] group-hover:text-[#3b62f4] transition-colors"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
          />
        </svg>
      </button>
      {saving && (
        <span className="text-[11px] text-[#8596ad] animate-pulse max-[640px]:hidden" aria-live="polite">
          กำลังบันทึก…
        </span>
      )}
    </div>
  );
}
