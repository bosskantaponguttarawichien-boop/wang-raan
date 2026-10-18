import { describe, expect, it } from "vitest";
import {
  createEmptyLayout,
  addTableSet,
  createCounter,
  createEntrance,
  type ValidationIssue,
} from "@/core/layout";
import {
  formatIssueHuman,
  getObjectName,
  getTableNumbers,
  type FormattedIssue,
} from "./formatter";

describe("Issue Humanizer & Formatter (feat-054)", () => {
  it("getTableNumbers ให้หมายเลข 1, 2... ตามลำดับโต๊ะในร้าน", () => {
    let layout = createEmptyLayout({ width: 8, depth: 6 });
    const r1 = addTableSet(layout, "table-2-seats", { x: 2, y: 2 });
    layout = r1.layout;
    const r2 = addTableSet(layout, "table-4-seats", { x: 5, y: 2 });
    layout = r2.layout;

    const tNums = getTableNumbers(layout);
    expect(tNums.get(r1.tableSet.table.id)).toBe(1);
    expect(tNums.get(r2.tableSet.table.id)).toBe(2);
  });

  it("getObjectName แปลงวัตถุเป็นชื่อภาษาคน", () => {
    let layout = createEmptyLayout({ width: 8, depth: 6 });
    const r1 = addTableSet(layout, "table-2-seats", { x: 2, y: 2 });
    layout = r1.layout;
    const counter = createCounter({ position: { x: 3, y: 1 } });
    layout = { ...layout, objects: [...layout.objects, counter] };
    layout = { ...layout, entrance: createEntrance(layout, { wall: "south", position: 3.5 }) };
    layout = { ...layout, kitchenDoor: { id: "kitchen-door-01", wall: "north", position: 1, width: 0.9 } };

    expect(getObjectName(r1.tableSet.table, layout)).toBe("โต๊ะ 1");
    expect(getObjectName(r1.tableSet.chairs[0], layout)).toBe("เก้าอี้โต๊ะ 1");
    expect(getObjectName(layout.kitchenDoor!.id, layout)).toBe("ประตูครัว");
    expect(getObjectName(counter, layout)).toBe("เคาน์เตอร์");
    expect(getObjectName(layout.entrance!.id, layout)).toBe("ทางเข้าร้าน");
  });

  it("formatIssueHuman ครอบคลุม completeness issues", () => {
    const missingEntrance: ValidationIssue = {
      id: "completeness/missing-entrance",
      category: "completeness",
      severity: "blocked",
      objectIds: [],
      message: "ยังไม่มีทางเข้าร้าน",
    };
    const res = formatIssueHuman(missingEntrance);
    expect(res.title).toBe("ยังไม่มีทางเข้าร้าน");
    expect(res.hint).toContain("กำหนดผนังและตำแหน่งทางเข้า");

    const missingTable: ValidationIssue = {
      id: "completeness/missing-table",
      category: "completeness",
      severity: "blocked",
      objectIds: [],
      message: "ยังไม่มีชุดโต๊ะ",
    };
    expect(formatIssueHuman(missingTable).title).toBe("ยังไม่มีโต๊ะในร้าน");
  });

  it("formatIssueHuman ครอบคลุม collision issues พร้อมระบุชื่อคู่กรณี", () => {
    let layout = createEmptyLayout({ width: 8, depth: 6 });
    const r1 = addTableSet(layout, "table-2-seats", { x: 2, y: 2 });
    layout = r1.layout;
    const r2 = addTableSet(layout, "table-4-seats", { x: 2.25, y: 2.25 });
    layout = r2.layout;

    const overlapIssue: ValidationIssue = {
      id: `collision/overlap/${r1.tableSet.table.id}+${r2.tableSet.table.id}`,
      category: "collision",
      severity: "blocked",
      objectIds: [r1.tableSet.table.id, r2.tableSet.table.id],
      message: "โต๊ะชนกับโต๊ะตัวอื่น",
    };

    const res = formatIssueHuman(overlapIssue, layout);
    expect(res.title).toContain("โต๊ะ 1");
    expect(res.title).toContain("โต๊ะ 2");
    expect(res.hint).toContain("ลากแยกออกจากกัน");
  });

  it("formatIssueHuman คำนวณระยะ ซม. ใน clearance issues", () => {
    const mainAisleIssue: ValidationIssue & Partial<FormattedIssue> = {
      id: "clearance/main-aisle/counter-1",
      category: "clearance",
      severity: "blocked",
      objectIds: ["counter-1"],
      message: "ทางเดินหลักแคบกว่า 1.20 ม.",
      required: 1.2,
      measured: 0.6,
      delta: 0.6,
    };

    const res = formatIssueHuman(mainAisleIssue);
    expect(res.title).toBe("ทางเดินหลักแคบไป 60 ซม.");
    expect(res.hint).toContain("1.20 ม.");
  });

  it("formatIssueHuman ใช้ title และ hint ในตัว issue ถ้ามีอยู่แล้ว", () => {
    const customIssue: ValidationIssue & Partial<FormattedIssue> = {
      id: "clearance/custom",
      category: "clearance",
      severity: "warning",
      objectIds: [],
      message: "ข้อความเดิม",
      title: "ทางเดินค่อนข้างแคบ",
      hint: "แนะนำ 90 ซม. ขึ้นไป",
    };

    const res = formatIssueHuman(customIssue);
    expect(res.title).toBe("ทางเดินค่อนข้างแคบ");
    expect(res.hint).toBe("แนะนำ 90 ซม. ขึ้นไป");
  });
});
