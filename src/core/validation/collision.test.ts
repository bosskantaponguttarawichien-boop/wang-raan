import { describe, expect, it } from "vitest";
import {
  addTableSet,
  createSequentialIds,
  moveObject,
  rotateObject,
  type Chair,
  type LayoutObject,
  type Rotation,
  type StoreLayout,
  type Table,
} from "@/core/layout";
import { block, cafeLayout, patchObject, withObjects } from "@/test/fixtures/layouts";
import { checkCollisions, isInsideRoom, issueCode } from "./index";

const ROTATIONS: Rotation[] = [0, 90, 180, 270];
const codes = (layout: StoreLayout) => checkCollisions(layout).map(issueCode);

function room(...objects: LayoutObject[]): StoreLayout {
  return { id: "l", version: 1, units: "m", width: 8, depth: 6, entrance: null, objects };
}

describe("Collision (PRD §5.4)", () => {
  it("ผังคาเฟ่ปกติ (รวมเก้าอี้สอดโต๊ะ 0.10 ม.) → ไม่มี issue", () => {
    expect(checkCollisions(cafeLayout())).toEqual([]);
  });

  it("แตะขอบกันพอดีไม่นับว่าชน", () => {
    expect(checkCollisions(room(block("a", 1, 1, 1, 1), block("b", 2, 1, 1, 1), block("c", 1, 2, 1, 1)))).toEqual([]);
  });

  it.each([
    ["kitchen", "counter", "ครัวทับเคาน์เตอร์"],
    ["kitchen", "kitchen", "ครัวทับครัวตัวอื่น"],
    ["counter", "counter", "เคาน์เตอร์ทับเคาน์เตอร์ตัวอื่น"],
  ] as const)("%s ทับ %s → Blocked", (a, b, message) => {
    const issues = checkCollisions(room(block("a", 1, 1, 2, 1, a), block("b", 2.5, 1.5, 2, 1, b)));
    expect(issues).toEqual([
      { id: "collision/overlap/a+b", category: "collision", severity: "blocked", objectIds: ["a", "b"], message },
    ]);
  });

  describe("ตรวจได้แม่นยำทุกมุมหมุน", () => {
    // เคาน์เตอร์ 2.4 × 0.7 ที่ (1, 1): rotation 0/180 กินแนวนอน, 90/270 กินแนวตั้ง
    const probe = block("probe", 1.2, 2.5, 0.5, 0.5);
    it.each(ROTATIONS)("Counter rotation %s°", (rotation) => {
      const counter: LayoutObject = { ...block("counter", 1, 1, 2.4, 0.7, "counter"), rotation };
      const hits = codes(room(counter, probe));
      expect(hits).toEqual(rotation % 180 === 90 ? ["overlap"] : []);
    });

    it.each(ROTATIONS)("Table set หมุน %s° แล้วเก้าอี้ยังสอดถูกต้อง ไม่มีการชน", (rotation) => {
      const ids = createSequentialIds();
      const added = addTableSet(room(), "table-4-seats", { x: 3, y: 3 }, ids);
      const layout = rotateObject(added.layout, added.tableSet.table.id, rotation);
      expect(checkCollisions(layout)).toEqual([]);
    });

    it.each(ROTATIONS)("Table set หมุน %s° ชิดผนังตะวันออก → ตรวจพบเก้าอี้ตกขอบ", (rotation) => {
      const ids = createSequentialIds();
      const added = addTableSet(room(), "table-2-seats", { x: 7, y: 3 }, ids);
      const layout = rotateObject(added.layout, added.tableSet.table.id, rotation);
      // หมุน 0/180: เก้าอี้อยู่เหนือ/ใต้ (ไม่ตกขอบ); 90/270: เก้าอี้ฝั่งตะวันออกยื่นเลยผนัง x=8
      expect(codes(layout).filter((c) => c === "out-of-bounds")).toHaveLength(rotation % 180 === 90 ? 1 : 0);
    });

    it.each(ROTATIONS)("Table set สองชุดชิดกัน หมุน %s° → เก้าอี้ทับเก้าอี้", (rotation) => {
      const ids = createSequentialIds();
      let layout = room();
      const a = addTableSet(layout, "table-4-seats", { x: 1, y: 2 }, ids);
      const b = addTableSet(a.layout, "table-4-seats", { x: 2.5, y: 2 }, ids); // ห่างกัน 0.30 ม. ระหว่างโต๊ะ
      layout = rotateObject(rotateObject(b.layout, a.tableSet.table.id, rotation), b.tableSet.table.id, rotation);
      expect(checkCollisions(layout)).toContainEqual(expect.objectContaining({ message: "เก้าอี้ทับเก้าอี้ตัวอื่น" }));
    });
  });

  describe("Table set", () => {
    const base = cafeLayout();
    const table = base.objects.find((o): o is Table => o.type === "table")!;
    const chairs = base.objects.filter((o): o is Chair => o.type === "chair" && o.tableId === table.id);
    const north = chairs.find((c) => c.rotation === 180)!;

    it("เก้าอี้สอดใต้โต๊ะตัวเองเกิน 0.10 ม. → Blocked", () => {
      const issues = checkCollisions(patchObject(base, north.id, { y: north.y + 0.15 }));
      expect(issues).toEqual([
        expect.objectContaining({
          id: `collision/chair-tuck-too-deep/${[north.id, table.id].sort().join("+")}`,
          message: "เก้าอี้สอดใต้โต๊ะ 0.25 ม. เกินกำหนด 0.10 ม.",
        }),
      ]);
    });

    it("เก้าอี้สอด 0.10 ม. พอดี → ผ่าน, ไม่สอดเลย → ผ่าน", () => {
      expect(checkCollisions(base)).toEqual([]);
      expect(checkCollisions(patchObject(base, north.id, { y: north.y - 0.3 }))).toEqual([]);
    });

    it("เก้าอี้หันหลังให้โต๊ะแล้วซ้อน → Blocked (สอดได้เฉพาะด้านหน้า)", () => {
      const issues = checkCollisions(patchObject(base, north.id, { rotation: 0 }));
      expect(issues.map(issueCode)).toEqual(["chair-tuck-side"]);
    });

    it("เก้าอี้ทับโต๊ะตัวอื่น → Blocked แม้ซ้อนไม่ถึง 0.10 ม.", () => {
      const other = base.objects.find((o): o is Table => o.type === "table" && o.id !== table.id)!;
      const stray: Chair = { ...north, id: "chair-x", x: other.x + 0.1, y: other.y - 0.45 };
      const issues = checkCollisions(withObjects(patchObject(base, table.id, { chairIds: [...table.chairIds, "chair-x"] }), stray));
      expect(issues).toContainEqual(expect.objectContaining({ message: "เก้าอี้ทับโต๊ะตัวอื่น" }));
    });

    it("ย้ายชุดโต๊ะไปทับครัว → Blocked ทั้งโต๊ะและเก้าอี้ที่ทับ", () => {
      const kitchen = base.objects.find((o) => o.type === "kitchen")!;
      const issues = checkCollisions(moveObject(base, table.id, { x: kitchen.x, y: kitchen.y }));
      expect(issues.some((i) => i.message === "โต๊ะทับครัว" || i.message === "ครัวทับโต๊ะ")).toBe(true);
      expect(issues.some((i) => /เก้าอี้ทับครัว|ครัวทับเก้าอี้/.test(i.message))).toBe(true);
    });
  });

  it("วัตถุออกนอกขอบร้าน → Blocked (รวมกรณียื่นออกบางส่วน)", () => {
    const issues = checkCollisions(room(block("a", -0.25, 1, 1, 1), block("b", 7.5, 5.5, 1, 1), block("c", 9, 9, 1, 1)));
    expect(issues.map((i) => i.id)).toEqual([
      "collision/out-of-bounds/a",
      "collision/out-of-bounds/b",
      "collision/out-of-bounds/c",
    ]);
  });

  it("isInsideRoom ยอมรับวัตถุชิดผนังพอดี", () => {
    expect(isInsideRoom({ x: 0, y: 0, width: 8, depth: 6 }, { width: 8, depth: 6 })).toBe(true);
    expect(isInsideRoom({ x: 0, y: 0, width: 8.01, depth: 6 }, { width: 8, depth: 6 })).toBe(false);
  });
});
