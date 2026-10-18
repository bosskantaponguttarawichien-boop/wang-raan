"use client";

/**
 * รูปลักษณ์เคาน์เตอร์ — 4 แบบ (ระแนงโค้ง / ตู้บานเรียบ / บาร์มีที่พักเท้า / ตู้กระจกโชว์) และสีตัวตู้
 * ใช้ radio group ชุดเดียวกับชุดโต๊ะ · เลือกแล้วผังเปลี่ยนทันที = Undo หนึ่งขั้น · footprint เท่าเดิมทุกแบบ
 */
import * as React from "react";
import { OBJECT_MIN_SIZE, SIZE_STEP, counterStyleOf, type Counter, type CounterVariant } from "@/core/layout";
import { layoutActions as actions } from "@/store/use-layout-store";
import { inputClass } from "./field";
import { ColorPicker, Segmented, groupClass } from "./table-set-style-controls";

const VARIANTS: { value: CounterVariant; label: string }[] = [
  { value: "fluted", label: "ระแนงโค้ง" },
  { value: "panel", label: "ตู้บานเรียบ" },
  { value: "bar", label: "บาร์พักเท้า" },
  { value: "display", label: "ตู้โชว์ขนม" },
];

export function CounterStyleControls({ counter }: { counter: Counter }) {
  const style = counterStyleOf(counter);
  return (
    <section aria-label="รูปลักษณ์เคาน์เตอร์" data-testid="counter-style">
      <div className={groupClass}>
        <Segmented
          name="counter-variant"
          legend="แบบ"
          options={VARIANTS}
          value={style.variant}
          onChange={(variant) => actions().setCounterStyle(counter.id, { variant })}
        />
        <ColorPicker
          name="counter-color"
          legend="สีตัวตู้"
          value={style.color}
          onChange={(color) => actions().setCounterStyle(counter.id, { color })}
        />
      </div>
    </section>
  );
}

/** ช่องความยาว × ความลึกของเคาน์เตอร์ (ขนาดก่อนหมุน) — นำไปใช้เมื่อกด Enter หรือออกจากช่อง (Core clamp ≥ 0.30 ม. ทีละ 0.05) */
export function CounterSizeFields({ counter }: { counter: Counter }) {
  const [width, setWidth] = React.useState(String(counter.width));
  const [depth, setDepth] = React.useState(String(counter.depth));
  React.useEffect(() => {
    setWidth(String(counter.width));
    setDepth(String(counter.depth));
  }, [counter.width, counter.depth]);
  const apply = () => {
    const w = Number.parseFloat(width);
    const d = Number.parseFloat(depth);
    if (!Number.isFinite(w) || !Number.isFinite(d)) {
      setWidth(String(counter.width));
      setDepth(String(counter.depth));
      return;
    }
    actions().resizeObject(counter.id, w, d);
    // Core อาจ clamp/snap ค่า หรือคืนผังเดิม → แสดงค่าจริงในผังเสมอ
    const after = actions().layout.objects.find((o) => o.id === counter.id);
    if (after) {
      setWidth(String(after.width));
      setDepth(String(after.depth));
    }
  };
  const inputProps = {
    type: "number",
    inputMode: "decimal" as const,
    step: SIZE_STEP,
    min: OBJECT_MIN_SIZE,
    className: inputClass,
    onBlur: apply,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter") apply();
    },
  };
  return (
    <section aria-label="ขนาดเคาน์เตอร์" data-testid="counter-size" className={`${groupClass} mb-3`}>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-[12px] leading-[1.6] text-secondary">
          ยาว (ม.)
          <input {...inputProps} aria-label="ความยาวเคาน์เตอร์ (ม.)" value={width} onChange={(e) => setWidth(e.target.value)} />
        </label>
        <label className="block text-[12px] leading-[1.6] text-secondary">
          ลึก (ม.)
          <input {...inputProps} aria-label="ความลึกเคาน์เตอร์ (ม.)" value={depth} onChange={(e) => setDepth(e.target.value)} />
        </label>
        <p className="col-span-2 m-0 text-[11px] leading-[1.5] text-secondary">
          อย่างน้อย {OBJECT_MIN_SIZE.toFixed(2)} ม. · ปรับทีละ {SIZE_STEP.toFixed(2)} ม.
        </p>
      </div>
    </section>
  );
}

const toolClass =
  "min-h-9 rounded-[6px] px-2 text-[12px] font-medium hover:bg-white focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus";

/** แผงแก้ไขเคาน์เตอร์ที่เลือก (รูปแบบเดียวกับแผงแก้ไขโต๊ะ) — หมุน/ทำซ้ำ/ลบ + ปรับยาว×ลึก + เลือกแบบและสี */
export function CounterEditPanel({
  counter,
  onBack,
  onToast = () => {},
}: {
  counter: Counter;
  onBack: () => void;
  onToast?: (message: string) => void;
}) {
  return (
    <section aria-label="แก้ไขเคาน์เตอร์">
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
      <h2 className="m-0 mb-1 text-[15px] font-semibold text-ink">แก้ไขเคาน์เตอร์</h2>
      <p className="m-0 mb-3 text-[12px] leading-[1.5] text-secondary">ปรับขนาด เลือกแบบและสีตัวตู้ · ดูผลได้ในมุมมอง 3D</p>

      <div className="mb-4 grid grid-cols-3 gap-1 rounded-[8px] bg-[#f1f4f9] p-1">
        <button type="button" aria-label="หมุนเคาน์เตอร์ 90 องศา" onClick={() => actions().rotateObject(counter.id, 90)} className={`${toolClass} text-ink`}>
          หมุน
        </button>
        <button
          type="button"
          aria-label="ทำซ้ำเคาน์เตอร์"
          onClick={() => {
            if (actions().duplicateObject(counter.id)) onToast("ทำซ้ำเคาน์เตอร์แล้ว วางไว้ในที่ว่างที่ใกล้ที่สุด");
          }}
          className={`${toolClass} text-ink`}
        >
          ทำซ้ำ
        </button>
        <button
          type="button"
          aria-label="ลบเคาน์เตอร์"
          onClick={() => {
            actions().deleteObject(counter.id);
            onToast("ลบเคาน์เตอร์แล้ว · กด Ctrl+Z เพื่อย้อน");
          }}
          className={`${toolClass} text-danger hover:bg-[var(--danger-soft)]`}
        >
          ลบ
        </button>
      </div>

      <CounterSizeFields counter={counter} />
      <CounterStyleControls counter={counter} />
    </section>
  );
}
