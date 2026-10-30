/**
 * Shared procedural food geometry, vessel/utensil builders, materials, and validation helpers.
 * Frozen in feat-103 so feat-104..108 can build their food models independently without touching shared files.
 *
 * Units: metres (1 unit = 1 m), +Y up, +Z forward, origin (0, 0, 0) at the bottom center of Vessel.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTMeshoptCompression, KHRMeshQuantization } from "@gltf-transform/extensions";
import { dedup, prune, quantize, reorder } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";

export const FOOD_IDS = Object.freeze(["fried-rice", "noodles", "steak", "salad", "cake"]);

export const FOOD_NODE_NAMES = Object.freeze({
  root: "FoodRoot",
  vessel: "Vessel",
  foodFull: "FoodFull",
  foodPartial: "FoodPartial",
  foodEmpty: "FoodEmpty",
  utensil: "Utensil",
});

export const FOOD_BUDGET = Object.freeze({
  maxFullTriangles: 8000,
  maxLiteTriangles: 2000,
  maxFullBytes: 300 * 1024,
  maxLiteBytes: 100 * 1024,
  maxFootprintDiameterMeters: 0.26,
  minFootprintDiameterMeters: 0.14,
  maxHeightMeters: 0.16,
  minHeightMeters: 0.02,
  baseOriginToleranceMeters: 0.002,
});

/** Shared sRGB color palette for vessels, utensils, and common ingredients. */
export const FOOD_PALETTE = Object.freeze({
  ceramicWarmWhite: 0xf7f4ec,
  ceramicRim: 0xe6e0d2,
  ceramicBowl: 0xebe5d9,
  ceramicBowlBand: 0x3b62f4,
  steakPlateDark: 0xf3efe6,
  saladBowlWhite: 0xf8f6f0,
  dessertPlateWhite: 0xfcfaf5,
  stainlessSteel: 0xd5dce2,
  woodChopstick: 0x9c6635,
  soupSpoonWhite: 0xf5f2eb,
});

/** Creates a MeshStandardMaterial with consistent low-poly shading. */
export function createFoodMaterial(name, color, options = {}) {
  const material = new THREE.MeshStandardMaterial({
    name,
    color,
    roughness: options.roughness ?? 0.65,
    metalness: options.metalness ?? 0.05,
    flatShading: options.flatShading ?? false,
  });
  return material;
}

/** Transforms a geometry in place and returns it for chaining. */
export function transformGeometry(geometry, { position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1] } = {}) {
  const matrix = new THREE.Matrix4();
  const pos = new THREE.Vector3(position[0], position[1], position[2]);
  const euler = new THREE.Euler(rotation[0], rotation[1], rotation[2], "XYZ");
  const quat = new THREE.Quaternion().setFromEuler(euler);
  const scl = new THREE.Vector3(scale[0], scale[1], scale[2]);
  matrix.compose(pos, quat, scl);
  geometry.applyMatrix4(matrix);
  return geometry;
}

/** Merges multiple BufferGeometries into a single mesh with the given name and material. */
export function createMergedMesh(name, geometries, material) {
  const normalized = geometries.map((geo) => {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.computeVertexNormals();
    // Keep only position and normal to ensure clean merge and compact GLB
    for (const key of Object.keys(g.attributes)) {
      if (key !== "position" && key !== "normal") {
        g.deleteAttribute(key);
      }
    }
    return g;
  });
  const merged = mergeGeometries(normalized, false);
  for (const g of normalized) g.dispose();
  merged.computeVertexNormals();
  const mesh = new THREE.Mesh(merged, material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Builds a standard round plate with a flat base at y = 0, raised rim, and recessed well.
 * Outer diameter <= 0.26 m.
 */
export function buildPlateVessel({
  lite = false,
  outerRadius = 0.12,
  height = 0.022,
  wellFloorY = 0.008,
  color = FOOD_PALETTE.ceramicWarmWhite,
} = {}) {
  const radialSegments = lite ? 16 : 32;
  const points = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(outerRadius * 0.62, 0),
    new THREE.Vector2(outerRadius * 0.72, height * 0.35),
    new THREE.Vector2(outerRadius, height * 0.92),
    new THREE.Vector2(outerRadius * 0.96, height),
    new THREE.Vector2(outerRadius * 0.74, wellFloorY + 0.003),
    new THREE.Vector2(0, wellFloorY),
  ];
  const lathe = new THREE.LatheGeometry(points, radialSegments);
  const material = createFoodMaterial("VesselPlateMat", color, { roughness: 0.42, metalness: 0.04 });
  return createMergedMesh("VesselMesh", [lathe], material);
}

/**
 * Builds a deep soup/salad bowl with foot ring at y = 0, curved wall, and hollow interior.
 */
export function buildBowlVessel({
  lite = false,
  outerRadius = 0.11,
  footRadius = 0.055,
  height = 0.072,
  innerFloorY = 0.016,
  wallThickness = 0.008,
  color = FOOD_PALETTE.ceramicBowl,
} = {}) {
  const radialSegments = lite ? 16 : 32;
  const rInner = outerRadius - wallThickness;
  const points = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(footRadius, 0),
    new THREE.Vector2(footRadius * 1.05, height * 0.14),
    new THREE.Vector2(outerRadius * 0.88, height * 0.48),
    new THREE.Vector2(outerRadius, height * 0.95),
    new THREE.Vector2(outerRadius - wallThickness * 0.45, height),
    new THREE.Vector2(rInner, height * 0.94),
    new THREE.Vector2(rInner * 0.82, height * 0.45),
    new THREE.Vector2(footRadius * 0.85, innerFloorY + 0.004),
    new THREE.Vector2(0, innerFloorY),
  ];
  const lathe = new THREE.LatheGeometry(points, radialSegments);
  const material = createFoodMaterial("VesselBowlMat", color, { roughness: 0.4, metalness: 0.05 });
  return createMergedMesh("VesselMesh", [lathe], material);
}

/**
 * Builds a low-poly spoon (handle + neck + oval scoop) positioned in local coordinates.
 */
export function buildSpoonGeometry({ lite = false, length = 0.135 } = {}) {
  const segs = lite ? 8 : 14;
  const scoop = transformGeometry(new THREE.SphereGeometry(0.018, segs, Math.max(4, Math.floor(segs / 2))), {
    position: [-length * 0.28, 0.002, 0],
    scale: [1.35, 0.28, 0.92],
  });
  const handle = transformGeometry(new THREE.BoxGeometry(length * 0.68, 0.0035, 0.009), {
    position: [length * 0.16, 0.006, 0],
    rotation: [0, 0, 0.08],
  });
  return [scoop, handle];
}

/**
 * Builds a low-poly fork (handle + head + tines).
 */
export function buildForkGeometry({ lite = false, length = 0.135 } = {}) {
  const parts = [];
  const handle = transformGeometry(new THREE.BoxGeometry(length * 0.64, 0.0035, 0.0085), {
    position: [length * 0.18, 0.005, 0],
    rotation: [0, 0, 0.06],
  });
  const neck = transformGeometry(new THREE.BoxGeometry(length * 0.16, 0.003, 0.018), {
    position: [-length * 0.18, 0.0025, 0],
  });
  parts.push(handle, neck);
  const tineCount = lite ? 3 : 4;
  const span = 0.014;
  for (let i = 0; i < tineCount; i++) {
    const z = (i / (tineCount - 1) - 0.5) * span;
    parts.push(
      transformGeometry(new THREE.BoxGeometry(length * 0.2, 0.0025, 0.0024), {
        position: [-length * 0.34, 0.002, z],
      }),
    );
  }
  return parts;
}

/**
 * Builds a low-poly table knife (handle + blade).
 */
export function buildKnifeGeometry({ length = 0.145 } = {}) {
  const handle = transformGeometry(new THREE.BoxGeometry(length * 0.48, 0.0045, 0.0095), {
    position: [length * 0.22, 0.004, 0],
  });
  const blade = transformGeometry(new THREE.BoxGeometry(length * 0.52, 0.0022, 0.012), {
    position: [-length * 0.24, 0.003, 0.001],
  });
  return [handle, blade];
}

/**
 * Builds a pair of chopsticks resting across a bowl or plate.
 */
export function buildChopsticksGeometry({ lite = false, length = 0.175 } = {}) {
  const segs = lite ? 6 : 10;
  const stickA = transformGeometry(new THREE.CylinderGeometry(0.0022, 0.0035, length, segs), {
    position: [0, 0.004, -0.008],
    rotation: [0.02, 0.04, Math.PI / 2],
  });
  const stickB = transformGeometry(new THREE.CylinderGeometry(0.0022, 0.0035, length, segs), {
    position: [0, 0.004, 0.008],
    rotation: [-0.02, -0.04, Math.PI / 2],
  });
  return [stickA, stickB];
}

/**
 * Assembles the canonical food root Group with required node names (`Vessel`, `FoodFull`, `FoodPartial`, `FoodEmpty`, `Utensil`)
 * and attaches metadata (`userData.foodContract`).
 */
export function assembleFoodModel({
  foodId,
  lite = false,
  vessel,
  foodFull,
  foodPartial,
  foodEmpty,
  utensil,
  anchors,
}) {
  if (!FOOD_IDS.includes(foodId)) {
    throw new Error(`Unknown foodId: ${foodId}`);
  }
  const root = new THREE.Group();
  root.name = FOOD_NODE_NAMES.root;

  const ensureGroup = (node, requiredName) => {
    const group = node instanceof THREE.Group ? node : new THREE.Group().add(node);
    group.name = requiredName;
    return group;
  };

  const vesselGroup = ensureGroup(vessel, FOOD_NODE_NAMES.vessel);
  const fullGroup = ensureGroup(foodFull, FOOD_NODE_NAMES.foodFull);
  const partialGroup = ensureGroup(foodPartial, FOOD_NODE_NAMES.foodPartial);
  const emptyGroup = ensureGroup(foodEmpty, FOOD_NODE_NAMES.foodEmpty);
  const utensilGroup = ensureGroup(utensil, FOOD_NODE_NAMES.utensil);

  root.add(vesselGroup, fullGroup, partialGroup, emptyGroup, utensilGroup);
  root.userData.foodContract = {
    version: 1,
    foodId,
    variant: lite ? "lite" : "full",
    anchors,
    states: ["full", "partial", "empty"],
  };
  root.updateMatrixWorld(true);
  return root;
}

/** Counts triangles and vertices across an Object3D subtree. */
export function measureObjectGeometry(object) {
  let triangles = 0;
  let vertices = 0;
  let meshCount = 0;
  object.traverse((child) => {
    if (child.isMesh && child.geometry) {
      meshCount += 1;
      const pos = child.geometry.getAttribute("position");
      if (pos) vertices += pos.count;
      if (child.geometry.index) {
        triangles += child.geometry.index.count / 3;
      } else if (pos) {
        triangles += pos.count / 3;
      }
    }
  });
  return { triangles: Math.round(triangles), vertices, meshCount };
}

/** Computes world bounding box and dimensions for an Object3D. */
export function measureObjectBounds(object) {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  return {
    min: [Number(box.min.x.toFixed(4)), Number(box.min.y.toFixed(4)), Number(box.min.z.toFixed(4))],
    max: [Number(box.max.x.toFixed(4)), Number(box.max.y.toFixed(4)), Number(box.max.z.toFixed(4))],
    size: [Number(size.x.toFixed(4)), Number(size.y.toFixed(4)), Number(size.z.toFixed(4))],
    center: [Number(center.x.toFixed(4)), Number(center.y.toFixed(4)), Number(center.z.toFixed(4))],
    footprintDiameter: Number(Math.max(size.x, size.z).toFixed(4)),
    height: Number(size.y.toFixed(4)),
  };
}

/**
 * Validates that a food model satisfies all structural, origin, footprint, state, and triangle budgets.
 */
export function validateFoodModel(root, { lite = false } = {}) {
  const requiredNodes = [
    FOOD_NODE_NAMES.vessel,
    FOOD_NODE_NAMES.foodFull,
    FOOD_NODE_NAMES.foodPartial,
    FOOD_NODE_NAMES.foodEmpty,
    FOOD_NODE_NAMES.utensil,
  ];
  for (const nodeName of requiredNodes) {
    const node = root.getObjectByName(nodeName);
    if (!node) throw new Error(`Missing required food node: ${nodeName}`);
    const stats = measureObjectGeometry(node);
    if (stats.triangles <= 0) {
      throw new Error(`Required food node has no geometry: ${nodeName}`);
    }
  }

  const fullStats = measureObjectGeometry(root.getObjectByName(FOOD_NODE_NAMES.foodFull));
  const partialStats = measureObjectGeometry(root.getObjectByName(FOOD_NODE_NAMES.foodPartial));
  const emptyStats = measureObjectGeometry(root.getObjectByName(FOOD_NODE_NAMES.foodEmpty));
  if (partialStats.triangles > fullStats.triangles) {
    throw new Error(`FoodPartial (${partialStats.triangles}) should not exceed FoodFull (${fullStats.triangles}) triangles`);
  }
  if (emptyStats.triangles >= partialStats.triangles && partialStats.triangles > 20) {
    throw new Error(`FoodEmpty (${emptyStats.triangles}) should have fewer triangles than FoodPartial (${partialStats.triangles})`);
  }

  const totalStats = measureObjectGeometry(root);
  const maxTris = lite ? FOOD_BUDGET.maxLiteTriangles : FOOD_BUDGET.maxFullTriangles;
  if (totalStats.triangles <= 0 || totalStats.triangles > maxTris) {
    throw new Error(`Triangle budget exceeded (${lite ? "lite" : "full"}): ${totalStats.triangles} > ${maxTris}`);
  }

  const bounds = measureObjectBounds(root);
  const vesselBounds = measureObjectBounds(root.getObjectByName(FOOD_NODE_NAMES.vessel));
  if (Math.abs(vesselBounds.min[1]) > FOOD_BUDGET.baseOriginToleranceMeters) {
    throw new Error(`Vessel base must rest at y=0 (got min.y=${vesselBounds.min[1]})`);
  }
  if (bounds.min[1] < -FOOD_BUDGET.baseOriginToleranceMeters) {
    throw new Error(`Food model extends below y=0 (got min.y=${bounds.min[1]})`);
  }
  if (bounds.footprintDiameter > FOOD_BUDGET.maxFootprintDiameterMeters || bounds.footprintDiameter < FOOD_BUDGET.minFootprintDiameterMeters) {
    throw new Error(`Footprint diameter ${bounds.footprintDiameter}m out of range [${FOOD_BUDGET.minFootprintDiameterMeters}, ${FOOD_BUDGET.maxFootprintDiameterMeters}]`);
  }
  if (bounds.height > FOOD_BUDGET.maxHeightMeters || bounds.height < FOOD_BUDGET.minHeightMeters) {
    throw new Error(`Height ${bounds.height}m out of range [${FOOD_BUDGET.minHeightMeters}, ${FOOD_BUDGET.maxHeightMeters}]`);
  }

  const contract = root.userData?.foodContract;
  if (!contract || !contract.anchors || !Array.isArray(contract.anchors.rimGrip) || !Array.isArray(contract.anchors.utensilRest)) {
    throw new Error("Missing root.userData.foodContract anchors");
  }

  return { stats: totalStats, bounds, stateTriangles: { full: fullStats.triangles, partial: partialStats.triangles, empty: emptyStats.triangles } };
}

/** Disposes all geometries and materials in an Object3D subtree. */
export function disposeFoodObject(root) {
  const geometries = new Set();
  const materials = new Set();
  root.traverse((obj) => {
    if (obj.geometry) geometries.add(obj.geometry);
    if (obj.material) {
      for (const m of Array.isArray(obj.material) ? obj.material : [obj.material]) {
        materials.add(m);
      }
    }
  });
  for (const g of geometries) g.dispose();
  for (const m of materials) m.dispose();
}

/**
 * Exports a validated food model to a compressed GLB using KHR_mesh_quantization + EXT_meshopt_compression.
 * Matches `createCharacterLoader()` decoder expectations.
 */
export async function exportFoodGlb(root, outputFile, { lite = false } = {}) {
  const validation = validateFoodModel(root, { lite });

  if (!globalThis.FileReader) {
    globalThis.FileReader = class FileReader {
      readAsArrayBuffer(blob) {
        blob.arrayBuffer().then((result) => {
          this.result = result;
          this.onloadend?.();
        });
      }
    };
  }

  const glb = await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: false });
  await MeshoptEncoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ "meshopt.encoder": MeshoptEncoder });
  const document = await io.readBinary(new Uint8Array(glb));

  await document.transform(
    dedup(),
    prune({ keepAttributes: true, keepLeaves: true }),
    quantize({ pattern: /^(POSITION|NORMAL)$/, quantizePosition: 14, quantizeNormal: 8 }),
    reorder({ encoder: MeshoptEncoder }),
  );
  document.createExtension(KHRMeshQuantization).setRequired(true);
  document
    .createExtension(EXTMeshoptCompression)
    .setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });

  const compressed = await io.writeBinary(document);
  const maxBytes = lite ? FOOD_BUDGET.maxLiteBytes : FOOD_BUDGET.maxFullBytes;
  if (compressed.byteLength > maxBytes) {
    throw new Error(`GLB size budget exceeded (${lite ? "lite" : "full"}): ${compressed.byteLength} > ${maxBytes} bytes`);
  }

  const resolvedFile = resolve(outputFile);
  await mkdir(dirname(resolvedFile), { recursive: true });
  await writeFile(resolvedFile, compressed);

  return {
    outputFile: resolvedFile,
    bytes: compressed.byteLength,
    ...validation,
  };
}
