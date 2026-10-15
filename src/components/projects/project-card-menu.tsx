"use client";

import * as React from "react";

export interface ProjectCardMenuProps {
  layoutId: string;
  layoutName: string;
  onOpen: () => void;
  onDelete: () => void;
}

export function ProjectCardMenu({
  layoutName,
  onOpen,
  onDelete,
}: ProjectCardMenuProps) {
  const [open, setOpen] = React.useState(false);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);

  // ปิดเมนูเมื่อคลิกนอก
  React.useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // จัดการคีย์บอร์ด (Escape คืนโฟกัสที่ปุ่ม ⋯, Arrow keys)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      e.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const items = menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
      if (items && items.length > 0) {
        items[0]?.focus();
      }
    }
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`เมนูจัดการผัง ${layoutName}`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        onKeyDown={handleKeyDown}
        className="more flex size-[34px] items-center justify-center rounded-[10px] border border-[#e2e8f1] bg-white/95 text-[#1e2b40] shadow-sm hover:border-[#c8d2e2] hover:bg-white cursor-pointer transition-opacity focus-visible:outline-3 focus-visible:outline-[#a4b6ff] focus-visible:outline-offset-1 max-[768px]:opacity-100"
      >
        <svg className="w-5 h-5 text-[#4e627c]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" />
        </svg>
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={`ตัวเลือกสำหรับ ${layoutName}`}
          onKeyDown={handleKeyDown}
          className="absolute right-0 top-[calc(100%+6px)] z-20 min-w-[180px] rounded-[12px] border border-[#e2e8f1] bg-white p-1.5 shadow-xl animate-in fade-in zoom-in-95 duration-100"
        >
          <button
            role="menuitem"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              onOpen();
            }}
            className="flex w-full items-center gap-2.5 rounded-[8px] border-0 bg-transparent px-3 py-2 text-left text-[14px] text-[#1e2b40] hover:bg-[#f7f9fc] cursor-pointer focus-visible:outline-3 focus-visible:outline-[#a4b6ff] transition-colors"
          >
            <svg className="w-4 h-4 text-[#3b62f4]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            เปิดผัง
          </button>
          <button
            role="menuitem"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              onDelete();
            }}
            className="flex w-full items-center gap-2.5 rounded-[8px] border-0 bg-transparent px-3 py-2 text-left text-[14px] text-[#b23d33] hover:bg-[#fdeeec] cursor-pointer focus-visible:outline-3 focus-visible:outline-[#a4b6ff] transition-colors"
          >
            <svg className="w-4 h-4 text-[#b23d33]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            ลบผัง
          </button>
        </div>
      )}
    </div>
  );
}
