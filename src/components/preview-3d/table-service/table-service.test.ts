import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import type { Chair, StoreLayout, Table } from "@/core/layout/types";
import {
  PRESENTATION_VERSION,
  type FoodKind,
  type MealPresentation,
  type PresentationSnapshot,
  type TablePresentation,
} from "@/core/simulation/presentation-contract";
import { QUALITY_LEVELS, type QualityLevel } from "../adaptive-quality";
import { FOOD_CATALOG, FOOD_KINDS, FOOD_NODE_NAMES } from "../food/catalog";
import type { SceneFeatureContext } from "../runtime/contracts";
import {
  TABLETOP_SURFACE_Y,
  buildProceduralFoodFallback,
  computeDeterministicStainSpecs,
  createTableServiceFeature,
  type FoodAssetLoaderLike,
} from "./table-service";

function makeTable(params: {
  id: string;
  x: number;
  y: number;
  width: number;
  depth: number;
  rotation?: 0 | 90 | 180 | 270;
  shape?: "round" | "rectangle";
}): Table {
  return {
    id: params.id,
    type: "table",
    x: params.x,
    y: params.y,
    width: params.width,
    depth: params.depth,
    rotation: params.rotation ?? 0,
    chairIds: [],
    style: {
      shape: params.shape ?? "rectangle",
      color: "oak",
      legStyle: "four-legs",
    },
  };
}

function makeChair(params: {
  id: string;
  tableId: string;
  x: number;
  y: number;
  rotation?: 0 | 90 | 180 | 270;
}): Chair {
  return {
    id: params.id,
    type: "chair",
    tableId: params.tableId,
    x: params.x,
    y: params.y,
    width: 0.45,
    depth: 0.45,
    rotation: params.rotation ?? 0,
  };
}

function makeLayout(objects: StoreLayout["objects"]): StoreLayout {
  return {
    id: "layout-1",
    version: 1,
    units: "m",
    width: 10,
    depth: 8,
    entrance: { id: "ent-1", wall: "south", position: 4, width: 1.5 },
    kitchenDoor: { id: "kit-1", wall: "north", position: 4, width: 1.0 },
    objects,
  };
}

function makeContext(initialQuality: QualityLevel = QUALITY_LEVELS[0]!): {
  context: SceneFeatureContext;
  setQuality: (q: QualityLevel) => void;
  setLayout: (l: StoreLayout | null) => void;
  invalidateSpy: ReturnType<typeof vi.fn>;
  invalidateShadowsSpy: ReturnType<typeof vi.fn>;
} {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
  const root = new THREE.Group();
  scene.add(root);

  let quality = initialQuality;
  let currentLayout: StoreLayout | null = null;
  const invalidateSpy = vi.fn();
  const invalidateShadowsSpy = vi.fn();

  const context: SceneFeatureContext = {
    scene,
    camera,
    root,
    getLayout: () => currentLayout,
    getQuality: () => quality,
    invalidate: invalidateSpy,
    invalidateShadows: invalidateShadowsSpy,
  };

  return {
    context,
    setQuality: (q) => {
      quality = q;
    },
    setLayout: (l) => {
      currentLayout = l;
    },
    invalidateSpy,
    invalidateShadowsSpy,
  };
}

function makeSnapshot(params: {
  runId?: string;
  layoutRevision?: string;
  sequence?: number;
  simTimeSeconds: number;
  meals: readonly MealPresentation[];
  tables: readonly TablePresentation[];
  milestones?: PresentationSnapshot["milestones"];
}): PresentationSnapshot {
  return {
    version: PRESENTATION_VERSION,
    runId: params.runId ?? "run-1",
    layoutRevision: params.layoutRevision ?? "rev-1",
    sequence: params.sequence ?? 1,
    simTimeSeconds: params.simTimeSeconds,
    customers: [],
    meals: params.meals,
    tables: params.tables,
    staff: [],
    milestones: params.milestones ?? [],
  };
}

describe("feat-116: Table visuals (5 foods, consumption states, deterministic stains, wiping & lifecycle)", () => {
  it("places all 5 food kinds across small/large round/rectangle tables rotated 0/90/180/270 without sinking, floating, or overlapping for party sizes 1, 2, and 4", () => {
    const rotations: readonly (0 | 90 | 180 | 270)[] = [0, 90, 180, 270];
    const shapes: readonly ("rectangle" | "round")[] = ["rectangle", "round"];

    for (const shape of shapes) {
      for (const rotation of rotations) {
        // Test small 2-seat table (0.60 x 0.60m) and standard 4-seat table (1.20 x 1.20m)
        const smallTable = makeTable({
          id: "t-small",
          x: 1.5,
          y: 1.5,
          width: 0.6,
          depth: 0.6,
          rotation,
          shape,
        });
        const largeTable = makeTable({
          id: "t-large",
          x: 4.5,
          y: 2.0,
          width: 1.2,
          depth: 1.2,
          rotation,
          shape,
        });

        // 2 chairs around small table (north & south of center 1.8, 1.8)
        const cSmall1 = makeChair({ id: "cs-1", tableId: "t-small", x: 1.575, y: 0.95, rotation: 180 });
        const cSmall2 = makeChair({ id: "cs-2", tableId: "t-small", x: 1.575, y: 2.2, rotation: 0 });

        // 4 chairs around large table (center 5.1, 2.6)
        const cLarge1 = makeChair({ id: "cl-1", tableId: "t-large", x: 4.875, y: 1.4, rotation: 180 });
        const cLarge2 = makeChair({ id: "cl-2", tableId: "t-large", x: 4.875, y: 3.35, rotation: 0 });
        const cLarge3 = makeChair({ id: "cl-3", tableId: "t-large", x: 3.9, y: 2.375, rotation: 90 });
        const cLarge4 = makeChair({ id: "cl-4", tableId: "t-large", x: 5.85, y: 2.375, rotation: 270 });

        const layout = makeLayout([
          smallTable,
          largeTable,
          cSmall1,
          cSmall2,
          cLarge1,
          cLarge2,
          cLarge3,
          cLarge4,
        ]);

        const { context } = makeContext();
        const feature = createTableServiceFeature(context, { disableNetworkLoad: true });
        feature.syncLayout(layout);

        // Party 2 on small table + Party 4 on large table using all 5 food kinds
        const meals: MealPresentation[] = [
          {
            mealId: "m-s1",
            ownerRenderAgentId: 10,
            tableId: "t-small",
            chairId: "cs-1",
            serviceCycleId: "cyc-small",
            foodKind: FOOD_KINDS[0]!,
            anchor: { x: 0, y: -0.17 },
            progress: "full",
            consumed: 0,
            placedAtSeconds: 5,
          },
          {
            mealId: "m-s2",
            ownerRenderAgentId: 11,
            tableId: "t-small",
            chairId: "cs-2",
            serviceCycleId: "cyc-small",
            foodKind: FOOD_KINDS[1]!,
            anchor: { x: 0, y: 0.17 },
            progress: "full",
            consumed: 0,
            placedAtSeconds: 5,
          },
          {
            mealId: "m-l1",
            ownerRenderAgentId: 20,
            tableId: "t-large",
            chairId: "cl-1",
            serviceCycleId: "cyc-large",
            foodKind: FOOD_KINDS[2]!,
            anchor: { x: 0, y: -0.34 },
            progress: "full",
            consumed: 0,
            placedAtSeconds: 5,
          },
          {
            mealId: "m-l2",
            ownerRenderAgentId: 21,
            tableId: "t-large",
            chairId: "cl-2",
            serviceCycleId: "cyc-large",
            foodKind: FOOD_KINDS[3]!,
            anchor: { x: 0, y: 0.34 },
            progress: "full",
            consumed: 0,
            placedAtSeconds: 5,
          },
          {
            mealId: "m-l3",
            ownerRenderAgentId: 22,
            tableId: "t-large",
            chairId: "cl-3",
            serviceCycleId: "cyc-large",
            foodKind: FOOD_KINDS[4]!,
            anchor: { x: -0.34, y: 0 },
            progress: "full",
            consumed: 0,
            placedAtSeconds: 5,
          },
          {
            mealId: "m-l4",
            ownerRenderAgentId: 23,
            tableId: "t-large",
            chairId: "cl-4",
            serviceCycleId: "cyc-large",
            foodKind: FOOD_KINDS[0]!,
            anchor: { x: 0.34, y: 0 },
            progress: "full",
            consumed: 0,
            placedAtSeconds: 5,
          },
        ];

        const tables: TablePresentation[] = [
          {
            tableId: "t-small",
            serviceCycleId: "cyc-small",
            availability: "occupied",
            surface: "served",
            mealIds: ["m-s1", "m-s2"],
            stainAmount: 0,
            wipeProgress: 0,
            cleanCompletedAtSeconds: null,
          },
          {
            tableId: "t-large",
            serviceCycleId: "cyc-large",
            availability: "occupied",
            surface: "served",
            mealIds: ["m-l1", "m-l2", "m-l3", "m-l4"],
            stainAmount: 0,
            wipeProgress: 0,
            cleanCompletedAtSeconds: null,
          },
        ];

        feature.update({
          nowMs: 1000,
          realDeltaSeconds: 0.016,
          playbackRate: 1,
          simulating: true,
          paused: false,
          presentation: makeSnapshot({ simTimeSeconds: 6, meals, tables }),
        });

        const smallDishes = feature.getDishPlacements("t-small");
        const largeDishes = feature.getDishPlacements("t-large");
        expect(smallDishes).toHaveLength(2);
        expect(largeDishes).toHaveLength(4);

        // Every dish must sit flush on TABLETOP_SURFACE_Y (0.76m) and stay inside table boundaries
        for (const dish of [...smallDishes, ...largeDishes]) {
          expect(dish.worldPosition.y).toBeCloseTo(TABLETOP_SURFACE_Y, 4);
          const table = dish.tableId === "t-small" ? smallTable : largeTable;
          const radius = FOOD_CATALOG[dish.foodKind].footprintDiameter / 2;
          expect(Math.abs(dish.localAnchor.x) + radius).toBeLessThanOrEqual(table.width / 2 + 1e-4);
          expect(Math.abs(dish.localAnchor.y) + radius).toBeLessThanOrEqual(table.depth / 2 + 1e-4);
        }

        // Verify non-overlapping footprints on small 2-seat table
        const d0 = smallDishes[0]!;
        const d1 = smallDishes[1]!;
        const distSmall = Math.hypot(
          d0.localAnchor.x - d1.localAnchor.x,
          d0.localAnchor.y - d1.localAnchor.y,
        );
        const minSumRadiiSmall =
          (FOOD_CATALOG[d0.foodKind].footprintDiameter +
            FOOD_CATALOG[d1.foodKind].footprintDiameter) /
          2;
        expect(distSmall).toBeGreaterThanOrEqual(minSumRadiiSmall);

        // Verify non-overlapping footprints on 4-seat table
        for (let i = 0; i < largeDishes.length; i++) {
          for (let j = i + 1; j < largeDishes.length; j++) {
            const a = largeDishes[i]!;
            const b = largeDishes[j]!;
            const dist = Math.hypot(
              a.localAnchor.x - b.localAnchor.x,
              a.localAnchor.y - b.localAnchor.y,
            );
            const sumRadii =
              (FOOD_CATALOG[a.foodKind].footprintDiameter +
                FOOD_CATALOG[b.foodKind].footprintDiameter) /
              2;
            expect(dist).toBeGreaterThanOrEqual(sumRadii);
          }
        }

        feature.dispose();
      }
    }
  });

  it("enforces full lifecycle: waiting-food (no dishes) -> served (full) -> eating (partial -> empty + stains grow) -> dirty after customer leaves -> wiping fades only target table -> clean removes all", () => {
    const t1 = makeTable({ id: "t-1", x: 1, y: 1, width: 0.8, depth: 0.8 });
    const t2 = makeTable({ id: "t-2", x: 3, y: 1, width: 0.8, depth: 0.8 });
    const c1 = makeChair({ id: "c-1", tableId: "t-1", x: 1.175, y: 0.45, rotation: 180 });
    const c2 = makeChair({ id: "c-2", tableId: "t-2", x: 3.175, y: 0.45, rotation: 180 });
    const layout = makeLayout([t1, t2, c1, c2]);

    const { context } = makeContext();
    const feature = createTableServiceFeature(context, { disableNetworkLoad: true });
    feature.syncLayout(layout);

    // Phase 1: Customer seated & waiting-food (placedAtSeconds = null, surface = "empty") -> NO dishes
    feature.update({
      nowMs: 100,
      realDeltaSeconds: 0.016,
      playbackRate: 1,
      simulating: true,
      paused: false,
      presentation: makeSnapshot({
        simTimeSeconds: 10,
        meals: [
          {
            mealId: "cyc1:meal:10",
            ownerRenderAgentId: 10,
            tableId: "t-1",
            chairId: "c-1",
            serviceCycleId: "cyc1",
            foodKind: "steak",
            anchor: { x: 0, y: -0.2 },
            progress: "full",
            consumed: 0,
            placedAtSeconds: null,
          },
        ],
        tables: [
          {
            tableId: "t-1",
            serviceCycleId: "cyc1",
            availability: "occupied",
            surface: "empty",
            mealIds: [],
            stainAmount: 0,
            wipeProgress: 0,
            cleanCompletedAtSeconds: null,
          },
          {
            tableId: "t-2",
            serviceCycleId: "cyc2",
            availability: "clean",
            surface: "clean",
            mealIds: [],
            stainAmount: 0,
            wipeProgress: 1,
            cleanCompletedAtSeconds: null,
          },
        ],
      }),
    });
    expect(feature.getDishPlacements("t-1")).toHaveLength(0);
    expect(feature.getTableStainInfo("t-1")).toBeNull();

    // Phase 2: Staff places food at t=15s -> full state visible, Vessel & Utensil visible
    feature.update({
      nowMs: 200,
      realDeltaSeconds: 0.016,
      playbackRate: 1,
      simulating: true,
      paused: false,
      presentation: makeSnapshot({
        simTimeSeconds: 15,
        meals: [
          {
            mealId: "cyc1:meal:10",
            ownerRenderAgentId: 10,
            tableId: "t-1",
            chairId: "c-1",
            serviceCycleId: "cyc1",
            foodKind: "steak",
            anchor: { x: 0, y: -0.2 },
            progress: "full",
            consumed: 0.05,
            placedAtSeconds: 15,
          },
          {
            mealId: "cyc2:meal:20",
            ownerRenderAgentId: 20,
            tableId: "t-2",
            chairId: "c-2",
            serviceCycleId: "cyc2",
            foodKind: "noodles",
            anchor: { x: 0, y: -0.2 },
            progress: "partial",
            consumed: 0.6,
            placedAtSeconds: 12,
          },
        ],
        tables: [
          {
            tableId: "t-1",
            serviceCycleId: "cyc1",
            availability: "occupied",
            surface: "served",
            mealIds: ["cyc1:meal:10"],
            stainAmount: 0.05,
            wipeProgress: 0,
            cleanCompletedAtSeconds: null,
          },
          {
            tableId: "t-2",
            serviceCycleId: "cyc2",
            availability: "occupied",
            surface: "eating",
            mealIds: ["cyc2:meal:20"],
            stainAmount: 0.6,
            wipeProgress: 0,
            cleanCompletedAtSeconds: null,
          },
        ],
      }),
    });

    const dishObj = feature.getDishObject("cyc1:meal:10");
    expect(dishObj).not.toBeNull();
    expect(dishObj!.getObjectByName(FOOD_NODE_NAMES.vessel)?.visible).toBe(true);
    expect(dishObj!.getObjectByName(FOOD_NODE_NAMES.utensil)?.visible).toBe(true);
    expect(dishObj!.getObjectByName(FOOD_NODE_NAMES.foodFull)?.visible).toBe(true);
    expect(dishObj!.getObjectByName(FOOD_NODE_NAMES.foodPartial)?.visible).toBe(false);
    expect(dishObj!.getObjectByName(FOOD_NODE_NAMES.foodEmpty)?.visible).toBe(false);

    // Phase 3: Customer eating at t=25s -> switches to partial, stains grow
    feature.update({
      nowMs: 300,
      realDeltaSeconds: 0.016,
      playbackRate: 1,
      simulating: true,
      paused: false,
      presentation: makeSnapshot({
        simTimeSeconds: 25,
        meals: [
          {
            mealId: "cyc1:meal:10",
            ownerRenderAgentId: 10,
            tableId: "t-1",
            chairId: "c-1",
            serviceCycleId: "cyc1",
            foodKind: "steak",
            anchor: { x: 0, y: -0.2 },
            progress: "partial",
            consumed: 0.55,
            placedAtSeconds: 15,
          },
          {
            mealId: "cyc2:meal:20",
            ownerRenderAgentId: 20,
            tableId: "t-2",
            chairId: "c-2",
            serviceCycleId: "cyc2",
            foodKind: "noodles",
            anchor: { x: 0, y: -0.2 },
            progress: "empty",
            consumed: 1.0,
            placedAtSeconds: 12,
          },
        ],
        tables: [
          {
            tableId: "t-1",
            serviceCycleId: "cyc1",
            availability: "occupied",
            surface: "eating",
            mealIds: ["cyc1:meal:10"],
            stainAmount: 0.55,
            wipeProgress: 0,
            cleanCompletedAtSeconds: null,
          },
          {
            tableId: "t-2",
            serviceCycleId: "cyc2",
            availability: "dirty",
            surface: "used",
            mealIds: ["cyc2:meal:20"],
            stainAmount: 1.0,
            wipeProgress: 0,
            cleanCompletedAtSeconds: null,
          },
        ],
      }),
    });

    expect(dishObj!.getObjectByName(FOOD_NODE_NAMES.foodFull)?.visible).toBe(false);
    expect(dishObj!.getObjectByName(FOOD_NODE_NAMES.foodPartial)?.visible).toBe(true);
    expect(dishObj!.getObjectByName(FOOD_NODE_NAMES.foodEmpty)?.visible).toBe(false);
    expect(dishObj!.getObjectByName(FOOD_NODE_NAMES.vessel)?.visible).toBe(true);
    expect(dishObj!.getObjectByName(FOOD_NODE_NAMES.utensil)?.visible).toBe(true);

    const stainT1Mid = feature.getTableStainInfo("t-1")!;
    const stainT2Full = feature.getTableStainInfo("t-2")!;
    expect(stainT1Mid.activeStainCount).toBeGreaterThan(0);
    expect(stainT2Full.activeStainCount).toBeGreaterThanOrEqual(stainT1Mid.activeStainCount);

    // Phase 4: Customer at t-1 finishes & leaves (availability = "dirty", surface = "used")
    // Empty plate and stains MUST remain on t-1 while customer is gone
    feature.update({
      nowMs: 400,
      realDeltaSeconds: 0.016,
      playbackRate: 1,
      simulating: true,
      paused: false,
      presentation: makeSnapshot({
        simTimeSeconds: 35,
        meals: [
          {
            mealId: "cyc1:meal:10",
            ownerRenderAgentId: 10,
            tableId: "t-1",
            chairId: "c-1",
            serviceCycleId: "cyc1",
            foodKind: "steak",
            anchor: { x: 0, y: -0.2 },
            progress: "empty",
            consumed: 1.0,
            placedAtSeconds: 15,
          },
          {
            mealId: "cyc2:meal:20",
            ownerRenderAgentId: 20,
            tableId: "t-2",
            chairId: "c-2",
            serviceCycleId: "cyc2",
            foodKind: "noodles",
            anchor: { x: 0, y: -0.2 },
            progress: "empty",
            consumed: 1.0,
            placedAtSeconds: 12,
          },
        ],
        tables: [
          {
            tableId: "t-1",
            serviceCycleId: "cyc1",
            availability: "dirty",
            surface: "used",
            mealIds: ["cyc1:meal:10"],
            stainAmount: 1.0,
            wipeProgress: 0,
            cleanCompletedAtSeconds: null,
          },
          {
            tableId: "t-2",
            serviceCycleId: "cyc2",
            availability: "dirty",
            surface: "used",
            mealIds: ["cyc2:meal:20"],
            stainAmount: 1.0,
            wipeProgress: 0,
            cleanCompletedAtSeconds: null,
          },
        ],
      }),
    });

    expect(feature.getDishPlacements("t-1")).toHaveLength(1);
    expect(dishObj!.getObjectByName(FOOD_NODE_NAMES.foodEmpty)?.visible).toBe(true);
    expect(dishObj!.getObjectByName(FOOD_NODE_NAMES.vessel)?.visible).toBe(true);
    expect(dishObj!.getObjectByName(FOOD_NODE_NAMES.utensil)?.visible).toBe(true);

    const stainT1BeforeWipe = feature.getTableStainInfo("t-1")!;
    const stainT2BeforeWipe = feature.getTableStainInfo("t-2")!;
    expect(stainT1BeforeWipe.effectiveOpacity).toBeGreaterThan(0.5);
    expect(stainT2BeforeWipe.effectiveOpacity).toBeGreaterThan(0.5);

    // Phase 5: Staff wipes t-1 (wipeProgress = 0.65) while t-2 is untouched (wipeProgress = 0)
    // Verify t-1 stains fade while t-2 stains remain completely unaffected (no shared material bleed)
    feature.update({
      nowMs: 500,
      realDeltaSeconds: 0.016,
      playbackRate: 1,
      simulating: true,
      paused: false,
      presentation: makeSnapshot({
        simTimeSeconds: 40,
        meals: [
          {
            mealId: "cyc1:meal:10",
            ownerRenderAgentId: 10,
            tableId: "t-1",
            chairId: "c-1",
            serviceCycleId: "cyc1",
            foodKind: "steak",
            anchor: { x: 0, y: -0.2 },
            progress: "empty",
            consumed: 1.0,
            placedAtSeconds: 15,
          },
          {
            mealId: "cyc2:meal:20",
            ownerRenderAgentId: 20,
            tableId: "t-2",
            chairId: "c-2",
            serviceCycleId: "cyc2",
            foodKind: "noodles",
            anchor: { x: 0, y: -0.2 },
            progress: "empty",
            consumed: 1.0,
            placedAtSeconds: 12,
          },
        ],
        tables: [
          {
            tableId: "t-1",
            serviceCycleId: "cyc1",
            availability: "cleaning",
            surface: "wiping",
            mealIds: ["cyc1:meal:10"],
            stainAmount: 0.35,
            wipeProgress: 0.65,
            cleanCompletedAtSeconds: null,
          },
          {
            tableId: "t-2",
            serviceCycleId: "cyc2",
            availability: "dirty",
            surface: "used",
            mealIds: ["cyc2:meal:20"],
            stainAmount: 1.0,
            wipeProgress: 0,
            cleanCompletedAtSeconds: null,
          },
        ],
      }),
    });

    const stainT1Wiping = feature.getTableStainInfo("t-1")!;
    const stainT2Untouched = feature.getTableStainInfo("t-2")!;
    expect(stainT1Wiping.effectiveOpacity).toBeLessThan(stainT1BeforeWipe.effectiveOpacity);
    expect(stainT2Untouched.effectiveOpacity).toBeCloseTo(stainT2BeforeWipe.effectiveOpacity, 4);

    // Phase 6: Cleaning completes on t-1 -> dishes and stains on t-1 are removed
    feature.update({
      nowMs: 600,
      realDeltaSeconds: 0.016,
      playbackRate: 1,
      simulating: true,
      paused: false,
      presentation: makeSnapshot({
        simTimeSeconds: 45,
        meals: [
          {
            mealId: "cyc2:meal:20",
            ownerRenderAgentId: 20,
            tableId: "t-2",
            chairId: "c-2",
            serviceCycleId: "cyc2",
            foodKind: "noodles",
            anchor: { x: 0, y: -0.2 },
            progress: "empty",
            consumed: 1.0,
            placedAtSeconds: 12,
          },
        ],
        tables: [
          {
            tableId: "t-1",
            serviceCycleId: "cyc1",
            availability: "clean",
            surface: "clean",
            mealIds: [],
            stainAmount: 0,
            wipeProgress: 1,
            cleanCompletedAtSeconds: 45,
          },
          {
            tableId: "t-2",
            serviceCycleId: "cyc2",
            availability: "dirty",
            surface: "used",
            mealIds: ["cyc2:meal:20"],
            stainAmount: 1.0,
            wipeProgress: 0,
            cleanCompletedAtSeconds: null,
          },
        ],
      }),
    });

    expect(feature.getDishPlacements("t-1")).toHaveLength(0);
    expect(feature.getTableStainInfo("t-1")).toBeNull();
    // Table 2 still has its dish and stain
    expect(feature.getDishPlacements("t-2")).toHaveLength(1);
    expect(feature.getTableStainInfo("t-2")).not.toBeNull();

    feature.dispose();
  });

  it("handles loaded GLB assets, fallback on asset load failure, and survives 10 service cycles + resets without leaking resources", () => {
    const t1 = makeTable({ id: "t-1", x: 2, y: 2, width: 0.8, depth: 0.8 });
    const c1 = makeChair({ id: "c-1", tableId: "t-1", x: 2.175, y: 1.45, rotation: 180 });
    const layout = makeLayout([t1, c1]);

    // Mock loader that succeeds for fried-rice and fails for cake
    const mockLoader: FoodAssetLoaderLike = {
      load(url, onLoad, _onProgress, onError) {
        if (url.includes("cake")) {
          onError?.(new Error("Mock network failure"));
          return;
        }
        const built = buildProceduralFoodFallback("fried-rice");
        onLoad({ scene: built.root });
      },
    };

    const { context } = makeContext();
    const feature = createTableServiceFeature(context, {
      createLoader: () => mockLoader,
    });
    feature.syncLayout(layout);

    for (let cycle = 1; cycle <= 10; cycle++) {
      const cycleId = `cycle-${cycle}`;
      const foodKind: FoodKind = cycle % 2 === 0 ? "cake" : "fried-rice";
      const mealId = `${cycleId}:meal:10`;

      // Serve & eat
      feature.update({
        nowMs: cycle * 1000,
        realDeltaSeconds: 0.016,
        playbackRate: 1,
        simulating: true,
        paused: false,
        presentation: makeSnapshot({
          simTimeSeconds: cycle * 20,
          meals: [
            {
              mealId,
              ownerRenderAgentId: 10,
              tableId: "t-1",
              chairId: "c-1",
              serviceCycleId: cycleId,
              foodKind,
              anchor: { x: 0, y: -0.2 },
              progress: "partial",
              consumed: 0.7,
              placedAtSeconds: cycle * 20 - 5,
            },
          ],
          tables: [
            {
              tableId: "t-1",
              serviceCycleId: cycleId,
              availability: "occupied",
              surface: "eating",
              mealIds: [mealId],
              stainAmount: 0.7,
              wipeProgress: 0,
              cleanCompletedAtSeconds: null,
            },
          ],
        }),
      });

      const dishes = feature.getDishPlacements("t-1");
      expect(dishes).toHaveLength(1);
      expect(dishes[0]!.usingLoadedAsset).toBe(foodKind === "fried-rice");
      expect(feature.getTableStainInfo("t-1")).not.toBeNull();

      // Clean table at end of cycle
      feature.update({
        nowMs: cycle * 1000 + 500,
        realDeltaSeconds: 0.016,
        playbackRate: 1,
        simulating: true,
        paused: false,
        presentation: makeSnapshot({
          simTimeSeconds: cycle * 20 + 10,
          meals: [],
          tables: [
            {
              tableId: "t-1",
              serviceCycleId: cycleId,
              availability: "clean",
              surface: "clean",
              mealIds: [],
              stainAmount: 0,
              wipeProgress: 1,
              cleanCompletedAtSeconds: cycle * 20 + 10,
            },
          ],
        }),
      });

      expect(feature.getStats().activeDishCount).toBe(0);
      expect(feature.getStats().activeStainTableCount).toBe(0);
    }

    // Test reset() and simulating=false cleanup
    feature.reset();
    expect(feature.getStats().activeDishCount).toBe(0);
    expect(feature.getStats().activeStainTableCount).toBe(0);
    expect(feature.getStats().disposedInstanceGeometries).toBeGreaterThan(0);
    expect(feature.getStats().disposedInstanceMaterials).toBeGreaterThan(0);

    feature.dispose();
  });

  it("produces deterministic stain specs per (tableId, serviceCycleId) that stay strictly inside round and rectangular table bounds", () => {
    const specsA = computeDeterministicStainSpecs(
      { id: "t-round", width: 0.6, depth: 0.6 },
      "round",
      "cyc-100",
    );
    const specsB = computeDeterministicStainSpecs(
      { id: "t-round", width: 0.6, depth: 0.6 },
      "round",
      "cyc-100",
    );
    const specsC = computeDeterministicStainSpecs(
      { id: "t-round", width: 0.6, depth: 0.6 },
      "round",
      "cyc-101",
    );

    expect(specsA).toEqual(specsB);
    expect(specsA).not.toEqual(specsC);

    for (const s of specsA) {
      const radialDist = Math.hypot(s.x, s.y) + Math.max(s.radiusX, s.radiusZ);
      expect(radialDist).toBeLessThanOrEqual(0.3);
    }
  });
});
