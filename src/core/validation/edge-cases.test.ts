import { describe, expect, it } from "vitest";
import {
  createSequentialIds,
  createTableSet,
  moveObject,
  rotatePoint,
  type Chair,
  type StoreLayout,
  type Table,
} from "@/core/layout";
import { block, cafeLayout, withObjects } from "@/test/fixtures/layouts";
import { chairAccessStrips, collectIssues, computeLayoutRevision, issueCode } from "./index";

// feat-010: edge cases ที่ไม่ได้ครอบคลุมในเทสต์รายกฎ
describe("edge cases", () => {
  it("rotatePoint 0° คืนจุดใหม่ที่ค่าเท่าเดิม", () => {
    const p = { x: 1, y: 2 };
    const r = rotatePoint(p, { x: 0, y: 0 }, 0);
    expect(r).toEqual(p);
    expect(r).not.toBe(p);
  });

  it("ย้าย Kitchen ไปจุดที่ snap แล้วเท่าเดิม → คืนผังเดิม", () => {
    const layout = cafeLayout();
    const kitchen = layout.objects.find((o) => o.type === "kitchen")!;
    expect(moveObject(layout, kitchen.id, { x: kitchen.x + 0.1, y: kitchen.y - 0.1 })).toBe(layout);
  });

  it.each([0, 90, 180, 270] as const)("เก้าอี้สอดใต้โต๊ะทั้งตัว (%s°) → เหลือเฉพาะแถบด้านหลัง", (rotation) => {
    const table: Table = { id: "t", type: "table", x: 2, y: 2, width: 1.2, depth: 1.2, rotation: 0, chairIds: ["c"] };
    const chair: Chair = { id: "c", type: "chair", tableId: "t", x: 2.35, y: 2.35, width: 0.5, depth: 0.5, rotation };
    expect(chairAccessStrips(chair, table)).toHaveLength(1);
  });

  it("issueCode ของ id ที่ไม่มีรูปแบบมาตรฐาน → สตริงว่าง", () => {
    expect(issueCode({ id: "legacy" })).toBe("");
  });

  it("revision ไม่พังเมื่อมี id ซ้ำ (ข้อมูลเสีย)", () => {
    const layout = cafeLayout();
    const dup = withObjects(layout, { ...layout.objects[0]! });
    expect(computeLayoutRevision(dup)).toMatch(/^rev-/);
    expect(computeLayoutRevision(dup)).not.toBe(computeLayoutRevision(layout));
  });

  it("หมวดเดียวกัน: Blocked มาก่อน Warning เสมอ", () => {
    const ids = createSequentialIds();
    const set = createTableSet("table-2-seats", { x: 3, y: 3 }, ids);
    const layout: StoreLayout = {
      id: "l",
      version: 1,
      units: "m",
      width: 8,
      depth: 6,
      entrance: null,
      objects: [
        { id: "t-empty", type: "table", x: 6, y: 5, width: 0.8, depth: 0.8, rotation: 0, chairIds: [] },
        set.table,
        ...set.chairs,
        { ...set.chairs[0]!, id: "orphan", tableId: "gone", x: 1, y: 5 },
        block("k", 0.5, 0.5, 2, 1.5),
      ],
    };
    const completeness = collectIssues(layout).filter((i) => i.category === "completeness");
    const severities = completeness.map((i) => i.severity);
    expect(severities.indexOf("warning")).toBeGreaterThan(severities.lastIndexOf("blocked"));
  });
});
