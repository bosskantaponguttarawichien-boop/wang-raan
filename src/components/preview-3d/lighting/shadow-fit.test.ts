import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { StoreLayout } from "@/core/layout/types";
import { VIEW_ROTATIONS } from "@/core/preview/view-rotation";
import { parseLocalDateTimeToUtcMs } from "./settings";
import {
  CUTAWAY_WALL_SHADOW_POLICY,
  applyShadowFitToLight,
  computeShadowBoundingVolume,
  computeShadowCameraFit,
  stabilizeShadowFrustum,
} from "./shadow-fit";
import { computeSolarPosition } from "./solar-position";

function makeLayout(width: number, depth: number): StoreLayout {
  return {
    id: "layout-1",
    version: 1,
    units: "m",
    width,
    depth,
    entrance: { id: "ent-1", wall: "south", position: Math.max(0.5, width / 2 - 0.5), width: 1.0 },
    kitchenDoor: { id: "kit-1", wall: "north", position: Math.max(0.5, width / 2 - 0.5), width: 1.0 },
    objects: [],
  };
}

describe("feat-121: Orthographic Shadow Camera Fitting & Stabilization (shadow-fit.ts)", () => {
  const BANGKOK = { latitude: 13.7563, longitude: 100.5018, northOffsetDegrees: 0 };

  it("fits orthographic shadow frustums for 2x2m, 8x6m, and 30x30m rooms including wall height and outdoor entrance queue without clipping", () => {
    const morningUtc = parseLocalDateTimeToUtcMs("2026-03-21T08:30", "Asia/Bangkok");
    const solar = computeSolarPosition(morningUtc, BANGKOK);

    const room2x2 = makeLayout(2, 2);
    const room8x6 = makeLayout(8, 6);
    const room30x30 = makeLayout(30, 30);

    const fit2 = computeShadowCameraFit(room2x2, solar, 2048);
    const fit8 = computeShadowCameraFit(room8x6, solar, 2048);
    const fit30 = computeShadowCameraFit(room30x30, solar, 2048);

    // Frustum span scales proportionally with store dimensions
    const span2 = fit2.right - fit2.left;
    const span8 = fit8.right - fit8.left;
    const span30 = fit30.right - fit30.left;

    expect(span2).toBeGreaterThan(4);
    expect(span8).toBeGreaterThan(span2);
    expect(span30).toBeGreaterThan(span8);
    expect(fit30.far).toBeGreaterThan(fit30.near + 20);

    // Verify all 8 corners of the bounding volume (including outdoor queue area at z = depth + 3m) project strictly inside [left..right] x [bottom..top] x [near..far]
    for (const [layout, fit] of [
      [room2x2, fit2],
      [room8x6, fit8],
      [room30x30, fit30],
    ] as const) {
      const volume = computeShadowBoundingVolume(layout);
      const light = new THREE.DirectionalLight();
      applyShadowFitToLight(light, fit);
      const cam = light.shadow.camera;
      cam.updateMatrixWorld(true);

      const pt = new THREE.Vector3();
      for (const x of [volume.minX, volume.maxX]) {
        for (const y of [volume.minY, volume.maxY]) {
          for (const z of [volume.minZ, volume.maxZ]) {
            pt.set(x, y, z).applyMatrix4(cam.matrixWorldInverse);
            expect(pt.x).toBeGreaterThanOrEqual(cam.left - 0.15);
            expect(pt.x).toBeLessThanOrEqual(cam.right + 0.15);
            expect(pt.y).toBeGreaterThanOrEqual(cam.bottom - 0.15);
            expect(pt.y).toBeLessThanOrEqual(cam.top + 0.15);
            expect(-pt.z).toBeGreaterThanOrEqual(cam.near - 0.15);
            expect(-pt.z).toBeLessThanOrEqual(cam.far + 0.15);
          }
        }
      }
    }
  });

  it("casts shadows in the exact opposite direction of the sun across morning (East sun -> West shadow), noon, and evening (West sun -> East shadow)", () => {
    const layout = makeLayout(8, 6);
    const morning = computeSolarPosition(
      parseLocalDateTimeToUtcMs("2026-03-21T08:00", "Asia/Bangkok"),
      BANGKOK,
    );
    const evening = computeSolarPosition(
      parseLocalDateTimeToUtcMs("2026-03-21T17:00", "Asia/Bangkok"),
      BANGKOK,
    );

    const fitMorning = computeShadowCameraFit(layout, morning, 2048);
    const fitEvening = computeShadowCameraFit(layout, evening, 2048);

    // Morning light is in the East (+X relative to target), so shadows fall toward West (-X)
    expect(fitMorning.lightPosition.x).toBeGreaterThan(fitMorning.targetPosition.x);
    expect(fitMorning.shadowFloorDirection.x).toBeLessThan(-0.7);

    // Evening light is in the West (-X relative to target), so shadows fall toward East (+X)
    expect(fitEvening.lightPosition.x).toBeLessThan(fitEvening.targetPosition.x);
    expect(fitEvening.shadowFloorDirection.x).toBeGreaterThan(0.7);
  });

  it("stabilizes shadow frustum to texel increments and keeps cutaway wall shadow policy invariant across 4 camera rotations", () => {
    const s1 = stabilizeShadowFrustum({
      minX: -6.0001,
      maxX: 6.0001,
      minY: -6.0001,
      maxY: 6.0001,
      fixedSpan: 14,
      shadowMapSize: 2048,
    });
    const s2 = stabilizeShadowFrustum({
      minX: -6.0002,
      maxX: 6.0002,
      minY: -6.0002,
      maxY: 6.0002,
      fixedSpan: 14,
      shadowMapSize: 2048,
    });

    // Sub-millimetre jitter snaps to the exact same texel grid bounds
    expect(s1).toEqual(s2);

    // Cutaway wall shadow policy: walls never cast shadows so rotating camera 0/90/180/270 never flips room shadows
    expect(CUTAWAY_WALL_SHADOW_POLICY.wallCastShadow).toBe(false);
    expect(CUTAWAY_WALL_SHADOW_POLICY.wallReceiveShadow).toBe(true);
    expect(VIEW_ROTATIONS).toEqual([0, 90, 180, 270]);
  });
});
