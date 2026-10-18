/**
 * แปลงผังรุ่นก่อน (ครัวเป็นกล่องบนพื้น `type: "kitchen"`) เป็นผังปัจจุบัน (ครัวเป็นห้องแยก → `kitchenDoor`)
 * Pure TypeScript — ใช้ทั้งตอน parse schema (BFF/Worker), โหลดเข้า store และนำเข้าไฟล์
 *
 * กติกา: กล่องครัวชิ้นแรกกลายเป็นประตูครัวกว้าง 0.90 ม. บนผนังที่ใกล้กล่องที่สุด ตรงกลางด้านที่หันเข้าผนัง
 * (เลื่อนหนีทางเข้าถ้าทับ; ผนังนั้นไม่มีที่ว่าง → ลองผนังที่ใกล้ถัดไป) · กล่องครัวทุกชิ้นถูกเอาออกจากพื้นร้าน
 */
import { KITCHEN_DOOR_DEFAULT_WIDTH } from "./constants";
import { createKitchenDoor, freeWallPosition } from "./entities";
import { footprint } from "./geometry";
import type { Entrance, KitchenDoor, Meters, Rotation, StoreLayout, Wall } from "./types";

/** กล่องครัวรุ่นก่อน (footprint เหมือนวัตถุทั่วไป) */
export interface LegacyKitchen {
  id: string;
  type: "kitchen";
  x: Meters;
  y: Meters;
  width: Meters;
  depth: Meters;
  rotation: Rotation;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLegacyKitchen(value: unknown): value is LegacyKitchen {
  if (!isRecord(value) || value.type !== "kitchen") return false;
  return ["x", "y", "width", "depth"].every((k) => typeof value[k] === "number" && Number.isFinite(value[k]));
}

/** ประตูครัวที่แทนกล่องครัวเดิม (null ถ้าไม่มีผนังใดว่างพอ) */
export function kitchenDoorFromLegacy(
  room: Pick<StoreLayout, "width" | "depth">,
  kitchen: Pick<LegacyKitchen, "id" | "x" | "y" | "width" | "depth" | "rotation">,
  entrance: Entrance | null,
): KitchenDoor | null {
  const rotation = ([0, 90, 180, 270] as const).includes(kitchen.rotation) ? kitchen.rotation : 0;
  const r = footprint({ ...kitchen, rotation });
  const candidates: { wall: Wall; distance: Meters; center: Meters }[] = [
    { wall: "north", distance: r.y, center: r.x + r.width / 2 },
    { wall: "west", distance: r.x, center: r.y + r.depth / 2 },
    { wall: "east", distance: room.width - (r.x + r.width), center: r.y + r.depth / 2 },
    { wall: "south", distance: room.depth - (r.y + r.depth), center: r.x + r.width / 2 },
  ];
  // stable sort: ระยะเท่ากันใช้ลำดับ เหนือ → ตะวันตก → ตะวันออก → ใต้
  candidates.sort((a, b) => a.distance - b.distance);
  const width = KITCHEN_DOOR_DEFAULT_WIDTH;
  for (const { wall, center } of candidates) {
    const position = freeWallPosition(room, wall, center - width / 2, width, entrance);
    if (position !== null) return createKitchenDoor(room, { wall, position, width }, () => kitchen.id);
  }
  return null;
}

/**
 * คืนผังรูปแบบปัจจุบันจากข้อมูลดิบ (unknown) — ไม่ตรวจความถูกต้องอื่น (หน้าที่ของ schema)
 * ข้อมูลที่ไม่ใช่ผังคืนกลับตามเดิม · ผังที่ไม่มีอะไรต้องแปลงคืน reference เดิม
 */
export function migrateLayoutData(raw: unknown): unknown {
  if (!isRecord(raw) || !Array.isArray(raw.objects)) return raw;
  const hasLegacy = raw.objects.some((o) => isRecord(o) && o.type === "kitchen");
  if (!hasLegacy && "kitchenDoor" in raw) return raw;

  let kitchenDoor = (raw.kitchenDoor ?? null) as KitchenDoor | null;
  if (!kitchenDoor && hasLegacy && typeof raw.width === "number" && typeof raw.depth === "number") {
    const legacy = raw.objects.find(isLegacyKitchen);
    const entrance = isRecord(raw.entrance) ? (raw.entrance as unknown as Entrance) : null;
    if (legacy) kitchenDoor = kitchenDoorFromLegacy({ width: raw.width, depth: raw.depth }, legacy, entrance);
  }
  return {
    ...raw,
    kitchenDoor,
    objects: hasLegacy ? raw.objects.filter((o) => !(isRecord(o) && o.type === "kitchen")) : raw.objects,
  };
}

/** ผังที่อาจมาจากรุ่นก่อน (draft, cloud, history) → ผังรูปแบบปัจจุบัน */
export function migrateLayout(layout: StoreLayout): StoreLayout {
  return migrateLayoutData(layout) as StoreLayout;
}
