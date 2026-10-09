/**
 * Zod Schemas — ใช้ร่วมกันระหว่าง Client, BFF และ Web Worker (architecture.md §4.2)
 * Type ที่ได้จาก schema ต้องตรงกับ Core types 100% (ตรวจด้วย expectTypeOf ในเทสต์)
 *
 * ต่างจากตัวอย่างใน architecture.md โดยตั้งใจ:
 * - พิกัดวัตถุไม่บังคับ ≥ 0: Non-blocking placement ยอมให้วางนอกขอบได้ชั่วคราว
 *   และ Validation Engine จะรายงาน out-of-bounds เป็น issue (BFF จึงตอบ 422 ไม่ใช่ 400)
 * - Table.chairIds อนุญาตเป็น [] (Completeness รายงานเป็น Warning)
 * - entrance เป็น null ได้ (Completeness รายงานเป็น Blocked)
 */
import { z } from "zod";
import { ENTRANCE_MAX_WIDTH, GRID_STEP, ROOM_MAX, ROOM_MIN } from "../layout/constants";

const ID = z.string().min(1).max(128);
/** พิกัดยอมให้ออกนอกร้านได้ระยะหนึ่ง แต่กันค่าขยะ/Infinity */
const Coordinate = z.number().finite().min(-ROOM_MAX).max(ROOM_MAX * 2);
const Size = z.number().finite().positive().max(ROOM_MAX);
const RoomDimension = z
  .number()
  .finite()
  .min(ROOM_MIN)
  .max(ROOM_MAX)
  .refine((v) => Math.abs(v / GRID_STEP - Math.round(v / GRID_STEP)) < 1e-6, {
    message: `ขนาดร้านต้องเป็นทวีคูณของ ${GRID_STEP} ม.`,
  });

export const RotationSchema = z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]);

const BaseObjectShape = {
  id: ID,
  x: Coordinate,
  y: Coordinate,
  width: Size,
  depth: Size,
  rotation: RotationSchema,
};

// C-01: องค์ประกอบหลักคือ kitchen, counter, table, chair (ไม่มี shelf)
export const KitchenSchema = z.object({ ...BaseObjectShape, type: z.literal("kitchen") }).strict();
export const CounterSchema = z.object({ ...BaseObjectShape, type: z.literal("counter") }).strict();
export const TableSchema = z
  .object({
    ...BaseObjectShape,
    type: z.literal("table"),
    chairIds: z.array(ID).max(16),
    preset: z.enum(["table-2-seats", "table-4-seats"]).optional(),
  })
  .strict();
export const ChairSchema = z.object({ ...BaseObjectShape, type: z.literal("chair"), tableId: ID }).strict();

export const LayoutObjectSchema = z.discriminatedUnion("type", [KitchenSchema, CounterSchema, TableSchema, ChairSchema]);

export const EntranceSchema = z
  .object({
    id: ID,
    wall: z.enum(["north", "south", "east", "west"]),
    position: z.number().finite().min(0).max(ROOM_MAX),
    width: z.number().finite().min(0.6).max(ENTRANCE_MAX_WIDTH),
  })
  .strict();

export const StoreLayoutSchema = z
  .object({
    id: ID,
    version: z.number().int().positive(),
    units: z.literal("m"),
    width: RoomDimension,
    depth: RoomDimension,
    entrance: EntranceSchema.nullable(),
    objects: z.array(LayoutObjectSchema).max(1000),
  })
  .strict()
  .superRefine((layout, ctx) => {
    const seen = new Set<string>();
    layout.objects.forEach((obj, index) => {
      if (seen.has(obj.id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["objects", index, "id"], message: `id ซ้ำ: ${obj.id}` });
      }
      seen.add(obj.id);
    });
  });

export const ValidationIssueSchema = z
  .object({
    id: z.string(),
    category: z.enum(["completeness", "collision", "clearance", "accessibility"]),
    severity: z.enum(["blocked", "warning"]),
    objectIds: z.array(z.string()),
    message: z.string(),
  })
  .strict();

export const ValidationResultSchema = z
  .object({
    layoutRevision: z.string().min(1),
    status: z.enum(["ready", "warning", "blocked"]),
    issues: z.array(ValidationIssueSchema),
    validatedAt: z.string().datetime(),
  })
  .strict();

/**
 * P1 → P2 Contract (PRD §4.4) — สัญญาขั้นต่ำ: status เป็น ready/warning และไม่มี issue ระดับ blocked
 * (การตรวจว่า layoutRevision ตรงกับผังเป็นหน้าที่ของผู้รับ เพราะต้องคำนวณ hash)
 */
export const P1LayoutContractSchema = z
  .object({
    contractVersion: z.literal("p1-layout-v1"),
    layout: StoreLayoutSchema,
    validation: ValidationResultSchema,
  })
  .strict()
  .superRefine((payload, ctx) => {
    if (payload.validation.status === "blocked" || payload.validation.issues.some((i) => i.severity === "blocked")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["validation", "status"],
        message: "ผังที่ Blocked ส่งต่อไป P2 ไม่ได้",
      });
    }
  });

/** Request body ของ BFF POST/PUT /api/layouts */
export const SaveLayoutRequestSchema = z.object({ layout: StoreLayoutSchema }).strict();

export type SaveLayoutRequest = z.infer<typeof SaveLayoutRequestSchema>;
