import * as React from "react";

/** ข้อความสำหรับ Screen Reader เท่านั้น */
export function VisuallyHidden({ children }: { children: React.ReactNode }) {
  return <span className="sr-only">{children}</span>;
}
