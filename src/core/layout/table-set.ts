/**
 * Table Set Lifecycle & Group Transformations — Pure TypeScript
 * อ้างอิง PRD.md §4.3, architecture.md §5.2, SKILL.md กฎข้อ 5
 *
 * - Creation: เพิ่มโต๊ะ = สร้าง Table พร้อม Chair ลูกตาม preset เสมอ (สอดใต้โต๊ะ 0.10 ม.)
 * - Group Transform: ย้าย/หมุน Table (หรือ Chair ลูก) → ทั้งชุดเคลื่อนที่ด้วยกันโดยรักษาระยะสัมพัทธ์
 * - Cascade Delete: ลบ Table → ลบ Chair ที่สังกัดทั้งหมด ไม่เหลือ Orphan Chair
 * - Non-blocking: ไม่ตรวจการชน/ตกขอบที่นี่ — เป็นหน้าที่ของ Validation Engine
 *
 * ทุกฟังก์ชันเป็น immutable: คืนผังใหม่ หรือคืนผังเดิม (reference เดิม) เมื่อไม่มีอะไรเปลี่ยน
 */
import { CLEARANCE, DEFAULT_SIZES, OBJECT_MIN_SIZE, ROOM_MAX, SIZE_STEP, TABLE_SET_PRESETS } from "./constants";
import { randomId } from "./entities";
import {
  directionVector,
  footprint,
  footprintSize,
  normalizeRotation,
  objectCenter,
  rectOverlap,
  rotatePoint,
  roundMeters,
  snapPoint,
  snapToGrid,
} from "./geometry";
import type {
  Chair,
  IdFactory,
  LayoutObject,
  Meters,
  Point,
  Rotation,
  StoreLayout,
  Table,
  TableSetPreset,
} from "./types";

type Side = "north" | "east" | "south" | "west";

/** เก้าอี้แต่ละฝั่งหันหน้าเข้าหาโต๊ะ */
const FACING_BY_SIDE: Record<Side, Rotation> = { north: 180, east: 270, south: 0, west: 90 };

export interface TableSet {
  table: Table;
  chairs: Chair[];
}

/** สร้าง Table set ตาม preset ที่ตำแหน่ง (snap 0.25 ม.) — เก้าอี้สอดใต้โต๊ะ 0.10 ม. จากด้านหน้า */
export function createTableSet(
  preset: TableSetPreset,
  position: Point,
  newId: IdFactory = randomId,
): TableSet {
  const spec = TABLE_SET_PRESETS[preset];
  const { x, y } = snapPoint(position);
  const tableId = newId("table");
  const tuck = CLEARANCE.chairTuckMax;
  const { width: chairWidth, depth: chairDepth } = DEFAULT_SIZES.chair;
  const cx = x + spec.tableWidth / 2;
  const cy = y + spec.tableDepth / 2;

  const chairs: Chair[] = spec.seats.map((side) => {
    const rotation = FACING_BY_SIDE[side];
    const size = footprintSize({ width: chairWidth, depth: chairDepth, rotation });
    const origin: Record<Side, Point> = {
      north: { x: cx - size.width / 2, y: y - size.depth + tuck },
      south: { x: cx - size.width / 2, y: y + spec.tableDepth - tuck },
      west: { x: x - size.width + tuck, y: cy - size.depth / 2 },
      east: { x: x + spec.tableWidth - tuck, y: cy - size.depth / 2 },
    };
    return {
      id: newId("chair"),
      type: "chair",
      tableId,
      x: roundMeters(origin[side].x),
      y: roundMeters(origin[side].y),
      width: chairWidth,
      depth: chairDepth,
      rotation,
    };
  });

  const table: Table = {
    id: tableId,
    type: "table",
    preset,
    x,
    y,
    width: spec.tableWidth,
    depth: spec.tableDepth,
    rotation: 0,
    chairIds: chairs.map((c) => c.id),
  };
  return { table, chairs };
}

/** เพิ่ม Table set เข้าผัง (โต๊ะตามด้วยเก้าอี้ลูก) */
export function addTableSet(
  layout: StoreLayout,
  preset: TableSetPreset,
  position: Point,
  newId: IdFactory = randomId,
): { layout: StoreLayout; tableSet: TableSet } {
  const tableSet = createTableSet(preset, position, newId);
  return {
    layout: { ...layout, objects: [...layout.objects, tableSet.table, ...tableSet.chairs] },
    tableSet,
  };
}

export function findObject(layout: StoreLayout, id: string): LayoutObject | undefined {
  return layout.objects.find((o) => o.id === id);
}

/** Chair ทุกตัวที่สังกัดโต๊ะ (อ้างอิงทั้ง tableId และ chairIds) */
export function getChairsOfTable(layout: StoreLayout, table: Table): Chair[] {
  const ids = new Set(table.chairIds);
  return layout.objects.filter(
    (o): o is Chair => o.type === "chair" && (o.tableId === table.id || ids.has(o.id)),
  );
}

/** โต๊ะที่เป็นเจ้าของกลุ่มของวัตถุนี้ (ตัวเองถ้าเป็นโต๊ะ, โต๊ะแม่ถ้าเป็นเก้าอี้) */
function owningTable(layout: StoreLayout, obj: LayoutObject): Table | undefined {
  if (obj.type === "table") return obj;
  if (obj.type !== "chair") return undefined;
  const parent = findObject(layout, obj.tableId);
  return parent?.type === "table" ? parent : undefined;
}

function replaceObjects(layout: StoreLayout, updates: Map<string, LayoutObject>): StoreLayout {
  return { ...layout, objects: layout.objects.map((o) => updates.get(o.id) ?? o) };
}

function translate<T extends LayoutObject>(obj: T, dx: Meters, dy: Meters): T {
  return { ...obj, x: roundMeters(obj.x + dx), y: roundMeters(obj.y + dy) };
}

/**
 * ย้ายวัตถุไปยังตำแหน่ง (มุมซ้ายบนของ footprint) — snap 0.25 ม.
 * Table → เก้าอี้ลูกย้ายตามด้วย delta เดียวกัน
 * Chair → ย้ายทั้งชุดโต๊ะตาม delta ของเก้าอี้ (เก้าอี้ไม่ใช่วัตถุอิสระ)
 */
export function moveObject(layout: StoreLayout, id: string, target: Point): StoreLayout {
  const obj = findObject(layout, id);
  if (!obj) return layout;

  const table = owningTable(layout, obj);
  if (!table) {
    if (obj.type === "chair") return layout; // orphan chair: ไม่ขยับ ให้ Validation รายงาน
    const snapped = snapPoint(target);
    if (snapped.x === obj.x && snapped.y === obj.y) return layout;
    return replaceObjects(layout, new Map([[obj.id, { ...obj, ...snapped }]]));
  }

  // แปลงเป้าหมายของเก้าอี้เป็นเป้าหมายของโต๊ะ แล้ว snap ที่โต๊ะ
  const desired = { x: table.x + (target.x - obj.x), y: table.y + (target.y - obj.y) };
  const snapped = snapPoint(desired);
  const dx = roundMeters(snapped.x - table.x);
  const dy = roundMeters(snapped.y - table.y);
  if (dx === 0 && dy === 0) return layout;

  const updates = new Map<string, LayoutObject>([[table.id, translate(table, dx, dy)]]);
  for (const chair of getChairsOfTable(layout, table)) updates.set(chair.id, translate(chair, dx, dy));
  return replaceObjects(layout, updates);
}

/** หมุนวัตถุเดี่ยวรอบจุดศูนย์กลาง แล้ว snap มุมซ้ายบน; คืน shift ที่เกิดจากการ snap */
function rotateAboutCenter<T extends LayoutObject>(obj: T, delta: Rotation): { next: T; shift: Point } {
  const center = objectCenter(obj);
  const rotation = normalizeRotation(obj.rotation + delta);
  const size = footprintSize({ ...obj, rotation });
  const raw = { x: center.x - size.width / 2, y: center.y - size.depth / 2 };
  const snapped = snapPoint(raw);
  return {
    next: { ...obj, rotation, x: snapped.x, y: snapped.y },
    shift: { x: snapped.x - raw.x, y: snapped.y - raw.y },
  };
}

/**
 * หมุนวัตถุตามเข็มนาฬิกา (ค่าเริ่มต้น 90°)
 * Table / Chair → หมุนทั้งชุดรอบจุดศูนย์กลางโต๊ะ เก้าอี้ลูกหมุนทิศตามและรักษาระยะสัมพัทธ์
 */
export function rotateObject(layout: StoreLayout, id: string, deltaDegrees = 90): StoreLayout {
  const obj = findObject(layout, id);
  const delta = normalizeRotation(deltaDegrees);
  if (!obj || delta === 0) return layout;

  const table = owningTable(layout, obj);
  if (!table) {
    if (obj.type === "chair") return layout;
    return replaceObjects(layout, new Map([[obj.id, rotateAboutCenter(obj, delta).next]]));
  }

  const pivot = objectCenter(table);
  const { next: rotatedTable, shift } = rotateAboutCenter(table, delta);
  const updates = new Map<string, LayoutObject>([[table.id, rotatedTable]]);

  for (const chair of getChairsOfTable(layout, table)) {
    const rotation = normalizeRotation(chair.rotation + delta);
    const center = rotatePoint(objectCenter(chair), pivot, delta);
    const size = footprintSize({ ...chair, rotation });
    updates.set(chair.id, {
      ...chair,
      rotation,
      x: roundMeters(center.x - size.width / 2 + shift.x),
      y: roundMeters(center.y - size.depth / 2 + shift.y),
    });
  }
  return replaceObjects(layout, updates);
}

/**
 * ลบวัตถุ
 * Table → Cascade Delete เก้าอี้ลูกทั้งหมด (ทั้งที่อ้าง tableId และที่อยู่ใน chairIds)
 * Chair → ลบเฉพาะเก้าอี้ตัวนั้น และถอด id ออกจาก chairIds ของโต๊ะแม่
 */
export function deleteObject(layout: StoreLayout, id: string): StoreLayout {
  const obj = findObject(layout, id);
  if (!obj) return layout;

  if (obj.type === "table") {
    const removed = new Set([obj.id, ...getChairsOfTable(layout, obj).map((c) => c.id)]);
    return { ...layout, objects: layout.objects.filter((o) => !removed.has(o.id)) };
  }

  const objects = layout.objects
    .filter((o) => o.id !== id)
    .map((o) =>
      obj.type === "chair" && o.type === "table" && o.chairIds.includes(id)
        ? { ...o, chairIds: o.chairIds.filter((c) => c !== id) }
        : o,
    );
  return { ...layout, objects };
}

export type TableSetIntegrityIssue =
  | { kind: "orphan-chair"; chairId: string; tableId: string }
  | { kind: "missing-chair"; tableId: string; chairId: string }
  | { kind: "chair-not-listed"; tableId: string; chairId: string }
  | { kind: "chair-in-multiple-tables"; chairId: string; tableIds: string[] }
  | { kind: "table-without-chairs"; tableId: string };

/** ตรวจความสมบูรณ์ของ hierarchy Table–Chair (PRD §4.3) */
export function checkTableSetIntegrity(layout: StoreLayout): TableSetIntegrityIssue[] {
  const issues: TableSetIntegrityIssue[] = [];
  const byId = new Map(layout.objects.map((o) => [o.id, o]));
  const owners = new Map<string, string[]>();

  for (const obj of layout.objects) {
    if (obj.type !== "table") continue;
    if (obj.chairIds.length === 0) issues.push({ kind: "table-without-chairs", tableId: obj.id });
    for (const chairId of obj.chairIds) {
      owners.set(chairId, [...(owners.get(chairId) ?? []), obj.id]);
      if (byId.get(chairId)?.type !== "chair") issues.push({ kind: "missing-chair", tableId: obj.id, chairId });
    }
  }

  for (const obj of layout.objects) {
    if (obj.type !== "chair") continue;
    const parent = byId.get(obj.tableId);
    if (parent?.type !== "table") {
      issues.push({ kind: "orphan-chair", chairId: obj.id, tableId: obj.tableId });
    } else if (!parent.chairIds.includes(obj.id)) {
      issues.push({ kind: "chair-not-listed", tableId: parent.id, chairId: obj.id });
    }
    const tableIds = owners.get(obj.id) ?? [];
    if (tableIds.length > 1) issues.push({ kind: "chair-in-multiple-tables", chairId: obj.id, tableIds });
  }
  return issues;
}

/**
 * ระยะที่เก้าอี้สอดเข้าใต้โต๊ะ วัดตามทิศด้านหน้าของเก้าอี้
 * `fromFront` = true เมื่อส่วนที่ทับคือด้านหน้าของเก้าอี้ (โต๊ะอยู่ด้านหน้า)
 * ใช้ร่วมกับ CLEARANCE.chairTuckMax (≤ 0.10 ม.) ใน Collision rule
 */
export function chairTuck(chair: Chair, table: Table): { depth: Meters; fromFront: boolean } {
  const a = footprint(chair);
  const b = footprint(table);
  const overlap = rectOverlap(a, b);
  if (overlap.x <= 1e-9 || overlap.y <= 1e-9) return { depth: 0, fromFront: false };

  const facing = directionVector(chair.rotation);
  const alongFacing = facing.x !== 0 ? overlap.x : overlap.y;
  const lateral = facing.x !== 0 ? overlap.y : overlap.x;
  const cc = objectCenter(chair);
  const tc = objectCenter(table);
  const towardTable = (tc.x - cc.x) * facing.x + (tc.y - cc.y) * facing.y;
  // สอดจากด้านหน้า = โต๊ะอยู่ด้านหน้าเก้าอี้ และแกนที่ทับน้อยที่สุดคือแกนทิศหน้า (ไม่ใช่ชนจากด้านข้าง)
  return { depth: roundMeters(alongFacing), fromFront: towardTable > 0 && alongFacing <= lateral + 1e-9 };
}

/**
 * ปรับขนาด Kitchen / Counter (ขนาดก่อนหมุน) — snap ทีละ 0.05 ม. ไม่ต่ำกว่า 0.30 ม. และไม่เกินขนาดร้านสูงสุด
 * Table / Chair ใช้ขนาดตาม preset ของ Table set (ปรับไม่ได้ เพื่อรักษาระยะสอดใต้โต๊ะ) → คืนผังเดิม
 */
export function resizeObject(layout: StoreLayout, id: string, width: Meters, depth: Meters): StoreLayout {
  const obj = findObject(layout, id);
  if (!obj || (obj.type !== "kitchen" && obj.type !== "counter")) return layout;
  const clamp = (v: Meters) =>
    Number.isFinite(v) ? Math.min(ROOM_MAX, Math.max(OBJECT_MIN_SIZE, snapToGrid(v, SIZE_STEP))) : OBJECT_MIN_SIZE;
  const next = { ...obj, width: clamp(width), depth: clamp(depth) };
  if (next.width === obj.width && next.depth === obj.depth) return layout;
  return replaceObjects(layout, new Map([[obj.id, next]]));
}
