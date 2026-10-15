"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as React from "react";
import { clampRoomDimension, snapToGrid, type Wall } from "@/core/layout";
import { cn } from "@/lib/cn";

export interface OnboardingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStartCustom: (params: { width: number; depth: number; wall: Wall }) => void;
  onUseTemplate: () => void;
}

const WALL_LABELS: Record<Wall, string> = {
  north: "บน",
  south: "ล่าง",
  west: "ซ้าย",
  east: "ขวา",
};

export function OnboardingModal({
  open,
  onOpenChange,
  onStartCustom,
  onUseTemplate,
}: OnboardingModalProps) {
  const [width, setWidth] = React.useState<number>(8);
  const [depth, setDepth] = React.useState<number>(6);
  const [wall, setWall] = React.useState<Wall>("south");

  const handleApply = () => {
    const validW = clampRoomDimension(width);
    const validD = clampRoomDimension(depth);
    onStartCustom({ width: validW, depth: validD, wall });
    onOpenChange(false);
  };

  const handleTemplate = () => {
    onUseTemplate();
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[#1e2b40]/40 backdrop-blur-[2px]" />
        <Dialog.Content
          data-surface="playground"
          data-testid="onboarding-dialog"
          className="fixed left-1/2 top-1/2 z-50 w-[min(440px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-[16px] border border-line bg-white p-6 shadow-card focus:outline-none"
        >
          <div className="mb-2 flex items-center justify-between">
            <Dialog.Title className="m-0 text-[18px] font-semibold text-ink">
              ร้านของคุณขนาดเท่าไร
            </Dialog.Title>
            <Dialog.Close
              aria-label="ปิดหน้าต่าง"
              className="grid size-8 place-items-center rounded-[8px] text-[18px] text-secondary hover:bg-blue-soft hover:text-blue focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus"
            >
              ×
            </Dialog.Close>
          </div>

          <Dialog.Description className="mb-5 text-[13px] leading-[1.5] text-secondary">
            ใส่ค่าประมาณได้ แก้ไขทีหลังได้เสมอที่แท็บ &ldquo;ร้าน&rdquo;
          </Dialog.Description>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label htmlFor="ob-w" className="mb-1 block text-[12px] font-medium text-ink">
                กว้าง (ม.)
              </label>
              <input
                id="ob-w"
                type="number"
                step={0.25}
                min={2}
                max={30}
                value={width}
                onChange={(e) => setWidth(snapToGrid(parseFloat(e.target.value) || 2))}
                className="w-full rounded-[8px] border border-line bg-white px-3 py-2 text-[14px] text-ink focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus"
              />
            </div>
            <div>
              <label htmlFor="ob-d" className="mb-1 block text-[12px] font-medium text-ink">
                ลึก (ม.)
              </label>
              <input
                id="ob-d"
                type="number"
                step={0.25}
                min={2}
                max={30}
                value={depth}
                onChange={(e) => setDepth(snapToGrid(parseFloat(e.target.value) || 2))}
                className="w-full rounded-[8px] border border-line bg-white px-3 py-2 text-[14px] text-ink focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus"
              />
            </div>
          </div>

          <div className="mb-1 text-[12px] font-medium text-ink">
            ประตูทางเข้าอยู่ด้านไหน (กดเลือกที่ขอบ)
          </div>

          <div className="mb-5 flex items-center gap-4 rounded-[12px] border border-dashed border-line bg-surface p-3.5">
            {/* กล่องจำลองร้านขนาดเล็ก */}
            <div
              className="relative size-16 shrink-0 rounded-[6px] border-2 border-line bg-white"
              role="group"
              aria-label="เลือกผนังทางเข้า"
            >
              {/* ผนังบน (north) */}
              <button
                type="button"
                onClick={() => setWall("north")}
                aria-label="ประตูด้านบน"
                aria-pressed={wall === "north"}
                className={cn(
                  "absolute -top-1.5 left-2 right-2 h-3 cursor-pointer border-t-[3.5px] border-transparent transition-colors",
                  wall === "north" ? "border-blue bg-blue/15" : "hover:border-blue/50",
                )}
              />
              {/* ผนังล่าง (south) */}
              <button
                type="button"
                onClick={() => setWall("south")}
                aria-label="ประตูด้านล่าง"
                aria-pressed={wall === "south"}
                className={cn(
                  "absolute -bottom-1.5 left-2 right-2 h-3 cursor-pointer border-b-[3.5px] border-transparent transition-colors",
                  wall === "south" ? "border-blue bg-blue/15" : "hover:border-blue/50",
                )}
              />
              {/* ผนังซ้าย (west) */}
              <button
                type="button"
                onClick={() => setWall("west")}
                aria-label="ประตูด้านซ้าย"
                aria-pressed={wall === "west"}
                className={cn(
                  "absolute -left-1.5 bottom-2 top-2 w-3 cursor-pointer border-l-[3.5px] border-transparent transition-colors",
                  wall === "west" ? "border-blue bg-blue/15" : "hover:border-blue/50",
                )}
              />
              {/* ผนังขวา (east) */}
              <button
                type="button"
                onClick={() => setWall("east")}
                aria-label="ประตูด้านขวา"
                aria-pressed={wall === "east"}
                className={cn(
                  "absolute -right-1.5 bottom-2 top-2 w-3 cursor-pointer border-r-[3.5px] border-transparent transition-colors",
                  wall === "east" ? "border-blue bg-blue/15" : "hover:border-blue/50",
                )}
              />
            </div>

            <div className="text-[13px] text-secondary">
              ประตูอยู่ด้าน <b className="text-blue">ผนัง{WALL_LABELS[wall]}</b>
              <br />
              <span className="text-[11px] text-muted">ตำแหน่งละเอียดสามารถลากปรับบนผังได้</span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
            <button
              type="button"
              onClick={handleTemplate}
              className="flex items-center gap-1.5 rounded-[10px] border border-line bg-surface px-3 py-2 text-[12.5px] font-medium text-ink hover:bg-[#edf1f6] focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus"
            >
              <svg viewBox="0 0 24 24" className="size-4 text-blue" fill="none" stroke="currentColor" strokeWidth={1.8}>
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M3 9h18M9 21V9" />
              </svg>
              ใช้ผังตัวอย่างแทน
            </button>

            <button
              type="button"
              onClick={handleApply}
              className="flex items-center gap-1.5 rounded-[10px] bg-blue px-4 py-2 text-[13px] font-medium text-white shadow-btn hover:bg-blue-strong focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus"
            >
              เริ่มจัดร้าน
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
