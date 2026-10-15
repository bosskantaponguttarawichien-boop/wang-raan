"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as React from "react";
import { CloudPanel } from "./cloud-panel";

export interface CloudModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CloudModal({ open, onOpenChange }: CloudModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[#1e2b40]/40 backdrop-blur-[2px]" />
        <Dialog.Content
          data-surface="playground"
          className="fixed left-1/2 top-1/2 z-50 w-[min(460px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-[16px] border border-line bg-white p-6 shadow-card focus:outline-none"
        >
          <div className="mb-4 flex items-center justify-between border-b border-line pb-3">
            <Dialog.Title className="m-0 text-[17px] font-semibold text-ink">
              บัญชีและผังออนไลน์
            </Dialog.Title>
            <Dialog.Close
              aria-label="ปิดหน้าต่าง"
              className="grid size-8 place-items-center rounded-[8px] text-[18px] text-secondary hover:bg-blue-soft hover:text-blue focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus"
            >
              ×
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">
            จัดการบัญชี บันทึกผังออนไลน์ และแชร์ลิงก์ผังร้าน
          </Dialog.Description>
          <div className="max-h-[70vh] overflow-y-auto pr-1">
            <CloudPanel />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
