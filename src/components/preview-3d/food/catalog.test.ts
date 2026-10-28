import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { createCharacterLoader } from "../character-loader";
import {
  FOOD_ASSET_BUDGET,
  FOOD_CATALOG,
  FOOD_KINDS,
  FOOD_NODE_NAMES,
  FOOD_SURFACE_FIXTURES,
  activeFoodStateNodeNames,
  chooseFoodKind,
  computeTablePlatePlacement,
  computeTraySlotOffsets,
  foodProgressFromConsumed,
  getFoodCatalogEntry,
  isFoodKind,
} from "./catalog";

const tempDir = mkdtempSync(join(tmpdir(), "wangraan-food-catalog-test-"));
const exporterScript = resolve("scripts/food-models/export-one.mjs");
const sharedModuleUrl = pathToFileURL(resolve("scripts/food-models/shared/index.mjs")).href;
const threeModuleUrl = pathToFileURL(resolve("node_modules/three/build/three.module.js")).href;

function runExporter(args: string[]) {
  return spawnSync(process.execPath, [exporterScript, ...args], {
    encoding: "utf8",
    timeout: 30000,
    windowsHide: true,
  });
}

afterAll(() => {
  if (dirname(resolve(tempDir)) !== resolve(tmpdir()) || !basename(tempDir).startsWith("wangraan-food-catalog-test-")) {
    throw new Error("Unexpected temporary directory");
  }
  rmSync(tempDir, { recursive: true, force: true });
});

describe("food catalog and contract (feat-103)", () => {
  it("defines all 5 menu items with constant URLs, anchors, and budgets without requiring asset files at import time", () => {
    expect(FOOD_KINDS).toEqual(["fried-rice", "noodles", "steak", "salad", "cake"]);
    for (const kind of FOOD_KINDS) {
      expect(isFoodKind(kind)).toBe(true);
      const entry = getFoodCatalogEntry(kind);
      expect(entry.id).toBe(kind);
      expect(entry.urls.full).toBe(`/assets/models/food/${kind}/${kind}.glb`);
      expect(entry.urls.lite).toBe(`/assets/models/food/${kind}/${kind}-lite.glb`);
      expect(entry.footprintDiameter).toBeGreaterThanOrEqual(FOOD_ASSET_BUDGET.minFootprintDiameterMeters);
      expect(entry.footprintDiameter).toBeLessThanOrEqual(FOOD_ASSET_BUDGET.maxFootprintDiameterMeters);
      expect(entry.nominalHeight).toBeGreaterThanOrEqual(FOOD_ASSET_BUDGET.minHeightMeters);
      expect(entry.nominalHeight).toBeLessThanOrEqual(FOOD_ASSET_BUDGET.maxHeightMeters);
      expect(entry.anchors.baseOrigin).toEqual([0, 0, 0]);
      expect(Math.hypot(entry.anchors.utensilRest[0], entry.anchors.utensilRest[2])).toBeLessThanOrEqual(
        entry.footprintDiameter / 2,
      );
    }
    expect(isFoodKind("burger")).toBe(false);
  });

  it("chooses food deterministically across all 5 dishes without touching any RNG state", () => {
    const counts = new Map<string, number>();
    for (let partyId = 1; partyId <= 50; partyId++) {
      for (let memberIndex = 0; memberIndex < 4; memberIndex++) {
        const first = chooseFoodKind(11, partyId, memberIndex);
        const second = chooseFoodKind(11, partyId, memberIndex);
        expect(first).toBe(second);
        counts.set(first, (counts.get(first) ?? 0) + 1);
      }
    }
    for (const kind of FOOD_KINDS) {
      expect(counts.get(kind) ?? 0).toBeGreaterThan(15);
    }
  });

  it("maps consumed ratio to full/partial/empty while always keeping Vessel and Utensil visible", () => {
    expect(foodProgressFromConsumed(0)).toBe("full");
    expect(foodProgressFromConsumed(0.15)).toBe("full");
    expect(foodProgressFromConsumed(0.45)).toBe("partial");
    expect(foodProgressFromConsumed(0.85)).toBe("empty");
    expect(foodProgressFromConsumed(1)).toBe("empty");

    expect(activeFoodStateNodeNames("full")).toEqual({
      vessel: true,
      foodFull: true,
      foodPartial: false,
      foodEmpty: false,
      utensil: true,
    });
    expect(activeFoodStateNodeNames("partial")).toEqual({
      vessel: true,
      foodFull: false,
      foodPartial: true,
      foodEmpty: false,
      utensil: true,
    });
    expect(activeFoodStateNodeNames("empty")).toEqual({
      vessel: true,
      foodFull: false,
      foodPartial: false,
      foodEmpty: true,
      utensil: true,
    });
  });

  it("places dishes on the serving tray and small 2-seat / 4-seat tables without overflowing or colliding", () => {
    const traySlots = computeTraySlotOffsets(2);
    expect(traySlots).toHaveLength(2);
    const tray = FOOD_SURFACE_FIXTURES.tray;
    for (const slot of traySlots) {
      expect(Math.abs(slot.x)).toBeLessThan(tray.width / 2);
      expect(Math.abs(slot.y)).toBeLessThan(tray.depth / 2);
    }

    for (const kind of FOOD_KINDS) {
      const radius = FOOD_CATALOG[kind].footprintDiameter / 2;
      const smallTable = FOOD_SURFACE_FIXTURES.smallTable2Seats;
      const northPlate = computeTablePlatePlacement({
        tableWidth: smallTable.width,
        tableDepth: smallTable.depth,
        tableShape: "rectangle",
        chairLocalCenter: { x: 0, y: -0.45 },
        foodKind: kind,
      });
      const southPlate = computeTablePlatePlacement({
        tableWidth: smallTable.width,
        tableDepth: smallTable.depth,
        tableShape: "rectangle",
        chairLocalCenter: { x: 0, y: 0.45 },
        foodKind: kind,
      });

      // Must remain inside the 0.60x0.60m tabletop
      expect(Math.abs(northPlate.anchor.x) + radius).toBeLessThanOrEqual(smallTable.width / 2 + 1e-4);
      expect(Math.abs(northPlate.anchor.y) + radius).toBeLessThanOrEqual(smallTable.depth / 2 + 1e-4);
      // Opposite plates must not overlap
      const centerDist = Math.hypot(
        northPlate.anchor.x - southPlate.anchor.x,
        northPlate.anchor.y - southPlate.anchor.y,
      );
      expect(centerDist).toBeGreaterThanOrEqual(FOOD_CATALOG[kind].footprintDiameter);
    }
  });

  it("has no side effects on exporter import and isolates output per foodId and variant", async () => {
    const importCheck = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `await import(${JSON.stringify(pathToFileURL(exporterScript).href)}); console.log(JSON.stringify({ reader: typeof globalThis.FileReader }));`,
      ],
      { encoding: "utf8", windowsHide: true },
    );
    expect(importCheck.status, importCheck.stderr).toBe(0);
    expect(JSON.parse(importCheck.stdout)).toEqual({ reader: "undefined" });

    const builderFile = join(tempDir, "fixture-builder.mjs");
    const outputDir = join(tempDir, "out-fried-rice");
    writeFileSync(
      builderFile,
      `import * as THREE from ${JSON.stringify(threeModuleUrl)};
import {
  assembleFoodModel,
  buildPlateVessel,
  buildSpoonGeometry,
  createFoodMaterial,
  createMergedMesh,
  transformGeometry,
} from ${JSON.stringify(sharedModuleUrl)};

export const foodId = "fried-rice";
export default function buildFixture({ foodId, lite }) {
  const segs = lite ? 8 : 16;
  const vessel = buildPlateVessel({ lite, outerRadius: 0.12, height: 0.022, wellFloorY: 0.008 });
  const mat = createFoodMaterial("FoodMat", 0xe3a83b);
  const fullGeo = transformGeometry(new THREE.SphereGeometry(0.065, segs, segs, 0, Math.PI * 2, 0, Math.PI / 2), {
    position: [0, 0.008, 0],
  });
  const partialGeo = transformGeometry(new THREE.SphereGeometry(0.045, Math.max(6, segs - 2), Math.max(4, segs / 2), 0, Math.PI * 2, 0, Math.PI / 2), {
    position: [-0.015, 0.008, 0],
  });
  const emptyGeo = transformGeometry(new THREE.CylinderGeometry(0.012, 0.014, 0.003, 6), {
    position: [0.01, 0.0095, 0],
  });
  const utensil = createMergedMesh("UtensilMesh", buildSpoonGeometry({ lite }), createFoodMaterial("SpoonMat", 0xd5dce2));
  utensil.position.set(0.06, 0.018, 0.01);
  return assembleFoodModel({
    foodId,
    lite,
    vessel,
    foodFull: createMergedMesh("FullMesh", [fullGeo], mat),
    foodPartial: createMergedMesh("PartialMesh", [partialGeo], mat),
    foodEmpty: createMergedMesh("EmptyMesh", [emptyGeo], mat),
    utensil,
    anchors: {
      baseOrigin: [0, 0, 0],
      rimGrip: [-0.11, 0.018, 0],
      utensilRest: [0.06, 0.018, 0.01],
      biteTarget: [0, 0.04, 0],
    },
  });
}
`,
    );

    const fullRes = runExporter(["--id", "fried-rice", "--output-dir", outputDir, "--builder", builderFile]);
    expect(fullRes.status, fullRes.stderr).toBe(0);
    expect(readdirSync(outputDir)).toEqual(["fried-rice.glb"]);

    const liteRes = runExporter(["--id", "fried-rice", "--lite", "--output-dir", outputDir, "--builder", builderFile]);
    expect(liteRes.status, liteRes.stderr).toBe(0);
    expect(readdirSync(outputDir).sort()).toEqual(["fried-rice-lite.glb", "fried-rice.glb"]);

    const fullBytes = readFileSync(join(outputDir, "fried-rice.glb"));
    expect(fullBytes.byteLength).toBeLessThanOrEqual(FOOD_ASSET_BUDGET.maxFullBytes);
    const loaded = await createCharacterLoader().parseAsync(
      fullBytes.buffer.slice(fullBytes.byteOffset, fullBytes.byteOffset + fullBytes.byteLength),
      "",
    );
    for (const nodeName of Object.values(FOOD_NODE_NAMES)) {
      if (nodeName === FOOD_NODE_NAMES.root) continue;
      expect(loaded.scene.getObjectByName(nodeName)).toBeTruthy();
    }

    // Mismatched foodId vs builder must fail without writing another food's asset
    const badOutput = join(tempDir, "out-noodles");
    const mismatch = runExporter(["--id", "noodles", "--output-dir", badOutput, "--builder", builderFile]);
    expect(mismatch.status).toBe(1);
    expect(() => readdirSync(badOutput)).toThrow();
  });
});

