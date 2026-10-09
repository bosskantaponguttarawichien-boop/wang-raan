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

/** C-01: องค์ประกอบหลักของ V1 — ไม่มี Shelf */
export type LayoutObjectType = "kitchen" | "counter" | "table" | "chair";

export type TableSetPreset = "table-2-seats" | "table-4-seats";

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

export interface Kitchen extends BaseObject {
  type: "kitchen";
}

export interface Counter extends BaseObject {
  type: "counter";
}

/** Table เป็นเจ้าของความสัมพันธ์กับ Chair (PRD §4.1) */
export interface Table extends BaseObject {
  type: "table";
  chairIds: string[];
  preset?: TableSetPreset;
}

/**
 * Chair สังกัด Table เดียวผ่าน `tableId`
 * `rotation` คือทิศที่ "ด้านหน้า" ของเก้าอี้หันไป: 0 = เหนือ, 90 = ตะวันออก, 180 = ใต้, 270 = ตะวันตก
 */
export interface Chair extends BaseObject {
  type: "chair";
  tableId: string;
}

export type LayoutObject = Kitchen | Counter | Table | Chair;

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

/** Root ของผังหนึ่งฉบับ (PRD §4.2) — ผลตรวจแยกเป็น ValidationResult ผูกด้วย layoutRevision */
export interface StoreLayout {
  id: string;
  version: number;
  units: "m";
  width: Meters;
  depth: Meters;
  /** null = ยังไม่ได้กำหนดทางเข้า (Completeness จะรายงานเป็น Blocked) */
  entrance: Entrance | null;
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
export type IdFactory = (kind: LayoutObjectType | "entrance" | "layout") => string;
