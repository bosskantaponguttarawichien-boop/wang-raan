import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createCharacterLoader } from "../../character-loader";
import { FOOD_ASSET_BUDGET, FOOD_CATALOG, FOOD_NODE_NAMES } from "../catalog";

function countTriangles(object: THREE.Object3D): number {
  let tris = 0;
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry) {
      const pos = mesh.geometry.getAttribute("position");
      if (mesh.geometry.index) tris += mesh.geometry.index.count / 3;
      else if (pos) tris += pos.count / 3;
    }
  });
  return Math.round(tris);
}

describe("steak 3D food asset (feat-106)", () => {
  const entry = FOOD_CATALOG.steak;

  it.each(["full", "lite"] as const)("loads trusted %s GLB within budget, origin y=0, and all required state nodes", async (variant) => {
    const relUrl = entry.urls[variant].replace(/^\//, "public/");
    const filePath = resolve(relUrl);
    const bytes = readFileSync(filePath);

    const maxBytes = variant === "lite" ? FOOD_ASSET_BUDGET.maxLiteBytes : FOOD_ASSET_BUDGET.maxFullBytes;
    expect(bytes.byteLength).toBeGreaterThan(1000);
    expect(bytes.byteLength).toBeLessThanOrEqual(maxBytes);

    const gltf = await createCharacterLoader().parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      "",
    );
    const root = gltf.scene;
    root.updateMatrixWorld(true);

    const vessel = root.getObjectByName(FOOD_NODE_NAMES.vessel);
    const full = root.getObjectByName(FOOD_NODE_NAMES.foodFull);
    const partial = root.getObjectByName(FOOD_NODE_NAMES.foodPartial);
    const empty = root.getObjectByName(FOOD_NODE_NAMES.foodEmpty);
    const utensil = root.getObjectByName(FOOD_NODE_NAMES.utensil);

    expect(vessel).toBeTruthy();
    expect(full).toBeTruthy();
    expect(partial).toBeTruthy();
    expect(empty).toBeTruthy();
    expect(utensil).toBeTruthy();

    const fullTris = countTriangles(full!);
    const partialTris = countTriangles(partial!);
    const emptyTris = countTriangles(empty!);
    expect(fullTris).toBeGreaterThan(partialTris);
    expect(partialTris).toBeGreaterThan(emptyTris);
    expect(emptyTris).toBeGreaterThan(0);

    const totalTris = countTriangles(root);
    const maxTris = variant === "lite" ? FOOD_ASSET_BUDGET.maxLiteTriangles : FOOD_ASSET_BUDGET.maxFullTriangles;
    expect(totalTris).toBeLessThanOrEqual(maxTris);

    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    box.getSize(size);

    expect(Math.abs(box.min.y)).toBeLessThanOrEqual(0.002);
    expect(Math.max(size.x, size.z)).toBeLessThanOrEqual(FOOD_ASSET_BUDGET.maxFootprintDiameterMeters + 0.002);
    expect(size.y).toBeGreaterThanOrEqual(FOOD_ASSET_BUDGET.minHeightMeters);
    expect(size.y).toBeLessThanOrEqual(FOOD_ASSET_BUDGET.maxHeightMeters);

    // Utensil must stay within vessel footprint
    const vesselBox = new THREE.Box3().setFromObject(vessel!);
    const utensilBox = new THREE.Box3().setFromObject(utensil!);
    expect(utensilBox.min.x).toBeGreaterThanOrEqual(vesselBox.min.x - 0.002);
    expect(utensilBox.max.x).toBeLessThanOrEqual(vesselBox.max.x + 0.002);
    expect(utensilBox.min.z).toBeGreaterThanOrEqual(vesselBox.min.z - 0.002);
    expect(utensilBox.max.z).toBeLessThanOrEqual(vesselBox.max.z + 0.002);
  });
});

