import { describe, expect, it } from "vitest";
import { checkTableSetIntegrity, createSequentialIds, type IdFactory, type StoreLayout } from "@/core/layout";
import { P1LayoutContractSchema, computeLayoutRevision, validateLayout } from "@/core/validation";
import { cafeLayout } from "@/test/fixtures/layouts";
import {
  LAYOUT_FILE_MAX_BYTES,
  createLayoutFile,
  importLayoutFile,
  layoutFileName,
  serializeLayoutFile,
} from "./layout-file";

const now = () => new Date("2026-10-10T03:00:00.000Z");
/** id ของผังที่นำเข้าต้องต่างจากไฟล์ต้นทาง → ใช้ตัวสร้าง id ที่มี prefix ต่างจาก fixture */
const ids = (): IdFactory => {
  const seq = createSequentialIds();
  return (kind) => `new-${seq(kind)}`;
};

function roundTrip(layout: StoreLayout) {
  const file = createLayoutFile(layout, validateLayout(layout, { now }));
  return importLayoutFile(serializeLayoutFile(file), ids());
}

/** ตัวอย่างใน PRD §4.4 (ไม่มี version, entrance.width, เก้าอี้ 0.6 ม.) */
const PRD_SAMPLE = {
  contractVersion: "p1-layout-v1",
  layout: {
    id: "layout-001",
    units: "m",
    width: 8,
    depth: 6,
    entrance: { id: "entrance-01", wall: "south", position: 1.2 },
    objects: [
      { id: "kitchen-01", type: "kitchen", x: 0.5, y: 0.5, width: 2, depth: 1.5, rotation: 0 },
      { id: "counter-01", type: "counter", x: 5, y: 0.5, width: 2.4, depth: 0.7, rotation: 0 },
      { id: "table-01", type: "table", x: 3, y: 3, width: 1.2, depth: 1.2, rotation: 0, chairIds: ["chair-01"] },
      { id: "chair-01", type: "chair", tableId: "table-01", x: 3.3, y: 2.3, width: 0.6, depth: 0.6, rotation: 0 },
    ],
  },
  validation: { layoutRevision: "same-as-current-layout", status: "ready", issues: [] },
};

describe("Export", () => {
  it("ไฟล์ตรง contract p1-layout-v1 และผัง Ready ผ่าน P1LayoutContractSchema (ส่งต่อ P2 ได้)", () => {
    const layout = cafeLayout();
    const file = createLayoutFile(layout, validateLayout(layout, { now }));
    const json = JSON.parse(serializeLayoutFile(file));
    expect(json.contractVersion).toBe("p1-layout-v1");
    expect(json.validation.layoutRevision).toBe(computeLayoutRevision(layout));
    expect(P1LayoutContractSchema.safeParse(json).success).toBe(true);
  });

  it("ชื่อไฟล์มีขนาดร้านและเวลา", () => {
    expect(layoutFileName({ width: 8, depth: 6 }, new Date(2026, 9, 10, 3, 5))).toBe("wang-raan-8x6m-20261010-0305.json");
    expect(layoutFileName({ width: 8, depth: 6 }, new Date(2026, 9, 10, 3, 5), "svg")).toMatch(/\.svg$/);
  });
});

describe("Import (feat-029 gate: แปลงเป็น Entity + Table-Chair Hierarchy ถูกต้อง)", () => {
  it("ส่งออก → นำเข้า ได้ผังเดิมทุกประการ ไม่มีหมายเหตุ", () => {
    const layout = cafeLayout();
    const result = roundTrip(layout);
    expect(result).toMatchObject({ ok: true, source: "contract", notes: [] });
    if (!result.ok) return;
    expect(result.layout).toEqual({ ...layout, id: "new-layout-01" }); // ได้ id ผังใหม่ ส่วนอื่นเหมือนเดิมทุกประการ
    expect(result.fileValidation?.status).toBe("ready");
    expect(checkTableSetIntegrity(result.layout)).toEqual([]);
  });

  it("รับ StoreLayout เปล่า ๆ (ไม่มี contract)", () => {
    const layout = cafeLayout();
    const result = importLayoutFile(JSON.stringify(layout), ids());
    expect(result).toMatchObject({ ok: true, source: "layout", fileValidation: null, layout: { ...layout, id: "new-layout-01" } });
  });

  it("ตัวอย่าง PRD §4.4: เติม version / ความกว้างประตู และได้ hierarchy ครบ", () => {
    const result = importLayoutFile(JSON.stringify(PRD_SAMPLE), ids());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.layout.version).toBe(1);
    expect(result.layout.entrance).toEqual({ id: "entrance-01", wall: "south", position: 1.25, width: 1.2 }); // id วัตถุ/ทางเข้าคงเดิม
    expect(result.layout.objects.find((o) => o.id === "table-01")).toMatchObject({ chairIds: ["chair-01"] });
    expect(result.layout.objects.find((o) => o.id === "chair-01")).toMatchObject({ tableId: "table-01" });
    expect(checkTableSetIntegrity(result.layout)).toEqual([]);
    expect(result.fileValidation).toBeNull(); // validatedAt หาย → ไม่ใช้
    expect(result.notes.join("\n")).toContain("ไม่ระบุความกว้างทางเข้า");
  });

  it("สร้าง chairIds ใหม่จาก tableId; ตัดเก้าอี้กำพร้า; ผูกเก้าอี้ที่ไม่มี tableId จาก chairIds", () => {
    const raw = {
      width: 8,
      depth: 6,
      entrance: { wall: "south", position: 1, width: 1.2 },
      objects: [
        { id: "t1", type: "table", x: 1, y: 1, width: 1.2, depth: 1.2, chairIds: ["ghost", "c2"] },
        { id: "t2", type: "table", x: 4, y: 1, width: 0.8, depth: 0.8, chairIds: ["c3", "c4"] },
        { id: "c1", type: "chair", tableId: "t1", x: 1.35, y: 0.6, width: 0.5, depth: 0.5 },
        { id: "c2", type: "chair", tableId: "t1", x: 1.35, y: 2.1, width: 0.5, depth: 0.5, rotation: 180 },
        { id: "c3", type: "chair", x: 4.15, y: 0.4, width: 0.5, depth: 0.5 },
        { id: "c4", type: "chair", tableId: "t1", x: 4.15, y: 1.7, width: 0.5, depth: 0.5, rotation: 180 },
        { id: "orphan", type: "chair", tableId: "nope", x: 6, y: 4, width: 0.5, depth: 0.5 },
        { id: "lost", type: "chair", x: 7, y: 4, width: 0.5, depth: 0.5 },
      ],
    };
    const result = importLayoutFile(JSON.stringify(raw), ids());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const byId = new Map(result.layout.objects.map((o) => [o.id, o]));
    expect(byId.get("t1")).toMatchObject({ chairIds: ["c2", "c1", "c4"] });
    expect(byId.get("t2")).toMatchObject({ chairIds: ["c3"] });
    expect(byId.get("c3")).toMatchObject({ tableId: "t2", rotation: 0 });
    expect(byId.has("orphan")).toBe(false);
    expect(byId.has("lost")).toBe(false);
    expect(checkTableSetIntegrity(result.layout)).toEqual([]);
    const notes = result.notes.join("\n");
    expect(notes).toContain("ตัดเก้าอี้ที่ไม่มีโต๊ะ 2 ตัว (orphan, lost)");
    expect(notes).toContain("ผูกเก้าอี้ c3 กับโต๊ะ t2");
    expect(notes).toContain("c4 อยู่ในหลายโต๊ะ");
    expect(notes).toContain("chairIds");
    expect(result.layout.id).toBe("new-layout-01");
  });

  it("ปรับค่าให้ถูกต้อง: ขนาดร้านลงกริด, มุมหมุน, id ที่ขาด, ทางเข้าเลยผนัง, ไม่มีทางเข้า", () => {
    const raw = {
      width: 8.1,
      depth: 6,
      entrance: { wall: "east", position: 5.5, width: 1.2 },
      objects: [
        { type: "kitchen", x: 0.5, y: 0.5, width: 2, depth: 1.5, rotation: 450 },
        { type: "table", x: 4, y: 3, width: 0.8, depth: 0.8 },
      ],
    };
    const result = importLayoutFile(JSON.stringify(raw), ids());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.layout).toMatchObject({ width: 8, entrance: { wall: "east", position: 4.75 } });
    expect(result.layout.objects.map((o) => o.id)).toEqual(["new-kitchen-01", "new-table-01"]);
    expect(result.layout.objects[0]!.rotation).toBe(90);
    const notes = result.notes.join("\n");
    for (const text of ["ลงกริด 0.25", "สร้าง id", "มุมหมุน", "ทางเข้า"]) expect(notes).toContain(text);

    const noEntrance = importLayoutFile(JSON.stringify({ ...raw, entrance: null }), ids());
    expect(noEntrance.ok && noEntrance.layout.entrance).toBeNull();
    expect(noEntrance.ok && noEntrance.notes.join()).toContain("ไม่มีทางเข้า");
  });

  it.each([
    ["ไม่ใช่ JSON", "{oops", "ไม่ใช่ JSON"],
    ["array", "[]", "ไม่พบข้อมูลผังร้าน"],
    ["ไม่มี objects", JSON.stringify({ width: 8 }), "ต้องมี contractVersion หรือ objects"],
    ["contract อื่น", JSON.stringify({ contractVersion: "p1-layout-v9", layout: {} }), "ไม่รองรับ contractVersion"],
    ["Shelf", JSON.stringify({ width: 8, depth: 6, objects: [{ type: "shelf", x: 0, y: 0, width: 1, depth: 1 }] }), "ไม่มี shelf"],
    ["ร้านใหญ่เกิน", JSON.stringify({ width: 40, depth: 6, objects: [] }), "ไม่เกิน 30"],
    ["หน่วยไม่ใช่เมตร", JSON.stringify({ width: 8, depth: 6, units: "cm", objects: [] }), "เมตร"],
    [
      "id ซ้ำ",
      JSON.stringify({
        width: 8,
        depth: 6,
        objects: [
          { id: "a", type: "kitchen", x: 0, y: 0, width: 1, depth: 1 },
          { id: "a", type: "counter", x: 2, y: 0, width: 1, depth: 1 },
        ],
      }),
      "id ซ้ำ: a",
    ],
    ["พิกัดไกลเกิน (schema สุดท้าย)", JSON.stringify({ width: 8, depth: 6, objects: [{ type: "kitchen", x: 500, y: 0, width: 1, depth: 1 }] }), "layout.objects.0.x"],
  ])("ปฏิเสธ: %s", (_name, text, message) => {
    const result = importLayoutFile(text, ids());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join("\n")).toContain(message);
  });

  it("ไฟล์ใหญ่เกิน 2 MB ถูกปฏิเสธก่อน parse", () => {
    const result = importLayoutFile(" ".repeat(LAYOUT_FILE_MAX_BYTES + 1), ids());
    expect(result).toEqual({ ok: false, errors: ["ไฟล์ใหญ่เกิน 2 MB"] });
  });

  it("พิกัดไม่ลงกริด → snap 0.25 ม.; เก้าอี้ขยับตามโต๊ะด้วยระยะเดียวกัน (คงระยะสอด); ขนาดครัว/เคาน์เตอร์ลงทีละ 0.05", () => {
    const raw = {
      width: 8,
      depth: 6,
      entrance: { wall: "south", position: 1, width: 1.2 },
      objects: [
        { id: "c", type: "counter", x: 1.13, y: 0.4, width: 2.42, depth: 0.71 },
        { id: "t", type: "table", x: 3.1, y: 3.05, width: 0.8, depth: 0.8, chairIds: ["s"] },
        { id: "s", type: "chair", tableId: "t", x: 3.25, y: 2.65, width: 0.5, depth: 0.5 },
      ],
    };
    const result = importLayoutFile(JSON.stringify(raw), ids());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const byId = new Map(result.layout.objects.map((o) => [o.id, o]));
    expect(byId.get("c")).toMatchObject({ x: 1.25, y: 0.5, width: 2.4, depth: 0.7 });
    expect(byId.get("t")).toMatchObject({ x: 3, y: 3, width: 0.8, depth: 0.8 });
    expect(byId.get("s")).toMatchObject({ x: 3.15, y: 2.6 }); // ขยับ (−0.10, −0.05) เท่าโต๊ะ
    expect(result.notes.join("\n")).toContain("ปรับตำแหน่ง/ขนาด 3 ชิ้นให้ลงกริด 0.25 ม.");

    const tiny = importLayoutFile(JSON.stringify({ ...raw, objects: [{ type: "kitchen", x: 0, y: 0, width: 0.1, depth: 0.1 }] }), ids());
    expect(tiny.ok && tiny.layout.objects[0]).toMatchObject({ width: 0.3, depth: 0.3 });
  });
});
