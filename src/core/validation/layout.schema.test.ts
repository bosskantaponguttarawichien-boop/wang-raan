import { describe, expect, expectTypeOf, it } from "vitest";
import type { z } from "zod";
import type { LayoutObject, StoreLayout, ValidationResult } from "@/core/layout";
import { cafeLayout } from "@/test/fixtures/layouts";
import {
  LayoutObjectSchema,
  P1LayoutContractSchema,
  SaveLayoutRequestSchema,
  StoreLayoutSchema,
  ValidationResultSchema,
  validateLayout,
} from "./index";

describe("Zod schemas — type-safe ตรงกับ Core types", () => {
  it("z.infer ตรงกับ type ใน src/core/layout/types.ts", () => {
    expectTypeOf<z.infer<typeof StoreLayoutSchema>>().toEqualTypeOf<StoreLayout>();
    expectTypeOf<z.infer<typeof LayoutObjectSchema>>().toEqualTypeOf<LayoutObject>();
    expectTypeOf<z.infer<typeof ValidationResultSchema>>().toEqualTypeOf<ValidationResult>();
  });

  it("ผังจาก Core ผ่าน schema และ round-trip JSON ได้ค่าเดิม", () => {
    const layout = cafeLayout();
    expect(StoreLayoutSchema.parse(JSON.parse(JSON.stringify(layout)))).toEqual(layout);
    expect(ValidationResultSchema.parse(validateLayout(layout))).toBeTruthy();
  });

  it("วัตถุนอกขอบร้านยังผ่าน schema (Non-blocking — ให้ Validation Engine รายงานแทน)", () => {
    const layout = cafeLayout();
    const outside = { ...layout, objects: layout.objects.map((o, i) => (i === 0 ? { ...o, x: -1 } : o)) };
    expect(StoreLayoutSchema.safeParse(outside).success).toBe(true);
  });

  it.each<[string, (l: StoreLayout) => unknown]>([
    ["มี shelf", (l) => ({ ...l, objects: [...l.objects, { ...l.objects[0], type: "shelf" }] })],
    ["ขนาดร้านเกิน 30 ม.", (l) => ({ ...l, width: 31 })],
    ["ขนาดร้านไม่ลงกริด 0.25", (l) => ({ ...l, width: 8.1 })],
    ["rotation 45°", (l) => ({ ...l, objects: l.objects.map((o, i) => (i === 0 ? { ...o, rotation: 45 } : o)) })],
    ["id ซ้ำ", (l) => ({ ...l, objects: [...l.objects, l.objects[0]] })],
    ["เก้าอี้ไม่มี tableId", (l) => ({ ...l, objects: l.objects.map((o) => (o.type === "chair" ? { ...o, tableId: undefined } : o)) })],
    ["ฟิลด์แปลกปลอม", (l) => ({ ...l, hacked: true })],
    ["พิกัด Infinity", (l) => ({ ...l, objects: l.objects.map((o, i) => (i === 0 ? { ...o, x: Infinity } : o)) })],
    ["units ไม่ใช่เมตร", (l) => ({ ...l, units: "cm" })],
    ["ทางเข้ากว้างเกิน 3 ม.", (l) => ({ ...l, entrance: { ...l.entrance!, width: 3.5 } })],
  ])("ปฏิเสธ: %s", (_, mutate) => {
    expect(StoreLayoutSchema.safeParse(mutate(cafeLayout())).success).toBe(false);
  });

  it("id ซ้ำระบุ path ของวัตถุที่ซ้ำ", () => {
    const l = cafeLayout();
    const result = StoreLayoutSchema.safeParse({ ...l, objects: [...l.objects, l.objects[0]] });
    expect(result.success).toBe(false);
    expect(result.error!.issues[0]!.path).toEqual(["objects", l.objects.length, "id"]);
  });

  it("SaveLayoutRequest ต้องมี { layout } เท่านั้น", () => {
    expect(SaveLayoutRequestSchema.safeParse({ layout: cafeLayout() }).success).toBe(true);
    expect(SaveLayoutRequestSchema.safeParse(cafeLayout()).success).toBe(false);
  });

  it("P1 → P2 contract ปฏิเสธผลตรวจ Blocked", () => {
    const layout = cafeLayout();
    const validation = validateLayout(layout);
    const payload = { contractVersion: "p1-layout-v1", layout, validation };
    expect(P1LayoutContractSchema.safeParse(payload).success).toBe(true);
    expect(P1LayoutContractSchema.safeParse({ ...payload, validation: { ...validation, status: "blocked" } }).success).toBe(false);
    const sneaky = { ...validation, issues: [{ id: "x", category: "collision", severity: "blocked", objectIds: [], message: "" }] };
    expect(P1LayoutContractSchema.safeParse({ ...payload, validation: sneaky }).success).toBe(false);
  });
});
