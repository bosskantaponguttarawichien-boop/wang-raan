import type { LayoutObjectType, Meters, TableSetPreset } from "./types";

/** Snap grid ของพิกัดที่ผู้ใช้วาง (AGENTS.md / design-system.md §7.2) */
export const GRID_STEP: Meters = 0.25;

/** ขนาดร้านที่รองรับ */
export const ROOM_MIN: Meters = 2;
export const ROOM_MAX: Meters = 30;

/** ค่าระยะ V1 (PRD C-10, §5.2) */
export const CLEARANCE = {
  mainAisle: 1.2,
  secondaryAisle: 0.9,
  chairAccess: 0.6,
  /** เก้าอี้สอดใต้โต๊ะของตนได้สูงสุด เฉพาะจากด้านหน้า */
  chairTuckMax: 0.1,
} as const satisfies Record<string, Meters>;

/** ทางเข้า (design-system.md §7.2.3, architecture.md EntranceSchema) */
export const ENTRANCE_DEFAULT_WIDTH: Meters = 1.2;
export const ENTRANCE_MIN_WIDTH: Meters = 0.6;
export const ENTRANCE_MAX_WIDTH: Meters = 3;

/** ขนาดเริ่มต้นจาก Palette (design-system.md §2.3, §7.1.3) — width × depth */
export const DEFAULT_SIZES = {
  kitchen: { width: 2, depth: 1.5 },
  counter: { width: 2.4, depth: 0.7 },
  table: { width: 1.2, depth: 1.2 },
  chair: { width: 0.5, depth: 0.5 },
} as const satisfies Record<LayoutObjectType, { width: Meters; depth: Meters }>;

/** Table set presets V1 (PRD §9 ข้อสรุป 10 ต.ค. 2026) */
export const TABLE_SET_PRESETS = {
  "table-2-seats": { tableWidth: 0.8, tableDepth: 0.8, seats: ["north", "south"] },
  "table-4-seats": { tableWidth: 1.2, tableDepth: 1.2, seats: ["north", "east", "south", "west"] },
} as const satisfies Record<
  TableSetPreset,
  { tableWidth: Meters; tableDepth: Meters; seats: ReadonlyArray<"north" | "east" | "south" | "west"> }
>;

/** ความละเอียดของการปรับขนาดวัตถุ และขนาดเล็กสุด (ม.) */
export const SIZE_STEP: Meters = 0.05;
export const OBJECT_MIN_SIZE: Meters = 0.3;
