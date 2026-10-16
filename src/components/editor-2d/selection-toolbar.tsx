"use client";

/**
 * Floating Selection Toolbar รุ่นใหม่
 * อ้างอิง PRD.md §9 ข้อ 11, design-html/playground-ux/index.html, feat-053
 *
 * - ลอยติดวัตถุ (วางด้านบน แต่สลับไปด้านล่างเมื่อชิดขอบบน)
 * - คำสั่ง: หมุน 90°, ทำซ้ำ (วางที่ว่างใกล้สุด), สลับ 2↔4 ที่นั่ง (เก้าอี้ตามทั้งชุด), '⋯' popover ปรับพิกัด X/Y, ลบ (cascade delete + toast)
 * - Accessible: role="toolbar", aria-label ไทยทุกปุ่ม, focus-visible outline ชัดเจน
 */
import * as React from "react";
import {
  footprint,
  snapToGrid,
  type LayoutObject,
  type Rect,
  type Table,
} from "@/core/layout";
import { layoutActions as actions } from "@/store/use-layout-store";
import { objectLabel } from "./stage-math";
import { cn } from "@/lib/cn";
import { TableSetStyleControls } from "@/components/editor/forms/table-set-style-controls";

export interface SelectionToolbarProps {
  /** กรอบผังร้าน (position: relative) ที่แถบนี้วางอยู่ข้างใน */
  boxRef: React.RefObject<HTMLDivElement | null>;
  room: { width: number; depth: number };
  objects: LayoutObject[];
  selected: LayoutObject;
  /** กรอบรวมของชุดโต๊ะ (ถ้าเลือกโต๊ะหรือเก้าอี้) */
  groupRect: Rect | null;
  onToast?: (message: string) => void;
}

const GAP = 10;
/** ยอมให้แถบยื่นออกนอกกรอบผังได้เท่านี้ (ยังอยู่ในพื้นที่ว่างรอบผัง) */
const OUTSIDE = 44;

type Box = { x: number; y: number; w: number; h: number };
const overlap = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

export function placeToolbar(
  target: Box,
  others: Box[],
  size: { w: number; h: number },
  area: { w: number; h: number },
): { x: number; y: number } {
  const cx = target.x + target.w / 2;
  const cy = target.y + target.h / 2;
  const clampX = (x: number) => Math.min(Math.max(-OUTSIDE, x), area.w + OUTSIDE - size.w);
  const candidates = [
    { x: clampX(cx - size.w / 2), y: target.y - GAP - size.h }, // บน
    { x: clampX(cx - size.w / 2), y: target.y + target.h + GAP }, // ล่าง
    { x: target.x + target.w + GAP, y: cy - size.h / 2 }, // ขวา
    { x: target.x - GAP - size.w, y: cy - size.h / 2 }, // ซ้าย
  ];
  let best = candidates[0]!;
  let bestScore = Infinity;
  candidates.forEach((c, i) => {
    const box = { ...c, ...size };
    const outside =
      c.x < -OUTSIDE || c.y < -OUTSIDE || c.x + size.w > area.w + OUTSIDE || c.y + size.h > area.h + OUTSIDE ? 1e9 : 0;
    // คะแนนเท่ากันให้ลำดับเดิมชนะ (บน → ล่าง → ขวา → ซ้าย)
    const score = outside + overlap(box, target) + others.reduce((n, o) => n + overlap(box, o), 0) + i;
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  });
  return best;
}

const ICON = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const BUTTON_BASE =
  "inline-flex items-center gap-1.5 px-2 py-1.5 rounded-[8px] text-[12.5px] font-medium text-ink hover:bg-surface focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus cursor-pointer transition-colors";

export function SelectionToolbar({
  boxRef,
  room,
  objects,
  selected,
  groupRect,
  onToast = () => {},
}: SelectionToolbarProps) {
  const barRef = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState<{ x: number; y: number } | null>(null);
  const [popOpen, setPopOpen] = React.useState(false);
  const [styleOpen, setStyleOpen] = React.useState(false);
  /** เปิดแผงฝั่งที่มีที่ว่างมากกว่า และจำกัดความสูงให้พอดีจอ (ไม่ทับแถบสถานะ/หัวหน้า) */
  const [stylePlacement, setStylePlacement] = React.useState<{ below: boolean; maxHeight: number }>({ below: true, maxHeight: 420 });
  const styleButtonRef = React.useRef<HTMLButtonElement>(null);

  // วัตถุเป้าหมายหลัก: ถ้าเลือกเก้าอี้ให้หมุน/สลับที่โต๊ะแม่
  const table =
    selected.type === "table"
      ? (selected as Table)
      : selected.type === "chair"
        ? (objects.find((o) => o.id === selected.tableId) as Table | undefined)
        : undefined;

  const target = table ?? selected;
  const isTableSet = Boolean(table);
  const currentSeats = table?.preset === "table-2-seats" ? 2 : 4;

  const [inputX, setInputX] = React.useState(String(target.x));
  const [inputY, setInputY] = React.useState(String(target.y));

  React.useEffect(() => {
    setInputX(String(target.x));
    setInputY(String(target.y));
  }, [target.x, target.y]);

  React.useLayoutEffect(() => {
    const box = boxRef.current;
    const bar = barRef.current;
    if (!box || !bar) return;
    const update = () => {
      const scale = box.clientWidth / room.width;
      const toPx = (r: Rect): Box => ({ x: r.x * scale, y: r.y * scale, w: r.width * scale, h: r.depth * scale });
      const others = objects
        .filter(
          (o) =>
            o.id !== selected.id &&
            o.id !== table?.id &&
            !(o.type === "chair" && o.tableId === table?.id),
        )
        .map((o) => toPx(footprint(o)));
      setPos(
        placeToolbar(
          toPx(groupRect ?? footprint(selected)),
          others,
          { w: bar.offsetWidth, h: bar.offsetHeight },
          { w: box.clientWidth, h: box.clientHeight },
        ),
      );
    };
    update();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(box);
    return () => observer?.disconnect();
  }, [boxRef, room.width, objects, selected, groupRect, table?.id]);

  const handleRotate = () => {
    actions().rotateObject(target.id, 90);
  };

  const handleDuplicate = () => {
    const newId = actions().duplicateObject(selected.id);
    if (newId) {
      onToast("ทำซ้ำแล้ว วางไว้ในที่ว่างที่ใกล้ที่สุด");
    }
  };

  const handleToggleSeats = () => {
    if (!table) return;
    const nextPreset = currentSeats === 2 ? 4 : 2;
    const ok = actions().toggleTableSeats(selected.id);
    if (ok) {
      onToast(`เปลี่ยนเป็นโต๊ะ ${nextPreset} ที่นั่งแล้ว (เก้าอี้ตามโต๊ะไปทั้งชุด)`);
    }
  };

  const handleDelete = () => {
    if (selected.type === "table") {
      const targetTable = selected as Table;
      const chairCount = objects.filter(
        (o) => o.type === "chair" && (o.tableId === targetTable.id || targetTable.chairIds.includes(o.id)),
      ).length;
      actions().deleteObject(selected.id);
      onToast(
        chairCount > 0
          ? `ลบโต๊ะพร้อมเก้าอี้ ${chairCount} ตัวแล้ว · กด Ctrl+Z เพื่อย้อน`
          : "ลบโต๊ะแล้ว · กด Ctrl+Z เพื่อย้อน",
      );
    } else if (selected.type === "chair") {
      actions().deleteObject(selected.id);
      onToast("ลบเก้าอี้ตัวนี้แล้ว · กด Ctrl+Z เพื่อย้อน");
    } else {
      actions().deleteObject(selected.id);
      onToast("ลบแล้ว · กด Ctrl+Z เพื่อย้อน");
    }
  };

  const applyCoord = () => {
    const nx = snapToGrid(parseFloat(inputX) || 0, 0.25);
    const ny = snapToGrid(parseFloat(inputY) || 0, 0.25);
    actions().updateObjectPosition(target.id, nx, ny);
    setPopOpen(false);
  };

  return (
    <div
      ref={barRef}
      role="toolbar"
      aria-label={`คำสั่งสำหรับ${objectLabel(target)}`}
      data-testid="selection-toolbar"
      className="absolute z-[30] flex items-center gap-1 whitespace-nowrap rounded-[12px] border border-line bg-white p-1 shadow-[0_6px_20px_rgba(30,43,64,0.14)]"
      style={{ left: pos?.x ?? 0, top: pos?.y ?? 0, visibility: pos ? "visible" : "hidden" }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* หมุน 90° */}
      <button
        type="button"
        aria-label="หมุน 90 องศา"
        title="หมุน 90 องศา (R)"
        className={BUTTON_BASE}
        onClick={handleRotate}
      >
        <svg viewBox="0 0 24 24" className="size-4 text-[#4e627c]" aria-hidden="true" {...ICON}>
          <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
          <path d="M21 3v5h-5" />
        </svg>
        <span>หมุน</span>
      </button>

      {/* ทำซ้ำ */}
      <button
        type="button"
        aria-label="ทำซ้ำ"
        title="ทำซ้ำวัตถุไปยังที่ว่างใกล้ที่สุด"
        className={BUTTON_BASE}
        onClick={handleDuplicate}
      >
        <svg viewBox="0 0 24 24" className="size-4 text-[#4e627c]" aria-hidden="true" {...ICON}>
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
        <span>ทำซ้ำ</span>
      </button>

      {/* สลับ 2↔4 ที่นั่ง (ถ้าเป็นชุดโต๊ะ) */}
      {isTableSet && (
        <button
          type="button"
          aria-label="เปลี่ยนจำนวนที่นั่ง"
          title={`เปลี่ยนจำนวนที่นั่ง (ปัจจุบัน ${currentSeats} ที่นั่ง)`}
          className={BUTTON_BASE}
          onClick={handleToggleSeats}
        >
          <svg viewBox="0 0 24 24" className="size-4 text-[#4e627c]" aria-hidden="true" {...ICON}>
            <path d="M5 11a2 2 0 0 1 2 2v2h10v-2a2 2 0 0 1 2-2v7h-2v-3H7v3H5v-7z" />
            <path d="M7 11V6a3 3 0 0 1 6 0v5" />
          </svg>
          <span>{currentSeats} ที่นั่ง</span>
          <svg viewBox="0 0 24 24" className="size-3.5 text-secondary" aria-hidden="true" {...ICON}>
            <path d="m7 16-4-4 4-4" />
            <path d="m17 8 4 4-4 4" />
            <path d="M3 12h18" />
          </svg>
        </button>
      )}

      {/* แบบโต๊ะ/เก้าอี้: ทรง ขนาด ขา สี (ทั้งชุด) */}
      {table && (
        <div className="relative">
          <button
            ref={styleButtonRef}
            type="button"
            aria-label="แบบโต๊ะและเก้าอี้"
            title="ปรับทรง ขนาด ขา และสีของโต๊ะ/เก้าอี้ทั้งชุด"
            aria-expanded={styleOpen}
            aria-haspopup="dialog"
            className={BUTTON_BASE}
            onClick={() => {
              setPopOpen(false);
              const rect = styleButtonRef.current?.getBoundingClientRect();
              if (rect && typeof window !== "undefined") {
                // เผื่อหัวหน้า (~64px) และแถบสถานะด้านล่าง (~72px)
                const below = window.innerHeight - rect.bottom - 80;
                const above = rect.top - 72;
                setStylePlacement({ below: below >= above, maxHeight: Math.max(200, Math.max(below, above)) });
              }
              setStyleOpen((prev) => !prev);
            }}
          >
            <svg viewBox="0 0 24 24" className="size-4 text-[#4e627c]" aria-hidden="true" {...ICON}>
              <circle cx="13.5" cy="6.5" r="1.5" />
              <circle cx="17.5" cy="10.5" r="1.5" />
              <circle cx="8.5" cy="7.5" r="1.5" />
              <circle cx="6.5" cy="12.5" r="1.5" />
              <path d="M12 2a10 10 0 0 0 0 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.3A5.7 5.7 0 0 0 22 9.7C22 5.4 17.5 2 12 2z" />
            </svg>
            <span>แบบ</span>
          </button>
          {styleOpen && (
            <div
              role="dialog"
              aria-label="แบบโต๊ะและเก้าอี้"
              className={cn(
                "absolute left-1/2 z-50 w-[min(288px,calc(100vw-32px))] -translate-x-1/2 overflow-y-auto overscroll-contain whitespace-normal rounded-[12px] border border-line bg-white p-3 shadow-[0_8px_24px_rgba(30,43,64,0.16)]",
                stylePlacement.below ? "top-full mt-2" : "bottom-full mb-2",
              )}
              style={{ maxHeight: stylePlacement.maxHeight }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setStyleOpen(false);
                  styleButtonRef.current?.focus();
                }
              }}
            >
              <TableSetStyleControls table={table} showSize />
            </div>
          )}
        </div>
      )}

      <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-line" />

      {/* '⋯' Popover ปรับตำแหน่งละเอียด */}
      <div className="relative">
        <button
          type="button"
          aria-label="ปรับละเอียด"
          title="ปรับตำแหน่งพิกัด X/Y ละเอียด"
          aria-expanded={popOpen}
          className="grid size-[32px] place-items-center rounded-[8px] text-[#4e627c] hover:bg-surface focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus cursor-pointer"
          onClick={() => {
            setStyleOpen(false);
            setPopOpen((prev) => !prev);
          }}
        >
          <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true" {...ICON}>
            <circle cx="12" cy="12" r="1" />
            <circle cx="19" cy="12" r="1" />
            <circle cx="5" cy="12" r="1" />
          </svg>
        </button>

        {popOpen && (
          <div
            role="dialog"
            aria-label="ปรับตำแหน่งละเอียด"
            className="absolute bottom-full left-1/2 z-50 mb-2 min-w-[200px] -translate-x-1/2 rounded-[12px] border border-line bg-white p-3 shadow-[0_8px_24px_rgba(30,43,64,0.16)]"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                setPopOpen(false);
              }
            }}
            // นำไปใช้เมื่อโฟกัสออกจากป๊อปโอเวอร์ทั้งก้อน — Tab จากช่อง X ไป Y ต้องไม่ปิดป๊อปโอเวอร์
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) applyCoord();
            }}
          >
            <div className="mb-2 text-[12px] font-semibold text-ink">ตำแหน่ง (ม.)</div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="pX" className="mb-1 block text-[11px] text-secondary">
                  ซ้าย-ขวา
                </label>
                <input
                  id="pX"
                  type="number"
                  step="0.25"
                  value={inputX}
                  onChange={(e) => setInputX(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") applyCoord();
                  }}
                  className="w-full rounded-[6px] border border-line px-2 py-1 text-[12px] text-ink focus:border-blue focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="pY" className="mb-1 block text-[11px] text-secondary">
                  บน-ล่าง
                </label>
                <input
                  id="pY"
                  type="number"
                  step="0.25"
                  value={inputY}
                  onChange={(e) => setInputY(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") applyCoord();
                  }}
                  className="w-full rounded-[6px] border border-line px-2 py-1 text-[12px] text-ink focus:border-blue focus:outline-none"
                />
              </div>
            </div>
            <div className="mt-2 text-[10.5px] leading-tight text-secondary">
              นับจากมุมซ้ายบนของร้าน (snap 0.25 ม.)
            </div>
          </div>
        )}
      </div>

      {/* ลบ */}
      <button
        type="button"
        aria-label="ลบ"
        title="ลบ (Delete)"
        className="grid size-[32px] place-items-center rounded-[8px] text-[var(--danger-ink)] hover:bg-[var(--danger-soft)] focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus cursor-pointer transition-colors"
        onClick={handleDelete}
      >
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true" {...ICON}>
          <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
        </svg>
      </button>
    </div>
  );
}
