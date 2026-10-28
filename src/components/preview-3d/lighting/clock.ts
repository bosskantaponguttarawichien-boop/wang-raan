/**
 * Wall-Clock & Deterministic Fixed-Time Controller for Solar Lighting (`feat-120`).
 *
 * Key Invariants:
 * 1. In `"realtime"` mode, reads wall-clock `nowMs()` (default `Date.now()`) and refreshes on a 60s cadence
 *    (plus immediately on start/visibility-resume/settings-change).
 * 2. NEVER couples to simulation `playbackRate` or `simTimeSeconds`.
 * 3. In `"fixed"` mode, resolves the user's configured `fixedDateTimeLocal` + `timezone` into a deterministic UTC instant.
 * 4. Pauses interval ticking when `document.visibilityState === "hidden"`, `prefers-reduced-motion: reduce`, or `@media print`.
 */
import {
  BANGKOK_REFERENCE_DEFAULTS,
  parseLocalDateTimeToUtcMs,
  sanitizeLightingSettings,
  type LightingSettings,
} from "./settings";
import { computeSolarPosition, type SolarPositionResult } from "./solar-position";

export const SOLAR_CLOCK_CADENCE_MS = 60_000;

export interface SolarClockSnapshot {
  readonly settings: LightingSettings;
  readonly effectiveUtcMs: number;
  readonly solar: SolarPositionResult;
  readonly reducedMotionOrPrint: boolean;
  readonly hidden: boolean;
}

export interface SolarClockEnvironment {
  readonly nowMs?: () => number;
  readonly cadenceMs?: number;
  readonly setIntervalFn?: (cb: () => void, ms: number) => ReturnType<typeof setInterval>;
  readonly clearIntervalFn?: (handle: ReturnType<typeof setInterval>) => void;
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
  nowMs: () => number = () => Date.now(),
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
  const nowMs = env.nowMs ?? (() => Date.now());
  const cadenceMs = Math.max(1000, env.cadenceMs ?? SOLAR_CLOCK_CADENCE_MS);
  const setIntervalFn = env.setIntervalFn ?? ((cb, ms) => setInterval(cb, ms));
  const clearIntervalFn = env.clearIntervalFn ?? ((id) => clearInterval(id));
  const isDocumentHidden = env.isDocumentHidden ?? defaultIsDocumentHidden;
  const isReducedMotionOrPrint = env.isReducedMotionOrPrint ?? defaultIsReducedMotionOrPrint;
  const subscribeVisibility = env.subscribeVisibility ?? defaultSubscribeVisibility;
  const subscribeMedia = env.subscribeMedia ?? defaultSubscribeMedia;

  let settings = sanitizeLightingSettings(initialSettings, BANGKOK_REFERENCE_DEFAULTS);
  let timerHandle: ReturnType<typeof setInterval> | null = null;
  let unsubscribeVisibility: (() => void) | null = null;
  let unsubscribeMedia: (() => void) | null = null;
  let started = false;
  let disposed = false;

  const listeners = new Set<(snapshot: SolarClockSnapshot) => void>();

  const computeCurrentSnapshot = (): SolarClockSnapshot => {
    const effectiveUtcMs = resolveEffectiveSolarUtcMs(settings, nowMs);
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

  const clearTimer = (): void => {
    if (timerHandle !== null) {
      clearIntervalFn(timerHandle);
      timerHandle = null;
    }
  };

  const shouldTickInterval = (): boolean => {
    if (!started || disposed) return false;
    if (settings.mode !== "realtime") return false;
    if (isDocumentHidden()) return false;
    if (isReducedMotionOrPrint()) return false;
    return true;
  };

  const syncTimer = (): void => {
    if (!shouldTickInterval()) {
      clearTimer();
      return;
    }
    if (timerHandle !== null) return;
    timerHandle = setIntervalFn(() => {
      if (!shouldTickInterval()) {
        clearTimer();
        return;
      }
      snapshot = computeCurrentSnapshot();
      notify();
    }, cadenceMs);
  };

  const handleEnvironmentSignal = (): void => {
    if (disposed) return;
    const wasHidden = snapshot.hidden;
    snapshot = computeCurrentSnapshot();
    syncTimer();
    if (wasHidden && !snapshot.hidden) {
      notify();
    } else {
      notify();
    }
  };

  return {
    start(): void {
      if (disposed || started) return;
      started = true;
      unsubscribeVisibility = subscribeVisibility(handleEnvironmentSignal);
      unsubscribeMedia = subscribeMedia(handleEnvironmentSignal);
      snapshot = computeCurrentSnapshot();
      syncTimer();
      notify();
    },

    stop(): void {
      if (!started) return;
      started = false;
      clearTimer();
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
      syncTimer();
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
      syncTimer();
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
      return timerHandle !== null;
    },
  };
}

