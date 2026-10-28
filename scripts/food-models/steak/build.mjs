/**
 * Procedural 3D model builder for `steak` (สเต๊ก) — feat-106.
 * Uses frozen shared helpers from `scripts/food-models/shared/index.mjs`.
 * Produces `Vessel` (steak plate), `FoodFull`, `FoodPartial`, `FoodEmpty`, and `Utensil` (fork + knife).
 */
import * as THREE from "three";
import {
  FOOD_PALETTE,
  assembleFoodModel,
  buildForkGeometry,
  buildKnifeGeometry,
  buildPlateVessel,
  createFoodMaterial,
  createMergedMesh,
  transformGeometry,
} from "../shared/index.mjs";

export const foodId = "steak";

export const STEAK_ANCHORS = Object.freeze({
  baseOrigin: [0, 0, 0],
  rimGrip: [-0.118, 0.018, 0],
  utensilRest: [0.076, 0.022, 0.015],
  biteTarget: [-0.018, 0.038, 0.01],
});

function buildSteakCut(lite, scaleX = 1.0, offsetX = -0.018) {
  const segs = lite ? 12 : 20;
  const slab = transformGeometry(new THREE.CylinderGeometry(0.046 * scaleX, 0.048 * scaleX, 0.02, segs), {
    position: [offsetX, 0.018, 0.012],
    rotation: [0, 0.25, 0],
    scale: [1.22, 1, 0.82],
  });
  return [slab];
}

function buildGrillStripes(scaleX = 1.0, offsetX = -0.018) {
  const stripes = [];
  const count = scaleX > 0.7 ? 3 : 2;
  for (let i = 0; i < count; i++) {
    const dx = offsetX + (i - (count - 1) / 2) * 0.018;
    stripes.push(
      transformGeometry(new THREE.BoxGeometry(0.004, 0.002, 0.048), {
        position: [dx, 0.0285, 0.012],
        rotation: [0, 0.55, 0],
      }),
    );
  }
  return stripes;
}

function buildButterPat(lite, offsetX = -0.018) {
  const segs = lite ? 8 : 12;
  return [
    transformGeometry(new THREE.CylinderGeometry(0.011, 0.012, 0.005, segs), {
      position: [offsetX, 0.0305, 0.012],
    }),
  ];
}

function buildPotatoWedges(count = 4) {
  const poses = [
    { pos: [0.038, 0.014, -0.038], rot: [0.1, 0.4, 0.15] },
    { pos: [0.052, 0.015, -0.022], rot: [-0.15, -0.3, 0.1] },
    { pos: [0.026, 0.016, -0.052], rot: [0.2, 0.8, -0.1] },
    { pos: [0.044, 0.021, -0.034], rot: [0.05, -0.6, 0.2] },
  ];
  return poses.slice(0, count).map((p) =>
    transformGeometry(new THREE.BoxGeometry(0.032, 0.009, 0.011), {
      position: p.pos,
      rotation: p.rot,
    }),
  );
}

function buildBroccoliFlorets(lite, count = 2) {
  const segs = lite ? 6 : 10;
  const coords = [
    [-0.048, 0.018, -0.038],
    [-0.026, 0.017, -0.052],
  ];
  return coords.slice(0, count).map((pos) =>
    transformGeometry(new THREE.SphereGeometry(0.015, segs, segs), {
      position: pos,
      scale: [1.05, 0.85, 1.05],
    }),
  );
}

export default function buildSteakModel({ lite = false } = {}) {
  const vessel = buildPlateVessel({
    lite,
    outerRadius: 0.125,
    height: 0.022,
    wellFloorY: 0.008,
    color: FOOD_PALETTE.steakPlateDark,
  });

  const meatMat = createFoodMaterial("SteakMeatMat", 0x6e3b26, { roughness: 0.68 });
  const searMat = createFoodMaterial("SteakSearMat", 0x3b1d11, { roughness: 0.78 });
  const butterMat = createFoodMaterial("SteakButterMat", 0xf5dc7a, { roughness: 0.42 });
  const potatoMat = createFoodMaterial("SteakPotatoMat", 0xe0a948, { roughness: 0.65 });
  const broccoliMat = createFoodMaterial("SteakBroccoliMat", 0x4b8f3b, { roughness: 0.65 });

  // ── 1. FoodFull: Full seared steak + grill marks + herb butter + potato wedges + broccoli ──
  const fullGroup = new THREE.Group();
  fullGroup.name = "FoodFull";
  fullGroup.add(
    createMergedMesh("SteakFullMeat", buildSteakCut(lite, 1.0, -0.016), meatMat),
    createMergedMesh("SteakFullSear", buildGrillStripes(1.0, -0.016), searMat),
    createMergedMesh("SteakFullButter", buildButterPat(lite, -0.016), butterMat),
    createMergedMesh("SteakFullPotato", buildPotatoWedges(4), potatoMat),
    createMergedMesh("SteakFullBroccoli", buildBroccoliFlorets(lite, 2), broccoliMat),
  );

  // ── 2. FoodPartial: Half steak cut + bite pieces + 2 potato wedges + 1 broccoli ──
  const partialGroup = new THREE.Group();
  partialGroup.name = "FoodPartial";
  const bitePiece = transformGeometry(new THREE.BoxGeometry(0.018, 0.016, 0.016), {
    position: [0.016, 0.016, 0.024],
    rotation: [0, 0.4, 0],
  });
  partialGroup.add(
    createMergedMesh("SteakPartialMeat", [...buildSteakCut(lite, 0.58, -0.028), bitePiece], meatMat),
    createMergedMesh("SteakPartialSear", buildGrillStripes(0.58, -0.028), searMat),
    createMergedMesh("SteakPartialPotato", buildPotatoWedges(2), potatoMat),
    createMergedMesh("SteakPartialBroccoli", buildBroccoliFlorets(lite, 1), broccoliMat),
  );

  // ── 3. FoodEmpty: Jus glaze drops & tiny potato crumb on the plate well ──
  const emptyGroup = new THREE.Group();
  emptyGroup.name = "FoodEmpty";
  const jusDrops = [
    transformGeometry(new THREE.CylinderGeometry(0.018, 0.02, 0.002, lite ? 6 : 10), {
      position: [-0.015, 0.009, 0.012],
    }),
    transformGeometry(new THREE.CylinderGeometry(0.009, 0.01, 0.002, lite ? 6 : 8), {
      position: [0.016, 0.009, -0.014],
    }),
  ];
  emptyGroup.add(createMergedMesh("SteakEmptyJus", jusDrops, meatMat));

  // ── 4. Utensil: Fork & Knife resting neatly inside the plate footprint ──
  const forkGeos = buildForkGeometry({ lite, length: 0.115 }).map((g) =>
    transformGeometry(g, {
      position: [-0.056, 0.021, 0.042],
      rotation: [0.03, 0.65, 0.06],
    }),
  );
  const knifeGeos = buildKnifeGeometry({ length: 0.12 }).map((g) =>
    transformGeometry(g, {
      position: [0.054, 0.021, 0.038],
      rotation: [0.03, -0.58, -0.06],
    }),
  );
  const utensilMesh = createMergedMesh(
    "SteakForkKnife",
    [...forkGeos, ...knifeGeos],
    createFoodMaterial("SteakUtensilMat", FOOD_PALETTE.stainlessSteel, { roughness: 0.28, metalness: 0.7 }),
  );

  return assembleFoodModel({
    foodId,
    lite,
    vessel,
    foodFull: fullGroup,
    foodPartial: partialGroup,
    foodEmpty: emptyGroup,
    utensil: utensilMesh,
    anchors: STEAK_ANCHORS,
  });
}

