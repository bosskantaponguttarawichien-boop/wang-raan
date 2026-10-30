/**
 * Solar & Scene Lighting Settings Schema and Reference Defaults (`feat-120`).
 *
 * Uses Bangkok (`13.7563°N, 100.5018°E`, `Asia/Bangkok`) as an explicit reference default
 * with a clear Thai disclosure label — never invokes `navigator.geolocation`.
 */
import { clampLatitude, clampLongitude, normalizeSignedDegrees } from "./solar-position";

export type LightingClockMode = "simulation" | "fixed";

export const BANGKOK_REFERENCE_DEFAULTS = {
  mode: "simulation" as LightingClockMode,
  latitude: 13.7563,
  longitude: 100.5018,
  timezone: "Asia/Bangkok",
  northOffsetDegrees: 0,
  /** Default fixed test date-time in Bangkok local time (2026-03-21T09:30, vernal equinox morning). */
  fixedDateTimeLocal: "2026-03-21T09:30",
  referenceLabel: "ค่าอ้างอิงเริ่มต้น: กรุงเทพฯ (ไม่ได้ตรวจพบตำแหน่งของคุณ)",
} as const;

export interface SupportedTimezoneOption {
  readonly id: string;
  readonly label: string;
  readonly utcOffsetMinutes: number;
}

export const SUPPORTED_TIMEZONES: readonly SupportedTimezoneOption[] = [
  { id: "Asia/Bangkok", label: "เอเชีย/กรุงเทพฯ (UTC+07:00)", utcOffsetMinutes: 420 },
  { id: "Asia/Tokyo", label: "เอเชีย/โตเกียว (UTC+09:00)", utcOffsetMinutes: 540 },
  { id: "Asia/Singapore", label: "เอเชีย/สิงคโปร์ (UTC+08:00)", utcOffsetMinutes: 480 },
  { id: "Europe/London", label: "ยุโรป/ลอนดอน (UTC+00:00)", utcOffsetMinutes: 0 },
  { id: "UTC", label: "เวลามาตรฐานสากล (UTC+00:00)", utcOffsetMinutes: 0 },
] as const;

export interface LightingSettings {
  readonly mode: LightingClockMode;
  readonly latitude: number;
  readonly longitude: number;
  readonly timezone: string;
  readonly northOffsetDegrees: number;
  /** Local ISO-like date-time string `YYYY-MM-DDTHH:mm` interpreted in `timezone` when `mode === "fixed"`. */
  readonly fixedDateTimeLocal: string;
  readonly referenceLabel: string;
}

export function getTimezoneOffsetMinutes(timezone: string): number {
  const matched = SUPPORTED_TIMEZONES.find((tz) => tz.id === timezone);
  if (matched) return matched.utcOffsetMinutes;
  return 420; // Default Asia/Bangkok UTC+7
}

/**
 * Parses a `YYYY-MM-DDTHH:mm` local time string in the given timezone into UTC epoch milliseconds
 * without double-applying any device local timezone offset.
 */
export function parseLocalDateTimeToUtcMs(
  localIsoString: string,
  timezone: string,
): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(
    localIsoString.trim(),
  );
  if (!match) {
    // Fallback to 2026-03-21T09:30 in Asia/Bangkok
    return Date.UTC(2026, 2, 21, 9, 30, 0) - 420 * 60_000;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? "0");

  const offsetMinutes = getTimezoneOffsetMinutes(timezone);
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second, 0);
  return asUtc - offsetMinutes * 60_000;
}

/**
 * Formats a UTC epoch timestamp into `YYYY-MM-DDTHH:mm` in the specified timezone.
 */
export function formatUtcMsToLocalDateTime(
  utcMs: number,
  timezone: string,
): string {
  const safeMs = Number.isFinite(utcMs) ? utcMs : Date.now();
  const offsetMinutes = getTimezoneOffsetMinutes(timezone);
  const shifted = new Date(safeMs + offsetMinutes * 60_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = shifted.getUTCFullYear();
  const m = pad(shifted.getUTCMonth() + 1);
  const d = pad(shifted.getUTCDate());
  const hh = pad(shifted.getUTCHours());
  const mm = pad(shifted.getUTCMinutes());
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

/**
 * Formats a UTC epoch timestamp into a readable Thai display time `HH:mm น.` in the specified timezone.
 */
export function formatDisplayTimeThai(utcMs: number, timezone: string): string {
  const localStr = formatUtcMsToLocalDateTime(utcMs, timezone);
  const timePart = localStr.split("T")[1] ?? "00:00";
  return `${timePart} น.`;
}

export function sanitizeLightingSettings(
  partial: Partial<LightingSettings>,
  current: LightingSettings = BANGKOK_REFERENCE_DEFAULTS,
): LightingSettings {
  const mode: LightingClockMode =
    partial.mode === "fixed" || partial.mode === "simulation" ? partial.mode : current.mode;
  const latitude =
    partial.latitude !== undefined ? clampLatitude(partial.latitude) : current.latitude;
  const longitude =
    partial.longitude !== undefined ? clampLongitude(partial.longitude) : current.longitude;
  const northOffsetDegrees =
    partial.northOffsetDegrees !== undefined
      ? normalizeSignedDegrees(partial.northOffsetDegrees)
      : current.northOffsetDegrees;
  const timezone =
    typeof partial.timezone === "string" &&
    SUPPORTED_TIMEZONES.some((t) => t.id === partial.timezone)
      ? partial.timezone
      : current.timezone;
  const fixedDateTimeLocal =
    typeof partial.fixedDateTimeLocal === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(partial.fixedDateTimeLocal.trim())
      ? partial.fixedDateTimeLocal.trim().slice(0, 16)
      : current.fixedDateTimeLocal;

  return {
    mode,
    latitude,
    longitude,
    timezone,
    northOffsetDegrees,
    fixedDateTimeLocal,
    referenceLabel: BANGKOK_REFERENCE_DEFAULTS.referenceLabel,
  };
}

