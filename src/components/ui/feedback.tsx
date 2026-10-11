import * as React from "react";
import { cn } from "@/lib/cn";
import { Button } from "./button";

/** ข้อความผิดพลาดสีแดง (role="alert" ให้ Screen Reader อ่านทันที) */
export function ErrorText({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p role="alert" className={cn("m-0 text-[#b8433b]", className)} {...props} />;
}

export interface LoadErrorProps {
  message: React.ReactNode;
  onRetry: () => void;
  "data-testid"?: string;
}

/** โหลดข้อมูลไม่สำเร็จ + ปุ่ม "ลองอีกครั้ง" */
export function LoadError({ message, onRetry, "data-testid": testId }: LoadErrorProps) {
  return (
    <div role="alert" className="text-[12px] text-[#b8433b]" data-testid={testId}>
      <p className="m-0">{message}</p>
      <Button variant="secondary" size="sm" className="mt-2" onClick={onRetry}>
        ลองอีกครั้ง
      </Button>
    </div>
  );
}
