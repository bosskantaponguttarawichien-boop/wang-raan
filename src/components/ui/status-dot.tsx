import * as React from "react";
import { cn } from "@/lib/cn";

export interface StatusDotProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** คลาสสีพื้นของจุด เช่น `bg-status-blocked` */
  tone: string;
}

/** จุดสีเล็ก + ข้อความสถานะ (สีเป็นตัวช่วย ข้อความบอกสถานะเสมอ) */
export function StatusDot({ tone, className, children, ...props }: StatusDotProps) {
  return (
    <span className={cn("flex items-center gap-1.5", className)} {...props}>
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", tone)} />
      {children}
    </span>
  );
}
