import {
  DEFAULT_COUNTER_STYLE,
  DEFAULT_SIZES,
  ENTRANCE_DEFAULT_WIDTH,
  ENTRANCE_MAX_WIDTH,
  ENTRANCE_MIN_WIDTH,
  GRID_STEP,
  KITCHEN_DOOR_DEFAULT_WIDTH,
} from "./constants";
import { EPSILON } from "./epsilon";
import { clampRoomDimension, normalizeRotation, roundMeters, snapPoint, snapToGrid } from "./geometry";
import type { Counter, CounterStyle, Entrance, IdFactory, KitchenDoor, Meters, Point, StoreLayout, Wall, WallDoor } from "./types";

/** id สุ่มที่ใช้ได้ทั้ง Browser, Node (BFF) และ Web Worker — ไม่พึ่ง DOM */
export const randomId: IdFactory = (kind) => `${kind}-${globalThis.crypto.randomUUID()}`;

/** id แบบนับเลข สำหรับเทสต์และ fixture ที่ต้อง deterministic */
export function createSequentialIds(): IdFactory {
  const counters = new Map<string, number>();
  return (kind) => {
    const next = (counters.get(kind) ?? 0) + 1;
    counters.set(kind, next);
    return `${kind}-${String(next).padStart(2, "0")}`;
  };
}

export interface AreaObjectInit {
  position: Point;
  width?: Meters;
  depth?: Meters;
  rotation?: number;
}

function areaObject<T extends "counter">(type: T, init: AreaObjectInit, newId: IdFactory) {
  const { x, y } = snapPoint(init.position);
  return {
    id: newId(type),
    type,
    x,
    y,
    // ขนาดวัตถุไม่บังคับลงกริด (เช่นเคาน์เตอร์ลึก 0.7 ม.) — snap เฉพาะตำแหน่ง
    width: roundMeters(init.width ?? DEFAULT_SIZES[type].width),
    depth: roundMeters(init.depth ?? DEFAULT_SIZES[type].depth),
    rotation: normalizeRotation(init.rotation ?? 0),
  };
}

export function createCounter(init: AreaObjectInit & { style?: CounterStyle }, newId: IdFactory = randomId): Counter {
  const counter: Counter = areaObject("counter", init, newId);
  return init.style ? { ...counter, style: { ...init.style } } : counter;
}

export function counterStyleOf(counter: Counter): CounterStyle {
  return { ...DEFAULT_COUNTER_STYLE, ...counter.style };
}

/** เปลี่ยนแบบ/สีเคาน์เตอร์ — คืนผังเดิม (reference เดิม) ถ้าไม่มีอะไรเปลี่ยน เพื่อไม่ให้เกิด history ว่าง */
export function setCounterStyle(layout: StoreLayout, id: string, patch: Partial<CounterStyle>): StoreLayout {
  const counter = layout.objects.find((o): o is Counter => o.id === id && o.type === "counter");
  if (!counter) return layout;
  const current = counterStyleOf(counter);
  const next = { ...current, ...patch };
  if (next.variant === current.variant && next.color === current.color) return layout;
  return { ...layout, objects: layout.objects.map((o) => (o === counter ? { ...counter, style: next } : o)) };
}

/** ความยาวของผนังด้านที่ระบุ */
export function wallLength(layout: Pick<StoreLayout, "width" | "depth">, wall: Wall): Meters {
  return wall === "north" || wall === "south" ? layout.width : layout.depth;
}

export interface WallDoorInit {
  wall: Wall;
  position: Meters;
  width?: Meters;
}

/** ช่องประตูที่ snap กริด กว้าง 0.60–3.00 ม. และไม่ยื่นเลยผนัง (ใช้ทั้งทางเข้าและประตูครัว) */
function wallDoor(layout: Pick<StoreLayout, "width" | "depth">, init: WallDoorInit, defaultWidth: Meters) {
  const length = wallLength(layout, init.wall);
  const width = Math.min(length, Math.max(ENTRANCE_MIN_WIDTH, Math.min(ENTRANCE_MAX_WIDTH, init.width ?? defaultWidth)));
  const position = Math.min(snapToGrid(length - width), Math.max(0, snapToGrid(init.position)));
  return { wall: init.wall, position: roundMeters(Math.max(0, position)), width };
}

/** สร้าง Entrance ที่ snap กริดและไม่ยื่นเลยผนัง */
export function createEntrance(
  layout: Pick<StoreLayout, "width" | "depth">,
  init: WallDoorInit,
  newId: IdFactory = randomId,
): Entrance {
  return { id: newId("entrance"), ...wallDoor(layout, init, ENTRANCE_DEFAULT_WIDTH) };
}

/** สร้างประตูครัวที่ snap กริดและไม่ยื่นเลยผนัง (ค่าเริ่มต้นกว้าง 0.90 ม.) */
export function createKitchenDoor(
  layout: Pick<StoreLayout, "width" | "depth">,
  init: WallDoorInit,
  newId: IdFactory = randomId,
): KitchenDoor {
  return { id: newId("kitchen-door"), ...wallDoor(layout, init, KITCHEN_DOOR_DEFAULT_WIDTH) };
}

/** ช่วงที่ประตูสองบานซ้อนกันบนผนังเดียวกัน (ม.) — 0 = ไม่ทับ (ชิดกันพอดียังไม่นับ) */
export function wallDoorOverlap(a: WallDoor, b: WallDoor): Meters {
  if (a.wall !== b.wall) return 0;
  const overlap = Math.min(a.position + a.width, b.position + b.width) - Math.max(a.position, b.position);
  return overlap > EPSILON ? roundMeters(overlap) : 0;
}

/**
 * ตำแหน่งบนผนังที่ใกล้ `desired` ที่สุด (ลงกริด) ซึ่งประตูกว้าง `width` วางได้โดยไม่ทับ `avoid`
 * null = ผนังนี้ไม่มีที่ว่างพอ
 */
export function freeWallPosition(
  layout: Pick<StoreLayout, "width" | "depth">,
  wall: Wall,
  desired: Meters,
  width: Meters,
  avoid: WallDoor | null,
): Meters | null {
  const length = wallLength(layout, wall);
  if (width > length + EPSILON) return null;
  const steps = Math.floor((length - width) / GRID_STEP + EPSILON);
  let best: Meters | null = null;
  for (let i = 0; i <= steps; i++) {
    const position = roundMeters(i * GRID_STEP);
    if (avoid && wallDoorOverlap({ id: "", wall, position, width }, avoid) > 0) continue;
    if (best === null || Math.abs(position - desired) < Math.abs(best - desired) - EPSILON) best = position;
  }
  return best;
}

const OPPOSITE_WALL: Record<Wall, Wall> = { north: "south", south: "north", east: "west", west: "east" };

/**
 * ตำแหน่งเริ่มต้นของประตูครัวใหม่: กลางผนังฝั่งตรงข้ามทางเข้า (ไม่มีทางเข้า = ผนังเหนือ)
 * ถ้าผนังนั้นไม่มีที่ว่าง ลองผนังอื่นตามลำดับ
 */
export function defaultKitchenDoorInit(layout: Pick<StoreLayout, "width" | "depth" | "entrance">): WallDoorInit | null {
  const first: Wall = layout.entrance ? OPPOSITE_WALL[layout.entrance.wall] : "north";
  const order: Wall[] = [first, ...(["north", "east", "west", "south"] as const).filter((w) => w !== first)];
  for (const wall of order) {
    const width = KITCHEN_DOOR_DEFAULT_WIDTH;
    const position = freeWallPosition(layout, wall, (wallLength(layout, wall) - width) / 2, width, layout.entrance);
    if (position !== null) return { wall, position, width };
  }
  return null;
}

/** ผังเปล่า (ขนาดร้าน snap 0.25 ม. และอยู่ในช่วง 2–30 ม.) */
export function createEmptyLayout(
  size: { width: Meters; depth: Meters },
  newId: IdFactory = randomId,
): StoreLayout {
  return {
    id: newId("layout"),
    version: 1,
    units: "m",
    width: clampRoomDimension(size.width),
    depth: clampRoomDimension(size.depth),
    entrance: null,
    kitchenDoor: null,
    objects: [],
  };
}
