import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import type { StoreLayout } from "@/core/layout/types";
import { createLightingStore } from "@/store/use-lighting-store";
import { QUALITY_LEVELS, type QualityLevel } from "../adaptive-quality";
import type { SceneFeatureContext } from "../runtime/contracts";
import { parseLocalDateTimeToUtcMs } from "./settings";
import { computePhotometricState, createSceneLightingFeature } from "./scene-lighting";
import { computeSolarPosition } from "./solar-position";

function makeLayout(width = 8, depth = 6): StoreLayout {
  return {
    id: "layout-1",
    version: 1,
    units: "m",
    width,
    depth,
    entrance: { id: "ent-1", wall: "south", position: 3.5, width: 1.2 },
    kitchenDoor: { id: "kit-1", wall: "north", position: 3.5, width: 1.0 },
    objects: [],
  };
}

function makeContext(
  layout: StoreLayout | null = makeLayout(),
  initialQuality: QualityLevel = QUALITY_LEVELS[0]!,
) {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
  const root = new THREE.Group();
  scene.add(root);

  let currentQuality = initialQuality;
  let currentLayout = layout;
  const invalidateSpy = vi.fn();
  const invalidateShadowsSpy = vi.fn();

  const context: SceneFeatureContext = {
    scene,
    camera,
    root,
    getLayout: () => currentLayout,
    getQuality: () => currentQuality,
    invalidate: invalidateSpy,
    invalidateShadows: invalidateShadowsSpy,
  };

  return {
    context,
    setQuality: (q: QualityLevel) => {
      currentQuality = q;
    },
    setLayout: (l: StoreLayout | null) => {
      currentLayout = l;
    },
    invalidateSpy,
    invalidateShadowsSpy,
  };
}

describe("feat-121: Real-Time & Fixed-Time Scene Lighting Runtime (scene-lighting.ts)", () => {
  const BANGKOK = { latitude: 13.7563, longitude: 100.5018, northOffsetDegrees: 0 };

  it("transitions photometric state cleanly across morning, solar noon, evening, twilight, and night (night turns direct sun shadow off while keeping indoor fill active)", () => {
    const morningSolar = computeSolarPosition(
      parseLocalDateTimeToUtcMs("2026-03-21T07:30", "Asia/Bangkok"),
      BANGKOK,
    );
    const noonSolar = computeSolarPosition(
      parseLocalDateTimeToUtcMs("2026-03-21T12:25", "Asia/Bangkok"),
      BANGKOK,
    );
    const eveningSolar = computeSolarPosition(
      parseLocalDateTimeToUtcMs("2026-03-21T17:30", "Asia/Bangkok"),
      BANGKOK,
    );
    const nightSolar = computeSolarPosition(
      parseLocalDateTimeToUtcMs("2026-03-21T22:00", "Asia/Bangkok"),
      BANGKOK,
    );

    const pMorning = computePhotometricState(morningSolar);
    const pNoon = computePhotometricState(noonSolar);
    const pEvening = computePhotometricState(eveningSolar);
    const pNight = computePhotometricState(nightSolar);

    // Morning & Evening have active sun shadow, lower intensity than noon
    expect(pMorning.isNight).toBe(false);
    expect(pMorning.sunCastShadow).toBe(true);
    expect(pMorning.sunIntensity).toBeGreaterThan(0.8);
    expect(pMorning.sunIntensity).toBeLessThan(pNoon.sunIntensity);

    // Solar noon has highest direct sun intensity
    expect(pNoon.sunCastShadow).toBe(true);
    expect(pNoon.sunIntensity).toBeGreaterThan(2.2);

    // Evening has active sun shadow
    expect(pEvening.sunCastShadow).toBe(true);
    expect(pEvening.sunIntensity).toBeGreaterThan(0.8);

    // Night turns direct sun intensity to 0 and disables sun shadow, while keeping hemisphere + indoor fill bright enough to read the room
    expect(pNight.isNight).toBe(true);
    expect(pNight.sunIntensity).toBe(0);
    expect(pNight.sunCastShadow).toBe(false);
    expect(pNight.hemisphereIntensity).toBeGreaterThanOrEqual(1.3);
    expect(pNight.indoorFillIntensity).toBeGreaterThan(1.0);
  });

  it("updates Three.js lights and invalidates shadows when store settings or layout change, without reallocating shadow maps every frame", () => {
    const store = createLightingStore({
      mode: "fixed",
      fixedDateTimeLocal: "2026-03-21T08:30",
    });

    const { context, setQuality, invalidateShadowsSpy } = makeContext(
      makeLayout(8, 6),
      QUALITY_LEVELS[0]!,
    );

    const feature = createSceneLightingFeature(context, {
      store,
      clockEnv: {
        isDocumentHidden: () => false,
        isReducedMotionOrPrint: () => false,
      },
    });

    expect(feature.sunLight.castShadow).toBe(true);
    expect(feature.sunLight.intensity).toBeGreaterThan(1.0);
    expect(feature.sunLight.shadow.mapSize.x).toBe(2048);

    const initialReallocations = feature.getShadowMapReallocations();

    // Run 60 render frames at 30x simulation speed -> must NOT reallocate shadow map or advance solar clock
    const beforePos = feature.sunLight.position.clone();
    for (let i = 0; i < 60; i++) {
      feature.update({
        nowMs: i * 16,
        realDeltaSeconds: 0.016,
        playbackRate: 30,
        simulating: true,
        paused: false,
      });
    }
    expect(feature.getShadowMapReallocations()).toBe(initialReallocations);
    expect(feature.sunLight.position.x).toBeCloseTo(beforePos.x, 5);
    expect(feature.sunLight.position.z).toBeCloseTo(beforePos.z, 5);

    // Degrade quality to level 2 (characterShadows: false, shadowMapSize: 1024)
    setQuality(QUALITY_LEVELS[2]!);
    feature.update({
      nowMs: 2000,
      realDeltaSeconds: 0.016,
      playbackRate: 1,
      simulating: true,
      paused: false,
    });
    expect(feature.sunLight.shadow.mapSize.x).toBe(1024);
    expect(feature.getShadowMapReallocations()).toBe(initialReallocations + 1);

    // Even at low quality (when shadowMap.autoUpdate is false in ThreeView), changing time to evening triggers invalidateShadows()
    invalidateShadowsSpy.mockClear();
    store.getState().setFixedDateTimeLocal("2026-03-21T17:15");
    expect(invalidateShadowsSpy).toHaveBeenCalled();
    expect(feature.sunLight.position.x).toBeLessThan(feature.sunLight.target.position.x); // West sun

    // Changing time to midnight turns off sunLight.castShadow and activates warm indoor fill
    store.getState().setFixedDateTimeLocal("2026-03-21T23:30");
    expect(feature.sunLight.castShadow).toBe(false);
    expect(feature.sunLight.intensity).toBe(0);
    expect(feature.indoorFillLight.intensity).toBeGreaterThan(1.0);

    // Syncing a larger 30x30m layout expands the shadow frustum
    feature.syncLayout(makeLayout(30, 30));
    expect(feature.getLastShadowFit()!.right - feature.getLastShadowFit()!.left).toBeGreaterThan(35);

    // Clean disposal removes all owned lights from the feature root
    feature.dispose();
    expect(context.root.children).toHaveLength(0);
  });
});
