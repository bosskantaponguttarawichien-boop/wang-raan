/**
 * Real-Time & Fixed-Time Scene Lighting Runtime (`feat-121`).
 *
 * Bridges the Solar Clock / Store (`feat-120`) and Shadow Camera Fit (`shadow-fit.ts`) into the
 * Three.js 3D preview (`SceneFeature` contract `"lighting"`).
 *
 * Lighting Architecture:
 * 1. `sunLight` (`THREE.DirectionalLight`): Direct sunlight casting directional shadows opposite the sun azimuth.
 *    - Daytime (`elevation > 0°`): warm golden morning/evening to crisp midday sunlight, `castShadow = true`.
 *    - Nighttime (`elevation <= 0°`): `intensity = 0` and `castShadow = false` so no phantom solar shadows appear at night.
 * 2. `skyGroundLight` (`THREE.HemisphereLight`): Ambient sky/ground bounce that shifts smoothly from bright daylight
 *    to warm-orange twilight and cool-blue night ambiance while keeping furniture/characters readable.
 * 3. `indoorFillLight` (`THREE.DirectionalLight`, shadowless): Overhead warm interior cafe lighting that ramps up
 *    during twilight and night so the store floor, tables, dishes, and characters remain clearly legible 24/7.
 */
import * as THREE from "three";
import type { StoreApi } from "zustand";
import type { StoreLayout } from "@/core/layout/types";
import {
  lightingStore as defaultLightingStore,
  type LightingStoreState,
} from "@/store/use-lighting-store";
import type { SceneFeature, SceneFeatureContext } from "../runtime/contracts";
import { createSolarClock, type SolarClockController, type SolarClockEnvironment } from "./clock";
import { applyShadowFitToLight, computeShadowCameraFit, type ShadowFrustumFit } from "./shadow-fit";
import type { SolarPhase, SolarPositionResult } from "./solar-position";

export interface PhotometricState {
  readonly phase: SolarPhase;
  readonly isNight: boolean;
  readonly sunColorHex: string;
  readonly sunIntensity: number;
  readonly sunCastShadow: boolean;
  readonly skyColorHex: string;
  readonly groundColorHex: string;
  readonly hemisphereIntensity: number;
  readonly indoorFillColorHex: string;
  readonly indoorFillIntensity: number;
  readonly sceneBackgroundHex: string;
}

export interface SceneLightingFeatureOptions {
  /** Optional Zustand lighting store override (for isolated unit testing). */
  readonly store?: StoreApi<LightingStoreState>;
  /** Optional clock environment override (for fake timers / reduced-motion tests). */
  readonly clockEnv?: SolarClockEnvironment;
  /** Optional existing directional/hemisphere lights to adopt instead of creating new ones. */
  readonly existingLights?: {
    readonly sunLight?: THREE.DirectionalLight;
    readonly skyGroundLight?: THREE.HemisphereLight;
  };
}

export interface SceneLightingFeature extends SceneFeature {
  readonly sunLight: THREE.DirectionalLight;
  readonly skyGroundLight: THREE.HemisphereLight;
  readonly indoorFillLight: THREE.DirectionalLight;
  readonly clock: SolarClockController;
  getPhotometricState(): PhotometricState;
  getLastShadowFit(): ShadowFrustumFit | null;
  getShadowMapReallocations(): number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function lerpColorHex(hexA: string, hexB: string, t: number): string {
  const c1 = new THREE.Color(hexA);
  const c2 = new THREE.Color(hexB);
  c1.lerp(c2, clamp01(t));
  return `#${c1.getHexString()}`;
}

/**
 * Pure photometric transfer function mapping `SolarPositionResult` to light colors, intensities,
 * and shadow-casting flags across midday, golden hour, twilight, and night.
 */
export function computePhotometricState(solar: SolarPositionResult): PhotometricState {
  const el = solar.elevationDegrees;

  // Night or below horizon: direct sun is OFF (`sunIntensity = 0`, `sunCastShadow = false`)
  // while warm indoor fill + soft ambient keep the store interior clearly readable.
  if (el <= 0) {
    // Twilight factor: 1 at horizon (0°), 0 at deep night (-12° or below)
    const twilightFactor = clamp01((el + 12) / 12);
    const skyColorHex = lerpColorHex("#b8c5dc", "#d9d4e6", twilightFactor);
    const groundColorHex = lerpColorHex("#9aa3b2", "#bfb8b0", twilightFactor);
    const hemisphereIntensity = Number((1.35 + twilightFactor * 0.35).toFixed(3));
    const indoorFillIntensity = Number((1.35 - twilightFactor * 0.25).toFixed(3));
    const sceneBackgroundHex = lerpColorHex("#e4e9f2", "#eef1f7", twilightFactor);

    return {
      phase: solar.phase,
      isNight: true,
      sunColorHex: "#ffb36b",
      sunIntensity: 0,
      sunCastShadow: false,
      skyColorHex,
      groundColorHex,
      hemisphereIntensity,
      indoorFillColorHex: "#fff2df",
      indoorFillIntensity,
      sceneBackgroundHex,
    };
  }

  // Daytime (el > 0°):
  // Low sun (0°..25°): warm golden-orange sunrise/sunset ramping up to full intensity
  // High sun (25°..90°): crisp warm-white daylight matching legacy key light (#fff1dc, intensity ~2.4)
  const goldenT = clamp01(el / 28);
  const highT = clamp01((el - 15) / 55);

  const sunColorHex = lerpColorHex("#ffbe78", "#fff1dc", goldenT);
  const sunIntensity = Number((0.65 + goldenT * 1.45 + highT * 0.35).toFixed(3));

  const skyColorHex = lerpColorHex("#ffe8cf", "#ffffff", goldenT);
  const groundColorHex = lerpColorHex("#cbbfa8", "#d4d8df", goldenT);
  const hemisphereIntensity = Number((1.72 + goldenT * 0.38).toFixed(3));

  // Indoor fill light supplements low-angle morning/evening sun and fades back at bright solar noon
  const indoorFillIntensity = Number((0.65 * (1 - goldenT * 0.7)).toFixed(3));
  const sceneBackgroundHex = lerpColorHex("#f2efe9", "#f5f7fb", goldenT);

  return {
    phase: solar.phase,
    isNight: false,
    sunColorHex,
    sunIntensity,
    sunCastShadow: true,
    skyColorHex,
    groundColorHex,
    hemisphereIntensity,
    indoorFillColorHex: "#fff3e0",
    indoorFillIntensity,
    sceneBackgroundHex,
  };
}

/**
 * Creates simulation/fixed solar lighting and shadow camera bounds.
 */
export function createSceneLightingFeature(
  context: SceneFeatureContext,
  options: SceneLightingFeatureOptions = {},
): SceneLightingFeature {
  const store = options.store ?? defaultLightingStore;

  const ownsSunLight = !options.existingLights?.sunLight;
  const ownsSkyGroundLight = !options.existingLights?.skyGroundLight;

  const sunLight =
    options.existingLights?.sunLight ?? new THREE.DirectionalLight("#fff1dc", 2.4);
  sunLight.name = "SolarDirectionalLight";
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.bias = -0.0005;
  sunLight.shadow.normalBias = 0.02;

  const skyGroundLight =
    options.existingLights?.skyGroundLight ??
    new THREE.HemisphereLight("#ffffff", "#d4d8df", 2.1);
  skyGroundLight.name = "SolarHemisphereLight";

  const indoorFillLight = new THREE.DirectionalLight("#fff2df", 0.45);
  indoorFillLight.name = "IndoorWarmFillLight";
  indoorFillLight.castShadow = false;

  if (ownsSunLight) {
    context.root.add(sunLight, sunLight.target);
  }
  if (ownsSkyGroundLight) {
    context.root.add(skyGroundLight);
  }
  context.root.add(indoorFillLight, indoorFillLight.target);

  const clock = createSolarClock(store.getState().settings, {
    ...options.clockEnv,
    nowMs: () => store.getState().effectiveUtcMs,
  });

  let currentLayout: StoreLayout | null = context.getLayout();
  let lastSolar: SolarPositionResult = clock.getSnapshot().solar;
  let lastPhotometric: PhotometricState = computePhotometricState(lastSolar);
  let lastShadowFit: ShadowFrustumFit | null = null;
  let lastShadowMapSize = context.getQuality().shadowMapSize;
  let shadowMapReallocations = 0;
  let disposed = false;

  const positionIndoorFill = (layout: StoreLayout | null): void => {
    const cx = layout ? layout.width / 2 : 4;
    const cz = layout ? layout.depth / 2 : 3;
    // Slight overhead angle from indoor ceiling so table surfaces and vertical faces both get warm fill
    indoorFillLight.position.set(cx + 0.8, 4.5, cz + 1.1);
    indoorFillLight.target.position.set(cx, 0, cz);
    indoorFillLight.target.updateMatrixWorld(true);
    indoorFillLight.updateMatrixWorld(true);
  };

  const applyLightingAndShadows = (
    solar: SolarPositionResult,
    layout: StoreLayout | null,
    forceShadowRefresh = false,
  ): void => {
    if (disposed) return;

    const quality = context.getQuality();
    const photometric = computePhotometricState(solar);

    const prevAzimuth = lastSolar.layoutAzimuthDegrees;
    const prevElevation = lastSolar.elevationDegrees;
    const prevPhase = lastPhotometric.phase;
    const prevCastShadow = sunLight.castShadow;

    lastSolar = solar;
    lastPhotometric = photometric;

    sunLight.color.set(photometric.sunColorHex);
    sunLight.intensity = photometric.sunIntensity;
    sunLight.castShadow = photometric.sunCastShadow;

    skyGroundLight.color.set(photometric.skyColorHex);
    skyGroundLight.groundColor.set(photometric.groundColorHex);
    skyGroundLight.intensity = photometric.hemisphereIntensity;

    indoorFillLight.color.set(photometric.indoorFillColorHex);
    indoorFillLight.intensity = photometric.indoorFillIntensity;
    positionIndoorFill(layout);

    let shadowChanged = forceShadowRefresh || prevCastShadow !== sunLight.castShadow;

    if (layout) {
      const fit = computeShadowCameraFit(layout, solar, quality.shadowMapSize);
      const { resizedShadowMap } = applyShadowFitToLight(sunLight, fit);
      if (resizedShadowMap) {
        shadowMapReallocations++;
        shadowChanged = true;
      }
      lastShadowFit = fit;
      lastShadowMapSize = quality.shadowMapSize;
    }

    const angleDelta =
      Math.abs(solar.layoutAzimuthDegrees - prevAzimuth) +
      Math.abs(solar.elevationDegrees - prevElevation);
    if (angleDelta > 0.02 || photometric.phase !== prevPhase) {
      shadowChanged = true;
    }

    if (shadowChanged) {
      context.invalidateShadows();
    }
    context.invalidate();
  };

  // The store owns simulation time; this controller only turns its snapshot into scene lighting.
  const unsubscribeClock = clock.subscribe((snap) => {
    if (disposed) return;
    applyLightingAndShadows(snap.solar, currentLayout);
  });

  // Subscribe to Zustand lighting store changes (from UI panel or programmatic updates)
  const unsubscribeStore = store.subscribe((state, prevState) => {
    if (disposed) return;
    if (state.settings !== prevState.settings) {
      clock.setSettings(state.settings);
    } else if (
      state.effectiveUtcMs !== prevState.effectiveUtcMs &&
      state.effectiveUtcMs !== lastSolar.timestampMs
    ) {
      clock.refreshNow();
    }
  });

  clock.start();
  applyLightingAndShadows(clock.getSnapshot().solar, currentLayout, true);

  return {
    sunLight,
    skyGroundLight,
    indoorFillLight,
    clock,

    syncLayout(layout: StoreLayout): void {
      if (disposed) return;
      currentLayout = layout;
      applyLightingAndShadows(lastSolar, layout, true);
    },

    update(): void {
      if (disposed) return;
      // The simulation store already owns elapsed time and playback speed; do not advance twice.
      // However, if AdaptiveQuality changed shadowMapSize between frames, update the shadow map resolution once.
      const currentQualitySize = context.getQuality().shadowMapSize;
      if (currentQualitySize !== lastShadowMapSize && currentLayout) {
        applyLightingAndShadows(lastSolar, currentLayout, true);
      }
    },

    reset(): void {
      if (disposed) return;
      // Refresh current solar position without resetting user's lighting settings
      const snap = clock.refreshNow();
      applyLightingAndShadows(snap.solar, currentLayout, true);
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      unsubscribeStore();
      unsubscribeClock();
      clock.dispose();

      indoorFillLight.removeFromParent();
      indoorFillLight.target.removeFromParent();

      if (ownsSkyGroundLight) {
        skyGroundLight.removeFromParent();
      }
      if (ownsSunLight) {
        sunLight.removeFromParent();
        sunLight.target.removeFromParent();
        sunLight.shadow.map?.dispose();
        sunLight.shadow.map = null;
      }
    },

    getPhotometricState(): PhotometricState {
      return lastPhotometric;
    },

    getLastShadowFit(): ShadowFrustumFit | null {
      return lastShadowFit;
    },

    getShadowMapReallocations(): number {
      return shadowMapReallocations;
    },
  };
}
