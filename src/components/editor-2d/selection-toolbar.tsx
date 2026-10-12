"use client";

/**
 * แถบเครื่องมือลอยข้างชิ้นงานที่เลือก: หมุนซ้าย/ขวา 90° และลบ
 * ตำแหน่ง: บนชิ้นงานก่อน ถ้าทับชิ้นอื่นหรือเลยขอบให้ลองล่าง → ขวา → ซ้าย แล้วเลือกที่ทับน้อยที่สุด
 */
import * as React from "react";
import { footprint, type LayoutObject, type Rect } from "@/core/layout";
import { layoutActions as actions } from "@/store/use-layout-store";
import { objectLabel } from "./stage-math";

export interface SelectionToolbarProps {
  /** กรอบผังร้าน (position: relative) ที่แถบนี้วางอยู่ข้างใน */
  boxRef: React.RefObject<HTMLDivElement | null>;
  room: { width: number; depth: number };
  objects: LayoutObject[];
  selected: LayoutObject;
  /** กรอบรวมของชุดโต๊ะ (ถ้าเลือกโต๊ะหรือเก้าอี้) */
  groupRect: Rect | null;
}

const GAP = 10;
/** ยอมให้แถบยื่นออกนอกกรอบผังได้เท่านี้ (ยังอยู่ในพื้นที่ว่างรอบผัง) */
const OUTSIDE = 44;

type Box = { x: number; y: number; w: number; h: number };
const overlap = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

export function placeToolbar(target: Box, others: Box[], size: { w: number; h: number }, area: { w: number; h: number }): { x: number; y: number } {
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

const ICON = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const ICON_BUTTON =
  "grid size-[32px] place-items-center rounded-[7px] text-[#4e627c] hover:bg-blue-soft hover:text-blue focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus";

export function SelectionToolbar({ boxRef, room, objects, selected, groupRect }: SelectionToolbarProps) {
  const barRef = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState<{ x: number; y: number } | null>(null);
  // เลือกเก้าอี้ = หมุนทั้งชุดที่โต๊ะแม่ (เหมือน Inspector) แต่ปุ่มลบลบเฉพาะเก้าอี้ตัวนั้น
  const target = selected.type === "chair" ? (objects.find((o) => o.id === selected.tableId) ?? selected) : selected;
  const tableId = selected.type === "table" ? selected.id : selected.type === "chair" ? selected.tableId : null;
  const deleteLabel = selected.type === "chair" ? "ลบเก้าอี้ตัวนี้" : selected.type === "table" ? "ลบทั้งชุดโต๊ะ" : "ลบชิ้นงานนี้";

  React.useLayoutEffect(() => {
    const box = boxRef.current;
    const bar = barRef.current;
    if (!box || !bar) return;
    const update = () => {
      const scale = box.clientWidth / room.width;
      const toPx = (r: Rect): Box => ({ x: r.x * scale, y: r.y * scale, w: r.width * scale, h: r.depth * scale });
      const others = objects
        .filter((o) => o.id !== selected.id && o.id !== tableId && !(o.type === "chair" && o.tableId === tableId))
        .map((o) => toPx(footprint(o)));
      setPos(
        placeToolbar(toPx(groupRect ?? footprint(selected)), others, { w: bar.offsetWidth, h: bar.offsetHeight }, { w: box.clientWidth, h: box.clientHeight }),
      );
    };
    update();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(box);
    return () => observer?.disconnect();
  }, [boxRef, room.width, objects, selected, groupRect, tableId]);

  return (
    <div
      ref={barRef}
      role="toolbar"
      aria-label={`เครื่องมือ${objectLabel(target)}`}
      data-testid="selection-toolbar"
      className="absolute z-[30] flex items-center gap-0.5 whitespace-nowrap rounded-[10px] border border-[var(--status-border)] bg-white py-1 pl-3 pr-1 shadow-status"
      style={{ left: pos?.x ?? 0, top: pos?.y ?? 0, visibility: pos ? "visible" : "hidden" }}
      // ไม่ให้การกดบนแถบไปเริ่มลาก/ยกเลิกการเลือกบนผัง
      onPointerDown={(e) => e.stopPropagation()}
    >
      <span className="mr-1.5 text-[13px] font-semibold text-ink">{objectLabel(target)}</span>
      <span aria-hidden="true" className="mx-1 h-5 w-px bg-line" />
      <button type="button" aria-label="หมุนซ้าย 90°" title="หมุนซ้าย 90° (Shift+R)" className={ICON_BUTTON} onClick={() => actions().rotateObject(target.id, -90)}>
        <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden="true" {...ICON}>
          <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
          <path d="M3 3v5h5" />
        </svg>
      </button>
      <button type="button" aria-label="หมุนขวา 90°" title="หมุนขวา 90° (R)" className={ICON_BUTTON} onClick={() => actions().rotateObject(target.id, 90)}>
        <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden="true" {...ICON}>
          <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
          <path d="M21 3v5h-5" />
        </svg>
      </button>
      <span aria-hidden="true" className="mx-1 h-5 w-px bg-line" />
      <button
        type="button"
        aria-label={deleteLabel}
        title={`${deleteLabel} (Delete)`}
        className={`${ICON_BUTTON} text-[#c64c45] hover:bg-[#fdecea] hover:text-[#b8433b]`}
        onClick={() => actions().deleteObject(selected.id)}
      >
        <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden="true" {...ICON}>
          <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
        </svg>
      </button>
    </div>
  );
}
