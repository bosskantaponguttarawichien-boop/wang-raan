import type { ChairStyle, CounterStyle, FurnitureColor, LayoutObjectType, Meters, TableSetPreset, TableStyle } from "./types";

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

/** ประตูครัว — กว้างพอให้พนักงานถือถาดผ่าน (ทางเดินรอง 0.90 ม.) */
export const KITCHEN_DOOR_DEFAULT_WIDTH: Meters = 0.9;

/** ขนาดเริ่มต้นจาก Palette (design-system.md §2.3, §7.1.3) — width × depth */
export const DEFAULT_SIZES = {
  counter: { width: 2.4, depth: 0.7 },
  table: { width: 1.2, depth: 1.2 },
  chair: { width: 0.5, depth: 0.5 },
} as const satisfies Record<LayoutObjectType, { width: Meters; depth: Meters }>;

/** รูปลักษณ์ค่าเริ่มต้นของชุดโต๊ะ — เลือกเก็บเป็น token ไม่รับ hex อิสระ */
export const DEFAULT_TABLE_STYLE: TableStyle = {
  shape: "rectangle",
  legStyle: "four-legs",
  color: "white",
};

export const DEFAULT_CHAIR_STYLE: ChairStyle = {
  kind: "chair",
  legStyle: "four-legs",
  color: "orange",
};

/** ผังเก่า/เคาน์เตอร์ใหม่ที่ยังไม่เลือกแบบ — ตรงกับหน้าตาเดิม (หน้าระแนงสีส้ม) */
export const DEFAULT_COUNTER_STYLE: CounterStyle = {
  variant: "fluted",
  color: "orange",
};

/** สีสำหรับ presentation tier; Core ใช้ enum เท่านั้นจึงยังเป็น Pure TypeScript */
export const FURNITURE_COLOR_HEX: Record<FurnitureColor, string> = {
  white: "#ffffff",
  oak: "#bd7a45",
  charcoal: "#3f4650",
  blue: "#4c78d8",
  orange: "#f28c45",
  sage: "#7eaa8a",
};

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

/** ขนาดหน้าโต๊ะที่ปรับได้ (ม.) — ทีละ SIZE_STEP */
export const TABLE_SIZE_MIN: Meters = 0.6;
export const TABLE_SIZE_MAX: Meters = 3;

/** ระยะตามแนวขอบโต๊ะที่จองให้เก้าอี้หนึ่งตัว — ความกว้างเก้าอี้ 0.50 ม. + ช่องว่าง 0.10 ม. */
export const TABLE_CHAIR_PITCH: Meters = DEFAULT_SIZES.chair.width + 0.1;
/** Schema จำกัด chairIds ไว้ 16 ตัว; ใช้เป็นขีดบนของตัวเลือกสร้างโต๊ะด้วย */
export const TABLE_CHAIR_MAX = 16;
