import type { FoodKind, FoodProgress, PresentationPoint } from "@/core/simulation/presentation-contract";

export const FOOD_CATALOG_VERSION = 1 as const;

/** Fixed order of all 5 menu items for deterministic hashing and iteration. */
export const FOOD_KINDS: readonly FoodKind[] = [
  "fried-rice",
  "noodles",
  "steak",
  "salad",
  "cake",
] as const;

export const FOOD_PROGRESS_ORDER: readonly FoodProgress[] = [
  "full",
  "partial",
  "empty",
] as const;

/** Canonical node names required inside every exported food GLB. */
export const FOOD_NODE_NAMES = {
  root: "FoodRoot",
  vessel: "Vessel",
  foodFull: "FoodFull",
  foodPartial: "FoodPartial",
  foodEmpty: "FoodEmpty",
  utensil: "Utensil",
} as const;

export type UtensilKind = "spoon" | "chopsticks-spoon" | "fork-knife" | "fork" | "dessert-fork";
export type VesselKind = "plate" | "bowl" | "steak-plate" | "salad-bowl" | "dessert-plate";

/** Budget limits frozen by contract v1 and verified in feat-103. */
export const FOOD_ASSET_BUDGET = {
  maxFullTriangles: 8000,
  maxLiteTriangles: 2000,
  maxFullBytes: 300 * 1024,
  maxLiteBytes: 100 * 1024,
  maxFootprintDiameterMeters: 0.26,
  minFootprintDiameterMeters: 0.14,
  maxHeightMeters: 0.16,
  minHeightMeters: 0.025,
} as const;

/** Tray and small-table physical dimensions (metres) used for layout & collision fixtures. */
export const FOOD_SURFACE_FIXTURES = {
  tray: {
    width: 0.42,
    depth: 0.30,
    surfaceY: 0.011,
  },
  smallTable2Seats: {
    width: 0.60,
    depth: 0.60,
    surfaceY: 0.76,
  },
  standardTable2Seats: {
    width: 0.80,
    depth: 0.80,
    surfaceY: 0.76,
  },
  standardTable4Seats: {
    width: 1.20,
    depth: 1.20,
    surfaceY: 0.76,
  },
} as const;

export interface FoodAnchorSpec {
  /** Base origin in local space — must sit flush on tray/tabletop at (0, 0, 0). */
  readonly baseOrigin: readonly [0, 0, 0];
  /** Grip point on vessel rim in local (x, y, z) metres for staff hand/tray placement. */
  readonly rimGrip: readonly [number, number, number];
  /** Resting utensil anchor in local (x, y, z) metres inside the vessel footprint. */
  readonly utensilRest: readonly [number, number, number];
  /** Center of edible food mass in local (x, y, z) metres for customer eating motion. */
  readonly biteTarget: readonly [number, number, number];
}

export interface FoodCatalogEntry {
  readonly id: FoodKind;
  readonly label: string;
  readonly description: string;
  readonly vesselKind: VesselKind;
  readonly utensilKind: UtensilKind;
  /** Diameter of the vessel footprint in metres (≤ 0.26 m). */
  readonly footprintDiameter: number;
  /** Nominal height of the full dish in metres. */
  readonly nominalHeight: number;
  readonly urls: {
    readonly full: string;
    readonly lite: string;
  };
  readonly anchors: FoodAnchorSpec;
  /** Fallback colour tokens (sRGB hex) when GLB is still loading or unavailable in dev. */
  readonly fallbackColors: {
    readonly vessel: string;
    readonly foodPrimary: string;
    readonly foodAccent: string;
    readonly utensil: string;
  };
}

export const FOOD_CATALOG: Readonly<Record<FoodKind, FoodCatalogEntry>> = {
  "fried-rice": {
    id: "fried-rice",
    label: "ข้าวผัด",
    description: "ข้าวผัดสีทองพูนจาน พร้อมแตงกวา มะเขือเทศ ต้นหอม และช้อนสั้น",
    vesselKind: "plate",
    utensilKind: "spoon",
    footprintDiameter: 0.24,
    nominalHeight: 0.068,
    urls: {
      full: "/assets/models/food/fried-rice/fried-rice.glb",
      lite: "/assets/models/food/fried-rice/fried-rice-lite.glb",
    },
    anchors: {
      baseOrigin: [0, 0, 0],
      rimGrip: [-0.11, 0.018, 0],
      utensilRest: [0.068, 0.024, 0.018],
      biteTarget: [-0.01, 0.048, 0],
    },
    fallbackColors: {
      vessel: "#f7f4ec",
      foodPrimary: "#e3a83b",
      foodAccent: "#4e9a51",
      utensil: "#d5dce2",
    },
  },
  noodles: {
    id: "noodles",
    label: "ก๋วยเตี๋ยว",
    description: "ชามก๋วยเตี๋ยวน้ำใส เส้นและลูกชิ้น ผักโรย พร้อมตะเกียบและช้อนซุป",
    vesselKind: "bowl",
    utensilKind: "chopsticks-spoon",
    footprintDiameter: 0.22,
    nominalHeight: 0.092,
    urls: {
      full: "/assets/models/food/noodles/noodles.glb",
      lite: "/assets/models/food/noodles/noodles-lite.glb",
    },
    anchors: {
      baseOrigin: [0, 0, 0],
      rimGrip: [-0.105, 0.058, 0],
      utensilRest: [0.055, 0.072, 0.02],
      biteTarget: [0, 0.064, 0],
    },
    fallbackColors: {
      vessel: "#ebe6dc",
      foodPrimary: "#f2d272",
      foodAccent: "#8c5432",
      utensil: "#8b5a2b",
    },
  },
  steak: {
    id: "steak",
    label: "สเต๊ก",
    description: "จานสเต๊กเนื้อย่างสีน้ำตาลเข้ม พร้อมมันฝรั่ง บรอกโคลี และมีดส้อม",
    vesselKind: "steak-plate",
    utensilKind: "fork-knife",
    footprintDiameter: 0.25,
    nominalHeight: 0.056,
    urls: {
      full: "/assets/models/food/steak/steak.glb",
      lite: "/assets/models/food/steak/steak-lite.glb",
    },
    anchors: {
      baseOrigin: [0, 0, 0],
      rimGrip: [-0.118, 0.018, 0],
      utensilRest: [0.076, 0.022, 0.015],
      biteTarget: [-0.018, 0.038, 0.01],
    },
    fallbackColors: {
      vessel: "#f4f1ea",
      foodPrimary: "#6e3b26",
      foodAccent: "#5a9947",
      utensil: "#cfd6dd",
    },
  },
  salad: {
    id: "salad",
    label: "สลัด",
    description: "ชามสลัดผักสดหลากสี มะเขือเทศราชินี ข้าวโพด และส้อมสลัด",
    vesselKind: "salad-bowl",
    utensilKind: "fork",
    footprintDiameter: 0.22,
    nominalHeight: 0.078,
    urls: {
      full: "/assets/models/food/salad/salad.glb",
      lite: "/assets/models/food/salad/salad-lite.glb",
    },
    anchors: {
      baseOrigin: [0, 0, 0],
      rimGrip: [-0.102, 0.044, 0],
      utensilRest: [0.062, 0.048, 0.016],
      biteTarget: [0, 0.054, 0],
    },
    fallbackColors: {
      vessel: "#f8f6f0",
      foodPrimary: "#58a64e",
      foodAccent: "#d94f3d",
      utensil: "#d5dce2",
    },
  },
  cake: {
    id: "cake",
    label: "เค้ก",
    description: "เค้กชิ้นสามเหลี่ยมสลับชั้นครีมและสตรอว์เบอร์รีบนจานขนม พร้อมส้อมขนม",
    vesselKind: "dessert-plate",
    utensilKind: "dessert-fork",
    footprintDiameter: 0.19,
    nominalHeight: 0.072,
    urls: {
      full: "/assets/models/food/cake/cake.glb",
      lite: "/assets/models/food/cake/cake-lite.glb",
    },
    anchors: {
      baseOrigin: [0, 0, 0],
      rimGrip: [-0.088, 0.015, 0],
      utensilRest: [0.056, 0.018, 0.014],
      biteTarget: [-0.008, 0.046, 0],
    },
    fallbackColors: {
      vessel: "#fcfaf5",
      foodPrimary: "#f3ccd2",
      foodAccent: "#d83b48",
      utensil: "#dce2e8",
    },
  },
} as const;

export function isFoodKind(value: unknown): value is FoodKind {
  return typeof value === "string" && (FOOD_KINDS as readonly string[]).includes(value);
}

export function getFoodCatalogEntry(kind: FoodKind): FoodCatalogEntry {
  return FOOD_CATALOG[kind];
}

/**
 * Deterministic 32-bit hash (Avalanche / Murmur3-inspired finalizer).
 * Isolated completely from the simulation RNG stream so choosing a dish never
 * alters customer arrivals, patience, dining duration, or day analysis results.
 */
export function hashFoodChoiceIndex(seed: number, partyId: number, memberIndex: number): number {
  let h = (Math.trunc(seed) ^ 0x9e3779b9) | 0;
  h = Math.imul(h ^ (Math.trunc(partyId) + 0x85ebca6b), 0xc2b2ae35);
  h = Math.imul(h ^ (Math.trunc(memberIndex) + 0x27d4eb2f), 0x165667b1);
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) % FOOD_KINDS.length;
}

/**
 * Deterministically selects one of the 5 FoodKind items from (seed, partyId, memberIndex)
 * without touching any stateful PRNG.
 */
export function chooseFoodKind(seed: number, partyId: number, memberIndex: number): FoodKind {
  return FOOD_KINDS[hashFoodChoiceIndex(seed, partyId, memberIndex)]!;
}

/** Maps continuous [0, 1] consumed ratio to discrete FoodProgress variant state. */
export function foodProgressFromConsumed(consumed: number): FoodProgress {
  if (!Number.isFinite(consumed) || consumed <= 0.15) return "full";
  if (consumed >= 0.85) return "empty";
  return "partial";
}

/** Returns which state group names should be visible for a given FoodProgress. */
export function activeFoodStateNodeNames(progress: FoodProgress): {
  readonly vessel: true;
  readonly foodFull: boolean;
  readonly foodPartial: boolean;
  readonly foodEmpty: boolean;
  readonly utensil: true;
} {
  return {
    vessel: true,
    foodFull: progress === "full",
    foodPartial: progress === "partial",
    foodEmpty: progress === "empty",
    utensil: true,
  };
}

/**
 * Computes local slot positions (x, y=z on tray surface) for 1–4 dishes carried on a staff tray
 * so dishes stay within the 0.42 × 0.30 m tray without overlapping.
 */
export function computeTraySlotOffsets(count: number): readonly PresentationPoint[] {
  const clamped = Math.max(0, Math.min(4, Math.trunc(count)));
  if (clamped === 0) return [];
  if (clamped === 1) return [{ x: 0, y: 0 }];
  if (clamped === 2) {
    return [
      { x: -0.095, y: 0 },
      { x: 0.095, y: 0 },
    ];
  }
  if (clamped === 3) {
    return [
      { x: -0.095, y: -0.055 },
      { x: 0.095, y: -0.055 },
      { x: 0, y: 0.06 },
    ];
  }
  return [
    { x: -0.095, y: -0.06 },
    { x: 0.095, y: -0.06 },
    { x: -0.095, y: 0.06 },
    { x: 0.095, y: 0.06 },
  ];
}

/**
 * Computes a deterministic tabletop plate placement (in table local coordinates)
 * in front of a seated chair, ensuring dishes on small 2-seat (0.60 × 0.60 m)
 * and 4-seat tables never collide or hang off the table edge.
 */
export function computeTablePlatePlacement(params: {
  readonly tableWidth: number;
  readonly tableDepth: number;
  readonly tableShape?: "round" | "rectangle";
  /** Chair center relative to table center, in table local frame (x = east, y = south). */
  readonly chairLocalCenter: PresentationPoint;
  readonly foodKind?: FoodKind;
}): {
  readonly anchor: PresentationPoint;
  readonly rotationRadians: number;
} {
  const { tableWidth, tableDepth, tableShape = "rectangle", chairLocalCenter, foodKind = "fried-rice" } = params;
  const entry = FOOD_CATALOG[foodKind];
  const radius = entry.footprintDiameter / 2;
  const margin = 0.025;

  const dx = chairLocalCenter.x;
  const dy = chairLocalCenter.y;
  const dist = Math.hypot(dx, dy);

  if (dist < 1e-6) {
    return { anchor: { x: 0, y: 0 }, rotationRadians: 0 };
  }

  const dirX = dx / dist;
  const dirY = dy / dist;

  // Place plate inset from the table edge toward the center so the diner can reach it comfortably
  // while keeping at least `radius + margin` from the center when two diners sit opposite each other.
  if (tableShape === "round") {
    const tableRadius = Math.min(tableWidth, tableDepth) / 2;
    const maxRadial = Math.max(0.06, tableRadius - radius - margin);
    const minRadial = Math.min(maxRadial, radius + 0.015);
    const targetRadial = Math.max(minRadial, Math.min(maxRadial, tableRadius * 0.56));
    return {
      anchor: {
        x: Number((dirX * targetRadial).toFixed(4)),
        y: Number((dirY * targetRadial).toFixed(4)),
      },
      rotationRadians: Math.atan2(dirX, dirY),
    };
  }

  const halfW = tableWidth / 2;
  const halfD = tableDepth / 2;
  const maxX = Math.max(0.05, halfW - radius - margin);
  const maxY = Math.max(0.05, halfD - radius - margin);

  // Determine dominant side (north/south vs east/west)
  if (Math.abs(dy) >= Math.abs(dx)) {
    const signY = dy >= 0 ? 1 : -1;
    const targetY = signY * Math.max(Math.min(maxY, radius + 0.015), Math.min(maxY, halfD * 0.56));
    const clampedX = Math.max(-maxX, Math.min(maxX, dx * 0.65));
    return {
      anchor: {
        x: Number(clampedX.toFixed(4)),
        y: Number(targetY.toFixed(4)),
      },
      rotationRadians: signY > 0 ? 0 : Math.PI,
    };
  }

  const signX = dx >= 0 ? 1 : -1;
  const targetX = signX * Math.max(Math.min(maxX, radius + 0.015), Math.min(maxX, halfW * 0.56));
  const clampedY = Math.max(-maxY, Math.min(maxY, dy * 0.65));
  return {
    anchor: {
      x: Number(targetX.toFixed(4)),
      y: Number(clampedY.toFixed(4)),
    },
    rotationRadians: signX > 0 ? Math.PI / 2 : -Math.PI / 2,
  };
}
