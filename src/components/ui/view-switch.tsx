"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

export interface ViewSwitchOption<T extends string> {
  value: T;
  label: string;
}

export interface ViewSwitchProps<T extends string> {
  options: ReadonlyArray<ViewSwitchOption<T>>;
  value: T;
  onValueChange: (value: T) => void;
  /** ชื่อกลุ่มปุ่มภาษาไทย เช่น "เลือกมุมมองผังร้าน" */
  "aria-label": string;
  className?: string;
}

// design-system.md §7.1.4 — Segmented View Switch ใช้ aria-pressed (§10)
export function ViewSwitch<T extends string>({
  options,
  value,
  onValueChange,
  className,
  "aria-label": ariaLabel,
}: ViewSwitchProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn("inline-flex gap-0.5 rounded-[7px] border border-line bg-[#f7f9fd] p-0.5", className)}
    >
      {options.map((option) => {
        const pressed = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={pressed}
            onClick={() => onValueChange(option.value)}
            className={cn(
              "min-h-7 rounded-[5px] px-3 text-[12px] leading-[1.5] text-[#637288]",
              "transition-colors duration-[180ms] motion-reduce:transition-none",
              "focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus focus-visible:outline-offset-2",
              pressed && "bg-white font-semibold text-blue shadow-[0_1px_3px_rgba(24,49,91,0.09)]",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
