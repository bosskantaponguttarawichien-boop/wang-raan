import {
  DEFAULT_SIZES,
  ENTRANCE_DEFAULT_WIDTH,
  ENTRANCE_MAX_WIDTH,
  ENTRANCE_MIN_WIDTH,
} from "./constants";
import { clampRoomDimension, normalizeRotation, roundMeters, snapPoint, snapToGrid } from "./geometry";
import type { Counter, Entrance, IdFactory, Kitchen, Meters, Point, StoreLayout, Wall } from "./types";

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

function areaObject<T extends "kitchen" | "counter">(type: T, init: AreaObjectInit, newId: IdFactory) {
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

export function createKitchen(init: AreaObjectInit, newId: IdFactory = randomId): Kitchen {
  return areaObject("kitchen", init, newId);
}

export function createCounter(init: AreaObjectInit, newId: IdFactory = randomId): Counter {
  return areaObject("counter", init, newId);
}

/** ความยาวของผนังด้านที่ระบุ */
export function wallLength(layout: Pick<StoreLayout, "width" | "depth">, wall: Wall): Meters {
  return wall === "north" || wall === "south" ? layout.width : layout.depth;
}

/** สร้าง Entrance ที่ snap กริดและไม่ยื่นเลยผนัง */
export function createEntrance(
  layout: Pick<StoreLayout, "width" | "depth">,
  init: { wall: Wall; position: Meters; width?: Meters },
  newId: IdFactory = randomId,
): Entrance {
  const length = wallLength(layout, init.wall);
  const width = Math.min(
    length,
    Math.max(ENTRANCE_MIN_WIDTH, Math.min(ENTRANCE_MAX_WIDTH, init.width ?? ENTRANCE_DEFAULT_WIDTH)),
  );
  const position = Math.min(snapToGrid(length - width), Math.max(0, snapToGrid(init.position)));
  return { id: newId("entrance"), wall: init.wall, position: roundMeters(Math.max(0, position)), width };
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
    objects: [],
  };
}
