/**
 * Core domain types — Pure TypeScript (ห้าม import React / DOM / Zustand)
 * อ้างอิง PRD.md §4 (Data Model) และ architecture.md §4.2
 *
 * ระบบพิกัด (หน่วยเมตร):
 * - จุดกำเนิด (0, 0) คือมุมตะวันตกเฉียงเหนือของร้าน แกน x ไปทางตะวันออก แกน y ไปทางใต้
 * - `x`, `y` ของวัตถุคือมุมซ้ายบนของ footprint บนผัง *หลังหมุนแล้ว* (ตาม POC เดิม)
 * - `width`, `depth` คือขนาดของวัตถุก่อนหมุน; ที่ rotation 90/270 footprint จะสลับเป็น depth × width
 * - `rotation` หมุนตามเข็มนาฬิกาเมื่อมองจากด้านบน
 */

export type Meters = number;

/** มุมหมุนที่รองรับใน V1 (ทีละ 90°) */
export type Rotation = 0 | 90 | 180 | 270;

export type Wall = "north" | "south" | "east" | "west";

/**
 * C-01: วัตถุที่วางบนพื้นร้าน — ไม่มี Shelf
 * ครัวเป็นห้องแยกนอกพื้นที่ร้าน แทนด้วย `StoreLayout.kitchenDoor` (ประตูบนผนัง) ไม่ใช่วัตถุบนพื้น
 */
export type LayoutObjectType = "counter" | "table" | "chair";

export type TableSetPreset = "table-2-seats" | "table-4-seats";

/** สีเฟอร์นิเจอร์ที่เลือกได้ในตัวแก้ไข (เก็บเป็นชื่อเพื่อให้ contract ปลอดภัย) */
export type FurnitureColor = "white" | "oak" | "charcoal" | "blue" | "orange" | "sage";

/** รูปลักษณ์โต๊ะ — ไม่กระทบ validation นอกจากขนาด footprint จริง */
export interface TableStyle {
  shape: "round" | "rectangle";
  legStyle: "four-legs" | "pedestal";
  color: FurnitureColor;
}

export type ChairShape = "square" | "round";

/** รูปลักษณ์เก้าอี้; stool = ไม่มีพนักพิง */
export interface ChairStyle {
  kind: "chair" | "stool";
  /** ทรงเบาะ — ไม่ระบุ = ตามแบบ (สตูลกลม, มีพนักพิงเหลี่ยม) เพื่อให้ผังเก่าหน้าตาเหมือนเดิม; footprint เท่าเดิมทุกทรง */
  shape?: ChairShape;
  legStyle: "four-legs" | "pedestal";
  color: FurnitureColor;
}

/** แบบเคาน์เตอร์: ระแนงโค้ง, ตู้บานเรียบ, บาร์มีที่พักเท้า, ตู้กระจกโชว์ขนม */
export type CounterVariant = "fluted" | "panel" | "bar" | "display";

/** รูปลักษณ์เคาน์เตอร์ — ไม่กระทบ validation (footprint = width × depth เหมือนเดิมทุกแบบ) */
export interface CounterStyle {
  variant: CounterVariant;
  color: FurnitureColor;
}

export interface Point {
  x: Meters;
  y: Meters;
}

/** สี่เหลี่ยมแนวแกน (axis-aligned) บนผัง */
export interface Rect {
  x: Meters;
  y: Meters;
  width: Meters;
  depth: Meters;
}

interface BaseObject {
  id: string;
  x: Meters;
  y: Meters;
  width: Meters;
  depth: Meters;
  rotation: Rotation;
}

export interface Counter extends BaseObject {
  type: "counter";
  /** optional เพื่ออ่านผังรุ่นก่อนหน้าได้ — ไม่ระบุ = DEFAULT_COUNTER_STYLE */
  style?: CounterStyle;
}

/** Table เป็นเจ้าของความสัมพันธ์กับ Chair (PRD §4.1) */
export interface Table extends BaseObject {
  type: "table";
  chairIds: string[];
  preset?: TableSetPreset;
  /** optional เพื่ออ่านผังรุ่นก่อนหน้าได้ */
  style?: TableStyle;
}

/**
 * Chair สังกัด Table เดียวผ่าน `tableId`
 * `rotation` คือทิศที่ "ด้านหน้า" ของเก้าอี้หันไป: 0 = เหนือ, 90 = ตะวันออก, 180 = ใต้, 270 = ตะวันตก
 */
export interface Chair extends BaseObject {
  type: "chair";
  tableId: string;
  /** optional เพื่ออ่านผังรุ่นก่อนหน้าได้ */
  style?: ChairStyle;
}

export type LayoutObject = Counter | Table | Chair;

/**
 * ทางเข้าบนผนังด้านหนึ่ง
 * `position` คือระยะจากมุมต้นผนัง (เหนือ/ใต้ วัดจากฝั่งตะวันตก, ตะวันออก/ตะวันตก วัดจากฝั่งเหนือ)
 * ถึงขอบเริ่มต้นของช่องประตู
 */
export interface Entrance {
  id: string;
  wall: Wall;
  position: Meters;
  width: Meters;
}

/**
 * ประตูเข้าห้องครัว (ห้องแยกนอกร้าน) — รูปแบบเดียวกับทางเข้า: ช่องบนผนังด้านหนึ่ง
 * พนักงานต้องเดินจากทางเข้าไปถึงหน้าประตูนี้ได้ (ทางเดินรอง ≥ 0.90 ม.)
 */
export interface KitchenDoor {
  id: string;
  wall: Wall;
  position: Meters;
  width: Meters;
}

/** ช่องประตูบนผนัง (ทางเข้า / ประตูครัว) */
export type WallDoor = Entrance | KitchenDoor;

/** Root ของผังหนึ่งฉบับ (PRD §4.2) — ผลตรวจแยกเป็น ValidationResult ผูกด้วย layoutRevision */
export interface StoreLayout {
  id: string;
  version: number;
  units: "m";
  width: Meters;
  depth: Meters;
  /** null = ยังไม่ได้กำหนดทางเข้า (Completeness จะรายงานเป็น Blocked) */
  entrance: Entrance | null;
  /** null = ยังไม่มีประตูครัว (Completeness จะรายงานเป็น Blocked) */
  kitchenDoor: KitchenDoor | null;
  objects: LayoutObject[];
}

export type ValidationStatus = "ready" | "warning" | "blocked";
export type IssueSeverity = "blocked" | "warning";
export type IssueCategory = "completeness" | "collision" | "clearance" | "accessibility";

export interface ValidationIssue {
  id: string;
  category: IssueCategory;
  severity: IssueSeverity;
  objectIds: string[];
  message: string;
}

export interface ValidationResult {
  layoutRevision: string;
  status: ValidationStatus;
  issues: ValidationIssue[];
  /** ISO-8601 */
  validatedAt: string;
}

/** สัญญาส่งต่อ P1 → P2 (PRD §4.4) */
export interface P1LayoutContract {
  contractVersion: "p1-layout-v1";
  layout: StoreLayout;
  validation: ValidationResult;
}

/** ตัวสร้าง id ที่ inject ได้ เพื่อให้เทสต์ deterministic */
export type IdFactory = (kind: LayoutObjectType | "entrance" | "kitchen-door" | "layout") => string;
