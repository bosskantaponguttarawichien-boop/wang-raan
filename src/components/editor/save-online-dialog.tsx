"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import * as React from "react";
import { saveDraft, getDraftStorage } from "@/lib/draft-storage";
import { useLayoutStore } from "@/store/use-layout-store";

export interface SaveOnlineDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SaveOnlineDialog({ open, onOpenChange }: SaveOnlineDialogProps) {
  const router = useRouter();
  const currentName = useLayoutStore((s) => s.layoutName);
  const setLayoutName = useLayoutStore((s) => s.setLayoutName);
  const layout = useLayoutStore((s) => s.layout);
  const history = useLayoutStore((s) => s.history);
  const historyIndex = useLayoutStore((s) => s.historyIndex);

  const [name, setName] = React.useState(currentName);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (open) {
      setName(currentName);
    }
  }, [open, currentName]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalName = name.trim() || currentName || `ผังร้าน ${layout.width} × ${layout.depth} ม.`;
    const limitedName = finalName.slice(0, 80);
    setLayoutName(limitedName);

    // บันทึก draft พร้อมชื่อและ flag สำหรับ sync หลัง login
    const storage = getDraftStorage();
    if (storage) {
      saveDraft(storage, {
        savedAt: new Date().toISOString(),
        name: limitedName,
        history,
        historyIndex,
      });
      try {
        storage.setItem("wang-raan:pending-sync", JSON.stringify({ name: limitedName }));
      } catch {
        // ignore storage error
      }
    }

    onOpenChange(false);
    // พาไปหน้า /login และตั้ง next กลับมาที่ /playground?sync=1
    router.push(`/login?next=${encodeURIComponent("/playground?sync=1")}`);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[#1e2b40]/40 backdrop-blur-[2px] transition-opacity" />
        <Dialog.Content
          role="dialog"
          aria-labelledby="so-title"
          aria-describedby="so-desc"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
            inputRef.current?.select();
          }}
          className="fixed left-1/2 top-1/2 z-50 w-[min(440px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-[16px] border border-[#e2e8f1] bg-white p-6 shadow-2xl focus:outline-none"
        >
          <div className="flex items-center gap-2.5 mb-2">
            <div className="grid size-9 place-items-center rounded-[10px] bg-[#edf1ff] text-[#3b62f4]" aria-hidden="true">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <Dialog.Title id="so-title" className="m-0 text-[18px] font-bold text-[#1e2b40]">
              บันทึกผังออนไลน์
            </Dialog.Title>
          </div>

          <Dialog.Description id="so-desc" className="mb-5 text-[14px] leading-[1.6] text-[#4e627c]">
            บันทึกผังร้านไว้ในบัญชีของคุณ เพื่อเปิดใช้งานต่อจากทุกอุปกรณ์และแชร์ลิงก์ให้ทีมดูได้
          </Dialog.Description>

          <form onSubmit={handleSubmit} noValidate>
            <div className="mb-4">
              <label htmlFor="so-name-input" className="block text-[13px] font-medium text-[#1e2b40] mb-1.5">
                ชื่อผังร้าน
              </label>
              <input
                ref={inputRef}
                id="so-name-input"
                type="text"
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="เช่น ร้านกาแฟสยามสุข"
                className="h-11 w-full rounded-[10px] border border-[#e2e8f1] px-3 text-[14px] text-[#1e2b40] bg-white focus:border-[#3b62f4] focus-visible:outline-3 focus-visible:outline-[#a4b6ff] focus-visible:outline-offset-1 transition-colors"
              />
              <p className="mt-1 text-right text-[12px] text-[#52637a] tabular-nums">
                {name.length}/80
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="inline-flex h-10 items-center justify-center rounded-[10px] border border-[#e2e8f1] bg-white px-4 text-[14px] font-medium text-[#1e2b40] hover:border-[#c8d2e2] hover:bg-[#f7f9fc] cursor-pointer focus-visible:outline-3 focus-visible:outline-[#a4b6ff] focus-visible:outline-offset-2 transition-colors"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                id="so-submit-btn"
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-[10px] border border-[#3b62f4] bg-[#3b62f4] px-4 text-[14px] font-medium text-white hover:bg-[#2e50da] cursor-pointer focus-visible:outline-3 focus-visible:outline-[#a4b6ff] focus-visible:outline-offset-2 transition-colors"
              >
                เข้าสู่ระบบเพื่อบันทึก
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
