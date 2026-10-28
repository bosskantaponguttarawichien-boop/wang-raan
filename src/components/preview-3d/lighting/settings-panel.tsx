"use client";

import * as React from "react";
import type { StoreApi } from "zustand";
import { useStore } from "zustand";
import {
  SUPPORTED_TIMEZONES,
  formatDisplayTimeThai,
  type LightingClockMode,
} from "./settings";
import type { SolarPhase } from "./solar-position";
import {
  lightingStore as defaultLightingStore,
  type LightingStoreState,
} from "@/store/use-lighting-store";

export interface LightingSettingsPanelProps {
  /** Optional store override for isolated unit tests. */
  readonly store?: StoreApi<LightingStoreState>;
  readonly className?: string;
}

const PHASE_LABELS_THAI: Readonly<Record<SolarPhase, string>> = {
  day: "กลางวัน (มีแสงแดดตรง)",
  "civil-twilight": "สนธยาพลเรือน (แสงเช้ามืด/พลบค่ำ)",
  "nautical-twilight": "สนธยาทางทะเล (ฟ้าสลัว)",
  night: "กลางคืน (ไฟในร้านหลัก)",
};

const FOCUS_RING_CLASS =
  "focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-[#a4b6ff] focus-visible:outline-offset-2";

export function LightingSettingsPanel({
  store = defaultLightingStore,
  className = "",
}: LightingSettingsPanelProps) {
  const settings = useStore(store, (s) => s.settings);
  const solar = useStore(store, (s) => s.solar);
  const effectiveUtcMs = useStore(store, (s) => s.effectiveUtcMs);
  const setMode = useStore(store, (s) => s.setMode);
  const setSettings = useStore(store, (s) => s.setSettings);
  const resetToBangkokDefaults = useStore(store, (s) => s.resetToBangkokDefaults);

  const [latInput, setLatInput] = React.useState(() => String(settings.latitude));
  const [lonInput, setLonInput] = React.useState(() => String(settings.longitude));
  const [northInput, setNorthInput] = React.useState(() => String(settings.northOffsetDegrees));
  const [validationMessage, setValidationMessage] = React.useState<string | null>(null);

  const [prevCoords, setPrevCoords] = React.useState({
    lat: settings.latitude,
    lon: settings.longitude,
    north: settings.northOffsetDegrees,
  });
  if (
    prevCoords.lat !== settings.latitude ||
    prevCoords.lon !== settings.longitude ||
    prevCoords.north !== settings.northOffsetDegrees
  ) {
    setPrevCoords({
      lat: settings.latitude,
      lon: settings.longitude,
      north: settings.northOffsetDegrees,
    });
    setLatInput(String(settings.latitude));
    setLonInput(String(settings.longitude));
    setNorthInput(String(settings.northOffsetDegrees));
  }

  const handleModeChange = (mode: LightingClockMode) => {
    setValidationMessage(null);
    setMode(mode);
  };

  const commitLatitude = (rawValue: string) => {
    setLatInput(rawValue);
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
      setValidationMessage("กรุณากรอกละติจูดเป็นตัวเลขระหว่าง -90 ถึง 90 องศา");
      return;
    }
    if (parsed < -90 || parsed > 90) {
      setValidationMessage("ละติจูดถูกปรับให้อยู่ในช่วง -90 ถึง 90 องศา");
    } else {
      setValidationMessage(null);
    }
    setSettings({ latitude: parsed });
  };

  const commitLongitude = (rawValue: string) => {
    setLonInput(rawValue);
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
      setValidationMessage("กรุณากรอกลองจิจูดเป็นตัวเลขระหว่าง -180 ถึง 180 องศา");
      return;
    }
    if (parsed < -180 || parsed > 180) {
      setValidationMessage("ลองจิจูดถูกปรับให้อยู่ในช่วง -180 ถึง 180 องศา");
    } else {
      setValidationMessage(null);
    }
    setSettings({ longitude: parsed });
  };

  const commitNorthOffset = (rawValue: string) => {
    setNorthInput(rawValue);
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
      setValidationMessage("กรุณากรอกมุมทิศเหนือเป็นตัวเลขระหว่าง -180 ถึง 180 องศา");
      return;
    }
    setValidationMessage(null);
    setSettings({ northOffsetDegrees: parsed });
  };

  const displayTime = formatDisplayTimeThai(effectiveUtcMs, settings.timezone);

  return (
    <section
      aria-label="ตั้งค่าแสงอาทิตย์และเวลาในฉาก 3 มิติ"
      data-testid="lighting-settings-panel"
      className={`w-full max-w-full overflow-x-hidden rounded-2xl border border-line bg-white p-3 text-ink shadow-sm sm:p-4 ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2.5">
        <div>
          <h3 className="text-sm font-semibold leading-[1.5] text-ink">
            ทิศแดดและเวลาจริง (Solar Lighting)
          </h3>
          <p
            data-testid="lighting-reference-disclosure"
            className="text-xs leading-[1.85] text-secondary-strong"
          >
            {settings.referenceLabel}
          </p>
        </div>
        <button
          type="button"
          aria-label="คืนค่าอ้างอิงเริ่มต้นกรุงเทพฯ"
          onClick={() => {
            setValidationMessage(null);
            resetToBangkokDefaults();
          }}
          className={`rounded-lg border border-line bg-white px-2.5 py-1 text-xs font-medium leading-[1.85] text-ink hover:bg-surface ${FOCUS_RING_CLASS}`}
        >
          ค่าเริ่มต้นกรุงเทพฯ
        </button>
      </div>

      {/* โหมดเวลา: เวลาเครื่องจริง vs เวลาทดสอบคงที่ */}
      <div
        role="group"
        aria-label="โหมดเวลาแสงอาทิตย์"
        className="mt-3 grid grid-cols-1 gap-1.5 min-[420px]:grid-cols-2"
      >
        <button
          type="button"
          aria-label="ใช้เวลาเครื่องจริง (Realtime)"
          aria-pressed={settings.mode === "realtime"}
          data-testid="lighting-mode-realtime"
          onClick={() => handleModeChange("realtime")}
          className={`rounded-xl border px-3 py-1.5 text-xs font-medium leading-[1.85] transition-colors ${FOCUS_RING_CLASS} ${
            settings.mode === "realtime"
              ? "border-blue bg-blue-soft text-blue-hover"
              : "border-line bg-white text-secondary-strong hover:bg-surface"
          }`}
        >
          เวลาเครื่องจริง (Realtime)
        </button>
        <button
          type="button"
          aria-label="ใช้เวลาทดสอบคงที่ (Fixed Time)"
          aria-pressed={settings.mode === "fixed"}
          data-testid="lighting-mode-fixed"
          onClick={() => handleModeChange("fixed")}
          className={`rounded-xl border px-3 py-1.5 text-xs font-medium leading-[1.85] transition-colors ${FOCUS_RING_CLASS} ${
            settings.mode === "fixed"
              ? "border-blue bg-blue-soft text-blue-hover"
              : "border-line bg-white text-secondary-strong hover:bg-surface"
          }`}
        >
          เวลาทดสอบคงที่ (Fixed)
        </button>
      </div>

      {/* ตัวเลือกวันเวลาเมื่ออยู่ในโหมด Fixed */}
      {settings.mode === "fixed" && (
        <div className="mt-3">
          <label
            htmlFor="lighting-fixed-datetime"
            className="block text-xs font-medium leading-[1.85] text-secondary-strong"
          >
            วันและเวลาทดสอบคงที่
          </label>
          <input
            id="lighting-fixed-datetime"
            type="datetime-local"
            aria-label="วันและเวลาทดสอบคงที่"
            data-testid="lighting-fixed-datetime"
            value={settings.fixedDateTimeLocal}
            onChange={(e) => setSettings({ fixedDateTimeLocal: e.target.value })}
            className={`mt-1 w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs text-ink ${FOCUS_RING_CLASS}`}
          />
        </div>
      )}

      {/* พิกัดละติจูด ลองจิจูด และทิศเหนือของผัง */}
      <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <div>
          <label
            htmlFor="lighting-latitude"
            className="block text-xs font-medium leading-[1.85] text-secondary-strong"
          >
            ละติจูด (°N)
          </label>
          <input
            id="lighting-latitude"
            type="number"
            step="0.0001"
            min={-90}
            max={90}
            aria-label="ละติจูดองศาเหนือ"
            data-testid="lighting-latitude-input"
            value={latInput}
            onChange={(e) => commitLatitude(e.target.value)}
            className={`mt-1 w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs text-ink ${FOCUS_RING_CLASS}`}
          />
        </div>

        <div>
          <label
            htmlFor="lighting-longitude"
            className="block text-xs font-medium leading-[1.85] text-secondary-strong"
          >
            ลองจิจูด (°E)
          </label>
          <input
            id="lighting-longitude"
            type="number"
            step="0.0001"
            min={-180}
            max={180}
            aria-label="ลองจิจูดองศาตะวันออก"
            data-testid="lighting-longitude-input"
            value={lonInput}
            onChange={(e) => commitLongitude(e.target.value)}
            className={`mt-1 w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs text-ink ${FOCUS_RING_CLASS}`}
          />
        </div>

        <div>
          <label
            htmlFor="lighting-north-offset"
            className="block text-xs font-medium leading-[1.85] text-secondary-strong"
          >
            ชดเชยทิศเหนือ (°)
          </label>
          <input
            id="lighting-north-offset"
            type="number"
            step="1"
            min={-180}
            max={180}
            aria-label="มุมชดเชยทิศเหนือของผังร้าน"
            data-testid="lighting-north-offset-input"
            value={northInput}
            onChange={(e) => commitNorthOffset(e.target.value)}
            className={`mt-1 w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs text-ink ${FOCUS_RING_CLASS}`}
          />
        </div>
      </div>

      {/* เขตเวลา (Timezone) */}
      <div className="mt-3">
        <label
          htmlFor="lighting-timezone"
          className="block text-xs font-medium leading-[1.85] text-secondary-strong"
        >
          เขตเวลาอ้างอิง (Timezone)
        </label>
        <select
          id="lighting-timezone"
          aria-label="เขตเวลาอ้างอิง"
          data-testid="lighting-timezone-select"
          value={settings.timezone}
          onChange={(e) => setSettings({ timezone: e.target.value })}
          className={`mt-1 w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs text-ink ${FOCUS_RING_CLASS}`}
        >
          {SUPPORTED_TIMEZONES.map((tz) => (
            <option key={tz.id} value={tz.id}>
              {tz.label}
            </option>
          ))}
        </select>
      </div>

      {validationMessage && (
        <p
          role="status"
          data-testid="lighting-validation-message"
          className="mt-2 rounded-lg bg-blue-soft px-2.5 py-1 text-xs leading-[1.85] text-blue-hover"
        >
          {validationMessage}
        </p>
      )}

      {/* สรุปสถานะดวงอาทิตย์ปัจจุบัน */}
      <div
        aria-live="polite"
        data-testid="lighting-solar-summary"
        className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-surface p-2.5 text-xs leading-[1.85] text-ink sm:grid-cols-4"
      >
        <div>
          <span className="block text-[11px] text-secondary-strong">เวลาที่คำนวณ</span>
          <strong className="font-semibold">{displayTime}</strong>
        </div>
        <div>
          <span className="block text-[11px] text-secondary-strong">ช่วงแสง</span>
          <strong className="font-semibold">{PHASE_LABELS_THAI[solar.phase]}</strong>
        </div>
        <div>
          <span className="block text-[11px] text-secondary-strong">มุมเงย (Elevation)</span>
          <strong className="font-semibold">{solar.elevationDegrees.toFixed(1)}°</strong>
        </div>
        <div>
          <span className="block text-[11px] text-secondary-strong">ทิศ (Azimuth)</span>
          <strong className="font-semibold">{solar.layoutAzimuthDegrees.toFixed(1)}°</strong>
        </div>
      </div>
    </section>
  );
}
