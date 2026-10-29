/**
 * Zustand Store for Solar & Scene Lighting Settings (`feat-120`).
 *
 * Reads the simulation clock without writing layout history, simulation configuration or RNG state.
 */
import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";
import { simulationStore, type SimulationStoreState } from "./use-simulation-store";
import {
  BANGKOK_REFERENCE_DEFAULTS,
  sanitizeLightingSettings,
  type LightingClockMode,
  type LightingSettings,
} from "@/components/preview-3d/lighting/settings";
import { resolveEffectiveSolarUtcMs, resolveRestaurantSolarUtcMs } from "@/components/preview-3d/lighting/clock";
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
  refreshSimulation: (nowMs?: () => number) => void;
  resetToBangkokDefaults: (nowMs?: () => number) => void;
}

function buildStateFromSettings(
  settings: LightingSettings,
  nowMs: () => number,
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
  timeSource?: () => number,
  simulation: StoreApi<SimulationStoreState> = simulationStore,
) {
  const getSimulationUtcMs = (settings: LightingSettings): number => {
    if (timeSource) return timeSource();
    const state = simulation.getState();
    const elapsed = state.status === "running" || state.status === "paused"
      ? state.metrics?.time ?? 0 : 0;
    return resolveRestaurantSolarUtcMs(settings, state.config.openTime, elapsed);
  };
  const initialSettings = sanitizeLightingSettings(initialPatch, BANGKOK_REFERENCE_DEFAULTS);
  const initialComputed = buildStateFromSettings(initialSettings, () => getSimulationUtcMs(initialSettings));

  const store = createStore<LightingStoreState>()((set, get) => ({
    ...initialComputed,
    setSettings: (patch, nowMs) => {
      const next = sanitizeLightingSettings(patch, get().settings);
      set(buildStateFromSettings(next, nowMs ?? (() => getSimulationUtcMs(next))));
    },
    setMode: (mode, nowMs) => {
      get().setSettings({ mode }, nowMs);
    },
    setCoordinates: (latitude, longitude, nowMs) => {
      get().setSettings({ latitude, longitude }, nowMs);
    },
    setNorthOffsetDegrees: (northOffsetDegrees, nowMs) => {
      get().setSettings({ northOffsetDegrees }, nowMs);
    },
    setFixedDateTimeLocal: (fixedDateTimeLocal, nowMs) => {
      get().setSettings({ fixedDateTimeLocal }, nowMs);
    },
    setTimezone: (timezone, nowMs) => {
      get().setSettings({ timezone }, nowMs);
    },
    refreshSimulation: (nowMs) => {
      const settings = get().settings;
      const source = nowMs ?? (() => getSimulationUtcMs(settings));
      const effectiveUtcMs = resolveEffectiveSolarUtcMs(settings, source);
      if (effectiveUtcMs !== get().effectiveUtcMs) set(buildStateFromSettings(settings, source));
    },
    resetToBangkokDefaults: (nowMs) => {
      const settings = { ...BANGKOK_REFERENCE_DEFAULTS };
      set(buildStateFromSettings(settings, nowMs ?? (() => getSimulationUtcMs(settings))));
    },
  }));

  // Worker metrics already include playback speed. Refresh once per simulated minute;
  // no wall-clock interval, including while paused, hidden, or viewing the 2D editor.
  const unsubscribe = simulation.subscribe(() => store.getState().refreshSimulation());
  return Object.assign(store, { dispose: unsubscribe });
}

export const lightingStore = createLightingStore();

export function useLightingStore<T>(selector: (state: LightingStoreState) => T): T {
  return useStore(lightingStore, selector);
}

