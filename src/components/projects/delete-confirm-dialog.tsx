"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as React from "react";

export interface DeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  layoutName: string;
  onConfirm: () => void | Promise<void>;
  loading?: boolean;
}

export function DeleteConfirmDialog({
  open,
  onOpenChange,
  layoutName,
  onConfirm,
  loading = false,
}: DeleteConfirmDialogProps) {
  const cancelBtnRef = React.useRef<HTMLButtonElement>(null);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[#1e2b40]/40 backdrop-blur-[2px] transition-opacity" />
        <Dialog.Content
          role="alertdialog"
          aria-labelledby="cf-t"
          aria-describedby="cf-d"
          onOpenAutoFocus={(e) => {
            // โฟกัสเริ่มต้นที่ปุ่มยกเลิกเพื่อความปลอดภัย (WCAG 2.1 AA)
            e.preventDefault();
            cancelBtnRef.current?.focus();
          }}
          className="fixed left-1/2 top-1/2 z-50 w-[min(420px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-[16px] border border-[#e2e8f1] bg-white p-6 shadow-2xl focus:outline-none"
        >
          <Dialog.Title id="cf-t" className="m-0 mb-2 text-[17px] font-semibold text-[#1e2b40]">
            ลบผัง &ldquo;{layoutName}&rdquo;?
          </Dialog.Title>
          <Dialog.Description id="cf-d" className="mb-5 text-[14px] leading-[1.6] text-[#4e627c]">
            ผังนี้และลิงก์แชร์ทั้งหมดของผังจะถูกลบถาวร กู้คืนไม่ได้
          </Dialog.Description>

          <div className="flex items-center justify-end gap-2">
            <button
              ref={cancelBtnRef}
              id="cf-cancel"
              type="button"
              disabled={loading}
              onClick={() => onOpenChange(false)}
              className="inline-flex h-10 items-center justify-center rounded-[10px] border border-[#e2e8f1] bg-white px-4 text-[14px] font-medium text-[#1e2b40] hover:border-[#c8d2e2] hover:bg-[#f7f9fc] cursor-pointer focus-visible:outline-3 focus-visible:outline-[#a4b6ff] focus-visible:outline-offset-2 transition-colors disabled:opacity-50"
            >
              ยกเลิก
            </button>
            <button
              id="cf-ok"
              type="button"
              disabled={loading}
              onClick={async () => {
                await onConfirm();
              }}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-[10px] border border-[#b23d33] bg-[#b23d33] px-4 text-[14px] font-medium text-white hover:bg-[#993128] cursor-pointer focus-visible:outline-3 focus-visible:outline-[#a4b6ff] focus-visible:outline-offset-2 transition-colors disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              {loading ? "กำลังลบ…" : "ลบผัง"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
