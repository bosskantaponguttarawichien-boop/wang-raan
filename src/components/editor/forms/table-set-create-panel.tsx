"use client";

import * as React from "react";
import {
  DEFAULT_CHAIR_STYLE,
  DEFAULT_TABLE_STYLE,
  TABLE_CHAIR_MAX,
  tableSeatCapacity,
  type ChairStyle,
  type Table,
  type TableSetCreationOptions,
  type TableStyle,
} from "@/core/layout";
import { cn } from "@/lib/cn";
import { TableSetStyleControls } from "./table-set-style-controls";

export interface TableSetCreatePanelProps {
  onBack: () => void;
  onCreate: (options: TableSetCreationOptions) => void;
}

/** หน้าตั้งค่าชุดโต๊ะในแผงซ้ายก่อนเพิ่มจริง — ไม่แก้ผังจนกว่าจะยืนยัน */
export function TableSetCreatePanel({ onBack, onCreate }: TableSetCreatePanelProps) {
  const [chairCount, setChairCount] = React.useState(4);
  const [size, setSize] = React.useState({ width: 1.2, depth: 1.2 });
  const [tableStyle, setTableStyle] = React.useState<TableStyle>(DEFAULT_TABLE_STYLE);
  const [chairStyle, setChairStyle] = React.useState<ChairStyle>(DEFAULT_CHAIR_STYLE);

  const previewTable: Table = {
    id: "new-table-preview",
    type: "table",
    preset: chairCount <= 2 ? "table-2-seats" : "table-4-seats",
    x: 0,
    y: 0,
    width: size.width,
    depth: size.depth,
    rotation: 0,
    chairIds: [],
    style: tableStyle,
  };

  const capacity = tableSeatCapacity(size.width, size.depth);
  const canCreate = chairCount >= 1 && chairCount <= capacity;
  const displayCapacity = Math.min(capacity, TABLE_CHAIR_MAX);

  return (
    <section aria-label="ตั้งค่าโต๊ะ">
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
      <h2 className="m-0 mb-1 text-[15px] font-semibold text-ink">ตั้งค่าโต๊ะ</h2>
      <p className="m-0 mb-3 text-[12px] leading-[1.5] text-secondary">
        เพิ่มจำนวนเก้าอี้และเลือกรูปแบบก่อนวางลงผัง
      </p>

      <fieldset className="mb-4 min-w-0 border-0 p-0">
        <legend className="mb-1 p-0 text-[12px] leading-[1.6] text-secondary">จำนวนเก้าอี้</legend>
        <div className="flex items-center justify-between rounded-[8px] bg-[#f1f4f9] p-1">
          <button
            type="button"
            aria-label="ลดจำนวนเก้าอี้"
            disabled={chairCount <= 1}
            onClick={() => setChairCount((count) => Math.max(1, count - 1))}
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
            disabled={chairCount >= displayCapacity}
            onClick={() => setChairCount((count) => Math.min(displayCapacity, count + 1))}
            className="grid size-10 place-items-center rounded-[6px] text-[22px] text-blue hover:bg-white disabled:cursor-not-allowed disabled:text-[#a9b4c4] focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus"
          >
            +
          </button>
        </div>
        <p id="table-seat-capacity" className={cn("mt-1.5 mb-0 text-[11px] leading-[1.5]", canCreate ? "text-secondary" : "font-medium text-danger")}>
          โต๊ะขนาดนี้รองรับเก้าอี้ได้สูงสุด {displayCapacity} ตัว
          {!canCreate && " · ปรับขนาดโต๊ะให้ใหญ่ขึ้นก่อนเพิ่ม"}
        </p>
      </fieldset>

      <TableSetStyleControls
        table={previewTable}
        chairStyle={chairStyle}
        showSize
        idPrefix="new-table"
        onSizeChange={(width, depth) => setSize({ width, depth })}
        onTableStyleChange={(patch) => {
          setTableStyle((current) => ({ ...current, ...patch }));
          if (patch.shape === "round") setSize(({ width }) => ({ width, depth: width }));
        }}
        onChairStyleChange={(patch) => setChairStyle((current) => ({ ...current, ...patch }))}
      />

      <button
        type="button"
        disabled={!canCreate}
        aria-describedby="table-seat-capacity"
        onClick={() => onCreate({ width: size.width, depth: size.depth, chairCount, style: { table: tableStyle, chair: chairStyle } })}
        className="mt-5 min-h-10 w-full rounded-[9px] bg-blue px-4 text-[13px] font-medium text-white shadow-btn hover:bg-blue-strong disabled:cursor-not-allowed disabled:bg-[#9baecc] focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus"
      >
        เพิ่มโต๊ะพร้อมเก้าอี้ {chairCount} ตัว ลงผัง
      </button>
    </section>
  );
}
