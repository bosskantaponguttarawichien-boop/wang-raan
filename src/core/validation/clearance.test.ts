import { describe, expect, it } from "vitest";
import { createTableSet, createSequentialIds, type Chair, type StoreLayout } from "@/core/layout";
import { TARGETS, block, cafeLayout, corridor } from "@/test/fixtures/layouts";
import { analyzeRoutes, chairAccessStrips, checkClearance, hasChairAccess, issueCode } from "./index";

const codes = (layout: StoreLayout) => checkClearance(layout).map(issueCode);

describe("ทางเดินหลัก ≥ 1.20 ม. (Entrance → Counter)", () => {
  it.each([
    [2, []],
    [1.25, []],
    [1.2, []],
    [1.15, ["main-aisle"]],
    [0.9, ["main-aisle"]],
    [0.6, ["main-aisle"]],
    [0.55, []], // เดินไม่ถึงเลย → เป็นหน้าที่ของ Accessibility
  ])("ช่องกว้าง %s ม. → %j", (gap, expected) => {
    expect(codes(corridor(gap, TARGETS.counter))).toEqual(expected);
  });

  it("ข้อความระบุความกว้างที่ต้องการ และชี้วัตถุปลายทาง", () => {
    expect(checkClearance(corridor(1.15, TARGETS.counter))).toEqual([
      {
        id: "clearance/main-aisle/target",
        category: "clearance",
        severity: "blocked",
        objectIds: ["target"],
        message: "ทางเดินหลักจากทางเข้าไปเคาน์เตอร์แคบกว่า 1.20 ม.",
      },
    ]);
  });

  it("ประตูกว้าง 0.90 ม. ไม่ทำให้ทางเดินหลักด้านในล้มเหลว", () => {
    expect(codes(corridor(2, TARGETS.counter, 0.9))).toEqual([]);
  });

  it("ช่องว่างลากเส้นผ่านได้แต่แคบ (ตัวอย่าง PRD §5.5) ถูกจับได้", () => {
    // ช่อง 0.70 ม. คนเดินได้ (≥ 0.60) แต่ไม่ถึงทางเดินรอง 0.90 / ทางเดินหลัก 1.20
    expect(codes(corridor(0.7, TARGETS.counter))).toEqual(["main-aisle"]);
    expect(codes(corridor(0.7, TARGETS.table))).toEqual(["secondary-aisle"]);
  });
});

describe("ทางเดินรอง ≥ 0.90 ม. (Entrance → Table / Kitchen)", () => {
  it.each(["table", "kitchen"] as const)("%s", (type) => {
    expect(codes(corridor(0.95, TARGETS[type]))).toEqual([]);
    expect(codes(corridor(0.9, TARGETS[type]))).toEqual([]);
    expect(codes(corridor(0.85, TARGETS[type]))).toEqual(["secondary-aisle"]);
    expect(codes(corridor(0.5, TARGETS[type]))).toEqual([]);
  });

  it("เก้าอี้ต้องการเพียง 0.60 ม. — ไม่มีคำเตือนทางเดินรอง", () => {
    expect(codes(corridor(0.6, TARGETS.chair))).toEqual([]);
  });
});

describe("พื้นที่เข้าถึงเก้าอี้ ≥ 0.60 ม. (ด้านหลังหรือด้านข้าง)", () => {
  // โต๊ะ 2 ที่นั่ง 0.8 ม. ที่ (3,3): เก้าอี้เหนือ x 3.15–3.65, y 2.6–3.1 หันใต้
  const ids = createSequentialIds();
  const set = createTableSet("table-2-seats", { x: 3, y: 3 }, ids);
  const north = set.chairs.find((c) => c.rotation === 180)!;

  function boxed(back: number, left: number, right: number): StoreLayout {
    return {
      id: "l",
      version: 1,
      units: "m",
      width: 8,
      depth: 6,
      entrance: null,
      objects: [
        set.table,
        ...set.chairs,
        block("back", 2.5, 1, 2, 2.6 - back - 1),
        block("left", 3.15 - left - 1, 2.6, 1, 0.4),
        block("right", 3.65 + right, 2.6, 1, 0.4),
      ],
    };
  }

  it("แถบเข้าถึง: ด้านหลังลึก 0.60 ม. และด้านข้างเฉพาะส่วนที่ไม่ได้สอดใต้โต๊ะ", () => {
    const [back, left, right] = chairAccessStrips(north, set.table);
    expect(back).toEqual({ x: 3.15, y: 2, width: 0.5, depth: 0.6 });
    expect(left!.x).toBeCloseTo(2.55, 9);
    expect(left!.depth).toBeCloseTo(0.4, 9); // 2.6–3.0 (0.10 ม. ที่สอดใต้โต๊ะไม่นับ)
    expect(right!.x).toBeCloseTo(3.65, 9);
  });

  it.each([
    [0.6, 0.6, 0.6, true],
    [0.55, 0.55, 0.6, true],
    [0.6, 0.55, 0.55, true],
    [0.55, 0.55, 0.55, false],
  ])("ระยะ หลัง %s / ซ้าย %s / ขวา %s → เข้าถึงได้ %s", (back, left, right, ok) => {
    const layout = boxed(back, left, right);
    expect(hasChairAccess(layout, north)).toBe(ok);
    expect(checkClearance(layout).some((i) => i.id === `clearance/chair-access/${north.id}`)).toBe(!ok);
  });

  it("แถบที่ยื่นออกนอกร้านใช้ไม่ได้", () => {
    const chair: Chair = { ...north, id: "c", tableId: "none", x: 0, y: 0, rotation: 180 };
    const layout: StoreLayout = {
      id: "l",
      version: 1,
      units: "m",
      width: 0.5,
      depth: 2,
      entrance: null,
      objects: [chair],
    };
    // หันใต้ → ด้านหลังอยู่เหนือ (นอกร้าน), ด้านข้างนอกร้านทั้งสอง
    expect(hasChairAccess(layout, chair)).toBe(false);
  });

  it.each([0, 90, 180, 270] as const)("แถบเข้าถึงหมุนตามทิศเก้าอี้ %s°", (rotation) => {
    const chair: Chair = { ...north, id: "c", tableId: "none", x: 2, y: 2, rotation };
    const strips = chairAccessStrips(chair);
    expect(strips).toHaveLength(3);
    for (const s of strips) expect(Math.max(s.width, s.depth)).toBeCloseTo(0.6, 9);
  });

  it("ผังคาเฟ่ปกติไม่มีปัญหา clearance", () => {
    expect(checkClearance(cafeLayout())).toEqual([]);
  });

  it("ไม่มีทางเข้า: ตรวจเฉพาะพื้นที่เก้าอี้ ไม่วิเคราะห์เส้นทาง", () => {
    const layout = { ...cafeLayout(), entrance: null };
    expect(analyzeRoutes(layout)).toBeNull();
    expect(checkClearance(layout)).toEqual([]);
  });
});
