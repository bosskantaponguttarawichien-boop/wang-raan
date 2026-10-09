import { describe, expect, it } from "vitest";
import type { Chair, Table } from "@/core/layout";
import { cafeLayout, patchObject, withObjects, withoutType } from "@/test/fixtures/layouts";
import { checkCompleteness, getUsableChairIds, issueCode } from "./index";

const codes = (issues: ReturnType<typeof checkCompleteness>) => issues.map(issueCode);

describe("Completeness Gate (PRD §5.3)", () => {
  it("ผังครบทุกองค์ประกอบ → ไม่มี issue", () => {
    expect(checkCompleteness(cafeLayout())).toEqual([]);
  });

  it("ไม่มี Entrance → Blocked", () => {
    const issues = checkCompleteness({ ...cafeLayout(), entrance: null });
    expect(issues).toEqual([
      {
        id: "completeness/missing-entrance",
        category: "completeness",
        severity: "blocked",
        objectIds: [],
        message: "ยังไม่มีทางเข้าร้าน",
      },
    ]);
  });

  it.each([
    ["kitchen", "missing-kitchen"],
    ["counter", "missing-counter"],
  ] as const)("ไม่มี %s → Blocked", (type, code) => {
    const issues = checkCompleteness(withoutType(cafeLayout(), type));
    expect(codes(issues)).toEqual([code]);
    expect(issues[0]!.severity).toBe("blocked");
  });

  it("ไม่มี Table → Blocked (และเก้าอี้ที่เหลือกลายเป็น orphan)", () => {
    const issues = checkCompleteness(withoutType(cafeLayout(), "table"));
    expect(codes(issues)).toContain("missing-table");
    expect(codes(issues)).toContain("missing-chair");
    expect(codes(issues).filter((c) => c === "orphan-chair")).toHaveLength(6);
    expect(issues.every((i) => i.severity === "blocked")).toBe(true);
  });

  it("ไม่มี Chair เลย → Blocked missing-chair (+ คำเตือนโต๊ะเปล่า)", () => {
    const noChairs = withoutType(cafeLayout(), "chair");
    const empty = {
      ...noChairs,
      objects: noChairs.objects.map((o) => (o.type === "table" ? { ...o, chairIds: [] } : o)),
    };
    const issues = checkCompleteness(empty);
    expect(codes(issues)).toEqual(["missing-chair", "table-without-chairs", "table-without-chairs"]);
    expect(issues.map((i) => i.severity)).toEqual(["blocked", "warning", "warning"]);
  });

  it("ผังเปล่า → Blocked ครบทั้ง 5 รายการ", () => {
    const layout = { ...cafeLayout(), entrance: null, objects: [] };
    expect(codes(checkCompleteness(layout))).toEqual([
      "missing-entrance",
      "missing-kitchen",
      "missing-counter",
      "missing-table",
      "missing-chair",
    ]);
  });
});

describe("เก้าอี้ที่ใช้งานได้ (PRD §4.3)", () => {
  const layout = cafeLayout();
  const chair = layout.objects.find((o): o is Chair => o.type === "chair")!;
  const table = layout.objects.find((o): o is Table => o.type === "table")!;

  it("เก้าอี้จาก preset ใช้งานได้ทั้งหมด", () => {
    expect(getUsableChairIds(layout).size).toBe(6);
  });

  it("เก้าอี้อ้างโต๊ะที่ไม่มีอยู่ → orphan-chair Blocked", () => {
    const issues = checkCompleteness(withObjects(layout, { ...chair, id: "chair-x", tableId: "table-gone" }));
    expect(issues).toContainEqual(
      expect.objectContaining({ id: "completeness/orphan-chair/chair-x", severity: "blocked" }),
    );
  });

  it("เก้าอี้อ้างโต๊ะแต่โต๊ะไม่ได้ระบุไว้ → chair-not-listed Blocked", () => {
    const issues = checkCompleteness(withObjects(layout, { ...chair, id: "chair-x" }));
    expect(issues).toContainEqual(
      expect.objectContaining({ id: `completeness/chair-not-listed/chair-x+${table.id}`, severity: "blocked" }),
    );
  });

  it("เก้าอี้ถูกอ้างโดยหลายโต๊ะ → Blocked", () => {
    const issues = checkCompleteness(withObjects(layout, { ...table, id: "table-x", chairIds: [chair.id] }));
    expect(codes(issues)).toContain("chair-in-multiple-tables");
  });

  it("โต๊ะอ้างเก้าอี้ที่ไม่มีอยู่ → dangling-chair-ref Blocked", () => {
    const issues = checkCompleteness(patchObject(layout, table.id, { chairIds: [...table.chairIds, "chair-ghost"] }));
    expect(issues).toEqual([
      expect.objectContaining({ id: `completeness/dangling-chair-ref/${table.id}`, severity: "blocked" }),
    ]);
  });

  it("ทุกเก้าอี้เป็น orphan → นับว่าไม่มีเก้าอี้ที่ใช้งานได้", () => {
    const orphaned = {
      ...layout,
      objects: layout.objects.map((o) => (o.type === "chair" ? { ...o, tableId: "nope" } : o)),
    };
    expect(getUsableChairIds(orphaned).size).toBe(0);
    expect(codes(checkCompleteness(orphaned))).toContain("missing-chair");
  });
});
