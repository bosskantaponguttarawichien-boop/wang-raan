/**
 * Procedural 3D model builder for `noodles` (ก๋วยเตี๋ยว) — feat-105.
 * Uses frozen shared helpers from `scripts/food-models/shared/index.mjs`.
 * Produces `Vessel` (bowl), `FoodFull`, `FoodPartial`, `FoodEmpty`, and `Utensil` (chopsticks + soup spoon).
 */
import * as THREE from "three";
import {
  FOOD_PALETTE,
  assembleFoodModel,
  buildBowlVessel,
  buildChopsticksGeometry,
  buildSpoonGeometry,
  createFoodMaterial,
  createMergedMesh,
  transformGeometry,
} from "../shared/index.mjs";

export const foodId = "noodles";

export const NOODLES_ANCHORS = Object.freeze({
  baseOrigin: [0, 0, 0],
  rimGrip: [-0.105, 0.058, 0],
  utensilRest: [0.055, 0.072, 0.02],
  biteTarget: [0, 0.064, 0],
});

function buildBrothDisc(radius, yPos, lite) {
  const segs = lite ? 14 : 26;
  return transformGeometry(new THREE.CylinderGeometry(radius, radius * 0.94, 0.004, segs), {
    position: [0, yPos, 0],
  });
}

function buildNoodleStrands(lite, count, yBase, radiusMax) {
  const tubularSegs = lite ? 12 : 22;
  const radialSegs = lite ? 5 : 8;
  const strands = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 1.8 + 0.2;
    const r = radiusMax * (0.42 + (i % 3) * 0.16);
    const torus = new THREE.TorusGeometry(r, 0.0045, radialSegs, tubularSegs, Math.PI * 1.35);
    strands.push(
      transformGeometry(torus, {
        position: [Math.cos(angle) * 0.012, yBase + (i % 2) * 0.003, Math.sin(angle) * 0.012],
        rotation: [Math.PI / 2 + 0.12 * ((i % 3) - 1), angle, 0.15 * i],
      }),
    );
  }
  return strands;
}

function buildMeatballs(lite, count, yBase) {
  const segs = lite ? 8 : 14;
  const coords = [
    [-0.028, yBase + 0.006, -0.018],
    [0.026, yBase + 0.005, -0.022],
    [-0.006, yBase + 0.007, 0.028],
  ];
  return coords.slice(0, count).map((pos) =>
    transformGeometry(new THREE.SphereGeometry(0.014, segs, segs), {
      position: pos,
      scale: [1, 0.88, 1],
    }),
  );
}

function buildGreens(lite, count, yBase) {
  const segs = lite ? 6 : 10;
  const coords = [
    { pos: [-0.036, yBase + 0.004, 0.018], rot: [0.2, 0.5, -0.2] },
    { pos: [0.034, yBase + 0.004, 0.016], rot: [-0.2, -0.4, 0.25] },
    { pos: [0.004, yBase + 0.005, -0.036], rot: [0.15, 0.9, -0.15] },
  ];
  return coords.slice(0, count).map((c) =>
    transformGeometry(new THREE.CylinderGeometry(0.012, 0.008, 0.003, segs), {
      position: c.pos,
      rotation: c.rot,
      scale: [1.4, 1, 0.75],
    }),
  );
}

export default function buildNoodlesModel({ lite = false } = {}) {
  const vessel = buildBowlVessel({
    lite,
    outerRadius: 0.11,
    footRadius: 0.056,
    height: 0.072,
    innerFloorY: 0.016,
    wallThickness: 0.008,
    color: FOOD_PALETTE.ceramicBowl,
  });

  const brothMat = createFoodMaterial("NoodleBrothMat", 0xc88a4b, { roughness: 0.28, metalness: 0.08 });
  const noodleMat = createFoodMaterial("NoodleStrandMat", 0xf2d272, { roughness: 0.62 });
  const meatballMat = createFoodMaterial("NoodleMeatballMat", 0x9e6b52, { roughness: 0.68 });
  const greenMat = createFoodMaterial("NoodleGreenMat", 0x4b9648, { roughness: 0.58 });

  // ── 1. FoodFull: High warm broth + dense noodles + 3 meatballs + greens ──
  const fullGroup = new THREE.Group();
  fullGroup.name = "FoodFull";
  const fullY = 0.052;
  fullGroup.add(
    createMergedMesh("NoodleFullBroth", [buildBrothDisc(0.091, fullY, lite)], brothMat),
    createMergedMesh("NoodleFullStrands", buildNoodleStrands(lite, lite ? 4 : 6, fullY + 0.002, 0.055), noodleMat),
    createMergedMesh("NoodleFullMeatballs", buildMeatballs(lite, 3, fullY), meatballMat),
    createMergedMesh("NoodleFullGreens", buildGreens(lite, 3, fullY + 0.002), greenMat),
  );

  // ── 2. FoodPartial: Lower broth level + half noodles + 1 meatball + 1 green leaf ──
  const partialGroup = new THREE.Group();
  partialGroup.name = "FoodPartial";
  const partialY = 0.036;
  partialGroup.add(
    createMergedMesh("NoodlePartialBroth", [buildBrothDisc(0.078, partialY, lite)], brothMat),
    createMergedMesh("NoodlePartialStrands", buildNoodleStrands(lite, lite ? 2 : 3, partialY + 0.002, 0.042), noodleMat),
    createMergedMesh("NoodlePartialMeatball", buildMeatballs(lite, 1, partialY), meatballMat),
    createMergedMesh("NoodlePartialGreen", buildGreens(lite, 1, partialY + 0.002), greenMat),
  );

  // ── 3. FoodEmpty: Shallow leftover soup pool at the bottom of the bowl ──
  const emptyGroup = new THREE.Group();
  emptyGroup.name = "FoodEmpty";
  const emptyY = 0.02;
  emptyGroup.add(createMergedMesh("NoodleEmptyBroth", [buildBrothDisc(0.052, emptyY, lite)], brothMat));

  // ── 4. Utensil: Wooden chopsticks resting inside the bowl rim + soup spoon ──
  const chopstickGeos = buildChopsticksGeometry({ lite, length: 0.165 }).map((g) =>
    transformGeometry(g, {
      position: [0.015, 0.071, 0.036],
      rotation: [0, -0.25, -0.04],
    }),
  );
  const soupSpoonGeos = buildSpoonGeometry({ lite, length: 0.105 }).map((g) =>
    transformGeometry(g, {
      position: [-0.038, 0.062, -0.025],
      rotation: [0.1, 0.65, 0.32],
    }),
  );
  const utensilGroup = new THREE.Group();
  utensilGroup.name = "Utensil";
  utensilGroup.add(
    createMergedMesh(
      "NoodleChopsticks",
      chopstickGeos,
      createFoodMaterial("ChopstickMat", FOOD_PALETTE.woodChopstick, { roughness: 0.65 }),
    ),
    createMergedMesh(
      "NoodleSoupSpoon",
      soupSpoonGeos,
      createFoodMaterial("SoupSpoonMat", FOOD_PALETTE.soupSpoonWhite, { roughness: 0.38 }),
    ),
  );

  return assembleFoodModel({
    foodId,
    lite,
    vessel,
    foodFull: fullGroup,
    foodPartial: partialGroup,
    foodEmpty: emptyGroup,
    utensil: utensilGroup,
    anchors: NOODLES_ANCHORS,
  });
}

