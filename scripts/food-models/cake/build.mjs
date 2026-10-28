/**
 * Procedural 3D model builder for `cake` (เค้ก) — feat-108.
 * Uses frozen shared helpers from `scripts/food-models/shared/index.mjs`.
 * Produces `Vessel` (dessert plate), `FoodFull`, `FoodPartial`, `FoodEmpty`, and `Utensil` (dessert fork).
 */
import * as THREE from "three";
import {
  FOOD_PALETTE,
  assembleFoodModel,
  buildForkGeometry,
  buildPlateVessel,
  createFoodMaterial,
  createMergedMesh,
  transformGeometry,
} from "../shared/index.mjs";

export const foodId = "cake";

export const CAKE_ANCHORS = Object.freeze({
  baseOrigin: [0, 0, 0],
  rimGrip: [-0.088, 0.015, 0],
  utensilRest: [0.056, 0.018, 0.014],
  biteTarget: [-0.008, 0.046, 0],
});

/**
 * Builds a triangular wedge prism in the XZ plane with height along Y.
 * `tipLength` controls how far the wedge extends toward the tip (1.0 = full wedge, 0.55 = half-eaten wedge).
 */
function buildWedgePrism({ radius = 0.068, angleSpan = 0.85, height = 0.012, yBottom = 0.008, tipStart = 0 }) {
  const shape = new THREE.Shape();
  const halfAngle = angleSpan / 2;
  const backX = -radius * 0.45;
  const tipX = radius * (0.55 - tipStart);
  const backHalfZ = Math.sin(halfAngle) * radius;
  const tipHalfZ = Math.max(0.004, backHalfZ * tipStart);

  shape.moveTo(backX, -backHalfZ);
  shape.lineTo(tipX, -tipHalfZ);
  shape.lineTo(tipX, tipHalfZ);
  shape.lineTo(backX, backHalfZ);
  shape.closePath();

  const extrude = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
    steps: 1,
  });
  // ExtrudeGeometry extrudes along +Z; rotate so shape lies in XZ and height goes along +Y
  return transformGeometry(extrude, {
    position: [-0.008, yBottom + height, 0],
    rotation: [Math.PI / 2, 0.22, 0],
  });
}

function buildCreamSwirlAndBerry(lite, xPos = -0.022, yBase = 0.048) {
  const segs = lite ? 8 : 14;
  const cream = transformGeometry(new THREE.SphereGeometry(0.011, segs, segs), {
    position: [xPos, yBase, -0.004],
    scale: [1.1, 0.72, 1.1],
  });
  const berry = transformGeometry(new THREE.ConeGeometry(0.0095, 0.016, segs), {
    position: [xPos, yBase + 0.01, -0.004],
    rotation: [0.12, 0, -0.15],
  });
  return { cream, berry };
}

export default function buildCakeModel({ lite = false } = {}) {
  const vessel = buildPlateVessel({
    lite,
    outerRadius: 0.095,
    height: 0.018,
    wellFloorY: 0.007,
    color: FOOD_PALETTE.dessertPlateWhite,
  });

  const spongeMat = createFoodMaterial("CakeSpongeMat", 0xf2cfa0, { roughness: 0.75 });
  const creamMat = createFoodMaterial("CakeCreamMat", 0xfffaf2, { roughness: 0.48 });
  const pinkFrostingMat = createFoodMaterial("CakeFrostingMat", 0xf3b8c4, { roughness: 0.52 });
  const berryMat = createFoodMaterial("CakeStrawberryMat", 0xd83b48, { roughness: 0.42 });

  // ── 1. FoodFull: Complete multi-layer cake wedge + cream + strawberry topping ──
  const fullGroup = new THREE.Group();
  fullGroup.name = "FoodFull";
  const spongeBottom = buildWedgePrism({ radius: 0.068, height: 0.013, yBottom: 0.008, tipStart: 0 });
  const creamMid = buildWedgePrism({ radius: 0.068, height: 0.007, yBottom: 0.021, tipStart: 0 });
  const spongeTop = buildWedgePrism({ radius: 0.068, height: 0.013, yBottom: 0.028, tipStart: 0 });
  const topFrosting = buildWedgePrism({ radius: 0.069, height: 0.005, yBottom: 0.041, tipStart: 0 });
  const fullTop = buildCreamSwirlAndBerry(lite, -0.022, 0.048);

  fullGroup.add(
    createMergedMesh("CakeFullSponge", [spongeBottom, spongeTop], spongeMat),
    createMergedMesh("CakeFullCream", [creamMid, fullTop.cream], creamMat),
    createMergedMesh("CakeFullFrosting", [topFrosting], pinkFrostingMat),
    createMergedMesh("CakeFullBerry", [fullTop.berry], berryMat),
  );

  // ── 2. FoodPartial: Half-eaten wedge with front tip eaten away + sponge crumbs ──
  const partialGroup = new THREE.Group();
  partialGroup.name = "FoodPartial";
  const pSpongeBottom = buildWedgePrism({ radius: 0.068, height: 0.013, yBottom: 0.008, tipStart: 0.42 });
  const pCreamMid = buildWedgePrism({ radius: 0.068, height: 0.007, yBottom: 0.021, tipStart: 0.42 });
  const pSpongeTop = buildWedgePrism({ radius: 0.068, height: 0.013, yBottom: 0.028, tipStart: 0.42 });
  const pTopFrosting = buildWedgePrism({ radius: 0.069, height: 0.005, yBottom: 0.041, tipStart: 0.42 });
  const pCrumb = transformGeometry(new THREE.BoxGeometry(0.009, 0.006, 0.008), {
    position: [0.014, 0.011, 0.008],
    rotation: [0, 0.5, 0],
  });

  partialGroup.add(
    createMergedMesh("CakePartialSponge", [pSpongeBottom, pSpongeTop, pCrumb], spongeMat),
    createMergedMesh("CakePartialCream", [pCreamMid], creamMat),
    createMergedMesh("CakePartialFrosting", [pTopFrosting], pinkFrostingMat),
  );

  // ── 3. FoodEmpty: Cake crumbs & cream smudge left on dessert plate ──
  const emptyGroup = new THREE.Group();
  emptyGroup.name = "FoodEmpty";
  const crumbs = [
    transformGeometry(new THREE.BoxGeometry(0.006, 0.003, 0.005), { position: [-0.012, 0.0085, 0.006], rotation: [0, 0.4, 0] }),
    transformGeometry(new THREE.BoxGeometry(0.005, 0.0025, 0.004), { position: [0.008, 0.0085, -0.01], rotation: [0, -0.6, 0] }),
  ];
  const smudge = transformGeometry(new THREE.CylinderGeometry(0.011, 0.012, 0.0018, lite ? 6 : 8), {
    position: [-0.004, 0.008, -0.004],
  });
  emptyGroup.add(
    createMergedMesh("CakeEmptyCrumbs", crumbs, spongeMat),
    createMergedMesh("CakeEmptySmudge", [smudge], pinkFrostingMat),
  );

  // ── 4. Utensil: Dessert fork resting inside the plate footprint ──
  const forkGeos = buildForkGeometry({ lite, length: 0.098 }).map((g) =>
    transformGeometry(g, {
      position: [0.036, 0.016, 0.022],
      rotation: [0.03, -0.62, -0.06],
    }),
  );
  const utensilMesh = createMergedMesh(
    "CakeDessertFork",
    forkGeos,
    createFoodMaterial("CakeForkMat", FOOD_PALETTE.stainlessSteel, { roughness: 0.28, metalness: 0.68 }),
  );

  return assembleFoodModel({
    foodId,
    lite,
    vessel,
    foodFull: fullGroup,
    foodPartial: partialGroup,
    foodEmpty: emptyGroup,
    utensil: utensilMesh,
    anchors: CAKE_ANCHORS,
  });
}

