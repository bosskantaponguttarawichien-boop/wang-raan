/**
 * Procedural 3D model builder for `fried-rice` (ข้าวผัด) — feat-104.
 * Uses frozen shared helpers from `scripts/food-models/shared/index.mjs`.
 * Produces `Vessel`, `FoodFull`, `FoodPartial`, `FoodEmpty`, and `Utensil` (spoon).
 */
import * as THREE from "three";
import {
  FOOD_PALETTE,
  assembleFoodModel,
  buildPlateVessel,
  buildSpoonGeometry,
  createFoodMaterial,
  createMergedMesh,
  transformGeometry,
} from "../shared/index.mjs";

export const foodId = "fried-rice";

export const FRIED_RICE_ANCHORS = Object.freeze({
  baseOrigin: [0, 0, 0],
  rimGrip: [-0.11, 0.018, 0],
  utensilRest: [0.068, 0.024, 0.018],
  biteTarget: [-0.01, 0.048, 0],
});

function buildCucumberSlices(lite) {
  const segs = lite ? 8 : 14;
  const poses = [
    { pos: [-0.068, 0.017, -0.042], rot: [0.18, 0.4, -0.22] },
    { pos: [-0.052, 0.019, -0.056], rot: [0.22, 0.5, -0.18] },
    { pos: [-0.034, 0.021, -0.064], rot: [0.25, 0.6, -0.14] },
  ];
  return poses.map((p) =>
    transformGeometry(new THREE.CylinderGeometry(0.016, 0.016, 0.004, segs), {
      position: p.pos,
      rotation: p.rot,
    }),
  );
}

function buildTomatoWedges(lite, count = 2) {
  const segs = lite ? 6 : 10;
  const poses = [
    { pos: [0.048, 0.018, -0.048], rot: [0.2, -0.5, 0.3], scale: [1.1, 0.55, 0.7] },
    { pos: [0.062, 0.017, -0.024], rot: [-0.15, -0.8, 0.25], scale: [1.0, 0.5, 0.68] },
  ];
  return poses.slice(0, count).map((p) =>
    transformGeometry(new THREE.SphereGeometry(0.014, segs, segs), {
      position: p.pos,
      rotation: p.rot,
      scale: p.scale,
    }),
  );
}

function buildGarnishBits(lite, radiusScale = 1, heightBase = 0.042) {
  const bits = [];
  const count = lite ? 5 : 9;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + 0.3;
    const r = (0.012 + (i % 3) * 0.011) * radiusScale;
    const x = Math.cos(angle) * r - 0.008;
    const z = Math.sin(angle) * r + 0.004;
    const y = heightBase - r * 0.32;
    bits.push(
      transformGeometry(new THREE.BoxGeometry(0.006, 0.0035, 0.006), {
        position: [x, y, z],
        rotation: [0.2 * i, 0.5 * i, 0.1 * i],
      }),
    );
  }
  return bits;
}

export default function buildFriedRiceModel({ lite = false } = {}) {
  const vessel = buildPlateVessel({
    lite,
    outerRadius: 0.12,
    height: 0.022,
    wellFloorY: 0.008,
    color: FOOD_PALETTE.ceramicWarmWhite,
  });

  const riceMat = createFoodMaterial("FriedRiceMoundMat", 0xe3a83b, { roughness: 0.78 });
  const greenMat = createFoodMaterial("FriedRiceGreenMat", 0x4e9a51, { roughness: 0.62 });
  const tomatoMat = createFoodMaterial("FriedRiceTomatoMat", 0xd64535, { roughness: 0.52 });
  const eggMat = createFoodMaterial("FriedRiceEggMat", 0xf7d560, { roughness: 0.68 });

  const domeW = lite ? 12 : 22;
  const domeH = lite ? 6 : 12;

  // ── 1. FoodFull: Rounded golden fried rice dome + egg bits + cucumber slices + tomato wedges ──
  const fullGroup = new THREE.Group();
  fullGroup.name = "FoodFull";

  const fullMound = transformGeometry(
    new THREE.SphereGeometry(0.064, domeW, domeH, 0, Math.PI * 2, 0, Math.PI * 0.52),
    {
      position: [-0.008, 0.009, 0.004],
      scale: [1.04, 0.72, 0.98],
    },
  );
  const fullEggBits = buildGarnishBits(lite, 1.0, 0.052);
  fullGroup.add(
    createMergedMesh("RiceFullMound", [fullMound], riceMat),
    createMergedMesh("RiceFullEgg", fullEggBits, eggMat),
    createMergedMesh(
      "RiceFullGreens",
      [...buildCucumberSlices(lite), ...buildGarnishBits(lite, 0.75, 0.054)],
      greenMat,
    ),
    createMergedMesh("RiceFullTomato", buildTomatoWedges(lite, 2), tomatoMat),
  );

  // ── 2. FoodPartial: Half-eaten mound with bite indentation + remaining cucumber/tomato ──
  const partialGroup = new THREE.Group();
  partialGroup.name = "FoodPartial";

  const partialMound = transformGeometry(
    new THREE.SphereGeometry(0.046, Math.max(8, domeW - 4), Math.max(5, domeH - 2), 0, Math.PI * 1.45, 0, Math.PI * 0.5),
    {
      position: [-0.022, 0.009, 0.012],
      rotation: [0, 0.4, 0],
      scale: [0.95, 0.58, 0.88],
    },
  );
  const partialScatter = transformGeometry(
    new THREE.CylinderGeometry(0.018, 0.024, 0.006, lite ? 6 : 10),
    {
      position: [0.015, 0.011, -0.01],
    },
  );
  partialGroup.add(
    createMergedMesh("RicePartialMound", [partialMound, partialScatter], riceMat),
    createMergedMesh("RicePartialGreens", buildCucumberSlices(lite).slice(0, 2), greenMat),
    createMergedMesh("RicePartialTomato", buildTomatoWedges(lite, 1), tomatoMat),
  );

  // ── 3. FoodEmpty: Scattered leftover rice grains & cucumber peel on the plate well ──
  const emptyGroup = new THREE.Group();
  emptyGroup.name = "FoodEmpty";

  const crumbs = [
    transformGeometry(new THREE.BoxGeometry(0.008, 0.0025, 0.005), { position: [-0.018, 0.0095, 0.014], rotation: [0, 0.5, 0] }),
    transformGeometry(new THREE.BoxGeometry(0.007, 0.0022, 0.0045), { position: [0.012, 0.0095, -0.012], rotation: [0, -0.8, 0] }),
    transformGeometry(new THREE.BoxGeometry(0.006, 0.002, 0.004), { position: [-0.004, 0.0095, -0.022], rotation: [0, 0.2, 0] }),
  ];
  emptyGroup.add(createMergedMesh("RiceEmptyCrumbs", crumbs, riceMat));

  // ── 4. Utensil: Short Thai dining spoon resting inside the right rim ──
  const spoonGeos = buildSpoonGeometry({ lite, length: 0.115 }).map((g) =>
    transformGeometry(g, {
      position: [0.048, 0.022, 0.015],
      rotation: [0.04, -0.58, -0.08],
    }),
  );
  const utensilMesh = createMergedMesh(
    "FriedRiceSpoon",
    spoonGeos,
    createFoodMaterial("SpoonMat", FOOD_PALETTE.stainlessSteel, { roughness: 0.3, metalness: 0.65 }),
  );

  return assembleFoodModel({
    foodId,
    lite,
    vessel,
    foodFull: fullGroup,
    foodPartial: partialGroup,
    foodEmpty: emptyGroup,
    utensil: utensilMesh,
    anchors: FRIED_RICE_ANCHORS,
  });
}
