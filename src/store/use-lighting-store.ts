/**
 * Zustand Store for Solar & Scene Lighting Settings (`feat-120`).
 *
 * Kept strictly separate from `use-layout-store.ts`, `use-simulation-store.ts`, and `day-config.ts`
 * so lighting/solar adjustments never pollute Undo/Redo layout history or simulation RNG state.
 */
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import {
  BANGKOK_REFERENCE_DEFAULTS,
  sanitizeLightingSettings,
  type LightingClockMode,
  type LightingSettings,
} from "@/components/preview-3d/lighting/settings";
import { resolveEffectiveSolarUtcMs } from "@/components/preview-3d/lighting/clock";
import {
  computeSolarPosition,
  type SolarPositionResult,
} from "@/components/preview-3d/lighting/solar-position";

export interface LightingStoreState {
  readonly settings: LightingSettings;
  readonly effectiveUtcMs: number;
  readonly solar: SolarPositionResult;
  setSettings: (patch: Partial<LightingSettings>, nowMs?: () => number) => void;
  setMode: (mode: LightingClockMode, nowMs?: () => number) => void;
  setCoordinates: (latitude: number, longitude: number, nowMs?: () => number) => void;
  setNorthOffsetDegrees: (northOffsetDegrees: number, nowMs?: () => number) => void;
  setFixedDateTimeLocal: (fixedDateTimeLocal: string, nowMs?: () => number) => void;
  setTimezone: (timezone: string, nowMs?: () => number) => void;
  refreshRealtime: (nowMs?: () => number) => void;
  resetToBangkokDefaults: (nowMs?: () => number) => void;
}

function buildStateFromSettings(
  settings: LightingSettings,
  nowMs: () => number = () => Date.now(),
): Pick<LightingStoreState, "settings" | "effectiveUtcMs" | "solar"> {
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
  };
}

export function createLightingStore(
  initialPatch: Partial<LightingSettings> = {},
  defaultNowMs: () => number = () => Date.now(),
) {
  const initialSettings = sanitizeLightingSettings(initialPatch, BANGKOK_REFERENCE_DEFAULTS);
  const initialComputed = buildStateFromSettings(initialSettings, defaultNowMs);

  return createStore<LightingStoreState>()((set, get) => ({
    ...initialComputed,
    setSettings: (patch, nowMs = defaultNowMs) => {
      const next = sanitizeLightingSettings(patch, get().settings);
      set(buildStateFromSettings(next, nowMs));
    },
    setMode: (mode, nowMs = defaultNowMs) => {
      const next = sanitizeLightingSettings({ mode }, get().settings);
      set(buildStateFromSettings(next, nowMs));
    },
    setCoordinates: (latitude, longitude, nowMs = defaultNowMs) => {
      const next = sanitizeLightingSettings({ latitude, longitude }, get().settings);
      set(buildStateFromSettings(next, nowMs));
    },
    setNorthOffsetDegrees: (northOffsetDegrees, nowMs = defaultNowMs) => {
      const next = sanitizeLightingSettings({ northOffsetDegrees }, get().settings);
      set(buildStateFromSettings(next, nowMs));
    },
    setFixedDateTimeLocal: (fixedDateTimeLocal, nowMs = defaultNowMs) => {
      const next = sanitizeLightingSettings({ fixedDateTimeLocal }, get().settings);
      set(buildStateFromSettings(next, nowMs));
    },
    setTimezone: (timezone, nowMs = defaultNowMs) => {
      const next = sanitizeLightingSettings({ timezone }, get().settings);
      set(buildStateFromSettings(next, nowMs));
    },
    refreshRealtime: (nowMs = defaultNowMs) => {
      set(buildStateFromSettings(get().settings, nowMs));
    },
    resetToBangkokDefaults: (nowMs = defaultNowMs) => {
      set(buildStateFromSettings({ ...BANGKOK_REFERENCE_DEFAULTS }, nowMs));
    },
  }));
}

export const lightingStore = createLightingStore();

export function useLightingStore<T>(selector: (state: LightingStoreState) => T): T {
  return useStore(lightingStore, selector);
}

