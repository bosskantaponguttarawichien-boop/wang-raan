/**
 * Simulation-driven & deterministic fixed-time solar lighting controller.
 *
 * Key Invariants:
 * 1. Simulation mode reads opening time + elapsed simulation time from its injected source.
 * 2. Never advances time using wall-clock timers or multiplies playback speed a second time.
 * 3. In `"fixed"` mode, resolves the user's configured `fixedDateTimeLocal` + `timezone` into a deterministic UTC instant.
 * 4. Visibility/media changes refresh a static snapshot from the same simulation source.
 */
import {
  BANGKOK_REFERENCE_DEFAULTS,
  parseLocalDateTimeToUtcMs,
  sanitizeLightingSettings,
  type LightingSettings,
} from "./settings";
import { computeSolarPosition, type SolarPositionResult } from "./solar-position";

/** Lighting changes at simulation-minute boundaries, matching the displayed restaurant clock. */
export const SOLAR_CLOCK_CADENCE_MS = 60_000;

export function resolveRestaurantSolarUtcMs(
  settings: LightingSettings,
  openTime: string,
  elapsedSeconds: number,
): number {
  const validOpening = /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(openTime) ? openTime : "10:00";
  // Use the configured reference date, never today's date or the device's timezone.
  const openingUtcMs = parseLocalDateTimeToUtcMs(
    `${settings.fixedDateTimeLocal.slice(0, 10)}T${validOpening}`,
    settings.timezone,
  );
  const elapsed = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0;
  return openingUtcMs + Math.floor(elapsed / 60) * SOLAR_CLOCK_CADENCE_MS;
}

export interface SolarClockSnapshot {
  readonly settings: LightingSettings;
  readonly effectiveUtcMs: number;
  readonly solar: SolarPositionResult;
  readonly reducedMotionOrPrint: boolean;
  readonly hidden: boolean;
}

export interface SolarClockEnvironment {
  readonly nowMs?: () => number;
  readonly isDocumentHidden?: () => boolean;
  readonly isReducedMotionOrPrint?: () => boolean;
  readonly subscribeVisibility?: (onChange: () => void) => () => void;
  readonly subscribeMedia?: (onChange: () => void) => () => void;
}

export interface SolarClockController {
  start(): void;
  stop(): void;
  dispose(): void;
  refreshNow(): SolarClockSnapshot;
  getSnapshot(): SolarClockSnapshot;
  setSettings(patch: Partial<LightingSettings>): SolarClockSnapshot;
  subscribe(listener: (snapshot: SolarClockSnapshot) => void): () => void;
  isRunning(): boolean;
}

function defaultIsDocumentHidden(): boolean {
  if (typeof document === "undefined") return false;
  return document.visibilityState === "hidden";
}

function defaultIsReducedMotionOrPrint(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return (
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    window.matchMedia("print").matches
  );
}

function defaultSubscribeVisibility(onChange: () => void): () => void {
  if (typeof document === "undefined" || typeof document.addEventListener !== "function") {
    return () => {};
  }
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

function defaultSubscribeMedia(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }
  const mqlReduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const mqlPrint = window.matchMedia("print");
  mqlReduced.addEventListener?.("change", onChange);
  mqlPrint.addEventListener?.("change", onChange);
  return () => {
    mqlReduced.removeEventListener?.("change", onChange);
    mqlPrint.removeEventListener?.("change", onChange);
  };
}

export function resolveEffectiveSolarUtcMs(
  settings: LightingSettings,
  nowMs: () => number = () => resolveRestaurantSolarUtcMs(settings, "10:00", 0),
): number {
  if (settings.mode === "fixed") {
    return parseLocalDateTimeToUtcMs(settings.fixedDateTimeLocal, settings.timezone);
  }
  return nowMs();
}

export function createSolarClock(
  initialSettings: Partial<LightingSettings> = {},
  env: SolarClockEnvironment = {},
): SolarClockController {
  const isDocumentHidden = env.isDocumentHidden ?? defaultIsDocumentHidden;
  const isReducedMotionOrPrint = env.isReducedMotionOrPrint ?? defaultIsReducedMotionOrPrint;
  const subscribeVisibility = env.subscribeVisibility ?? defaultSubscribeVisibility;
  const subscribeMedia = env.subscribeMedia ?? defaultSubscribeMedia;

  let settings = sanitizeLightingSettings(initialSettings, BANGKOK_REFERENCE_DEFAULTS);
  let unsubscribeVisibility: (() => void) | null = null;
  let unsubscribeMedia: (() => void) | null = null;
  let started = false;
  let disposed = false;

  const listeners = new Set<(snapshot: SolarClockSnapshot) => void>();

  const computeCurrentSnapshot = (): SolarClockSnapshot => {
    const effectiveUtcMs = resolveEffectiveSolarUtcMs(settings, env.nowMs);
    const solar = computeSolarPosition(effectiveUtcMs, {
      latitude: settings.latitude,
      longitude: settings.longitude,
      northOffsetDegrees: settings.northOffsetDegrees,
    });
    return {
      settings,
      effectiveUtcMs,
      solar,
      reducedMotionOrPrint: isReducedMotionOrPrint(),
      hidden: isDocumentHidden(),
    };
  };

  let snapshot = computeCurrentSnapshot();

  const notify = (): void => {
    for (const listener of listeners) {
      listener(snapshot);
    }
  };

  const handleEnvironmentSignal = (): void => {
    if (disposed) return;
    snapshot = computeCurrentSnapshot();
    notify();
  };

  return {
    start(): void {
      if (disposed || started) return;
      started = true;
      unsubscribeVisibility = subscribeVisibility(handleEnvironmentSignal);
      unsubscribeMedia = subscribeMedia(handleEnvironmentSignal);
      snapshot = computeCurrentSnapshot();
      notify();
    },

    stop(): void {
      if (!started) return;
      started = false;
      unsubscribeVisibility?.();
      unsubscribeVisibility = null;
      unsubscribeMedia?.();
      unsubscribeMedia = null;
    },

    dispose(): void {
      if (disposed) return;
      this.stop();
      disposed = true;
      listeners.clear();
    },

    refreshNow(): SolarClockSnapshot {
      if (disposed) return snapshot;
      snapshot = computeCurrentSnapshot();
      notify();
      return snapshot;
    },

    getSnapshot(): SolarClockSnapshot {
      return snapshot;
    },

    setSettings(patch: Partial<LightingSettings>): SolarClockSnapshot {
      if (disposed) return snapshot;
      settings = sanitizeLightingSettings(patch, settings);
      snapshot = computeCurrentSnapshot();
      notify();
      return snapshot;
    },

    subscribe(listener: (snapshot: SolarClockSnapshot) => void): () => void {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    isRunning(): boolean {
      return false; // No independent timer; the simulation store drives refreshes.
    },
  };
}

