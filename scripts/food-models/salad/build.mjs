/**
 * Procedural 3D model builder for `salad` (สลัด) — feat-107.
 * Uses frozen shared helpers from `scripts/food-models/shared/index.mjs`.
 * Produces `Vessel` (salad bowl), `FoodFull`, `FoodPartial`, `FoodEmpty`, and `Utensil` (salad fork).
 */
import * as THREE from "three";
import {
  FOOD_PALETTE,
  assembleFoodModel,
  buildBowlVessel,
  buildForkGeometry,
  createFoodMaterial,
  createMergedMesh,
  transformGeometry,
} from "../shared/index.mjs";

export const foodId = "salad";

export const SALAD_ANCHORS = Object.freeze({
  baseOrigin: [0, 0, 0],
  rimGrip: [-0.102, 0.044, 0],
  utensilRest: [0.062, 0.048, 0.016],
  biteTarget: [0, 0.054, 0],
});

function buildLettuceClusters(lite, count, yBase, spreadRadius) {
  const segsW = lite ? 7 : 12;
  const segsH = lite ? 5 : 9;
  const leaves = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + 0.25;
    const r = (i === 0 ? 0.01 : spreadRadius * (0.55 + (i % 2) * 0.28));
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    const y = yBase + (i === 0 ? 0.012 : (i % 3) * 0.004);
    leaves.push(
      transformGeometry(new THREE.SphereGeometry(0.026, segsW, segsH), {
        position: [x, y, z],
        rotation: [0.35 * Math.sin(angle), angle, 0.35 * Math.cos(angle)],
        scale: [1.35, 0.52, 1.05],
      }),
    );
  }
  return leaves;
}

function buildPurpleCabbageLeaves(lite, count, yBase) {
  const segsW = lite ? 6 : 10;
  const segsH = lite ? 5 : 8;
  const poses = [
    { pos: [-0.024, yBase + 0.01, -0.018], rot: [0.25, 0.8, -0.2] },
    { pos: [0.026, yBase + 0.009, 0.016], rot: [-0.25, -0.6, 0.22] },
    { pos: [0.004, yBase + 0.012, -0.026], rot: [0.2, 1.4, -0.18] },
  ];
  return poses.slice(0, count).map((p) =>
    transformGeometry(new THREE.SphereGeometry(0.02, segsW, segsH), {
      position: p.pos,
      rotation: p.rot,
      scale: [1.25, 0.45, 0.9],
    }),
  );
}

function buildCherryTomatoes(lite, count, yBase) {
  const segsW = lite ? 6 : 10;
  const segsH = lite ? 5 : 8;
  const coords = [
    [-0.032, yBase + 0.014, 0.014],
    [0.028, yBase + 0.014, -0.022],
    [0.002, yBase + 0.018, 0.026],
  ];
  return coords.slice(0, count).map((pos) =>
    transformGeometry(new THREE.SphereGeometry(0.012, segsW, segsH), {
      position: pos,
      scale: [1, 0.92, 1],
    }),
  );
}

function buildCroutonsAndCorn(count, yBase) {
  const poses = [
    { pos: [-0.014, yBase + 0.018, -0.008], rot: [0.2, 0.5, 0.1], size: 0.011 },
    { pos: [0.018, yBase + 0.016, 0.006], rot: [-0.1, 0.9, 0.2], size: 0.01 },
    { pos: [-0.008, yBase + 0.015, 0.018], rot: [0.3, -0.4, 0.15], size: 0.008 },
    { pos: [0.012, yBase + 0.017, -0.016], rot: [0.1, 0.2, -0.2], size: 0.008 },
  ];
  return poses.slice(0, count).map((p) =>
    transformGeometry(new THREE.BoxGeometry(p.size, p.size * 0.75, p.size), {
      position: p.pos,
      rotation: p.rot,
    }),
  );
}

export default function buildSaladModel({ lite = false } = {}) {
  const vessel = buildBowlVessel({
    lite,
    outerRadius: 0.11,
    footRadius: 0.06,
    height: 0.056,
    innerFloorY: 0.014,
    wallThickness: 0.008,
    color: FOOD_PALETTE.saladBowlWhite,
  });

  const greenMat = createFoodMaterial("SaladGreenMat", 0x58a64e, { roughness: 0.58 });
  const purpleMat = createFoodMaterial("SaladPurpleMat", 0x7d3c70, { roughness: 0.62 });
  const tomatoMat = createFoodMaterial("SaladTomatoMat", 0xd94f3d, { roughness: 0.45 });
  const croutonMat = createFoodMaterial("SaladCroutonMat", 0xe8b94f, { roughness: 0.68 });

  // ── 1. FoodFull: Abundant multi-color salad leaves + cherry tomatoes + golden croutons ──
  const fullGroup = new THREE.Group();
  fullGroup.name = "FoodFull";
  const fullY = 0.032;
  fullGroup.add(
    createMergedMesh("SaladFullGreens", buildLettuceClusters(lite, lite ? 5 : 7, fullY, 0.046), greenMat),
    createMergedMesh("SaladFullPurple", buildPurpleCabbageLeaves(lite, 3, fullY), purpleMat),
    createMergedMesh("SaladFullTomatoes", buildCherryTomatoes(lite, 3, fullY), tomatoMat),
    createMergedMesh("SaladFullCroutons", buildCroutonsAndCorn(4, fullY), croutonMat),
  );

  // ── 2. FoodPartial: Half-eaten salad with fewer leaves, 1 tomato, 2 croutons ──
  const partialGroup = new THREE.Group();
  partialGroup.name = "FoodPartial";
  const partialY = 0.024;
  partialGroup.add(
    createMergedMesh("SaladPartialGreens", buildLettuceClusters(lite, lite ? 3 : 4, partialY, 0.034), greenMat),
    createMergedMesh("SaladPartialPurple", buildPurpleCabbageLeaves(lite, 1, partialY), purpleMat),
    createMergedMesh("SaladPartialTomato", buildCherryTomatoes(lite, 1, partialY), tomatoMat),
    createMergedMesh("SaladPartialCroutons", buildCroutonsAndCorn(2, partialY), croutonMat),
  );

  // ── 3. FoodEmpty: Tiny leftover lettuce shred & dressing drop at bottom of bowl ──
  const emptyGroup = new THREE.Group();
  emptyGroup.name = "FoodEmpty";
  const shred = transformGeometry(new THREE.CylinderGeometry(0.014, 0.016, 0.0025, lite ? 6 : 10), {
    position: [-0.01, 0.016, 0.008],
    scale: [1.2, 1, 0.7],
  });
  emptyGroup.add(createMergedMesh("SaladEmptyShred", [shred], greenMat));

  // ── 4. Utensil: Salad fork resting inside the bowl rim ──
  const forkGeos = buildForkGeometry({ lite, length: 0.115 }).map((g) =>
    transformGeometry(g, {
      position: [0.044, 0.048, 0.016],
      rotation: [0.06, -0.45, -0.14],
    }),
  );
  const utensilMesh = createMergedMesh(
    "SaladFork",
    forkGeos,
    createFoodMaterial("SaladForkMat", FOOD_PALETTE.stainlessSteel, { roughness: 0.3, metalness: 0.65 }),
  );

  return assembleFoodModel({
    foodId,
    lite,
    vessel,
    foodFull: fullGroup,
    foodPartial: partialGroup,
    foodEmpty: emptyGroup,
    utensil: utensilMesh,
    anchors: SALAD_ANCHORS,
  });
}
