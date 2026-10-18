/**
 * Zod schemas ของฟอร์มใน Editor (architecture.md §5.4) — แยกจาก Layout schema เพราะเป็นค่าที่ผู้ใช้พิมพ์
 * ข้อความ error เป็นภาษาไทย แสดงใต้ช่องกรอกผ่าน aria-describedby
 */
import { z } from "zod";
import {
  ENTRANCE_MAX_WIDTH,
  ENTRANCE_MIN_WIDTH,
  GRID_STEP,
  OBJECT_MIN_SIZE,
  ROOM_MAX,
  ROOM_MIN,
  SIZE_STEP,
  wallLength,
} from "@/core/layout";

const isMultipleOf = (step: number) => (v: number) => Math.abs(v / step - Math.round(v / step)) < 1e-6;

/** ช่องตัวเลข: ช่องว่าง/ตัวอักษร → NaN (react-hook-form valueAsNumber) ต้องแจ้งว่า "กรอกตัวเลข" */
const num = (label: string) =>
  z.number({ invalid_type_error: `กรอก${label}เป็นตัวเลข`, required_error: `กรอก${label}` }).finite(`กรอก${label}เป็นตัวเลข`);

const gridMeters = (label: string) =>
  num(label).refine(isMultipleOf(GRID_STEP), { message: `${label}ต้องลงกริดทีละ ${GRID_STEP} ม.` });

const roomDimension = (label: string) =>
  gridMeters(label).pipe(
    z
      .number()
      .min(ROOM_MIN, `${label}อย่างน้อย ${ROOM_MIN} ม.`)
      .max(ROOM_MAX, `${label}ไม่เกิน ${ROOM_MAX} ม.`),
  );

export const RoomSettingsSchema = z
  .object({
    width: roomDimension("ความกว้างร้าน"),
    depth: roomDimension("ความลึกร้าน"),
    entranceWall: z.enum(["north", "south", "east", "west"]),
    entrancePosition: gridMeters("ตำแหน่งทางเข้า").pipe(z.number().min(0, "ตำแหน่งทางเข้าต้องไม่ติดลบ")),
    entranceWidth: num("ความกว้างทางเข้า")
      .min(ENTRANCE_MIN_WIDTH, `ทางเข้ากว้างอย่างน้อย ${ENTRANCE_MIN_WIDTH} ม.`)
      .max(ENTRANCE_MAX_WIDTH, `ทางเข้ากว้างไม่เกิน ${ENTRANCE_MAX_WIDTH} ม.`)
      .refine(isMultipleOf(SIZE_STEP), { message: `ความกว้างทางเข้าปรับทีละ ${SIZE_STEP} ม.` }),
    hasKitchenDoor: z.boolean(),
    kitchenDoorWall: z.enum(["north", "south", "east", "west"]),
    kitchenDoorPosition: gridMeters("ตำแหน่งประตูครัว").pipe(z.number().min(0, "ตำแหน่งประตูครัวต้องไม่ติดลบ")),
    kitchenDoorWidth: num("ความกว้างประตูครัว")
      .min(ENTRANCE_MIN_WIDTH, `ประตูครัวกว้างอย่างน้อย ${ENTRANCE_MIN_WIDTH} ม.`)
      .max(ENTRANCE_MAX_WIDTH, `ประตูครัวกว้างไม่เกิน ${ENTRANCE_MAX_WIDTH} ม.`)
      .refine(isMultipleOf(SIZE_STEP), { message: `ความกว้างประตูครัวปรับทีละ ${SIZE_STEP} ม.` }),
  })
  .superRefine((v, ctx) => {
    if (!Number.isFinite(v.width) || !Number.isFinite(v.depth)) return;
    const wall = wallLength(v, v.entranceWall);
    if (v.entranceWidth > wall) {
      ctx.addIssue({ code: "custom", path: ["entranceWidth"], message: `ทางเข้ากว้างเกินผนัง (${wall} ม.)` });
    } else if (v.entrancePosition + v.entranceWidth > wall + 1e-9) {
      ctx.addIssue({
        code: "custom",
        path: ["entrancePosition"],
        message: `ทางเข้าเลยผนัง — ตำแหน่งได้สูงสุด ${(wall - v.entranceWidth).toFixed(2)} ม.`,
      });
    }

    if (v.hasKitchenDoor) {
      const kwall = wallLength(v, v.kitchenDoorWall);
      if (v.kitchenDoorWidth > kwall) {
        ctx.addIssue({ code: "custom", path: ["kitchenDoorWidth"], message: `ประตูครัวกว้างเกินผนัง (${kwall} ม.)` });
      } else if (v.kitchenDoorPosition + v.kitchenDoorWidth > kwall + 1e-9) {
        ctx.addIssue({
          code: "custom",
          path: ["kitchenDoorPosition"],
          message: `ประตูครัวเลยผนัง — ตำแหน่งได้สูงสุด ${(kwall - v.kitchenDoorWidth).toFixed(2)} ม.`,
        });
      }
      if (v.kitchenDoorWall === v.entranceWall) {
        const overlap =
          Math.min(v.entrancePosition + v.entranceWidth, v.kitchenDoorPosition + v.kitchenDoorWidth) -
          Math.max(v.entrancePosition, v.kitchenDoorPosition);
        if (overlap > 1e-6) {
          ctx.addIssue({
            code: "custom",
            path: ["kitchenDoorPosition"],
            message: "ประตูครัวทับช่องทางเข้าร้าน",
          });
        }
      }
    }
  });

export type RoomSettingsValues = z.infer<typeof RoomSettingsSchema>;

export const ObjectInspectorSchema = z.object({
  x: gridMeters("ตำแหน่ง x").pipe(z.number().min(-ROOM_MAX).max(ROOM_MAX)),
  y: gridMeters("ตำแหน่ง y").pipe(z.number().min(-ROOM_MAX).max(ROOM_MAX)),
  rotation: z.enum(["0", "90", "180", "270"]),
  /** กว้าง/ลึก ใช้เฉพาะครัวและเคาน์เตอร์ (โต๊ะ/เก้าอี้ใช้ขนาด preset) */
  width: num("ความกว้าง")
    .min(OBJECT_MIN_SIZE, `อย่างน้อย ${OBJECT_MIN_SIZE} ม.`)
    .max(ROOM_MAX, `ไม่เกิน ${ROOM_MAX} ม.`)
    .refine(isMultipleOf(SIZE_STEP), { message: `ปรับทีละ ${SIZE_STEP} ม.` }),
  depth: num("ความลึก")
    .min(OBJECT_MIN_SIZE, `อย่างน้อย ${OBJECT_MIN_SIZE} ม.`)
    .max(ROOM_MAX, `ไม่เกิน ${ROOM_MAX} ม.`)
    .refine(isMultipleOf(SIZE_STEP), { message: `ปรับทีละ ${SIZE_STEP} ม.` }),
});

export type ObjectInspectorValues = z.infer<typeof ObjectInspectorSchema>;
