"use client";

/**
 * รูปลักษณ์ชุดโต๊ะ — ทรงโต๊ะ, ขาโต๊ะ, สีโต๊ะ, แบบเก้าอี้ (มี/ไม่มีพนักพิง), ทรงเก้าอี้, ขาเก้าอี้, สีเก้าอี้
 * เป็น radio group มาตรฐาน (Tab เข้ากลุ่ม, ลูกศรเลือก) · เลือกแล้วผังเปลี่ยนทันที = Undo หนึ่งขั้น
 * สไตล์เก้าอี้ใช้กับเก้าอี้ "ทุกตัว" ในชุด เพื่อให้ชุดเป็นหน่วยเดียวกันเหมือนการย้าย/หมุน
 */
import * as React from "react";
import {
  FURNITURE_COLOR_HEX,
  TABLE_SIZE_MAX,
  TABLE_SIZE_MIN,
  chairStyleOf,
  resolveChairStyle,
  tableStyleOf,
  type Chair,
  type ChairShape,
  type ChairStyle,
  type FurnitureColor,
  type Table,
  type TableStyle,
} from "@/core/layout";
import { cn } from "@/lib/cn";
import { layoutActions as actions, useLayoutStore } from "@/store/use-layout-store";
import { inputClass } from "./field";

const COLOR_LABEL: Record<FurnitureColor, string> = {
  white: "ขาว",
  oak: "ไม้โอ๊ก",
  charcoal: "เทาเข้ม",
  blue: "น้ำเงิน",
  orange: "ส้ม",
  sage: "เขียวเสจ",
};
const COLORS = Object.keys(COLOR_LABEL) as FurnitureColor[];

interface Option<V extends string> {
  value: V;
  label: string;
}

const TABLE_SHAPES: Option<TableStyle["shape"]>[] = [
  { value: "rectangle", label: "สี่เหลี่ยม" },
  { value: "round", label: "กลม" },
];
const LEG_STYLES: Option<TableStyle["legStyle"]>[] = [
  { value: "four-legs", label: "สี่ขา" },
  { value: "pedestal", label: "ขาเดี่ยว" },
];
const CHAIR_KINDS: Option<ChairStyle["kind"]>[] = [
  { value: "chair", label: "มีพนักพิง" },
  { value: "stool", label: "สตูล" },
];
const CHAIR_SHAPES: Option<ChairShape>[] = [
  { value: "square", label: "สี่เหลี่ยม" },
  { value: "round", label: "กลม" },
];

export function Segmented<V extends string>({
  name,
  legend,
  options,
  value,
  onChange,
}: {
  name: string;
  legend: string;
  options: Option<V>[];
  value: V;
  onChange: (value: V) => void;
}) {
  const labelId = `${name}-label`;
  return (
    // ป้ายซ้าย ตัวเลือกขวา — ลดความสูงแผงลงครึ่งหนึ่งเทียบกับป้ายอยู่บรรทัดบน
    <div role="radiogroup" aria-labelledby={labelId} className="grid min-w-0 grid-cols-[64px_minmax(0,1fr)] items-center gap-2">
      <span id={labelId} className="text-[12px] leading-[1.4] text-secondary">
        {legend}
      </span>
      <div className="grid grid-cols-2 gap-0.5 rounded-[8px] bg-[#f1f4f9] p-0.5">
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              "flex min-h-9 cursor-pointer items-center justify-center rounded-[6px] px-1.5 text-center text-[13px] leading-tight has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-solid has-[:focus-visible]:outline-focus",
              // text-secondary-strong: ผ่าน 4.5:1 บนพื้น #f1f4f9 (text-secondary ได้แค่ 4.26:1)
              value === o.value ? "bg-white font-semibold text-ink shadow-sm" : "text-secondary-strong hover:text-ink",
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            {o.label}
          </label>
        ))}
      </div>
    </div>
  );
}

export function ColorPicker({
  name,
  legend,
  value,
  onChange,
}: {
  name: string;
  legend: string;
  value: FurnitureColor;
  onChange: (value: FurnitureColor) => void;
}) {
  const labelId = `${name}-label`;
  return (
    <div role="radiogroup" aria-labelledby={labelId} className="min-w-0">
      <p id={labelId} className="m-0 mb-1.5 text-[12px] leading-[1.4] text-secondary">
        {legend} <span className="font-medium text-ink">· {COLOR_LABEL[value]}</span>
      </p>
      {/* 6 สีในแถวเดียวเสมอ — ไม่ตกบรรทัดที่จอแคบ */}
      <div className="grid grid-cols-6 gap-1">
        {COLORS.map((c) => (
          <label
            key={c}
            title={COLOR_LABEL[c]}
            className={cn(
              "mx-auto grid aspect-square w-full max-w-10 min-w-8 cursor-pointer place-items-center rounded-full border-2 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-solid has-[:focus-visible]:outline-focus",
              value === c ? "border-blue" : "border-transparent hover:border-line",
            )}
          >
            <input
              type="radio"
              name={name}
              value={c}
              checked={value === c}
              onChange={() => onChange(c)}
              aria-label={COLOR_LABEL[c]}
              className="sr-only"
            />
            <span
              aria-hidden="true"
              className="grid size-[72%] place-items-center rounded-full border border-[#c9d2df]"
              style={{ backgroundColor: FURNITURE_COLOR_HEX[c] }}
            >
              {value === c && (
                <svg viewBox="0 0 24 24" className={cn("size-3.5", c === "white" ? "text-ink" : "text-white")} fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                  <path d="m5 12.5 4.5 4.5L19 7.5" />
                </svg>
              )}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

/** ช่องขนาดหน้าโต๊ะ — นำไปใช้เมื่อกด Enter หรือออกจากช่อง (Core clamp 0.60–3.00 ม. ทีละ 0.05) */
function TableSizeFields({
  table,
  round,
  onSizeChange,
}: {
  table: Table;
  round: boolean;
  onSizeChange?: (width: number, depth: number) => void;
}) {
  const [width, setWidth] = React.useState(String(table.width));
  const [depth, setDepth] = React.useState(String(table.depth));
  // ขนาดในผังเปลี่ยน (undo, ลากปรับ) → แสดงค่าใหม่ทันทีระหว่าง render
  const [shown, setShown] = React.useState({ width: table.width, depth: table.depth });
  if (shown.width !== table.width || shown.depth !== table.depth) {
    setShown({ width: table.width, depth: table.depth });
    setWidth(String(table.width));
    setDepth(String(table.depth));
  }
  const apply = () => {
    const w = Number.parseFloat(width);
    const d = round ? w : Number.parseFloat(depth);
    if (!Number.isFinite(w) || !Number.isFinite(d)) {
      setWidth(String(table.width));
      setDepth(String(table.depth));
      return;
    }
    if (onSizeChange) onSizeChange(w, d);
    else actions().resizeTableSet(table.id, w, d);
  };
  const inputProps = {
    type: "number",
    inputMode: "decimal" as const,
    step: 0.05,
    min: TABLE_SIZE_MIN,
    max: TABLE_SIZE_MAX,
    className: inputClass,
    onBlur: apply,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter") apply();
    },
  };
  return (
    <div className="grid grid-cols-2 gap-2">
      <label className={cn("block text-[12px] leading-[1.6] text-secondary", round && "col-span-2")}>
        {round ? "เส้นผ่านศูนย์กลาง (ม.)" : "กว้าง (ม.)"}
        <input {...inputProps} value={width} onChange={(e) => setWidth(e.target.value)} />
      </label>
      {!round && (
        <label className="block text-[12px] leading-[1.6] text-secondary">
          ลึก (ม.)
          <input {...inputProps} value={depth} onChange={(e) => setDepth(e.target.value)} />
        </label>
      )}
      <p className="col-span-2 m-0 text-[11px] leading-[1.5] text-secondary">
        {TABLE_SIZE_MIN.toFixed(2)}–{TABLE_SIZE_MAX.toFixed(2)} ม. · เก้าอี้จัดรอบโต๊ะใหม่ให้อัตโนมัติ
      </p>
    </div>
  );
}

export const groupClass = "grid min-w-0 gap-3 rounded-[12px] border border-line bg-white p-3";

function GroupHeading({ icon, hint, children }: { icon: "table" | "chair"; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-[8px] bg-blue-soft text-blue">
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          {icon === "table" ? <path d="M3 9h18M5 9v10M19 9v10M8 9V6h8v3" /> : <path d="M7 3v9h10M7 12v9M17 12v9M7 16h10" />}
        </svg>
      </span>
      <h3 className="m-0 text-[14px] font-semibold leading-[1.4] text-ink">{children}</h3>
      {hint && <span className="ml-auto text-[11px] text-secondary">{hint}</span>}
    </div>
  );
}

export interface TableSetStyleControlsProps {
  table: Table;
  /** ใช้เมื่อแสดงตัวเลือกก่อนสร้างชุดโต๊ะ (ยังไม่มี Chair ใน store) */
  chairStyle?: ChairStyle;
  showSize?: boolean;
  idPrefix?: string;
  onTableStyleChange?: (patch: Partial<TableStyle>) => void;
  onChairStyleChange?: (patch: Partial<ChairStyle>) => void;
  onSizeChange?: (width: number, depth: number) => void;
}

export function TableSetStyleControls({
  table,
  chairStyle: chairStyleOverride,
  showSize = false,
  idPrefix = "table-set",
  onTableStyleChange,
  onChairStyleChange,
  onSizeChange,
}: TableSetStyleControlsProps) {
  const firstChair = useLayoutStore((s) =>
    s.layout.objects.find((o): o is Chair => o.type === "chair" && o.tableId === table.id),
  );
  const tableStyle = tableStyleOf(table);
  const chairStyle = chairStyleOverride ? resolveChairStyle(chairStyleOverride) : firstChair ? chairStyleOf(firstChair) : null;
  const setTable = (patch: Partial<TableStyle>) => {
    if (onTableStyleChange) onTableStyleChange(patch);
    else actions().setTableSetStyle(table.id, { table: patch });
  };
  const setChair = (patch: Partial<ChairStyle>) => {
    if (onChairStyleChange) onChairStyleChange(patch);
    else actions().setTableSetStyle(table.id, { chair: patch });
  };

  return (
    <section aria-label="รูปลักษณ์ชุดโต๊ะ" data-testid="table-set-style" className={cn("grid gap-3", !showSize && "mt-4 border-t border-[#e6ebf2] pt-3")}>
      <div className={groupClass}>
        <GroupHeading icon="table">โต๊ะ</GroupHeading>
        {showSize && <TableSizeFields table={table} round={tableStyle.shape === "round"} onSizeChange={onSizeChange} />}
        <Segmented name={`${idPrefix}-table-shape`} legend="ทรงโต๊ะ" options={TABLE_SHAPES} value={tableStyle.shape} onChange={(shape) => setTable({ shape })} />
        <Segmented name={`${idPrefix}-table-legs`} legend="ขาโต๊ะ" options={LEG_STYLES} value={tableStyle.legStyle} onChange={(legStyle) => setTable({ legStyle })} />
        <ColorPicker name={`${idPrefix}-table-color`} legend="สีโต๊ะ" value={tableStyle.color} onChange={(color) => setTable({ color })} />
        {tableStyle.shape === "round" && (
          <p className="m-0 text-[11px] leading-[1.6] text-secondary">
            โต๊ะกลมใช้กรอบจัตุรัสเท่าเส้นผ่านศูนย์กลางในการตรวจระยะ — ปลอดภัยกว่าพื้นที่จริงเล็กน้อย
          </p>
        )}
      </div>
      {chairStyle && (
        <div className={groupClass}>
          <GroupHeading icon="chair" hint="ใช้กับทุกตัวในชุด">
            เก้าอี้
          </GroupHeading>
          <Segmented name={`${idPrefix}-chair-kind`} legend="แบบ" options={CHAIR_KINDS} value={chairStyle.kind} onChange={(kind) => setChair({ kind })} />
          <Segmented name={`${idPrefix}-chair-shape`} legend="ทรงเก้าอี้" options={CHAIR_SHAPES} value={chairStyle.shape} onChange={(shape) => setChair({ shape })} />
          <Segmented name={`${idPrefix}-chair-legs`} legend="ขาเก้าอี้" options={LEG_STYLES} value={chairStyle.legStyle} onChange={(legStyle) => setChair({ legStyle })} />
          <ColorPicker name={`${idPrefix}-chair-color`} legend="สีเก้าอี้" value={chairStyle.color} onChange={(color) => setChair({ color })} />
        </div>
      )}
    </section>
  );
}
