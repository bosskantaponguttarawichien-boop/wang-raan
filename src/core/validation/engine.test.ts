import { describe, expect, it } from "vitest";
import {
  addTableSet,
  createCounter,
  createEmptyLayout,
  createEntrance,
  createKitchen,
  createSequentialIds,
  deleteObject,
  moveObject,
  rotateObject,
  type StoreLayout,
  type Table,
} from "@/core/layout";
import { cafeLayout, withObjects, withoutType } from "@/test/fixtures/layouts";
import {
  canStartSimulation,
  collectIssues,
  computeLayoutRevision,
  isValidationFresh,
  summarizeStatus,
  validateLayout,
} from "./index";

const fixedNow = () => new Date("2026-10-10T01:00:00.000Z");

describe("summarizeStatus (PRD §6)", () => {
  it.each([
    [[], "ready"],
    [[{ severity: "warning" }], "warning"],
    [[{ severity: "warning" }, { severity: "blocked" }], "blocked"],
    [[{ severity: "blocked" }], "blocked"],
  ] as const)("%j → %s", (issues, status) => {
    expect(summarizeStatus(issues)).toBe(status);
  });
});

describe("validateLayout", () => {
  it("ผังคาเฟ่ครบถ้วน → Ready พร้อม revision และเวลาตรวจ", () => {
    const layout = cafeLayout();
    expect(validateLayout(layout, { now: fixedNow })).toEqual({
      layoutRevision: computeLayoutRevision(layout),
      status: "ready",
      issues: [],
      validatedAt: "2026-10-10T01:00:00.000Z",
    });
  });

  it("มีเฉพาะคำเตือน → Warning (ยังเริ่มจำลองได้)", () => {
    const ids = createSequentialIds();
    const base = cafeLayout(ids);
    const emptyTable: Table = { id: "table-empty", type: "table", x: 6, y: 5, width: 0.8, depth: 0.8, rotation: 0, chairIds: [] };
    const layout = withObjects(base, emptyTable);
    const result = validateLayout(layout);
    expect(result.status).toBe("warning");
    expect(result.issues.map((i) => i.id)).toEqual(["completeness/table-without-chairs/table-empty"]);
    expect(canStartSimulation(result, layout)).toBe(true);
  });

  it("ขาด Kitchen → Blocked และเริ่มจำลองไม่ได้", () => {
    const layout = withoutType(cafeLayout(), "kitchen");
    const result = validateLayout(layout);
    expect(result.status).toBe("blocked");
    expect(canStartSimulation(result, layout)).toBe(false);
  });

  it("issues เรียงตามหมวด completeness → collision → clearance → accessibility และ Blocked ก่อน Warning", () => {
    const base = cafeLayout();
    const table = base.objects.find((o) => o.type === "table")!;
    const kitchen = base.objects.find((o) => o.type === "kitchen")!;
    const emptyTable: Table = { id: "table-empty", type: "table", x: 6, y: 5, width: 0.8, depth: 0.8, rotation: 0, chairIds: [] };
    // ย้ายโต๊ะไปทับครัว + ลบเคาน์เตอร์ + โต๊ะเปล่า
    const layout = withObjects(withoutType(moveObject(base, table.id, { x: kitchen.x, y: kitchen.y }), "counter"), emptyTable);
    const issues = collectIssues(layout);
    const order = ["completeness", "collision", "clearance", "accessibility"];
    const ranks = issues.map((i) => order.indexOf(i.category));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(issues[0]!.id).toBe("completeness/missing-counter");
    expect(issues.find((i) => i.severity === "warning")!.id).toBe("completeness/table-without-chairs/table-empty");
    expect(issues.some((i) => i.category === "collision")).toBe(true);
  });

  it("ใช้เวลาปัจจุบันเมื่อไม่ inject นาฬิกา", () => {
    const before = Date.now();
    const at = Date.parse(validateLayout(cafeLayout()).validatedAt);
    expect(at).toBeGreaterThanOrEqual(before);
  });
});

describe("Layout revision & ความสดใหม่ของผลตรวจ (C-07)", () => {
  const layout = cafeLayout();
  const table = layout.objects.find((o) => o.type === "table")!;

  it("revision คงที่ และไม่ขึ้นกับลำดับ objects", () => {
    expect(computeLayoutRevision(layout)).toBe(computeLayoutRevision(cafeLayout()));
    expect(computeLayoutRevision({ ...layout, objects: [...layout.objects].reverse() })).toBe(computeLayoutRevision(layout));
    expect(computeLayoutRevision(layout)).toMatch(/^rev-[0-9a-f]{16}$/);
  });

  it.each<[string, (l: StoreLayout) => StoreLayout]>([
    ["ย้ายโต๊ะ", (l) => moveObject(l, table.id, { x: 4, y: 3 })],
    ["หมุนโต๊ะ", (l) => rotateObject(l, table.id)],
    ["ลบโต๊ะ (cascade)", (l) => deleteObject(l, table.id)],
    ["ขนาดร้าน", (l) => ({ ...l, width: 9 })],
    ["ย้ายทางเข้า", (l) => ({ ...l, entrance: { ...l.entrance!, position: 2 } })],
    ["ไม่มีทางเข้า", (l) => ({ ...l, entrance: null })],
    ["hierarchy เก้าอี้", (l) => ({ ...l, objects: l.objects.map((o) => (o.type === "chair" ? { ...o, tableId: "x" } : o)) })],
  ])("%s → revision เปลี่ยน และผลตรวจเดิมหมดอายุ", (_, edit) => {
    const result = validateLayout(layout);
    const edited = edit(layout);
    expect(computeLayoutRevision(edited)).not.toBe(result.layoutRevision);
    expect(isValidationFresh(result, edited)).toBe(false);
    expect(canStartSimulation(result, edited)).toBe(false);
  });

  it("ผลตรวจของผังเดียวกันยังสดใหม่, ไม่มีผลตรวจ → เริ่มจำลองไม่ได้", () => {
    const result = validateLayout(layout);
    expect(isValidationFresh(result, { ...layout })).toBe(true);
    expect(canStartSimulation(result, layout)).toBe(true);
    expect(canStartSimulation(null, layout)).toBe(false);
  });
});

describe("ประสิทธิภาพ", () => {
  it("ร้านใหญ่สุด 30 × 30 ม. กับ 60 ชุดโต๊ะ ตรวจเสร็จภายใน 1 วินาที", () => {
    const ids = createSequentialIds();
    let layout = createEmptyLayout({ width: 30, depth: 30 }, ids);
    layout = {
      ...layout,
      entrance: createEntrance(layout, { wall: "south", position: 14 }, ids),
      objects: [createKitchen({ position: { x: 1, y: 1 } }, ids), createCounter({ position: { x: 26, y: 1 } }, ids)],
    };
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 10; col++) {
        layout = addTableSet(layout, "table-4-seats", { x: 1.5 + col * 2.75, y: 5 + row * 3.75 }, ids).layout;
      }
    }
    const start = performance.now();
    const result = validateLayout(layout);
    const elapsed = performance.now() - start;
    expect(result.status).toBe("ready");
    expect(elapsed).toBeLessThan(1000);
  });
});
