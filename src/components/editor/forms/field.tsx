import * as React from "react";
import { cn } from "@/lib/cn";

export const inputClass =
  "mt-1 block min-h-10 w-full min-w-0 rounded-[7px] border border-[#dce4ef] bg-white px-2 text-[14px] tabular-nums text-ink aria-[invalid=true]:border-status-blocked focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus";

export interface FieldProps {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  className?: string;
  children: (aria: { id: string; "aria-invalid": boolean; "aria-describedby"?: string }) => React.ReactNode;
}

/** ป้ายกำกับ + ช่องกรอก + ข้อความ error (ผูกด้วย aria-describedby ให้ Screen Reader อ่าน) */
export function Field({ id, label, error, hint, className, children }: FieldProps) {
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("min-w-0", className)}>
      <label htmlFor={id} className="block text-[12px] leading-[1.6] text-secondary">
        {label}
      </label>
      {children({ id, "aria-invalid": Boolean(error), "aria-describedby": describedBy })}
      {hint && !error && (
        <p id={`${id}-hint`} className="m-0 mt-1 text-[11px] leading-[1.6] text-secondary">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="m-0 mt-1 text-[11px] leading-[1.6] text-[#b8433b]">
          {error}
        </p>
      )}
    </div>
  );
}
