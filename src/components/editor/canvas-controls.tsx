"use client";

/**
 * ตัวควบคุม Artboard: สลับ 2D/3D + ขนาดร้านบนแถบหัว และปุ่มซูมลอยมุมล่างซ้ายของ Canvas
 * (ย้ายออกจากแถบเครื่องมือเหนือ Canvas เดิม เพื่อคืนพื้นที่แนวตั้งให้ผังร้าน)
 */
import * as React from "react";
import { cn } from "@/lib/cn";
import { ViewSwitch } from "@/components/ui";
import { ZOOM_MAX, ZOOM_MIN, layoutActions as actions, useLayoutStore } from "@/store/use-layout-store";

const ZOOM_BUTTON =
  "grid size-9 place-items-center rounded-[9px] text-[#3d4f66] transition-colors duration-[180ms] hover:bg-blue-soft hover:text-blue disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[#3d4f66] motion-reduce:transition-none focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus";
const ICON = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

/** สลับ 2D/3D + ขนาดร้าน — อยู่บนแถบหัว */
export function CanvasControls({ className }: { className?: string }) {
  const is3D = useLayoutStore((s) => s.is3DView);
  const size = useLayoutStore((s) => `${s.layout.width} × ${s.layout.depth} เมตร`);

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <ViewSwitch
        aria-label="เปลี่ยนมุมมอง"
        value={is3D ? "3d" : "2d"}
        onValueChange={(v) => actions().set3DView(v === "3d")}
        options={[
          { value: "2d", label: "จัดผัง 2D" },
          { value: "3d", label: "ดูตัวอย่าง 3D" },
        ]}
      />
      <span className="whitespace-nowrap rounded-[5px] bg-[#f3f6fa] px-2 py-1 text-[12px] text-secondary-strong max-[1100px]:hidden">{size}</span>
    </div>
  );
}

const VIEW_TOP: Record<number, string> = { 0: "ด้านบน", 90: "ด้านซ้าย", 180: "ด้านล่าง", 270: "ด้านขวา" };

/** ซูมออก · พอดี · ซูมเข้า | หมุนมุมมองซ้าย · ขวา — การ์ดลอยมุมล่างซ้ายของ Canvas */
export function ZoomControls({ className }: { className?: string }) {
  const zoom = useLayoutStore((s) => s.zoom);
  const viewRotation = useLayoutStore((s) => s.viewRotation);
  // ผนังของผังจริงที่หมุนขึ้นไปอยู่ด้านบนของจอ (ป้ายในผัง 2D เรียก ด้านบน/ล่าง/ซ้าย/ขวา ตามผังเดิม)
  const rotationLabel = viewRotation === 0 ? "มุมมองปกติ" : `หมุน ${viewRotation}° · ผนัง${VIEW_TOP[viewRotation]}อยู่บน`;
  const zoomBy = (step: number) => actions().setZoom(Math.round((zoom + step) * 10) / 10);
  const percent = `${Math.round(zoom * 100)}%`;

  return (
    <div
      role="group"
      aria-label={`ซูมและหมุน Artboard (ขณะนี้ ${percent}, ${rotationLabel})`}
      className={cn("flex items-center gap-1 rounded-[12px] border border-[#e6ebf2] bg-white p-1 shadow-status", className)}
    >
      <button type="button" aria-label="ซูมออก" title="ซูมออก" className={ZOOM_BUTTON} disabled={zoom <= ZOOM_MIN} onClick={() => zoomBy(-0.1)}>
        <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden="true" {...ICON}>
          <path d="M5 12h14" />
        </svg>
      </button>
      <button type="button" aria-label={`ปรับให้พอดี (ขณะนี้ ${percent})`} title={`พอดี · ${percent}`} className={ZOOM_BUTTON} onClick={() => actions().setZoom(1)}>
        <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden="true" {...ICON}>
          <path d="M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7" />
        </svg>
      </button>
      <button type="button" aria-label="ซูมเข้า" title="ซูมเข้า" className={ZOOM_BUTTON} disabled={zoom >= ZOOM_MAX} onClick={() => zoomBy(0.1)}>
        <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden="true" {...ICON}>
          <path d="M5 12h14M12 5v14" />
        </svg>
      </button>
      <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-[#e6ebf2]" />
      <button type="button" aria-label={`หมุนมุมมองทวนเข็ม 90 องศา (${rotationLabel})`} title="หมุนซ้าย 90°" className={ZOOM_BUTTON} onClick={() => actions().rotateView(-1)} data-testid="rotate-view-left">
        <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden="true" {...ICON}>
          <path d="M4 5v5h5" />
          <path d="M4.6 10A8 8 0 1 1 6 16.5" />
        </svg>
      </button>
      <button type="button" aria-label={`หมุนมุมมองตามเข็ม 90 องศา (${rotationLabel})`} title="หมุนขวา 90°" className={ZOOM_BUTTON} onClick={() => actions().rotateView(1)} data-testid="rotate-view-right">
        <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden="true" {...ICON}>
          <path d="M20 5v5h-5" />
          <path d="M19.4 10A8 8 0 1 0 18 16.5" />
        </svg>
      </button>
    </div>
  );
}
