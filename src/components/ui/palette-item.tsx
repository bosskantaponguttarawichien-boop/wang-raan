import * as React from "react";
import { cn } from "@/lib/cn";

export interface PaletteItemProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  name: string;
  /** ขนาดเป็นเมตร เช่น "1.2 × 1.2 ม." */
  size: string;
  icon: React.ReactNode;
}

// design-system.md §7.1.3 — Palette Item Button (.add-item)
export const PaletteItem = React.forwardRef<HTMLButtonElement, PaletteItemProps>(
  ({ name, size, icon, className, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        "flex w-full items-center gap-3 rounded-[9px] border border-[#e4e9f2] bg-white p-2 text-left",
        "transition-colors duration-[180ms] hover:border-[#afbef2] hover:bg-[#f9faff] motion-reduce:transition-none",
        "focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus focus-visible:outline-offset-2",
        className,
      )}
      {...props}
    >
      <span aria-hidden="true" className="grid size-[34px] shrink-0 place-items-center rounded-[8px] bg-blue-soft text-blue">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        {/* ชื่อที่อ่านได้มาจากข้อความที่มองเห็น (WCAG 2.5.3 Label in Name) + คำกริยาสำหรับ Screen Reader */}
        <span className="block text-[13px] font-semibold leading-[1.5] text-ink">
          <span className="sr-only">เพิ่ม</span>
          {name}
        </span>
        <span className="block text-[11px] leading-[1.55] text-secondary">{size}</span>
      </span>
      <span aria-hidden="true" className="text-[#7990dd]">
        +
      </span>
    </button>
  ),
);
PaletteItem.displayName = "PaletteItem";
