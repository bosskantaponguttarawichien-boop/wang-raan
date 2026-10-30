import * as THREE from "three";
import { objectCenter, tableStyleOf } from "@/core/layout";
import type { Chair, StoreLayout, Table } from "@/core/layout/types";
import type {
  FoodKind,
  FoodProgress,
  MealPresentation,
  PresentationPoint,
  PresentationSnapshot,
  ServiceMilestones,
  TablePresentation,
} from "@/core/simulation/presentation-contract";
import {
  FOOD_CATALOG,
  FOOD_KINDS,
  FOOD_NODE_NAMES,
  activeFoodStateNodeNames,
  computeTablePlatePlacement,
  foodProgressFromConsumed,
} from "../food/catalog";
import { createCharacterLoader } from "../character-loader";
import type { SceneFeature, SceneFeatureContext, SceneFrame } from "../runtime/contracts";

/** Tabletop surface elevation in metres (matches three-view.tsx topHeight 0.74 + thickness/2 0.02 = 0.76). */
export const TABLETOP_SURFACE_Y = 0.76;

/** Slight vertical lift above tabletop to avoid z-fighting with the table mesh. */
export const STAIN_SURFACE_OFFSET_Y = 0.0016;

/** Maximum stain blotches rendered per table at highest quality. */
export const MAX_STAINS_PER_TABLE = 5;

export interface FoodAssetLoaderLike {
  load(
    url: string,
    onLoad: (gltf: { scene: THREE.Object3D }) => void,
    onProgress?: ((event: ProgressEvent) => void) | undefined,
    onError?: ((error: unknown) => void) | undefined,
  ): void;
}

export interface TableServiceFeatureOptions {
  /** Custom GLTF loader (injectable for deterministic unit tests and offline mode). */
  readonly createLoader?: () => FoodAssetLoaderLike;
  /** Disable network GLB loading and use procedural fallback meshes only. */
  readonly disableNetworkLoad?: boolean;
}

export interface TableDishPlacementInfo {
  readonly mealId: string;
  readonly tableId: string;
  readonly chairId: string;
  readonly serviceCycleId: string;
  readonly foodKind: FoodKind;
  readonly progress: FoodProgress;
  readonly consumed: number;
  readonly localAnchor: PresentationPoint;
  readonly worldPosition: THREE.Vector3;
  readonly rotationRadians: number;
  readonly usingLoadedAsset: boolean;
}

export interface TableStainClusterInfo {
  readonly tableId: string;
  readonly serviceCycleId: string;
  readonly stainAmount: number;
  readonly wipeProgress: number;
  readonly effectiveOpacity: number;
  readonly activeStainCount: number;
  readonly localCenters: readonly PresentationPoint[];
}

export interface TableServiceFeature extends SceneFeature {
  /** Returns active dish placement metadata for inspection/testing or staff-action coordination. */
  getDishPlacements(tableId?: string): readonly TableDishPlacementInfo[];
  /** Returns active stain cluster metadata for a table. */
  getTableStainInfo(tableId: string): TableStainClusterInfo | null;
  /** Returns theThree.js Group for a specific mealId if currently mounted on a table. */
  getDishObject(mealId: string): THREE.Object3D | null;
  /** Returns diagnostic counts for memory/leak verification. */
  getStats(): {
    readonly tableCount: number;
    readonly activeDishCount: number;
    readonly activeStainTableCount: number;
    readonly activeStainMeshCount: number;
    readonly cachedTemplateCount: number;
    readonly disposedInstanceMaterials: number;
    readonly disposedInstanceGeometries: number;
  };
}

interface IndexedTable {
  readonly table: Table;
  readonly center: PresentationPoint;
  readonly rotationRadians: number;
  readonly shape: "round" | "rectangle";
  readonly group: THREE.Group;
  readonly dishesGroup: THREE.Group;
  readonly stainsGroup: THREE.Group;
}

interface CachedFoodTemplate {
  full: THREE.Object3D | null;
  lite: THREE.Object3D | null;
  fullLoading: boolean;
  liteLoading: boolean;
  fullFailed: boolean;
  liteFailed: boolean;
}

interface ActiveDishInstance {
  readonly mealId: string;
  readonly tableId: string;
  readonly chairId: string;
  readonly serviceCycleId: string;
  readonly foodKind: FoodKind;
  progress: FoodProgress;
  consumed: number;
  localAnchor: PresentationPoint;
  rotationRadians: number;
  root: THREE.Group;
  content: THREE.Object3D;
  usingLoadedAsset: boolean;
  usedLiteVariant: boolean;
  ownedGeometries: THREE.BufferGeometry[];
  ownedMaterials: THREE.Material[];
}

interface StainPatchSpec {
  readonly x: number;
  readonly y: number;
  readonly radiusX: number;
  readonly radiusZ: number;
  readonly rotation: number;
  readonly colorHex: string;
  readonly threshold: number;
  readonly baseOpacity: number;
}

interface ActiveStainCluster {
  readonly tableId: string;
  serviceCycleId: string;
  stainAmount: number;
  wipeProgress: number;
  effectiveOpacity: number;
  readonly group: THREE.Group;
  readonly specs: readonly StainPatchSpec[];
  readonly meshes: THREE.Mesh[];
  readonly geometries: THREE.BufferGeometry[];
  readonly materials: THREE.MeshStandardMaterial[];
}

const STAIN_PALETTE = [
  "#8a562d", // coffee / gravy brown
  "#b56733", // sauce amber
  "#734827", // dark soy / cocoa ring
  "#c48c46", // tea / broth drop
  "#9c4f30", // tomato / curry smudge
] as const;

/** Deterministic 32-bit FNV-1a / Murmur-style hash from string + salt. */
export function hashTableCycle(tableId: string, serviceCycleId: string, salt = 0): number {
  const input = `${tableId}::${serviceCycleId}::${salt}`;
  let h = 0x811c9dc5 ^ Math.imul(salt + 1, 0x9e3779b9);
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

function unitRandomFromHash(hash: number, step: number): number {
  let h = Math.imul(hash ^ Math.imul(step + 1, 0x27d4eb2d), 0x165667b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) / 0xffffffff;
}

/**
 * Computes deterministic stain blotch specifications within a table's safe surface area.
 * Stains never spill off small (0.60×0.60m) or round tables.
 */
export function computeDeterministicStainSpecs(
  table: Pick<Table, "id" | "width" | "depth">,
  tableShape: "round" | "rectangle",
  serviceCycleId: string,
  count: number = MAX_STAINS_PER_TABLE,
): readonly StainPatchSpec[] {
  const clampedCount = Math.max(1, Math.min(MAX_STAINS_PER_TABLE, Math.trunc(count)));
  const specs: StainPatchSpec[] = [];
  const margin = 0.08;
  const maxRadius = 0.042;

  for (let i = 0; i < clampedCount; i++) {
    const h = hashTableCycle(table.id, serviceCycleId, i + 1);
    const u1 = unitRandomFromHash(h, 1);
    const u2 = unitRandomFromHash(h, 2);
    const u3 = unitRandomFromHash(h, 3);
    const u4 = unitRandomFromHash(h, 4);
    const u5 = unitRandomFromHash(h, 5);

    const radiusX = Number((0.022 + u3 * (maxRadius - 0.022)).toFixed(4));
    const radiusZ = Number((radiusX * (0.68 + u4 * 0.45)).toFixed(4));
    const safePad = Math.max(radiusX, radiusZ) + margin;

    let x = 0;
    let y = 0;
    if (tableShape === "round") {
      const tableRadius = Math.min(table.width, table.depth) / 2;
      const maxR = Math.max(0.03, tableRadius - safePad);
      const r = Math.sqrt(u1) * maxR * 0.82;
      const theta = u2 * Math.PI * 2;
      x = Number((Math.cos(theta) * r).toFixed(4));
      y = Number((Math.sin(theta) * r).toFixed(4));
    } else {
      const maxX = Math.max(0.03, table.width / 2 - safePad);
      const maxY = Math.max(0.03, table.depth / 2 - safePad);
      x = Number(((u1 * 2 - 1) * maxX * 0.78).toFixed(4));
      y = Number(((u2 * 2 - 1) * maxY * 0.78).toFixed(4));
    }

    specs.push({
      x,
      y,
      radiusX,
      radiusZ,
      rotation: Number((u5 * Math.PI * 2).toFixed(4)),
      colorHex: STAIN_PALETTE[h % STAIN_PALETTE.length]!,
      threshold: i * 0.14,
      baseOpacity: Number((0.52 + (i === 0 ? 0.16 : u3 * 0.22)).toFixed(3)),
    });
  }

  return specs;
}

/**
 * Builds a procedural fallback food hierarchy matching the canonical `FOOD_NODE_NAMES`
 * (`FoodRoot` -> `Vessel`, `FoodFull`, `FoodPartial`, `FoodEmpty`, `Utensil`) so that
 * state toggling and unit tests work identically before/without GLB network load.
 */
export function buildProceduralFoodFallback(kind: FoodKind): {
  readonly root: THREE.Group;
  readonly geometries: THREE.BufferGeometry[];
  readonly materials: THREE.Material[];
} {
  const entry = FOOD_CATALOG[kind];
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  const vesselMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: entry.fallbackColors.vessel,
      roughness: 0.42,
      metalness: 0.05,
    }),
  );
  const primaryMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: entry.fallbackColors.foodPrimary,
      roughness: 0.68,
      metalness: 0.02,
    }),
  );
  const accentMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: entry.fallbackColors.foodAccent,
      roughness: 0.58,
      metalness: 0.02,
    }),
  );
  const utensilMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: entry.fallbackColors.utensil,
      roughness: 0.35,
      metalness: 0.45,
    }),
  );

  const root = new THREE.Group();
  root.name = FOOD_NODE_NAMES.root;
  root.userData.foodKind = kind;

  const radius = entry.footprintDiameter / 2;
  const isBowl = entry.vesselKind === "bowl" || entry.vesselKind === "salad-bowl";
  const vesselHeight = isBowl ? 0.048 : 0.02;

  // 1. Vessel
  const vesselGroup = new THREE.Group();
  vesselGroup.name = FOOD_NODE_NAMES.vessel;
  const vesselGeo = trackGeo(
    new THREE.CylinderGeometry(radius, radius * (isBowl ? 0.68 : 0.82), vesselHeight, 18),
  );
  const vesselMesh = new THREE.Mesh(vesselGeo, vesselMat);
  vesselMesh.position.y = vesselHeight / 2;
  vesselMesh.castShadow = true;
  vesselMesh.receiveShadow = true;
  vesselGroup.add(vesselMesh);

  // 2. FoodFull
  const fullGroup = new THREE.Group();
  fullGroup.name = FOOD_NODE_NAMES.foodFull;
  const fullRadius = radius * 0.72;
  const fullHeight = Math.max(0.024, entry.nominalHeight - vesselHeight * 0.65);
  const fullGeo = trackGeo(
    kind === "cake"
      ? new THREE.ConeGeometry(fullRadius * 0.85, fullHeight, 3)
      : new THREE.SphereGeometry(fullRadius, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
  );
  const fullMesh = new THREE.Mesh(fullGeo, primaryMat);
  fullMesh.position.y = vesselHeight * 0.75 + (kind === "cake" ? fullHeight / 2 : 0);
  if (kind !== "cake") fullMesh.scale.y = Math.max(0.35, fullHeight / fullRadius);
  fullMesh.castShadow = true;
  fullMesh.receiveShadow = true;
  fullGroup.add(fullMesh);

  const garnishGeo = trackGeo(new THREE.SphereGeometry(radius * 0.18, 8, 6));
  const garnishMesh = new THREE.Mesh(garnishGeo, accentMat);
  garnishMesh.position.set(radius * 0.22, vesselHeight + fullHeight * 0.55, -radius * 0.14);
  fullGroup.add(garnishMesh);

  // 3. FoodPartial
  const partialGroup = new THREE.Group();
  partialGroup.name = FOOD_NODE_NAMES.foodPartial;
  partialGroup.visible = false;
  const partialGeo = trackGeo(
    new THREE.SphereGeometry(fullRadius * 0.64, 12, 8, 0, Math.PI * 1.35, 0, Math.PI * 0.5),
  );
  const partialMesh = new THREE.Mesh(partialGeo, primaryMat);
  partialMesh.position.set(-radius * 0.12, vesselHeight * 0.72, radius * 0.08);
  partialMesh.scale.y = Math.max(0.28, (fullHeight * 0.62) / (fullRadius * 0.64));
  partialMesh.castShadow = true;
  partialMesh.receiveShadow = true;
  partialGroup.add(partialMesh);

  // 4. FoodEmpty
  const emptyGroup = new THREE.Group();
  emptyGroup.name = FOOD_NODE_NAMES.foodEmpty;
  emptyGroup.visible = false;
  const crumbGeo = trackGeo(new THREE.CylinderGeometry(radius * 0.16, radius * 0.18, 0.004, 8));
  const crumbMesh = new THREE.Mesh(crumbGeo, accentMat);
  crumbMesh.position.set(radius * 0.1, vesselHeight + 0.002, radius * 0.06);
  emptyGroup.add(crumbMesh);

  // 5. Utensil
  const utensilGroup = new THREE.Group();
  utensilGroup.name = FOOD_NODE_NAMES.utensil;
  const utensilGeo = trackGeo(new THREE.BoxGeometry(0.014, 0.006, radius * 1.15));
  const utensilMesh = new THREE.Mesh(utensilGeo, utensilMat);
  utensilMesh.position.set(
    entry.anchors.utensilRest[0],
    Math.max(vesselHeight + 0.004, entry.anchors.utensilRest[1]),
    entry.anchors.utensilRest[2],
  );
  utensilMesh.rotation.y = 0.22;
  utensilGroup.add(utensilMesh);

  root.add(vesselGroup, fullGroup, partialGroup, emptyGroup, utensilGroup);
  return { root, geometries, materials };
}

/** Toggles visibility of canonical food state groups (`Vessel`, `FoodFull`, `FoodPartial`, `FoodEmpty`, `Utensil`). */
export function applyFoodProgressVisibility(root: THREE.Object3D, progress: FoodProgress): void {
  const states = activeFoodStateNodeNames(progress);
  const vessel = root.getObjectByName(FOOD_NODE_NAMES.vessel);
  const full = root.getObjectByName(FOOD_NODE_NAMES.foodFull);
  const partial = root.getObjectByName(FOOD_NODE_NAMES.foodPartial);
  const empty = root.getObjectByName(FOOD_NODE_NAMES.foodEmpty);
  const utensil = root.getObjectByName(FOOD_NODE_NAMES.utensil);

  if (vessel) vessel.visible = states.vessel;
  if (full) full.visible = states.foodFull;
  if (partial) partial.visible = states.foodPartial;
  if (empty) empty.visible = states.foodEmpty;
  if (utensil) utensil.visible = states.utensil;
  root.userData.foodProgress = progress;
}

function disposeObjectTree(root: THREE.Object3D | null): void {
  if (!root) return;
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      if (obj.geometry) geometries.add(obj.geometry);
      for (const mat of [obj.material].flat()) {
        if (mat) materials.add(mat);
      }
    }
  });
  for (const geo of geometries) geo.dispose();
  for (const mat of materials) mat.dispose();
}

/**
 * Determines whether a meal should be visibly placed on its table at the current snapshot time.
 */
function isMealPlacedOnTable(
  meal: MealPresentation,
  tableState: TablePresentation | undefined,
  milestones: readonly ServiceMilestones[],
  simTimeSeconds: number,
): boolean {
  if (!tableState) return false;
  if (tableState.serviceCycleId !== meal.serviceCycleId) return false;
  if (tableState.availability === "clean" || tableState.surface === "clean" || tableState.surface === "empty") {
    return false;
  }
  if (
    tableState.cleanCompletedAtSeconds !== null &&
    simTimeSeconds >= tableState.cleanCompletedAtSeconds
  ) {
    return false;
  }

  // Check if clean milestone has already cleared the table
  const cleanMilestone = milestones.find(
    (m) =>
      m.serviceCycleId === meal.serviceCycleId &&
      m.clearedAtSeconds !== null &&
      simTimeSeconds >= m.clearedAtSeconds,
  );
  if (cleanMilestone) return false;

  if (tableState.mealIds.includes(meal.mealId)) {
    if (meal.placedAtSeconds === null) return true;
    return simTimeSeconds + 1e-6 >= meal.placedAtSeconds;
  }

  if (meal.placedAtSeconds !== null && simTimeSeconds + 1e-6 >= meal.placedAtSeconds) {
    return true;
  }

  return false;
}

/**
 * Resolves local tabletop anchor & facing rotation for a meal from its bound chair and table geometry,
 * preventing overlap on small 0.60×0.60m tables and respecting round/rectangle boundaries.
 */
export function resolveTableDishAnchor(params: {
  readonly meal: MealPresentation;
  readonly table: Table;
  readonly tableShape: "round" | "rectangle";
  readonly chair: Chair | undefined;
  readonly siblingMealsOnTable: readonly MealPresentation[];
  readonly chairs?: ReadonlyMap<string, Chair>;
}): {
  readonly localAnchor: PresentationPoint;
  readonly rotationRadians: number;
} {
  const { meal, table, tableShape, chair, siblingMealsOnTable, chairs } = params;

  // จานหลักยังอยู่หน้าเก้าอี้เหมือนเดิม ส่วนจานเพิ่มหาที่ว่างบนโต๊ะ
  // โดยคำนึงถึงจานหลักของทุกคนและจานเพิ่มที่วางไปแล้ว
  if (meal.mealId.includes(":extra:") && chairs) {
    const primaries = siblingMealsOnTable.filter((item) => !item.mealId.includes(":extra:"));
    const extras = siblingMealsOnTable.filter((item) => item.mealId.includes(":extra:")).sort((a, b) => a.mealId.localeCompare(b.mealId));
    const occupied = primaries.map((item) => ({
      anchor: resolveTableDishAnchor({ ...params, meal: item, chair: chairs.get(item.chairId), chairs: undefined }).localAnchor,
      radius: FOOD_CATALOG[item.foodKind].footprintDiameter / 2,
    }));
    for (const extra of extras) {
      const base = resolveTableDishAnchor({ ...params, meal: extra, chair: chairs.get(extra.chairId), chairs: undefined });
      const radius = FOOD_CATALOG[extra.foodKind].footprintDiameter / 2;
      const maxX = table.width / 2 - radius - 0.025;
      const maxY = table.depth / 2 - radius - 0.025;
      let best: PresentationPoint | undefined;
      let bestDistance = Infinity;
      for (let x = -maxX; x <= maxX + 0.0001; x += 0.025) {
        for (let y = -maxY; y <= maxY + 0.0001; y += 0.025) {
          if (tableShape === "round" && Math.hypot(x, y) > Math.min(table.width, table.depth) / 2 - radius - 0.025) continue;
          if (occupied.some((item) => Math.hypot(x - item.anchor.x, y - item.anchor.y) < radius + item.radius + 0.005)) continue;
          const distance = Math.hypot(x - base.localAnchor.x, y - base.localAnchor.y);
          if (distance < bestDistance) { best = { x, y }; bestDistance = distance; }
        }
      }
      // บางโต๊ะเล็กเกินกว่าจะวางจานทั้งหมดได้ จึงใช้ตำแหน่งสำรองแทนการซ่อนอาหาร
      const anchor = best ?? base.localAnchor;
      if (extra.mealId === meal.mealId) return { localAnchor: anchor, rotationRadians: base.rotationRadians };
      occupied.push({ anchor, radius });
    }
  }

  if (chair) {
    const chairCenter = objectCenter(chair);
    const tableCenter = objectCenter(table);
    const angle = (-table.rotation * Math.PI) / 180;
    const dx = chairCenter.x - tableCenter.x;
    const dy = chairCenter.y - tableCenter.y;
    // Transform world delta into table-local coordinates (matches object.rotation.y = degToRad(-table.rotation))
    const localChairX = dx * Math.cos(angle) - dy * Math.sin(angle);
    const localChairY = dx * Math.sin(angle) + dy * Math.cos(angle);

    const placement = computeTablePlatePlacement({
      tableWidth: table.width,
      tableDepth: table.depth,
      tableShape,
      chairLocalCenter: { x: localChairX, y: localChairY },
      foodKind: meal.foodKind,
    });

    return {
      localAnchor: placement.anchor,
      rotationRadians: placement.rotationRadians,
    };
  }

  // Fallback when chair reference is missing: clamp meal.anchor within safe table bounds
  const entry = FOOD_CATALOG[meal.foodKind];
  const radius = entry.footprintDiameter / 2;
  const margin = 0.025;
  const maxX = Math.max(0.04, table.width / 2 - radius - margin);
  const maxY = Math.max(0.04, table.depth / 2 - radius - margin);
  const clampedX = Math.max(-maxX, Math.min(maxX, meal.anchor.x));
  const clampedY = Math.max(-maxY, Math.min(maxY, meal.anchor.y));
  const idx = Math.max(0, siblingMealsOnTable.findIndex((m) => m.mealId === meal.mealId));
  const fallbackRot = (idx * Math.PI) / 2;

  return {
    localAnchor: { x: Number(clampedX.toFixed(4)), y: Number(clampedY.toFixed(4)) },
    rotationRadians: fallbackRot,
  };
}

/**
 * Creates the `"table-service"` scene feature responsible for tabletop dishes (all 5 menus),
 * consumption progress (`full` -> `partial` -> `empty`), deterministic table stains, and
 * wipe-progress cleanup synchronized with `PresentationSnapshot`.
 */
export function createTableServiceFeature(
  context: SceneFeatureContext,
  options: TableServiceFeatureOptions = {},
): TableServiceFeature {
  const indexedTables = new Map<string, IndexedTable>();
  const indexedChairs = new Map<string, Chair>();
  const dishAnchorCache = new Map<string, { signature: string; anchors: Map<string, ReturnType<typeof resolveTableDishAnchor>> }>();
  const activeDishes = new Map<string, ActiveDishInstance>();
  const activeStains = new Map<string, ActiveStainCluster>();

  const templates = new Map<FoodKind, CachedFoodTemplate>();
  for (const kind of FOOD_KINDS) {
    templates.set(kind, {
      full: null,
      lite: null,
      fullLoading: false,
      liteLoading: false,
      fullFailed: false,
      liteFailed: false,
    });
  }

  let loader: FoodAssetLoaderLike | null = null;
  let disposed = false;
  let lastRunId: string | null = null;
  let lastLayoutRevision: string | null = null;
  let disposedInstanceMaterials = 0;
  let disposedInstanceGeometries = 0;

  const wantsLiteVariant = (): boolean => {
    const q = context.getQuality();
    return !q.characterShadows || q.shadowMapSize <= 1024;
  };

  const getLoader = (): FoodAssetLoaderLike | null => {
    if (options.disableNetworkLoad) return null;
    if (!loader) {
      loader = options.createLoader ? options.createLoader() : createCharacterLoader();
    }
    return loader;
  };

  const applyShadowFlags = (root: THREE.Object3D): void => {
    const cast = context.getQuality().characterShadows;
    root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = cast;
        obj.receiveShadow = true;
      }
    });
  };

  const upgradeDishesForKind = (kind: FoodKind): void => {
    if (disposed) return;
    const cache = templates.get(kind);
    if (!cache) return;
    const useLite = wantsLiteVariant();
    const templateScene = useLite ? (cache.lite ?? cache.full) : (cache.full ?? cache.lite);
    if (!templateScene) return;
    const actualLite = templateScene === cache.lite;

    let upgraded = false;
    for (const dish of activeDishes.values()) {
      if (dish.foodKind !== kind) continue;
      if (dish.usingLoadedAsset && dish.usedLiteVariant === actualLite) continue;

      // Dispose procedural fallback resources owned by this dish instance
      dish.root.remove(dish.content);
      for (const geo of dish.ownedGeometries) {
        geo.dispose();
        disposedInstanceGeometries++;
      }
      for (const mat of dish.ownedMaterials) {
        mat.dispose();
        disposedInstanceMaterials++;
      }
      dish.ownedGeometries.length = 0;
      dish.ownedMaterials.length = 0;

      const cloned = templateScene.clone(true);
      applyShadowFlags(cloned);
      applyFoodProgressVisibility(cloned, dish.progress);
      dish.content = cloned;
      dish.usingLoadedAsset = true;
      dish.usedLiteVariant = actualLite;
      dish.root.add(cloned);
      upgraded = true;
    }

    if (upgraded) {
      context.invalidateShadows();
      context.invalidate();
    }
  };

  const requestFoodTemplate = (kind: FoodKind, lite: boolean): void => {
    const cache = templates.get(kind);
    if (!cache || disposed) return;
    if (lite) {
      if (cache.lite || cache.liteLoading || cache.liteFailed) return;
    } else {
      if (cache.full || cache.fullLoading || cache.fullFailed) return;
    }

    const activeLoader = getLoader();
    if (!activeLoader) return;

    const entry = FOOD_CATALOG[kind];
    const url = lite ? entry.urls.lite : entry.urls.full;
    if (lite) cache.liteLoading = true;
    else cache.fullLoading = true;

    activeLoader.load(
      url,
      (gltf) => {
        if (disposed) {
          disposeObjectTree(gltf.scene);
          return;
        }
        if (lite) {
          cache.liteLoading = false;
          cache.lite = gltf.scene;
        } else {
          cache.fullLoading = false;
          cache.full = gltf.scene;
        }
        upgradeDishesForKind(kind);
      },
      undefined,
      () => {
        if (lite) {
          cache.liteLoading = false;
          cache.liteFailed = true;
        } else {
          cache.fullLoading = false;
          cache.fullFailed = true;
        }
      },
    );
  };

  const instantiateFoodContent = (
    kind: FoodKind,
    progress: FoodProgress,
  ): {
    content: THREE.Object3D;
    usingLoadedAsset: boolean;
    usedLiteVariant: boolean;
    ownedGeometries: THREE.BufferGeometry[];
    ownedMaterials: THREE.Material[];
  } => {
    const cache = templates.get(kind)!;
    const useLite = wantsLiteVariant();
    requestFoodTemplate(kind, useLite);
    if (!useLite && !cache.full && !cache.lite) {
      requestFoodTemplate(kind, true);
    }

    const templateScene = useLite ? (cache.lite ?? cache.full) : (cache.full ?? cache.lite);
    if (templateScene) {
      const actualLite = templateScene === cache.lite;
      const cloned = templateScene.clone(true);
      applyShadowFlags(cloned);
      applyFoodProgressVisibility(cloned, progress);
      return {
        content: cloned,
        usingLoadedAsset: true,
        usedLiteVariant: actualLite,
        ownedGeometries: [],
        ownedMaterials: [],
      };
    }

    const fallback = buildProceduralFoodFallback(kind);
    applyShadowFlags(fallback.root);
    applyFoodProgressVisibility(fallback.root, progress);
    return {
      content: fallback.root,
      usingLoadedAsset: false,
      usedLiteVariant: useLite,
      ownedGeometries: fallback.geometries,
      ownedMaterials: fallback.materials,
    };
  };

  const removeDishInstance = (mealId: string): boolean => {
    const dish = activeDishes.get(mealId);
    if (!dish) return false;
    dish.root.removeFromParent();
    for (const geo of dish.ownedGeometries) {
      geo.dispose();
      disposedInstanceGeometries++;
    }
    for (const mat of dish.ownedMaterials) {
      mat.dispose();
      disposedInstanceMaterials++;
    }
    dish.ownedGeometries.length = 0;
    dish.ownedMaterials.length = 0;
    activeDishes.delete(mealId);
    return true;
  };

  const removeStainCluster = (tableId: string): boolean => {
    const cluster = activeStains.get(tableId);
    if (!cluster) return false;
    cluster.group.removeFromParent();
    for (const geo of cluster.geometries) {
      geo.dispose();
      disposedInstanceGeometries++;
    }
    for (const mat of cluster.materials) {
      mat.dispose();
      disposedInstanceMaterials++;
    }
    cluster.meshes.length = 0;
    cluster.geometries.length = 0;
    cluster.materials.length = 0;
    activeStains.delete(tableId);
    return true;
  };

  const clearAllDynamicProps = (): boolean => {
    const hadProps = activeDishes.size > 0 || activeStains.size > 0;
    for (const mealId of [...activeDishes.keys()]) {
      removeDishInstance(mealId);
    }
    for (const tableId of [...activeStains.keys()]) {
      removeStainCluster(tableId);
    }
    return hadProps;
  };

  const clearTableAnchors = (): void => {
    clearAllDynamicProps();
    for (const indexed of indexedTables.values()) {
      indexed.group.removeFromParent();
    }
    indexedTables.clear();
    indexedChairs.clear();
    dishAnchorCache.clear();
  };

  const ensureStainCluster = (
    indexed: IndexedTable,
    serviceCycleId: string,
  ): ActiveStainCluster => {
    const existing = activeStains.get(indexed.table.id);
    if (existing && existing.serviceCycleId === serviceCycleId) {
      return existing;
    }
    if (existing) {
      removeStainCluster(indexed.table.id);
    }

    const specs = computeDeterministicStainSpecs(
      indexed.table,
      indexed.shape,
      serviceCycleId,
      MAX_STAINS_PER_TABLE,
    );
    const group = new THREE.Group();
    group.name = `TableStains:${indexed.table.id}:${serviceCycleId}`;

    const meshes: THREE.Mesh[] = [];
    const geometries: THREE.BufferGeometry[] = [];
    const materials: THREE.MeshStandardMaterial[] = [];

    specs.forEach((spec, index) => {
      // Disc geometry with low segment count for performance
      const geo = new THREE.CircleGeometry(1, 14);
      geo.rotateX(-Math.PI / 2);
      geometries.push(geo);

      // Each stain blotch gets its own material instance so fading/wiping never bleeds onto other tables
      const mat = new THREE.MeshStandardMaterial({
        color: spec.colorHex,
        roughness: 0.9,
        metalness: 0.0,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1 - index,
        polygonOffsetUnits: -1,
      });
      materials.push(mat);

      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = `StainPatch:${index}`;
      mesh.position.set(spec.x, STAIN_SURFACE_OFFSET_Y + index * 0.0001, spec.y);
      mesh.rotation.y = spec.rotation;
      mesh.scale.set(spec.radiusX, 1, spec.radiusZ);
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.visible = false;
      mesh.renderOrder = 2;

      group.add(mesh);
      meshes.push(mesh);
    });

    indexed.stainsGroup.add(group);

    const cluster: ActiveStainCluster = {
      tableId: indexed.table.id,
      serviceCycleId,
      stainAmount: 0,
      wipeProgress: 0,
      effectiveOpacity: 0,
      group,
      specs,
      meshes,
      geometries,
      materials,
    };
    activeStains.set(indexed.table.id, cluster);
    return cluster;
  };

  const syncTableStains = (
    indexed: IndexedTable,
    tableState: TablePresentation,
    simTimeSeconds: number,
    milestones: readonly ServiceMilestones[],
  ): boolean => {
    const isClearedByMilestone = milestones.some(
      (m) =>
        m.serviceCycleId === tableState.serviceCycleId &&
        m.clearedAtSeconds !== null &&
        simTimeSeconds >= m.clearedAtSeconds,
    );
    const isCleaned =
      tableState.availability === "clean" ||
      tableState.surface === "clean" ||
      tableState.surface === "empty" ||
      tableState.wipeProgress >= 1 ||
      (tableState.cleanCompletedAtSeconds !== null &&
        simTimeSeconds >= tableState.cleanCompletedAtSeconds) ||
      isClearedByMilestone;

    const clampedStain = Math.max(0, Math.min(1, tableState.stainAmount));
    const clampedWipe = Math.max(0, Math.min(1, tableState.wipeProgress));
    const wipeFactor = Math.max(0, 1 - clampedWipe);
    const effectiveStrength = clampedStain * wipeFactor;

    if (isCleaned || !tableState.serviceCycleId || effectiveStrength <= 0.005) {
      return removeStainCluster(indexed.table.id);
    }

    const cluster = ensureStainCluster(indexed, tableState.serviceCycleId);
    const prevOpacity = cluster.effectiveOpacity;
    cluster.stainAmount = clampedStain;
    cluster.wipeProgress = clampedWipe;

    const quality = context.getQuality();
    const maxAllowedPatches = quality.characterShadows ? MAX_STAINS_PER_TABLE : 3;

    let maxPatchOpacity = 0;
    cluster.specs.forEach((spec, idx) => {
      const mesh = cluster.meshes[idx]!;
      const mat = cluster.materials[idx]!;
      if (idx >= maxAllowedPatches || clampedStain <= spec.threshold) {
        mesh.visible = false;
        mat.opacity = 0;
        return;
      }
      const localGrowth = Math.min(
        1,
        (clampedStain - spec.threshold) / Math.max(0.15, 1 - spec.threshold),
      );
      const patchOpacity = Number((spec.baseOpacity * localGrowth * wipeFactor).toFixed(4));
      mesh.visible = patchOpacity > 0.01;
      mat.opacity = patchOpacity;
      if (patchOpacity > maxPatchOpacity) maxPatchOpacity = patchOpacity;
    });

    cluster.effectiveOpacity = maxPatchOpacity;
    return Math.abs(prevOpacity - maxPatchOpacity) > 0.005;
  };

  const applySnapshot = (snapshot: PresentationSnapshot): void => {
    let changed = false;
    // คราบไม่ทอดเงา (castShadow = false) การจางลงทีละเฟรมขณะเช็ดจึงไม่ต้องวาด shadow map ใหม่
    // ต่างจากจาน/อาหารที่ทอดเงาจริง — แยกสองเรื่องนี้ ไม่ให้ฉากที่มีคนเช็ดโต๊ะวาดเงาใหม่ทุกเฟรม
    let shadowsChanged = false;

    // If runId or layoutRevision changed, clear stale props from previous run
    if (
      (lastRunId !== null && lastRunId !== snapshot.runId) ||
      (lastLayoutRevision !== null && lastLayoutRevision !== snapshot.layoutRevision)
    ) {
      if (clearAllDynamicProps()) { changed = true; shadowsChanged = true; }
    }
    lastRunId = snapshot.runId;
    lastLayoutRevision = snapshot.layoutRevision;

    const tableStates = new Map<string, TablePresentation>(
      snapshot.tables.map((t) => [t.tableId, t]),
    );

    // Group placed meals by table
    const placedMealsByTable = new Map<string, MealPresentation[]>();
    for (const meal of snapshot.meals) {
      const tableState = tableStates.get(meal.tableId);
      if (!isMealPlacedOnTable(meal, tableState, snapshot.milestones, snapshot.simTimeSeconds)) {
        continue;
      }
      let list = placedMealsByTable.get(meal.tableId);
      if (!list) {
        list = [];
        placedMealsByTable.set(meal.tableId, list);
      }
      list.push(meal);
    }

    const liveMealIds = new Set<string>();

    for (const [tableId, mealsOnTable] of placedMealsByTable) {
      const indexed = indexedTables.get(tableId);
      if (!indexed) continue;

      const signature = JSON.stringify(mealsOnTable.map((item) => [item.mealId, item.chairId, item.foodKind, item.anchor.x, item.anchor.y]));
      let cached = dishAnchorCache.get(tableId);
      if (!cached || cached.signature !== signature) {
        const anchors = new Map<string, ReturnType<typeof resolveTableDishAnchor>>();
        for (const item of mealsOnTable) {
          anchors.set(item.mealId, resolveTableDishAnchor({ meal: item, table: indexed.table, tableShape: indexed.shape,
            chair: indexedChairs.get(item.chairId), siblingMealsOnTable: mealsOnTable, chairs: indexedChairs }));
        }
        cached = { signature, anchors };
        dishAnchorCache.set(tableId, cached);
      }

      for (const meal of mealsOnTable) {
        liveMealIds.add(meal.mealId);
        const progress: FoodProgress = meal.progress ?? foodProgressFromConsumed(meal.consumed);
        const { localAnchor, rotationRadians } = cached.anchors.get(meal.mealId)!;

        let instance = activeDishes.get(meal.mealId);
        if (
          !instance ||
          instance.foodKind !== meal.foodKind ||
          instance.tableId !== meal.tableId ||
          instance.serviceCycleId !== meal.serviceCycleId
        ) {
          if (instance) removeDishInstance(meal.mealId);

          const dishRoot = new THREE.Group();
          dishRoot.name = `TableDish:${meal.mealId}`;
          dishRoot.position.set(localAnchor.x, 0, localAnchor.y);
          dishRoot.rotation.y = rotationRadians;

          const instantiated = instantiateFoodContent(meal.foodKind, progress);
          dishRoot.add(instantiated.content);
          indexed.dishesGroup.add(dishRoot);

          instance = {
            mealId: meal.mealId,
            tableId: meal.tableId,
            chairId: meal.chairId,
            serviceCycleId: meal.serviceCycleId,
            foodKind: meal.foodKind,
            progress,
            consumed: meal.consumed,
            localAnchor,
            rotationRadians,
            root: dishRoot,
            content: instantiated.content,
            usingLoadedAsset: instantiated.usingLoadedAsset,
            usedLiteVariant: instantiated.usedLiteVariant,
            ownedGeometries: instantiated.ownedGeometries,
            ownedMaterials: instantiated.ownedMaterials,
          };
          activeDishes.set(meal.mealId, instance);
          changed = true;
          shadowsChanged = true;
        } else {
          // Update existing dish position & state if changed
          if (
            Math.abs(instance.localAnchor.x - localAnchor.x) > 1e-4 ||
            Math.abs(instance.localAnchor.y - localAnchor.y) > 1e-4 ||
            Math.abs(instance.rotationRadians - rotationRadians) > 1e-4
          ) {
            instance.localAnchor = localAnchor;
            instance.rotationRadians = rotationRadians;
            instance.root.position.set(localAnchor.x, 0, localAnchor.y);
            instance.root.rotation.y = rotationRadians;
            changed = true;
            shadowsChanged = true;
          }
          instance.consumed = meal.consumed;
          if (instance.progress !== progress) {
            instance.progress = progress;
            applyFoodProgressVisibility(instance.content, progress);
            changed = true;
            shadowsChanged = true;
          }
        }
      }
    }

    // Remove dishes that are no longer on any table (e.g., table cleaned or new cycle)
    for (const mealId of [...activeDishes.keys()]) {
      if (!liveMealIds.has(mealId)) {
        if (removeDishInstance(mealId)) { changed = true; shadowsChanged = true; }
      }
    }

    // Sync stains for every indexed table
    for (const [tableId, indexed] of indexedTables) {
      const tableState = tableStates.get(tableId);
      if (!tableState) {
        if (removeStainCluster(tableId)) changed = true;
        continue;
      }
      if (syncTableStains(indexed, tableState, snapshot.simTimeSeconds, snapshot.milestones)) {
        changed = true;
      }
    }

    if (shadowsChanged) context.invalidateShadows();
    if (changed) context.invalidate();
  };

  return {
    syncLayout(layout: StoreLayout): void {
      if (disposed) return;
      clearTableAnchors();

      for (const item of layout.objects) {
        if (item.type === "chair") {
          indexedChairs.set(item.id, item);
        } else if (item.type === "table") {
          const center = objectCenter(item);
          const style = tableStyleOf(item);
          const rotationRadians = THREE.MathUtils.degToRad(-item.rotation);

          const group = new THREE.Group();
          group.name = `TableSurface:${item.id}`;
          group.position.set(center.x, TABLETOP_SURFACE_Y, center.y);
          group.rotation.y = rotationRadians;

          const dishesGroup = new THREE.Group();
          dishesGroup.name = `TableDishes:${item.id}`;
          const stainsGroup = new THREE.Group();
          stainsGroup.name = `TableStainsRoot:${item.id}`;

          group.add(dishesGroup, stainsGroup);
          context.root.add(group);

          indexedTables.set(item.id, {
            table: item,
            center,
            rotationRadians,
            shape: style.shape,
            group,
            dishesGroup,
            stainsGroup,
          });
        }
      }
      context.root.updateMatrixWorld(true);
    },

    update(frame: SceneFrame): void {
      if (disposed) return;
      if (!frame.simulating) {
        if (clearAllDynamicProps()) {
          context.invalidateShadows();
          context.invalidate();
        }
        return;
      }
      if (!frame.presentation) return;
      applySnapshot(frame.presentation);
    },

    reset(): void {
      if (disposed) return;
      lastRunId = null;
      lastLayoutRevision = null;
      if (clearAllDynamicProps()) {
        context.invalidateShadows();
        context.invalidate();
      }
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      clearTableAnchors();
      for (const cache of templates.values()) {
        disposeObjectTree(cache.full);
        disposeObjectTree(cache.lite);
        cache.full = null;
        cache.lite = null;
      }
      templates.clear();
    },

    getDishPlacements(tableId?: string): readonly TableDishPlacementInfo[] {
      // ห้ามบังคับคำนวณเมทริกซ์ทั้งฉากที่นี่: ฟังก์ชันนี้ถูกเรียกต่อ "ลูกค้าหนึ่งคน" ในทุกเฟรม
      // ฉากหนาแน่น (ลูกค้า 66 คน ล้วนมีกระดูกของตัวเอง) จึงไล่ทั้ง scene graph ซ้ำ 66 รอบต่อเฟรม
      // getWorldPosition() อัปเดตเมทริกซ์ของสายพ่อแม่ให้เองอยู่แล้ว (updateWorldMatrix(true, false))
      const out: TableDishPlacementInfo[] = [];
      for (const dish of activeDishes.values()) {
        if (tableId !== undefined && dish.tableId !== tableId) continue;
        const worldPos = new THREE.Vector3();
        dish.root.getWorldPosition(worldPos);
        out.push({
          mealId: dish.mealId,
          tableId: dish.tableId,
          chairId: dish.chairId,
          serviceCycleId: dish.serviceCycleId,
          foodKind: dish.foodKind,
          progress: dish.progress,
          consumed: dish.consumed,
          localAnchor: { ...dish.localAnchor },
          worldPosition: worldPos,
          rotationRadians: dish.rotationRadians,
          usingLoadedAsset: dish.usingLoadedAsset,
        });
      }
      return out;
    },

    getTableStainInfo(tableId: string): TableStainClusterInfo | null {
      const cluster = activeStains.get(tableId);
      if (!cluster) return null;
      const activeStainCount = cluster.meshes.filter((m) => m.visible).length;
      return {
        tableId: cluster.tableId,
        serviceCycleId: cluster.serviceCycleId,
        stainAmount: cluster.stainAmount,
        wipeProgress: cluster.wipeProgress,
        effectiveOpacity: cluster.effectiveOpacity,
        activeStainCount,
        localCenters: cluster.specs.map((s) => ({ x: s.x, y: s.y })),
      };
    },

    getDishObject(mealId: string): THREE.Object3D | null {
      return activeDishes.get(mealId)?.root ?? null;
    },

    getStats() {
      let activeStainMeshCount = 0;
      for (const cluster of activeStains.values()) {
        activeStainMeshCount += cluster.meshes.filter((m) => m.visible).length;
      }
      let cachedTemplateCount = 0;
      for (const cache of templates.values()) {
        if (cache.full) cachedTemplateCount++;
        if (cache.lite) cachedTemplateCount++;
      }
      return {
        tableCount: indexedTables.size,
        activeDishCount: activeDishes.size,
        activeStainTableCount: activeStains.size,
        activeStainMeshCount,
        cachedTemplateCount,
        disposedInstanceMaterials,
        disposedInstanceGeometries,
      };
    },
  };
}

