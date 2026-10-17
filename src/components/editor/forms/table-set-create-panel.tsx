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
import { TableSetPreview } from "./table-set-preview";
import { TableSetStyleControls } from "./table-set-style-controls";

export interface TableSetCreatePanelProps {
  onBack: () => void;
  onCreate: (options: TableSetCreationOptions) => void;
}

const stepButtonClass =
  "grid size-10 shrink-0 place-items-center rounded-[8px] border border-line bg-white text-ink shadow-sm hover:border-blue hover:text-blue disabled:cursor-not-allowed disabled:border-[#e6ebf2] disabled:text-[#a9b4c4] disabled:shadow-none disabled:hover:text-[#a9b4c4] focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus";

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
  const round = tableStyle.shape === "round";
  const sizeLabel = round ? `Ø ${size.width.toFixed(2)} ม.` : `${size.width.toFixed(2)} × ${size.depth.toFixed(2)} ม.`;

  return (
    <section aria-label="ตั้งค่าโต๊ะ" className="flex min-w-0 flex-col">
      <div className="mb-3 flex items-center gap-1.5">
        <button
          type="button"
          onClick={onBack}
          className="-ml-1.5 inline-flex min-h-9 items-center gap-1 rounded-[8px] px-1.5 text-[13px] font-medium text-secondary hover:bg-blue-soft hover:text-blue focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="m14.5 5-7 7 7 7" />
          </svg>
          กลับ
        </button>
      </div>
      <h2 className="m-0 mb-0.5 text-[16px] font-semibold text-ink">ตั้งค่าโต๊ะ</h2>
      <p className="m-0 mb-3 text-[12px] leading-[1.5] text-secondary">เลือกขนาด จำนวนที่นั่ง และสีก่อนวางลงผัง</p>

      {/* ภาพตัวอย่าง + จำนวนเก้าอี้ อยู่ด้วยกัน เพราะเปลี่ยนจำนวนแล้วเห็นผลทันที */}
      <div className="mb-4 overflow-hidden rounded-[12px] border border-line bg-white">
        <div className="relative h-[136px] bg-surface bg-[radial-gradient(#dfe5ee_1px,transparent_1px)] [background-size:12px_12px] p-3">
          <TableSetPreview
            width={size.width}
            depth={size.depth}
            chairCount={chairCount}
            tableStyle={tableStyle}
            chairStyle={chairStyle}
          />
          <span className="absolute bottom-2 left-2 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-medium tabular-nums text-secondary-strong shadow-sm">
            {sizeLabel}
          </span>
        </div>

        <fieldset className="m-0 min-w-0 border-0 border-t border-line p-3">
          <legend className="sr-only">จำนวนเก้าอี้</legend>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <p aria-hidden="true" className="m-0 text-[13px] font-semibold leading-[1.4] text-ink">
              จำนวนเก้าอี้
            </p>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                aria-label="ลดจำนวนเก้าอี้"
                disabled={chairCount <= 1}
                onClick={() => setChairCount((count) => Math.max(1, count - 1))}
                className={stepButtonClass}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
                  <path d="M6 12h12" />
                </svg>
              </button>
              <output
                aria-live="polite"
                className={cn(
                  "min-w-[52px] text-center text-[18px] font-semibold tabular-nums leading-none",
                  canCreate ? "text-ink" : "text-danger",
                )}
              >
                {chairCount} <span className="text-[12px] font-medium text-secondary">ตัว</span>
              </output>
              <button
                type="button"
                aria-label="เพิ่มจำนวนเก้าอี้"
                disabled={chairCount >= displayCapacity}
                onClick={() => setChairCount((count) => Math.min(displayCapacity, count + 1))}
                className={stepButtonClass}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
                  <path d="M6 12h12M12 6v12" />
                </svg>
              </button>
            </div>
          </div>
          <p
            id="table-seat-capacity"
            className={cn("m-0 mt-2 text-[11px] leading-[1.5]", canCreate ? "text-secondary" : "font-medium text-danger")}
          >
            โต๊ะขนาดนี้รองรับเก้าอี้ได้สูงสุด {displayCapacity} ตัว
            {!canCreate && " · ขยายโต๊ะหรือลดจำนวนเก้าอี้"}
          </p>
        </fieldset>
      </div>

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

      {/* ปุ่มยืนยันติดขอบล่างของแผง — ไม่ต้องเลื่อนหาหลังปรับค่า */}
      <div className="sticky -bottom-4 z-10 mt-2 bg-gradient-to-t from-white from-75% to-white/0 pt-5 pb-4">
        <button
          type="button"
          disabled={!canCreate}
          aria-describedby="table-seat-capacity"
          onClick={() => onCreate({ width: size.width, depth: size.depth, chairCount, style: { table: tableStyle, chair: chairStyle } })}
          className="min-h-11 w-full rounded-[10px] bg-blue px-4 text-[14px] font-semibold text-white shadow-btn hover:bg-blue-strong disabled:cursor-not-allowed disabled:bg-[#9baecc] focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus"
        >
          เพิ่มโต๊ะพร้อมเก้าอี้ {chairCount} ตัว ลงผัง
        </button>
      </div>
    </section>
  );
}
