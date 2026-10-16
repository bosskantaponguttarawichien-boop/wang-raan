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
import {
  CLEARANCE,
  DEFAULT_CHAIR_STYLE,
  DEFAULT_SIZES,
  DEFAULT_TABLE_STYLE,
  OBJECT_MIN_SIZE,
  ROOM_MAX,
  SIZE_STEP,
  TABLE_SET_PRESETS,
  TABLE_CHAIR_MAX,
  TABLE_CHAIR_PITCH,
  TABLE_SIZE_MAX,
  TABLE_SIZE_MIN,
} from "./constants";
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
  ChairStyle,
  IdFactory,
  LayoutObject,
  Meters,
  Point,
  Rotation,
  StoreLayout,
  Table,
  TableSetPreset,
  TableStyle,
} from "./types";

type Side = "north" | "east" | "south" | "west";

/** เก้าอี้แต่ละฝั่งหันหน้าเข้าหาโต๊ะ */
const FACING_BY_SIDE: Record<Side, Rotation> = { north: 180, east: 270, south: 0, west: 90 };

export interface TableSet {
  table: Table;
  chairs: Chair[];
}

/** ค่าที่เลือกก่อนสร้างชุดโต๊ะจาก Palette — ใช้ Core เดิมจัดวางเก้าอี้และรักษา lifecycle */
export interface TableSetCreationOptions {
  width?: Meters;
  depth?: Meters;
  style?: TableSetStylePatch;
  /** จำนวนเก้าอี้ที่ผู้ใช้เลือกก่อนสร้าง — ต้องไม่เกินความจุของหน้าโต๊ะ */
  chairCount?: number;
}

/** ความจุเก้าอี้สูงสุดโดยไม่ให้เก้าอี้ที่อยู่ขอบเดียวกันทับกัน */
export function tableSeatCapacity(width: Meters, depth: Meters): number {
  const slots = (length: Meters) => Math.max(0, Math.floor((length + 0.1 + 1e-9) / TABLE_CHAIR_PITCH));
  return Math.min(TABLE_CHAIR_MAX, 2 * (slots(width) + slots(depth)));
}

function sideCapacity(side: Side, width: Meters, depth: Meters): number {
  const length = side === "north" || side === "south" ? width : depth;
  return Math.max(0, Math.floor((length + 0.1 + 1e-9) / TABLE_CHAIR_PITCH));
}

/** จัดเก้าอี้กระจายรอบโต๊ะ โดยคงลำดับ 2/4 ที่นั่งแบบเดิมเพื่อ compatibility */
function sidesForChairCount(chairCount: number, width: Meters, depth: Meters): Side[] {
  const capacityBySide: Record<Side, number> = {
    north: sideCapacity("north", width, depth),
    east: sideCapacity("east", width, depth),
    south: sideCapacity("south", width, depth),
    west: sideCapacity("west", width, depth),
  };
  const preferred: Side[] = chairCount === 2 ? ["north", "south", "east", "west"] : ["north", "east", "south", "west"];
  const allocated: Side[] = [];
  const used: Record<Side, number> = { north: 0, east: 0, south: 0, west: 0 };
  while (allocated.length < chairCount) {
    let added = false;
    for (const side of preferred) {
      if (allocated.length === chairCount) break;
      if (used[side] >= capacityBySide[side]) continue;
      allocated.push(side);
      used[side] += 1;
      added = true;
    }
    if (!added) break;
  }
  return allocated;
}

function chairOriginForSide(
  table: Pick<Table, "x" | "y" | "width" | "depth">,
  side: Side,
  index: number,
  countOnSide: number,
  chair: Pick<Chair, "width" | "depth" | "rotation">,
): Point {
  const rotation = FACING_BY_SIDE[side];
  const size = footprintSize({ ...chair, rotation });
  const alongLength = side === "north" || side === "south" ? table.width : table.depth;
  const chairAlong = side === "north" || side === "south" ? size.width : size.depth;
  const gap = Math.max(0, (alongLength - countOnSide * chairAlong) / (countOnSide + 1));
  const along = gap + index * (chairAlong + gap);
  const tuck = CLEARANCE.chairTuckMax;
  const origins: Record<Side, Point> = {
    north: { x: table.x + along, y: table.y - size.depth + tuck },
    south: { x: table.x + along, y: table.y + table.depth - tuck },
    west: { x: table.x - size.width + tuck, y: table.y + along },
    east: { x: table.x + table.width - tuck, y: table.y + along },
  };
  return origins[side];
}

/** สร้าง Table set ตาม preset ที่ตำแหน่ง (snap 0.25 ม.) — เก้าอี้สอดใต้โต๊ะ 0.10 ม. จากด้านหน้า */
export function createTableSet(
  preset: TableSetPreset,
  position: Point,
  newId: IdFactory = randomId,
  options: TableSetCreationOptions = {},
): TableSet {
  const spec = TABLE_SET_PRESETS[preset];
  const { x, y } = snapPoint(position);
  const requestedTableStyle = options.style?.table;
  const resolvedTableStyle = { ...DEFAULT_TABLE_STYLE, ...requestedTableStyle };
  const width = clampTableSize(options.width ?? spec.tableWidth);
  const depth = resolvedTableStyle.shape === "round" ? width : clampTableSize(options.depth ?? spec.tableDepth);
  const chairCount = Math.trunc(options.chairCount ?? spec.seats.length);
  const capacity = tableSeatCapacity(width, depth);
  if (chairCount < 1 || chairCount > capacity) {
    throw new RangeError(`โต๊ะ ${width.toFixed(2)} × ${depth.toFixed(2)} ม. รองรับเก้าอี้ได้สูงสุด ${capacity} ตัว`);
  }
  const tableId = newId("table");
  const { width: chairWidth, depth: chairDepth } = DEFAULT_SIZES.chair;
  const chairStyle = options.style?.chair ? { ...DEFAULT_CHAIR_STYLE, ...options.style.chair } : undefined;
  const table: Table = {
    id: tableId,
    type: "table",
    preset,
    x,
    y,
    width,
    depth,
    rotation: 0,
    chairIds: [],
    ...(requestedTableStyle ? { style: resolvedTableStyle } : {}),
  };
  const sides = sidesForChairCount(chairCount, width, depth);
  const sideTotals = sides.reduce<Record<Side, number>>((totals, side) => ({ ...totals, [side]: totals[side] + 1 }), {
    north: 0,
    east: 0,
    south: 0,
    west: 0,
  });
  const sideIndexes: Record<Side, number> = { north: 0, east: 0, south: 0, west: 0 };
  const chairs: Chair[] = sides.map((side) => {
    const rotation = FACING_BY_SIDE[side];
    const origin = chairOriginForSide(table, side, sideIndexes[side]++, sideTotals[side], {
      width: chairWidth,
      depth: chairDepth,
      rotation,
    });
    return {
      id: newId("chair"),
      type: "chair",
      tableId,
      x: roundMeters(origin.x),
      y: roundMeters(origin.y),
      width: chairWidth,
      depth: chairDepth,
      rotation,
      ...(chairStyle ? { style: chairStyle } : {}),
    };
  });
  table.chairIds = chairs.map((c) => c.id);
  return { table, chairs };
}

/** เพิ่ม Table set เข้าผัง (โต๊ะตามด้วยเก้าอี้ลูก) */
export function addTableSet(
  layout: StoreLayout,
  preset: TableSetPreset,
  position: Point,
  newId: IdFactory = randomId,
  options: TableSetCreationOptions = {},
): { layout: StoreLayout; tableSet: TableSet } {
  const initial = createTableSet(preset, position, newId, options);
  const next: StoreLayout = { ...layout, objects: [...layout.objects, initial.table, ...initial.chairs] };

  const table = findObject(next, initial.table.id) as Table;
  return {
    layout: next,
    tableSet: { table, chairs: getChairsOfTable(next, table) },
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
 * Table / Chair → คืนผังเดิม; ปรับขนาดโต๊ะผ่าน resizeTableSet ซึ่งจัดเก้าอี้ทั้งชุดใหม่เพื่อรักษาระยะสอดใต้โต๊ะ
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

/**
 * สลับ preset โต๊ะ (table-2-seats ↔ table-4-seats)
 * - ลบเก้าอี้เดิมของโต๊ะออก
 * - คำนวณตำแหน่งกึ่งกลางเดิม แล้วสร้าง TableSet ใหม่ตาม preset ใหม่ที่จุดเดิม
 * - หมุน TableSet ใหม่ให้มี rotation เท่ากับโต๊ะเดิม
 * - คืนผังใหม่และ id ของโต๊ะใหม่ (หรือคืน null ถ้าไม่พบโต๊ะ)
 */
export function toggleTablePreset(
  layout: StoreLayout,
  tableId: string,
  newId: IdFactory = randomId,
): { layout: StoreLayout; newTable: Table } | null {
  const table = findObject(layout, tableId);
  if (!table || table.type !== "table") return null;

  const currentPreset = table.preset ?? "table-4-seats";
  const targetPreset: TableSetPreset =
    currentPreset === "table-2-seats" ? "table-4-seats" : "table-2-seats";

  // ลบโต๊ะเดิมและเก้าอี้เดิมออกจากผัง
  const oldChairs = getChairsOfTable(layout, table);
  const oldIds = new Set([table.id, ...oldChairs.map((c) => c.id)]);
  const remainingObjects = layout.objects.filter((o) => !oldIds.has(o.id));

  // หาจุดศูนย์กลางเดิมของโต๊ะ
  const center = objectCenter(table);
  const newSpec = TABLE_SET_PRESETS[targetPreset];
  const initialPos = snapPoint({
    x: center.x - newSpec.tableWidth / 2,
    y: center.y - newSpec.tableDepth / 2,
  });

  // สร้างชุดโต๊ะใหม่ที่ initialPos
  const newSet = createTableSet(targetPreset, initialPos, newId);

  // ใส่ชุดโต๊ะใหม่เข้าผังชั่วคราว
  let tempLayout: StoreLayout = {
    ...layout,
    objects: [...remainingObjects, newSet.table, ...newSet.chairs],
  };

  // ถ้าโต๊ะเดิมมีมุมหมุน ให้หมุนชุดใหม่ตาม
  if (table.rotation !== 0) {
    tempLayout = rotateObject(tempLayout, newSet.table.id, table.rotation);
  }

  // คงรูปลักษณ์ (ทรง/ขา/สี) เดิมของชุด — ขนาดใช้ตาม preset ใหม่
  tempLayout = copyTableSetAppearance(
    tempLayout,
    { table, chairStyle: oldChairs[0]?.style },
    newSet.table.id,
  );

  const finalTable = findObject(tempLayout, newSet.table.id) as Table;
  return { layout: tempLayout, newTable: finalTable };
}


/** ค่าที่ใช้แสดงผลจริง (ผังรุ่นเก่าไม่มี style → ใช้ค่าเริ่มต้น) */
export function tableStyleOf(table: Table): TableStyle {
  return { ...DEFAULT_TABLE_STYLE, ...table.style };
}

export function chairStyleOf(chair: Chair): ChairStyle {
  return { ...DEFAULT_CHAIR_STYLE, ...chair.style };
}

const SIDE_BY_FACING: Record<Rotation, Side> = { 180: "north", 270: "east", 0: "south", 90: "west" };

function clampTableSize(v: Meters): Meters {
  if (!Number.isFinite(v)) return TABLE_SIZE_MIN;
  return Math.min(TABLE_SIZE_MAX, Math.max(TABLE_SIZE_MIN, snapToGrid(v, SIZE_STEP)));
}

/**
 * จัดชุดโต๊ะใหม่ด้วยขนาดหน้าโต๊ะใหม่ โดยคง id/สไตล์/ฝั่งของเก้าอี้ และจุดศูนย์กลางโต๊ะ (snap 0.25 ม.)
 * เก้าอี้ถูกวางใหม่ให้สอดใต้โต๊ะ 0.10 ม. เท่าเดิม — ไม่มีเก้าอี้ถูกสร้างหรือลบ (ไม่เกิด Orphan Chair)
 */
function rebuildTableSet(layout: StoreLayout, table: Table, width: Meters, depth: Meters): StoreLayout {
  const chairs = getChairsOfTable(layout, table);
  const center = objectCenter(table);
  const { x, y } = snapPoint({ x: center.x - width / 2, y: center.y - depth / 2 });

  // จัดกลุ่มเก้าอี้ตามฝั่งในกรอบอ้างอิงของโต๊ะ (ก่อนหมุน)
  const bySide = new Map<Side, Chair[]>();
  for (const chair of chairs) {
    const side = SIDE_BY_FACING[normalizeRotation(chair.rotation - table.rotation)];
    bySide.set(side, [...(bySide.get(side) ?? []), chair]);
  }

  const updates = new Map<string, LayoutObject>([[table.id, { ...table, x, y, width, depth, rotation: 0 }]]);
  for (const [side, group] of bySide) {
    group.forEach((chair, i) => {
      const rotation = FACING_BY_SIDE[side];
      const origin = chairOriginForSide({ x, y, width, depth }, side, i, group.length, { ...chair, rotation });
      updates.set(chair.id, { ...chair, rotation, x: roundMeters(origin.x), y: roundMeters(origin.y) });
    });
  }
  const flat = replaceObjects(layout, updates);
  return table.rotation === 0 ? flat : rotateObject(flat, table.id, table.rotation);
}

/**
 * ปรับขนาดหน้าโต๊ะของชุด (เลือกโต๊ะหรือเก้าอี้ลูกก็ได้) — snap ทีละ 0.05 ม. ช่วง 0.60–3.00 ม.
 * โต๊ะกลมบังคับกว้าง = ลึก (เส้นผ่านศูนย์กลาง) · เก้าอี้ทั้งชุดถูกจัดตำแหน่งใหม่รอบโต๊ะ
 */
export function resizeTableSet(layout: StoreLayout, id: string, width: Meters, depth: Meters): StoreLayout {
  const obj = findObject(layout, id);
  const table = obj && owningTable(layout, obj);
  if (!table) return layout;
  const w = clampTableSize(width);
  const d = tableStyleOf(table).shape === "round" ? w : clampTableSize(depth);
  if (tableSeatCapacity(w, d) < getChairsOfTable(layout, table).length) return layout;
  if (w === table.width && d === table.depth) return layout;
  return rebuildTableSet(layout, table, w, d);
}

/**
 * ปรับจำนวนเก้าอี้ของชุดโต๊ะที่มีอยู่ โดยเก็บ id ของโต๊ะและเก้าอี้เดิมเท่าที่จำนวนยังพอ
 * เก้าอี้ที่เพิ่มจะรับรูปลักษณ์จากเก้าอี้ตัวแรก และทุกตัวถูกจัดตำแหน่งใหม่รอบโต๊ะเดียวกัน
 * คืนผังเดิมเมื่อจำนวนไม่ถูกต้องหรือเกินความจุ เพื่อให้ UI ปิดการเพิ่มได้อย่างปลอดภัย
 */
export function setTableSetChairCount(
  layout: StoreLayout,
  id: string,
  chairCount: number,
  newId: IdFactory = randomId,
): StoreLayout {
  const obj = findObject(layout, id);
  const table = obj && owningTable(layout, obj);
  const count = Math.trunc(chairCount);
  if (!table || count < 1 || count > tableSeatCapacity(table.width, table.depth)) return layout;

  const existing = getChairsOfTable(layout, table).sort(
    (a, b) => table.chairIds.indexOf(a.id) - table.chairIds.indexOf(b.id),
  );
  if (existing.length === count) return layout;

  const center = objectCenter(table);
  const { x, y } = snapPoint({ x: center.x - table.width / 2, y: center.y - table.depth / 2 });
  const baseTable: Table = {
    ...table,
    x,
    y,
    rotation: 0,
    preset: count <= 2 ? "table-2-seats" : "table-4-seats",
    chairIds: [],
  };
  const template = existing[0];
  const baseChair = {
    width: template?.width ?? DEFAULT_SIZES.chair.width,
    depth: template?.depth ?? DEFAULT_SIZES.chair.depth,
    ...(template?.style ? { style: template.style } : {}),
  };
  const sides = sidesForChairCount(count, table.width, table.depth);
  const sideTotals = sides.reduce<Record<Side, number>>((totals, side) => ({ ...totals, [side]: totals[side] + 1 }), {
    north: 0,
    east: 0,
    south: 0,
    west: 0,
  });
  const sideIndexes: Record<Side, number> = { north: 0, east: 0, south: 0, west: 0 };
  const chairs: Chair[] = sides.map((side, index) => {
    const previous = existing[index];
    const rotation = FACING_BY_SIDE[side];
    const origin = chairOriginForSide(baseTable, side, sideIndexes[side]++, sideTotals[side], {
      ...baseChair,
      rotation,
    });
    return {
      id: previous?.id ?? newId("chair"),
      type: "chair",
      tableId: table.id,
      x: roundMeters(origin.x),
      y: roundMeters(origin.y),
      width: previous?.width ?? baseChair.width,
      depth: previous?.depth ?? baseChair.depth,
      rotation,
      ...(previous?.style ? { style: previous.style } : baseChair.style ? { style: baseChair.style } : {}),
    };
  });
  const nextTable = { ...baseTable, chairIds: chairs.map((chair) => chair.id) };
  const oldChairIds = new Set(existing.map((chair) => chair.id));
  const withoutOldChairs = layout.objects.filter((object) => !oldChairIds.has(object.id));
  let next: StoreLayout = {
    ...layout,
    objects: withoutOldChairs.flatMap((object) => (object.id === table.id ? [nextTable, ...chairs] : [object])),
  };
  if (table.rotation !== 0) next = rotateObject(next, table.id, table.rotation);
  return next;
}

export interface TableSetStylePatch {
  table?: Partial<TableStyle>;
  chair?: Partial<ChairStyle>;
}

/**
 * เปลี่ยนรูปลักษณ์ชุดโต๊ะ: สไตล์โต๊ะ และสไตล์เก้าอี้ "ทุกตัว" ในชุด
 * เปลี่ยนเป็นโต๊ะกลม → หน้าโต๊ะเป็นจัตุรัสตามด้านที่สั้นกว่า (footprint ไม่ขยาย จึงไม่เกิดการชนใหม่)
 */
export function setTableSetStyle(layout: StoreLayout, id: string, patch: TableSetStylePatch): StoreLayout {
  const obj = findObject(layout, id);
  const table = obj && owningTable(layout, obj);
  if (!table) return layout;

  const updates = new Map<string, LayoutObject>();
  const tableStyle = { ...tableStyleOf(table), ...patch.table };
  const tableChanged = (Object.keys(tableStyle) as (keyof TableStyle)[]).some((k) => tableStyle[k] !== tableStyleOf(table)[k]);
  if (tableChanged) updates.set(table.id, { ...table, style: tableStyle });
  if (patch.chair) {
    for (const chair of getChairsOfTable(layout, table)) {
      const current = chairStyleOf(chair);
      const next = { ...current, ...patch.chair };
      if ((Object.keys(next) as (keyof ChairStyle)[]).some((k) => next[k] !== current[k])) {
        updates.set(chair.id, { ...chair, style: next });
      }
    }
  }
  if (updates.size === 0) return layout;

  const styled = replaceObjects(layout, updates);
  const styledTable = findObject(styled, table.id) as Table;
  if (tableStyle.shape === "round" && styledTable.width !== styledTable.depth) {
    const side = Math.min(styledTable.width, styledTable.depth);
    return rebuildTableSet(styled, styledTable, side, side);
  }
  return styled;
}

/** คัดลอกขนาด/สไตล์ของชุดต้นแบบไปยังชุดเป้าหมาย (ใช้ตอนทำซ้ำหรือสลับจำนวนที่นั่ง) */
export function copyTableSetAppearance(
  layout: StoreLayout,
  source: { table: Table; chairStyle?: ChairStyle },
  targetTableId: string,
  options: { size?: boolean } = {},
): StoreLayout {
  let next = layout;
  if (options.size) next = resizeTableSet(next, targetTableId, source.table.width, source.table.depth);
  return setTableSetStyle(next, targetTableId, {
    table: source.table.style,
    chair: source.chairStyle,
  });
}
