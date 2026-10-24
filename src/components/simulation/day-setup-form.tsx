"use client";

/**
 * ฟอร์มจำลองร้าน 1 วัน (feat-095) — 3 ส่วนตามร่างที่ตกลง 2026-10-23
 * (1) ร้านของคุณ: เปิด–ปิด  (2) พนักงาน: มีตำแหน่งตามสิ่งที่วางในผัง  (3) ลูกค้าวันนี้
 * ค่าที่คำนวณ (ชั่วโมงเปิด, จาน/ชม., คน/ชม.) แสดงทันทีใต้ช่องที่เกี่ยวข้อง
 */
import * as React from "react";
import { cn } from "@/lib/cn";
import {
  COOK_MINUTE_LIMITS,
  DAILY_CUSTOMER_LIMITS,
  DINE_MINUTE_LIMITS,
  PATIENCE_LIMITS,
  STAFF_LIMITS,
  dineRange,
  formatNumber,
  toDayInput,
} from "@/lib/day-config";
import { useLayoutStore } from "@/store/use-layout-store";
import { useSimulationStore, type SimulationConfigState } from "@/store/use-simulation-store";

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line pt-3.5 first:border-t-0 first:pt-0" aria-label={title}>
      <h3 className="mb-2.5 flex items-center gap-2 text-[13px] font-semibold leading-[1.5] text-ink">
        <span aria-hidden="true" className="flex size-5 items-center justify-center rounded-full bg-blue-soft text-blue-hover">
          {icon}
        </span>
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

/** ค่าที่ระบบคำนวณให้ (โทนน้ำเงินอ่อน) */
function Calc({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <p id={id} className="m-0 mt-1.5 rounded-[8px] bg-blue-soft px-2.5 py-1.5 text-[11.5px] leading-[1.7] text-blue-hover" aria-live="polite">
      {children}
    </p>
  );
}

function Slider({
  id,
  label,
  value,
  display,
  min,
  max,
  step,
  disabled,
  onChange,
  hint,
}: {
  id: string;
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  disabled: boolean;
  onChange: (value: number) => void;
  hint?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="flex items-center justify-between gap-2 text-[12px] text-secondary-strong">
        <span>{label}</span>
        <b className="shrink-0 font-semibold tabular-nums text-ink">{display}</b>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-valuetext={display}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1.5 h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-line accent-blue disabled:cursor-not-allowed"
      />
      {hint && <p className="m-0 mt-1 text-[11px] text-secondary-strong">{hint}</p>}
    </div>
  );
}

function TimeRange({
  label,
  from,
  to,
  disabled,
  onChange,
}: {
  label: string;
  from: { value: string; label: string };
  to: { value: string; label: string };
  disabled: boolean;
  onChange: (which: "from" | "to", value: string) => void;
}) {
  const input = "h-8 w-[6.5rem] min-w-0 rounded-[8px] border border-line bg-white px-2 text-[12.5px] tabular-nums text-ink disabled:bg-surface";
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className="mb-1.5 p-0 text-[12px] text-secondary-strong">{label}</legend>
      <div className="flex flex-wrap items-center gap-2 text-[12px] text-secondary-strong">
        <input type="time" aria-label={from.label} value={from.value} disabled={disabled} onChange={(e) => onChange("from", e.target.value)} className={input} />
        <span aria-hidden="true">ถึง</span>
        <input type="time" aria-label={to.label} value={to.value} disabled={disabled} onChange={(e) => onChange("to", e.target.value)} className={input} />
      </div>
    </fieldset>
  );
}

function Stepper({ label, value, disabled, onChange }: { label: string; value: number; disabled: boolean; onChange: (value: number) => void }) {
  const button =
    "flex size-7 items-center justify-center rounded-[8px] border border-line bg-white text-[14px] text-ink hover:bg-surface disabled:cursor-not-allowed disabled:text-secondary focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus cursor-pointer";
  return (
    <div className="flex items-center gap-2" role="group" aria-label={`จำนวน${label}`}>
      <button type="button" className={button} aria-label={`ลด${label}`} disabled={disabled || value <= STAFF_LIMITS.min} onClick={() => onChange(value - 1)}>
        −
      </button>
      <output className="min-w-5 text-center text-[13px] font-semibold tabular-nums text-ink" aria-label={`${label} ${value} คน`}>
        {value}
      </output>
      <button type="button" className={button} aria-label={`เพิ่ม${label}`} disabled={disabled || value >= STAFF_LIMITS.max} onClick={() => onChange(value + 1)}>
        +
      </button>
    </div>
  );
}

function Role({
  title,
  source,
  missing,
  control,
  children,
}: {
  title: string;
  /** ทำไมถึงมีตำแหน่งนี้ */
  source: string;
  /** ข้อความเมื่อผังยังไม่มีสิ่งที่ทำให้เกิดตำแหน่งนี้; null = มีแล้ว */
  missing: string | null;
  /** ตัวปรับจำนวนคน (ข้างชื่อตำแหน่ง) */
  control: React.ReactNode;
  /** รายละเอียดเพิ่มของตำแหน่งนี้ */
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-[10px] border p-2.5", missing ? "border-dashed border-line bg-surface" : "border-line bg-white")}>
      <div className="flex items-center justify-between gap-2">
        <b className={cn("text-[12.5px] font-semibold", missing ? "text-secondary-strong" : "text-ink")}>{title}</b>
        {!missing && control}
      </div>
      <p className="m-0 mt-0.5 text-[11px] leading-[1.7] text-secondary-strong">{missing ?? source}</p>
      {!missing && children}
    </div>
  );
}

export function DaySetupForm({ disabled }: { disabled: boolean }) {
  const config = useSimulationStore((s) => s.config);
  const setConfig = useSimulationStore((s) => s.setConfig);
  const counters = useLayoutStore((s) => s.layout.objects.filter((o) => o.type === "counter").length);
  const hasKitchen = useLayoutStore((s) => s.layout.kitchenDoor !== null);
  const set = (patch: Partial<SimulationConfigState>) => setConfig(patch);

  const day = toDayInput(config);
  const [dineLow, dineHigh] = dineRange(config.dineMinutes);
  const dishesPerHour = (config.cooks * 60) / config.cookMinutesPerDish;

  return (
    <div className="space-y-3.5" data-testid="day-setup-form">
      <Section icon={<StoreIcon />} title="ร้านของคุณ">
        <TimeRange
          label="เปิด–ปิดร้าน"
          from={{ value: config.openTime, label: "เวลาเปิดร้าน" }}
          to={{ value: config.closeTime, label: "เวลาปิดร้าน" }}
          disabled={disabled}
          onChange={(which, value) => set(which === "from" ? { openTime: value } : { closeTime: value })}
        />
        {day.ok && <Calc>เปิดวันละ {formatNumber(day.hours)} ชั่วโมง</Calc>}
      </Section>

      <Section icon={<StaffIcon />} title="พนักงาน">
        <p className="m-0 -mt-1 text-[11px] text-secondary-strong">มีตำแหน่งไหนบ้าง ขึ้นอยู่กับสิ่งที่วางในผัง</p>
        <Role
          title="พนักงานหน้าร้าน"
          source={`มีเพราะผังมีเคาน์เตอร์ ${counters} จุด · รับออร์เดอร์ เสิร์ฟ และรับเงิน`}
          missing={counters === 0 ? "วางเคาน์เตอร์ในผังก่อน ถึงจะมีพนักงานหน้าร้าน" : null}
          control={<Stepper label="พนักงานหน้าร้าน" value={config.frontStaff} disabled={disabled} onChange={(frontStaff) => set({ frontStaff })} />}
        />
        <Role
          title="พ่อครัว"
          source="มีเพราะผังมีประตูครัว"
          missing={hasKitchen ? null : "วางประตูครัวในผังก่อน ถึงจะมีพ่อครัว"}
          control={<Stepper label="พ่อครัว" value={config.cooks} disabled={disabled} onChange={(cooks) => set({ cooks })} />}
        >
          <div className="mt-2.5">
            <Slider
              id="sim-cook-minutes"
              label="พ่อครัว 1 คน ทำ 1 จาน ใช้เวลา"
              value={config.cookMinutesPerDish}
              display={`${formatNumber(config.cookMinutesPerDish)} นาที`}
              {...COOK_MINUTE_LIMITS}
              disabled={disabled}
              onChange={(cookMinutesPerDish) => set({ cookMinutesPerDish })}
            />
            <Calc>
              ครัวทำได้ราว {formatNumber(dishesPerHour)} จาน/ชม.
              {config.cooks > 1 && ` (${config.cooks} คน × ${formatNumber(60 / config.cookMinutesPerDish)} จาน)`}
            </Calc>
          </div>
        </Role>
      </Section>

      <Section icon={<CustomerIcon />} title="ลูกค้าวันนี้">
        <Slider
          id="sim-daily-customers"
          label="อยากให้ลูกค้าเข้าทั้งวัน"
          value={config.dailyCustomers}
          display={`${config.dailyCustomers} คน`}
          {...DAILY_CUSTOMER_LIMITS}
          disabled={disabled}
          onChange={(dailyCustomers) => set({ dailyCustomers })}
        />
        <div>
          <TimeRange
            label="ช่วงที่คนเข้าเยอะที่สุด"
            from={{ value: config.peakStart, label: "เวลาเริ่มช่วงคนเยอะ" }}
            to={{ value: config.peakEnd, label: "เวลาจบช่วงคนเยอะ" }}
            disabled={disabled}
            onChange={(which, value) => set(which === "from" ? { peakStart: value } : { peakEnd: value })}
          />
          {day.ok ? (
            day.plan.peak && (
              <Calc>
                ช่วงนี้ลูกค้าเข้าราว {formatNumber(day.plan.peak.customersPerHour)} คน/ชม. · ช่วงอื่นราว {formatNumber(day.plan.customersPerHour)} คน/ชม.
              </Calc>
            )
          ) : (
            <p role="alert" className="m-0 mt-1.5 text-[11.5px] leading-[1.7] text-danger">
              {day.reason}
            </p>
          )}
        </div>
        <Slider
          id="sim-dine-minutes"
          label="ลูกค้านั่งกินประมาณ"
          value={config.dineMinutes}
          display={`${dineLow}–${dineHigh} นาที`}
          {...DINE_MINUTE_LIMITS}
          disabled={disabled}
          onChange={(dineMinutes) => set({ dineMinutes })}
        />
        <Slider
          id="sim-patience"
          label="ลูกค้ารอได้ไม่เกิน"
          value={config.patienceMinutes}
          display={`${config.patienceMinutes} นาที`}
          {...PATIENCE_LIMITS}
          disabled={disabled}
          onChange={(patienceMinutes) => set({ patienceMinutes })}
          hint="นับตั้งแต่นั่งลงจนได้อาหาร"
        />
      </Section>
    </div>
  );
}

const iconProps = { viewBox: "0 0 24 24", className: "size-3.5", fill: "none", stroke: "currentColor", strokeWidth: 2 } as const;

function StoreIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3 9l1.5-5h15L21 9M3 9h18v2a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0V9zM5 13v8h14v-8" />
    </svg>
  );
}

function StaffIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="7" r="4" />
      <path d="M5 21v-1a7 7 0 0 1 14 0v1" />
    </svg>
  );
}

function CustomerIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18.5 20a6.5 6.5 0 0 0-3-5.5" />
    </svg>
  );
}
