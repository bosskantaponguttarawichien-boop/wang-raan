/**
 * P1 Layout JSON File — Import / Export (PRD §4.4 `p1-layout-v1`, feat-029)
 * Pure TypeScript: ใช้ได้ทั้ง Client, BFF และ Worker
 *
 * ส่งออก: `{ contractVersion: "p1-layout-v1", layout, validation }` โดยตรวจผังใหม่ทุกครั้ง
 *   (ไฟล์ของผัง Blocked ยังส่งออกได้เพื่อเก็บงาน แต่ P2 จะรับเฉพาะ ready/warning ตาม P1LayoutContractSchema)
 *
 * นำเข้า: รับได้ 3 แบบ — ไฟล์ contract เต็ม, StoreLayout เปล่า ๆ และตัวอย่างใน PRD §4.4
 *   (ไม่มี version / entrance.width / chairIds) แล้ว "สร้าง Table–Chair Hierarchy ใหม่" จากข้อมูลจริง:
 *   - เก้าอี้สังกัดโต๊ะตาม `tableId`; ถ้าไม่มี `tableId` แต่อยู่ใน `chairIds` ของโต๊ะเดียว → ใช้โต๊ะนั้น
 *   - `chairIds` ของโต๊ะคำนวณใหม่จากเก้าอี้ที่สังกัดจริง (ห้ามมีเก้าอี้หลายโต๊ะ / id ค้าง)
 *   - เก้าอี้ที่หาโต๊ะไม่ได้ถูกตัดทิ้ง (ห้ามเกิด Orphan Chair) และแจ้งในรายการหมายเหตุ
 *   - พิกัดลงกริด 0.25 ม. (เก้าอี้ขยับตามโต๊ะ), ขนาดครัว/เคาน์เตอร์ลงทีละ 0.05 ม.
 *   - ได้ id ผังใหม่เสมอ (นำเข้า = เอกสารใหม่)
 *   - ผลตรวจในไฟล์ไม่ถูกเชื่อถือ — ผู้เรียกต้องตรวจผังใหม่เอง
 */
import { z } from "zod";
import { ENTRANCE_DEFAULT_WIDTH, OBJECT_MIN_SIZE, ROOM_MAX, ROOM_MIN, SIZE_STEP } from "../layout/constants";
import { createEntrance } from "../layout/entities";
import { clampRoomDimension, normalizeRotation, roundMeters, snapToGrid } from "../layout/geometry";
import type { IdFactory, LayoutObject, StoreLayout, ValidationResult } from "../layout/types";
import { OBJECT_LABEL } from "../validation/issues";
import { StoreLayoutSchema, ValidationResultSchema } from "../validation/layout.schema";

export const LAYOUT_FILE_CONTRACT = "p1-layout-v1";
/** กันไฟล์ใหญ่ผิดปกติ (ผัง 1,000 ชิ้น ≈ 200 KB) */
export const LAYOUT_FILE_MAX_BYTES = 2_000_000;

export interface LayoutFile {
  contractVersion: typeof LAYOUT_FILE_CONTRACT;
  layout: StoreLayout;
  validation: ValidationResult;
}

export function createLayoutFile(layout: StoreLayout, validation: ValidationResult): LayoutFile {
  return { contractVersion: LAYOUT_FILE_CONTRACT, layout, validation };
}

export function serializeLayoutFile(file: LayoutFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

/** ชื่อไฟล์ เช่น wang-raan-8x6m-20261010-0315.json */
export function layoutFileName(layout: Pick<StoreLayout, "width" | "depth">, at: Date, ext = "json"): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}`;
  return `wang-raan-${layout.width}x${layout.depth}m-${stamp}.${ext}`;
}

// ── Import ──────────────────────────────────────────────────────────────────

const Num = z.number().finite();
const LooseObject = z.object({
  id: z.string().min(1).max(128).optional(),
  type: z.enum(["kitchen", "counter", "table", "chair"], {
    errorMap: () => ({ message: "ชนิดวัตถุต้องเป็น kitchen, counter, table หรือ chair (V1 ไม่มี shelf)" }),
  }),
  x: Num,
  y: Num,
  width: Num.positive(),
  depth: Num.positive(),
  rotation: Num.optional(),
  chairIds: z.array(z.string()).optional(),
  preset: z.enum(["table-2-seats", "table-4-seats"]).optional(),
  tableId: z.string().optional(),
});

const LooseLayout = z.object({
  id: z.string().min(1).max(128).optional(),
  version: z.number().int().positive().optional(),
  units: z.literal("m", { errorMap: () => ({ message: "หน่วยต้องเป็นเมตร (\"m\")" }) }).optional(),
  width: Num.min(ROOM_MIN, `ขนาดร้านอย่างน้อย ${ROOM_MIN} ม.`).max(ROOM_MAX, `ขนาดร้านไม่เกิน ${ROOM_MAX} ม.`),
  depth: Num.min(ROOM_MIN, `ขนาดร้านอย่างน้อย ${ROOM_MIN} ม.`).max(ROOM_MAX, `ขนาดร้านไม่เกิน ${ROOM_MAX} ม.`),
  entrance: z
    .object({
      id: z.string().min(1).max(128).optional(),
      wall: z.enum(["north", "south", "east", "west"]),
      position: Num,
      width: Num.optional(),
    })
    .nullable()
    .optional(),
  objects: z.array(LooseObject).max(1000, "วัตถุเกิน 1,000 ชิ้น"),
});

type LooseObject = z.infer<typeof LooseObject>;

export type ImportSource = "contract" | "layout";

export type LayoutImportResult =
  | {
      ok: true;
      layout: StoreLayout;
      source: ImportSource;
      /** สิ่งที่ระบบปรับให้ระหว่างนำเข้า (ภาษาไทย) */
      notes: string[];
      /** ผลตรวจที่แนบมากับไฟล์ (ใช้แสดงอ้างอิงเท่านั้น) */
      fileValidation: ValidationResult | null;
    }
  | { ok: false; errors: string[] };

const fail = (...errors: string[]): LayoutImportResult => ({ ok: false, errors });

function zodMessages(error: z.ZodError, prefix: string): string[] {
  return error.issues.slice(0, 5).map((i) => {
    const path = [prefix, ...i.path].filter((p) => p !== "").join(".");
    return `${path}: ${i.message}`;
  });
}

export function importLayoutFile(text: string, newId: IdFactory): LayoutImportResult {
  if (text.length > LAYOUT_FILE_MAX_BYTES) return fail("ไฟล์ใหญ่เกิน 2 MB");
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return fail("ไฟล์ไม่ใช่ JSON ที่ถูกต้อง");
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) return fail("ไม่พบข้อมูลผังร้านในไฟล์");

  const record = data as Record<string, unknown>;
  let source: ImportSource = "layout";
  let rawLayout: unknown = record;
  let fileValidation: ValidationResult | null = null;
  if ("contractVersion" in record) {
    if (record.contractVersion !== LAYOUT_FILE_CONTRACT) {
      return fail(`ไม่รองรับ contractVersion "${String(record.contractVersion)}" (รองรับ ${LAYOUT_FILE_CONTRACT})`);
    }
    source = "contract";
    rawLayout = record.layout;
    const v = ValidationResultSchema.safeParse(record.validation);
    fileValidation = v.success ? v.data : null;
  } else if (!("objects" in record)) {
    return fail("ไม่พบข้อมูลผังร้านในไฟล์ (ต้องมี contractVersion หรือ objects)");
  }

  const parsed = LooseLayout.safeParse(rawLayout);
  if (!parsed.success) return fail(...zodMessages(parsed.error, source === "contract" ? "layout" : ""));
  const raw = parsed.data;
  const notes: string[] = [];

  // ── ขนาดร้าน ──
  const width = clampRoomDimension(raw.width);
  const depth = clampRoomDimension(raw.depth);
  if (width !== raw.width || depth !== raw.depth) {
    notes.push(`ปรับขนาดร้านเป็น ${width} × ${depth} ม. ให้ลงกริด 0.25 ม.`);
  }
  const room = { width, depth };

  // ── id: ห้ามซ้ำ (ทำให้ความสัมพันธ์โต๊ะ-เก้าอี้กำกวม) ──
  const seen = new Set<string>();
  for (const obj of raw.objects) {
    if (!obj.id) continue;
    if (seen.has(obj.id)) return fail(`id ซ้ำ: ${obj.id} — ไม่สามารถสร้างความสัมพันธ์โต๊ะ-เก้าอี้ได้`);
    seen.add(obj.id);
  }
  const withIds = raw.objects.map((obj) => ({ ...obj, id: obj.id ?? newId(obj.type) }));
  const generated = raw.objects.filter((o) => !o.id).length;
  if (generated > 0) notes.push(`สร้าง id ให้วัตถุที่ไม่มี id ${generated} ชิ้น`);

  // ── Table–Chair hierarchy ──
  const tables = new Map(withIds.filter((o) => o.type === "table").map((t) => [t.id, t]));
  const listedBy = new Map<string, string[]>(); // chairId → โต๊ะที่ระบุใน chairIds
  for (const table of tables.values()) {
    for (const chairId of table.chairIds ?? []) listedBy.set(chairId, [...(listedBy.get(chairId) ?? []), table.id]);
  }

  const ownerOf = new Map<string, string>();
  const dropped: string[] = [];
  for (const chair of withIds.filter((o) => o.type === "chair")) {
    const listed = listedBy.get(chair.id) ?? [];
    let owner = chair.tableId && tables.has(chair.tableId) ? chair.tableId : undefined;
    if (!owner && listed.length === 1) {
      owner = listed[0];
      notes.push(`ผูกเก้าอี้ ${chair.id} กับโต๊ะ ${owner} ตาม chairIds`);
    }
    if (!owner) {
      dropped.push(chair.id);
      continue;
    }
    if (listed.some((t) => t !== owner)) notes.push(`เก้าอี้ ${chair.id} อยู่ในหลายโต๊ะ — ใช้โต๊ะ ${owner} ตาม tableId`);
    ownerOf.set(chair.id, owner);
  }
  if (dropped.length > 0) notes.push(`ตัดเก้าอี้ที่ไม่มีโต๊ะ ${dropped.length} ตัว (${dropped.slice(0, 3).join(", ")}${dropped.length > 3 ? ", …" : ""})`);

  const chairsOf = (tableId: string, given: string[] | undefined) => {
    const members = withIds.filter((o) => o.type === "chair" && ownerOf.get(o.id) === tableId).map((o) => o.id);
    // คงลำดับตามไฟล์ก่อน แล้วต่อด้วยเก้าอี้ที่ไฟล์ไม่ได้ระบุ
    const ordered = [...(given ?? []).filter((id) => members.includes(id)), ...members.filter((id) => !(given ?? []).includes(id))];
    return [...new Set(ordered)];
  };

  // ── ลงกริด 0.25 ม. (AGENTS.md) — เก้าอี้ขยับตามโต๊ะด้วยระยะเดียวกัน เพื่อคงระยะสอดใต้โต๊ะ ──
  const tableShift = new Map<string, { dx: number; dy: number }>();
  for (const table of tables.values()) {
    tableShift.set(table.id, { dx: roundMeters(snapToGrid(table.x) - table.x), dy: roundMeters(snapToGrid(table.y) - table.y) });
  }
  const sizeOf = (obj: LooseObject, v: number) =>
    // ครัว/เคาน์เตอร์ปรับขนาดทีละ 0.05 ม. เหมือนใน Editor; โต๊ะ/เก้าอี้คงขนาดตาม preset
    obj.type === "kitchen" || obj.type === "counter" ? Math.min(ROOM_MAX, Math.max(OBJECT_MIN_SIZE, snapToGrid(v, SIZE_STEP))) : roundMeters(v);

  let fixedChairIds = 0;
  let snapped = 0;
  const objects: LayoutObject[] = [];
  for (const obj of withIds) {
    if (obj.type === "chair" && !ownerOf.has(obj.id)) continue;
    const shift = obj.type === "chair" ? tableShift.get(ownerOf.get(obj.id)!)! : null;
    const base = {
      id: obj.id,
      x: shift ? roundMeters(obj.x + shift.dx) : snapToGrid(obj.x),
      y: shift ? roundMeters(obj.y + shift.dy) : snapToGrid(obj.y),
      width: sizeOf(obj, obj.width),
      depth: sizeOf(obj, obj.depth),
      rotation: normalizeRotation(obj.rotation ?? 0),
    };
    const eps = 1e-6;
    if ([base.x - obj.x, base.y - obj.y, base.width - obj.width, base.depth - obj.depth].some((d) => Math.abs(d) > eps)) snapped++;
    if (obj.rotation !== undefined && obj.rotation !== base.rotation) {
      notes.push(`ปรับมุมหมุนของ${OBJECT_LABEL[obj.type]} ${obj.id} เป็น ${base.rotation}°`);
    }
    objects.push(buildObject(obj, base, chairsOf, ownerOf, () => fixedChairIds++));
  }
  if (snapped > 0) notes.push(`ปรับตำแหน่ง/ขนาด ${snapped} ชิ้นให้ลงกริด 0.25 ม. (เก้าอี้ขยับตามโต๊ะ)`);
  if (fixedChairIds > 0) notes.push(`สร้างรายการเก้าอี้ (chairIds) ของโต๊ะใหม่ตามเก้าอี้ที่สังกัดจริง ${fixedChairIds} โต๊ะ`);

  // ── ทางเข้า ──
  let entrance: StoreLayout["entrance"] = null;
  if (raw.entrance) {
    const e = raw.entrance;
    const entranceId = e.id ?? newId("entrance");
    entrance = createEntrance(room, { wall: e.wall, position: e.position, width: e.width ?? ENTRANCE_DEFAULT_WIDTH }, () => entranceId);
    if (e.width === undefined) notes.push(`ไม่ระบุความกว้างทางเข้า — ใช้ ${ENTRANCE_DEFAULT_WIDTH} ม.`);
    else if (entrance.position !== e.position || entrance.width !== e.width) notes.push("ปรับตำแหน่ง/ความกว้างทางเข้าให้อยู่บนผนังและลงกริด");
  } else {
    notes.push("ไฟล์ไม่มีทางเข้า — ต้องกำหนดทางเข้าก่อนจำลอง");
  }

  const layout: StoreLayout = {
    // ผังที่นำเข้าเป็นเอกสารใหม่เสมอ: id ใหม่ → ไม่ชนกับผังเดิม (ของตนเองหรือของคนที่ส่งไฟล์มา) ตอนบันทึก
    id: newId("layout"),
    version: raw.version ?? 1,
    units: "m",
    width,
    depth,
    entrance,
    objects,
  };
  const check = StoreLayoutSchema.safeParse(layout);
  if (!check.success) return fail(...zodMessages(check.error, "layout"));
  return { ok: true, layout, source, notes, fileValidation };
}

function buildObject(
  obj: LooseObject & { id: string },
  base: Omit<LayoutObject, "type" | "chairIds" | "tableId" | "preset">,
  chairsOf: (tableId: string, given: string[] | undefined) => string[],
  ownerOf: Map<string, string>,
  onFixed: () => void,
): LayoutObject {
  switch (obj.type) {
    case "table": {
      const chairIds = chairsOf(obj.id, obj.chairIds);
      const given = obj.chairIds ?? [];
      if (given.length !== chairIds.length || given.some((id, i) => id !== chairIds[i])) onFixed();
      return { ...base, type: "table", chairIds, ...(obj.preset ? { preset: obj.preset } : {}) };
    }
    case "chair":
      return { ...base, type: "chair", tableId: ownerOf.get(obj.id)! };
    default:
      return { ...base, type: obj.type };
  }
}
