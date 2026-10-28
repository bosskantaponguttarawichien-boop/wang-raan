/**
 * Orthographic Shadow Camera Fitting & Texel Stabilization (`feat-121`).
 *
 * Computes world-space directional light placement and orthographic shadow frustum bounds
 * for any store layout from `2×2` m up to `30×30` m, including wall height (`2.7` m) and
 * the outside entrance queue area (`OUTSIDE_DISTANCE = 3` m).
 *
 * Cutaway Wall Policy:
 * Walls and door frames use `castShadow: false, receiveShadow: true` (matching `three-view.tsx`)
 * because two near walls fade out depending on camera `viewRotation`. Keeping wall shadow casting off
 * guarantees that rotating the camera 4 ways (`0/90/180/270`) never causes phantom wall shadows
 * to appear/disappear or room brightness to flip.
 */
import * as THREE from "three";
import type { StoreLayout } from "@/core/layout/types";
import { OUTSIDE_DISTANCE, doorFrame } from "@/components/simulation/walk-pacer";
import { CHARACTER_HEIGHT } from "../character-models";
import type { SolarPositionResult, WorldVector3 } from "./solar-position";

export const SCENE_WALL_HEIGHT = 2.7;

/** Minimum elevation angle (degrees) used for shadow-casting geometry so grazing sunrise/sunset shadows do not stretch infinitely. */
export const MIN_SHADOW_ELEVATION_DEGREES = 14;

export const CUTAWAY_WALL_SHADOW_POLICY = {
  wallCastShadow: false,
  wallReceiveShadow: true,
  furnitureCastShadow: true,
  furnitureReceiveShadow: true,
  rationale:
    "ผนัง 2 ด้านที่ใกล้กล้องจะถูกซ่อนตามมุมมอง (cutaway) จึงไม่ให้ผนังทอดเงา เพื่อไม่ให้เงาห้องเปลี่ยนหรือกลับด้านเมื่อหมุนกล้อง 0/90/180/270 องศา",
} as const;

export interface ShadowBoundingVolume {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly centerX: number;
  readonly centerY: number;
  readonly centerZ: number;
  readonly radius: number;
}

export interface ShadowFrustumFit {
  readonly lightPosition: WorldVector3;
  readonly targetPosition: WorldVector3;
  /** Direction vector pointing from target toward the light (effective shadow sun vector). */
  readonly effectiveLightDirection: WorldVector3;
  /** Direction vector on the floor plane (`x, z`) in which shadows are cast (opposite the sun). */
  readonly shadowFloorDirection: { readonly x: number; readonly z: number };
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly near: number;
  readonly far: number;
  readonly bias: number;
  readonly normalBias: number;
  readonly shadowMapSize: number;
  readonly texelSizeMeters: number;
}

/**
 * Computes the world-space axis-aligned bounding volume that must be covered by the shadow camera,
 * including the room interior (`[0..width] × [0..depth] × [0..2.7m]`) and the outdoor queue zone
 * in front of the entrance door (`OUTSIDE_DISTANCE = 3m`).
 */
export function computeShadowBoundingVolume(layout: StoreLayout): ShadowBoundingVolume {
  let minX = 0;
  let maxX = Math.max(2, layout.width);
  const minY = 0;
  const maxY = SCENE_WALL_HEIGHT;
  let minZ = 0;
  let maxZ = Math.max(2, layout.depth);

  const door = doorFrame(layout);
  if (door) {
    for (const lateral of [-1, 1]) {
      const side = door.width / 2 + 1;
      const x = door.center.x + door.outward.x * OUTSIDE_DISTANCE + door.along.x * side * lateral;
      const z = door.center.y + door.outward.y * OUTSIDE_DISTANCE + door.along.y * side * lateral;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
  } else {
    // Fallback margin around the store perimeter if no entrance is placed yet
    minX -= 1;
    maxX += 1;
    minZ -= 1;
    maxZ += 1;
  }

  const centerX = (minX + maxX) / 2;
  const centerY = 0;
  const centerZ = (minZ + maxZ) / 2;
  const spanX = maxX - minX;
  const spanZ = maxZ - minZ;
  const radius = Math.hypot(spanX, spanZ, maxY) / 2 + 0.75;

  return {
    minX,
    maxX,
    minY,
    maxY: Math.max(maxY, CHARACTER_HEIGHT),
    minZ,
    maxZ,
    centerX,
    centerY,
    centerZ,
    radius,
  };
}

/**
 * Computes an effective unit vector toward the shadow-casting light source.
 * Preserves the exact horizontal solar azimuth (`layoutAzimuthDegrees`), while clamping
 * minimum elevation to `MIN_SHADOW_ELEVATION_DEGREES` when the sun is near the horizon.
 */
export function computeEffectiveShadowLightDirection(
  solar: Pick<SolarPositionResult, "elevationDegrees" | "layoutAzimuthDegrees">,
): WorldVector3 {
  const effectiveElDeg = Math.max(
    MIN_SHADOW_ELEVATION_DEGREES,
    Math.min(88, solar.elevationDegrees),
  );
  const elRad = (effectiveElDeg * Math.PI) / 180;
  const azRad = (solar.layoutAzimuthDegrees * Math.PI) / 180;

  const cosEl = Math.cos(elRad);
  const x = cosEl * Math.sin(azRad);
  const y = Math.sin(elRad);
  const z = -cosEl * Math.cos(azRad);
  const len = Math.hypot(x, y, z) || 1;

  return {
    x: Number((x / len).toFixed(6)),
    y: Number((y / len).toFixed(6)),
    z: Number((z / len).toFixed(6)),
  };
}

/**
 * Snaps orthographic frustum bounds (`minX, maxX, minY, maxY`) in light-view space to discrete
 * shadow map texel increments so small sub-degree solar movements never cause shadow edges to shimmer.
 */
export function stabilizeShadowFrustum(params: {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly fixedSpan: number;
  readonly shadowMapSize: number;
}): {
  readonly left: number;
  readonly right: number;
  readonly bottom: number;
  readonly top: number;
  readonly texelSizeMeters: number;
} {
  const { minX, maxX, minY, maxY, fixedSpan, shadowMapSize } = params;
  const safeMapSize = Math.max(256, shadowMapSize);
  const span = Math.max(fixedSpan, maxX - minX, maxY - minY, 4);
  const texelSizeMeters = span / safeMapSize;

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  const snappedCenterX = Math.round(centerX / texelSizeMeters) * texelSizeMeters;
  const snappedCenterY = Math.round(centerY / texelSizeMeters) * texelSizeMeters;
  const halfSpan = span / 2;

  return {
    left: Number((snappedCenterX - halfSpan).toFixed(4)),
    right: Number((snappedCenterX + halfSpan).toFixed(4)),
    bottom: Number((snappedCenterY - halfSpan).toFixed(4)),
    top: Number((snappedCenterY + halfSpan).toFixed(4)),
    texelSizeMeters: Number(texelSizeMeters.toFixed(6)),
  };
}

/**
 * Computes complete orthographic shadow camera parameters and directional light transform
 * for a given `StoreLayout`, `SolarPositionResult`, and `shadowMapSize`.
 */
export function computeShadowCameraFit(
  layout: StoreLayout,
  solar: Pick<SolarPositionResult, "elevationDegrees" | "layoutAzimuthDegrees" | "shadowFloorDirection">,
  shadowMapSize = 2048,
): ShadowFrustumFit {
  const volume = computeShadowBoundingVolume(layout);
  const lightDir = computeEffectiveShadowLightDirection(solar);

  const distance = Math.max(12, volume.radius * 2.4);
  const targetPosition: WorldVector3 = {
    x: Number(volume.centerX.toFixed(4)),
    y: 0,
    z: Number(volume.centerZ.toFixed(4)),
  };
  const lightPosition: WorldVector3 = {
    x: Number((targetPosition.x + lightDir.x * distance).toFixed(4)),
    y: Number((targetPosition.y + lightDir.y * distance).toFixed(4)),
    z: Number((targetPosition.z + lightDir.z * distance).toFixed(4)),
  };

  // Build light view matrix looking from lightPosition to targetPosition
  const tempCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  tempCamera.position.set(lightPosition.x, lightPosition.y, lightPosition.z);
  tempCamera.up.set(0, 1, 0);
  tempCamera.lookAt(targetPosition.x, targetPosition.y, targetPosition.z);
  tempCamera.updateMatrixWorld(true);

  const invLightMatrix = tempCamera.matrixWorldInverse;
  const corner = new THREE.Vector3();

  let lMinX = Infinity;
  let lMaxX = -Infinity;
  let lMinY = Infinity;
  let lMaxY = -Infinity;
  let lMinZ = Infinity;
  let lMaxZ = -Infinity;

  const xs = [volume.minX, volume.maxX];
  const ys = [volume.minY, volume.maxY];
  const zs = [volume.minZ, volume.maxZ];

  for (const x of xs) {
    for (const y of ys) {
      for (const z of zs) {
        corner.set(x, y, z).applyMatrix4(invLightMatrix);
        lMinX = Math.min(lMinX, corner.x);
        lMaxX = Math.max(lMaxX, corner.x);
        lMinY = Math.min(lMinY, corner.y);
        lMaxY = Math.max(lMaxY, corner.y);
        // In Three.js camera view space, objects in front of the camera have negative Z
        const depthFromLight = -corner.z;
        lMinZ = Math.min(lMinZ, depthFromLight);
        lMaxZ = Math.max(lMaxZ, depthFromLight);
      }
    }
  }

  const fixedSpan = volume.radius * 2.08;
  const stabilized = stabilizeShadowFrustum({
    minX: lMinX,
    maxX: lMaxX,
    minY: lMinY,
    maxY: lMaxY,
    fixedSpan,
    shadowMapSize,
  });

  const near = Number(Math.max(0.5, lMinZ - 2.0).toFixed(4));
  const far = Number(Math.max(near + 10, lMaxZ + 4.0).toFixed(4));

  // Scale bias & normalBias proportionally to texel size so both 2x2m and 30x30m rooms avoid acne & peter-panning
  const roomScale = Math.max(layout.width, layout.depth) / 10;
  const bias = Number((-0.00035 - Math.min(0.00055, roomScale * 0.00012)).toFixed(6));
  const normalBias = Number((0.016 + Math.min(0.024, stabilized.texelSizeMeters * 0.85)).toFixed(4));

  return {
    lightPosition,
    targetPosition,
    effectiveLightDirection: lightDir,
    shadowFloorDirection: solar.shadowFloorDirection,
    left: stabilized.left,
    right: stabilized.right,
    top: stabilized.top,
    bottom: stabilized.bottom,
    near,
    far,
    bias,
    normalBias,
    shadowMapSize,
    texelSizeMeters: stabilized.texelSizeMeters,
  };
}

/**
 * Applies a computed `ShadowFrustumFit` directly to a `THREE.DirectionalLight` without reallocating
 * its shadow map unless `shadowMapSize` actually changed.
 */
export function applyShadowFitToLight(
  light: THREE.DirectionalLight,
  fit: ShadowFrustumFit,
): { readonly resizedShadowMap: boolean } {
  light.position.set(fit.lightPosition.x, fit.lightPosition.y, fit.lightPosition.z);
  light.target.position.set(fit.targetPosition.x, fit.targetPosition.y, fit.targetPosition.z);
  light.target.updateMatrixWorld(true);
  light.updateMatrixWorld(true);

  const shadowCamera = light.shadow.camera;
  shadowCamera.position.copy(light.position);
  shadowCamera.up.set(0, 1, 0);
  shadowCamera.lookAt(fit.targetPosition.x, fit.targetPosition.y, fit.targetPosition.z);
  shadowCamera.left = fit.left;
  shadowCamera.right = fit.right;
  shadowCamera.top = fit.top;
  shadowCamera.bottom = fit.bottom;
  shadowCamera.near = fit.near;
  shadowCamera.far = fit.far;
  shadowCamera.updateProjectionMatrix();
  shadowCamera.updateMatrixWorld(true);

  light.shadow.bias = fit.bias;
  light.shadow.normalBias = fit.normalBias;

  let resizedShadowMap = false;
  if (
    light.shadow.mapSize.x !== fit.shadowMapSize ||
    light.shadow.mapSize.y !== fit.shadowMapSize
  ) {
    light.shadow.mapSize.set(fit.shadowMapSize, fit.shadowMapSize);
    light.shadow.map?.dispose();
    light.shadow.map = null;
    resizedShadowMap = true;
  }

  return { resizedShadowMap };
}
