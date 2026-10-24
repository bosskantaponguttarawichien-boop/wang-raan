"use client";

import * as React from "react";
import { snapToGrid, tableSeatCapacity, type Table } from "@/core/layout";
import { layoutActions as actions } from "@/store/use-layout-store";
import { TableSetStyleControls } from "./table-set-style-controls";

export interface TableSetEditPanelProps {
  table: Table;
  onBack: () => void;
  onToast?: (message: string) => void;
}

/** แผงแก้ไขชุดโต๊ะที่เลือก — คำสั่งของชุดอยู่ทางซ้าย ไม่บังพื้นที่จัดผัง */
export function TableSetEditPanel({ table, onBack, onToast = () => {} }: TableSetEditPanelProps) {
  const chairCount = table.chairIds.length;
  const capacity = tableSeatCapacity(table.width, table.depth);
  const [position, setPosition] = React.useState({ x: String(table.x), y: String(table.y) });
  // ตำแหน่งในผังเปลี่ยน (ลาก, undo) → แสดงค่าใหม่ทันทีระหว่าง render
  const [shownAt, setShownAt] = React.useState({ x: table.x, y: table.y });
  if (shownAt.x !== table.x || shownAt.y !== table.y) {
    setShownAt({ x: table.x, y: table.y });
    setPosition({ x: String(table.x), y: String(table.y) });
  }

  const setCount = (next: number) => {
    if (actions().setTableSetChairCount(table.id, next)) {
      onToast(`ปรับเป็นเก้าอี้ ${next} ตัวแล้ว`);
    }
  };
  const applyPosition = () => {
    const x = Number.parseFloat(position.x);
    const y = Number.parseFloat(position.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      setPosition({ x: String(table.x), y: String(table.y) });
      return;
    }
    actions().updateObjectPosition(table.id, snapToGrid(x, 0.25), snapToGrid(y, 0.25));
  };
  const duplicate = () => {
    if (actions().duplicateObject(table.id)) onToast("ทำซ้ำโต๊ะแล้ว วางไว้ในที่ว่างที่ใกล้ที่สุด");
  };
  const remove = () => {
    actions().deleteObject(table.id);
    onToast(`ลบโต๊ะพร้อมเก้าอี้ ${chairCount} ตัวแล้ว · กด Ctrl+Z เพื่อย้อน`);
  };

  return (
    <section aria-label="แก้ไขโต๊ะ">
      <button
        type="button"
        onClick={onBack}
        className="mb-3 inline-flex min-h-9 items-center gap-1 rounded-[8px] px-1.5 text-[13px] font-medium text-secondary hover:bg-blue-soft hover:text-blue focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="m14.5 5-7 7 7 7" />
        </svg>
        กลับ
      </button>
      <h2 className="m-0 mb-1 text-[15px] font-semibold text-ink">แก้ไขโต๊ะ</h2>
      <p className="m-0 mb-3 text-[12px] leading-[1.5] text-secondary">
        ปรับโต๊ะและเก้าอี้ทั้งชุดจากแผงนี้
      </p>

      <div className="mb-4 grid grid-cols-3 gap-1 rounded-[8px] bg-[#f1f4f9] p-1">
        <button
          type="button"
          aria-label="หมุนโต๊ะ 90 องศา"
          onClick={() => actions().rotateObject(table.id, 90)}
          className="min-h-9 rounded-[6px] px-2 text-[12px] font-medium text-ink hover:bg-white focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus"
        >
          หมุน
        </button>
        <button
          type="button"
          aria-label="ทำซ้ำโต๊ะ"
          onClick={duplicate}
          className="min-h-9 rounded-[6px] px-2 text-[12px] font-medium text-ink hover:bg-white focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus"
        >
          ทำซ้ำ
        </button>
        <button
          type="button"
          aria-label="ลบโต๊ะ"
          onClick={remove}
          className="min-h-9 rounded-[6px] px-2 text-[12px] font-medium text-danger hover:bg-[var(--danger-soft)] focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus"
        >
          ลบ
        </button>
      </div>

      <fieldset className="mb-4 min-w-0 border-0 p-0">
        <legend className="mb-1 p-0 text-[12px] leading-[1.6] text-secondary">จำนวนเก้าอี้</legend>
        <div className="flex items-center justify-between rounded-[8px] bg-[#f1f4f9] p-1">
          <button
            type="button"
            aria-label="ลดจำนวนเก้าอี้"
            disabled={chairCount <= 1}
            onClick={() => setCount(chairCount - 1)}
            className="grid size-10 place-items-center rounded-[6px] text-[22px] text-ink hover:bg-white disabled:cursor-not-allowed disabled:text-[#a9b4c4] focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus"
          >
            −
          </button>
          <output aria-live="polite" className="text-center text-[15px] font-semibold text-ink">
            {chairCount} ตัว
          </output>
          <button
            type="button"
            aria-label="เพิ่มจำนวนเก้าอี้"
            disabled={chairCount >= capacity}
            onClick={() => setCount(chairCount + 1)}
            className="grid size-10 place-items-center rounded-[6px] text-[22px] text-blue hover:bg-white disabled:cursor-not-allowed disabled:text-[#a9b4c4] focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus"
          >
            +
          </button>
        </div>
        <p className="mb-0 mt-1.5 text-[11px] leading-[1.5] text-secondary">
          โต๊ะขนาดนี้รองรับเก้าอี้ได้สูงสุด {capacity} ตัว
        </p>
      </fieldset>

      <TableSetStyleControls table={table} showSize idPrefix={`edit-${table.id}`} />

      <fieldset className="mt-4 min-w-0 border-0 border-t border-[#e6ebf2] pt-3">
        <legend className="mb-2 p-0 text-[14px] font-semibold text-ink">ตำแหน่งโต๊ะ</legend>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-[12px] leading-[1.6] text-secondary">
            ซ้าย-ขวา (ม.)
            <input
              type="number"
              inputMode="decimal"
              step="0.25"
              value={position.x}
              onChange={(event) => setPosition((current) => ({ ...current, x: event.target.value }))}
              onBlur={applyPosition}
              onKeyDown={(event) => {
                if (event.key === "Enter") applyPosition();
              }}
              className="mt-1 block w-full rounded-[8px] border border-line bg-white px-2.5 py-2 text-[13px] text-ink focus:border-blue focus:outline-none focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus"
            />
          </label>
          <label className="block text-[12px] leading-[1.6] text-secondary">
            บน-ล่าง (ม.)
            <input
              type="number"
              inputMode="decimal"
              step="0.25"
              value={position.y}
              onChange={(event) => setPosition((current) => ({ ...current, y: event.target.value }))}
              onBlur={applyPosition}
              onKeyDown={(event) => {
                if (event.key === "Enter") applyPosition();
              }}
              className="mt-1 block w-full rounded-[8px] border border-line bg-white px-2.5 py-2 text-[13px] text-ink focus:border-blue focus:outline-none focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus"
            />
          </label>
        </div>
        <p className="mb-0 mt-1.5 text-[11px] leading-[1.5] text-secondary">
          พิกัดจะ snap ทุก 0.25 ม.
        </p>
      </fieldset>
    </section>
  );
}
