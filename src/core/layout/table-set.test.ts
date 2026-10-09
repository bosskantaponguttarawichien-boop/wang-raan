import { describe, expect, it } from "vitest";
import {
  CLEARANCE,
  addTableSet,
  chairTuck,
  checkTableSetIntegrity,
  createCounter,
  createEmptyLayout,
  createKitchen,
  createSequentialIds,
  createTableSet,
  deleteObject,
  findObject,
  footprint,
  getChairsOfTable,
  moveObject,
  objectCenter,
  rectsIntersect,
  rotateObject,
  type Chair,
  type IdFactory,
  type StoreLayout,
  type Table,
  type TableSetPreset,
} from "./index";

function setup(preset: TableSetPreset = "table-4-seats", position = { x: 3, y: 3 }) {
  const ids: IdFactory = createSequentialIds();
  const base = createEmptyLayout({ width: 8, depth: 6 }, ids);
  const kitchen = createKitchen({ position: { x: 0.5, y: 0.5 } }, ids);
  const withKitchen: StoreLayout = { ...base, objects: [kitchen] };
  const { layout, tableSet } = addTableSet(withKitchen, preset, position, ids);
  return { layout, table: tableSet.table, chairs: tableSet.chairs, kitchen, ids };
}

function tableOf(layout: StoreLayout, id: string): Table {
  const t = findObject(layout, id);
  if (t?.type !== "table") throw new Error(`ไม่พบโต๊ะ ${id}`);
  return t;
}

/** ตำแหน่งศูนย์กลางเก้าอี้เทียบกับศูนย์กลางโต๊ะ */
function relativeCenters(layout: StoreLayout, tableId: string) {
  const table = tableOf(layout, tableId);
  const c = objectCenter(table);
  return getChairsOfTable(layout, table).map((chair) => {
    const p = objectCenter(chair);
    return { id: chair.id, dx: +(p.x - c.x).toFixed(6), dy: +(p.y - c.y).toFixed(6), rotation: chair.rotation };
  });
}

function expectTucksWithinLimit(layout: StoreLayout, tableId: string) {
  const table = tableOf(layout, tableId);
  for (const chair of getChairsOfTable(layout, table)) {
    const tuck = chairTuck(chair, table);
    expect(tuck.fromFront).toBe(true);
    expect(tuck.depth).toBeLessThanOrEqual(CLEARANCE.chairTuckMax);
    expect(tuck.depth).toBeCloseTo(CLEARANCE.chairTuckMax, 9);
  }
}

describe("Creation — Table set presets", () => {
  it.each([
    ["table-2-seats", 0.8, [180, 0]],
    ["table-4-seats", 1.2, [180, 270, 0, 90]],
  ] as const)("%s: โต๊ะ %s ม. พร้อมเก้าอี้ลูกหันหน้าเข้าโต๊ะ", (preset, size, facings) => {
    const { table, chairs } = createTableSet(preset, { x: 3, y: 3 }, createSequentialIds());
    expect(table).toMatchObject({ type: "table", preset, x: 3, y: 3, width: size, depth: size, rotation: 0 });
    expect(chairs.map((c) => c.rotation)).toEqual(facings);
    expect(table.chairIds).toEqual(chairs.map((c) => c.id));
    for (const chair of chairs) expect(chair.tableId).toBe(table.id);
  });

  it.each(["table-2-seats", "table-4-seats"] as const)("%s: เก้าอี้สอดใต้โต๊ะ 0.10 ม. จากด้านหน้าพอดี", (preset) => {
    const { layout, table } = setup(preset);
    expectTucksWithinLimit(layout, table.id);
  });

  it("เก้าอี้ในชุดเดียวกันไม่ทับกันเอง", () => {
    const { chairs } = createTableSet("table-4-seats", { x: 3, y: 3 }, createSequentialIds());
    for (const a of chairs)
      for (const b of chairs) if (a !== b) expect(rectsIntersect(footprint(a), footprint(b))).toBe(false);
  });

  it("ตำแหน่งโต๊ะ snap เข้ากริด 0.25 ม.", () => {
    const { table } = createTableSet("table-2-seats", { x: 3.11, y: 2.9 }, createSequentialIds());
    expect([table.x, table.y]).toEqual([3, 3]);
  });

  it("addTableSet ไม่แก้ผังเดิม (immutable)", () => {
    const ids = createSequentialIds();
    const before = createEmptyLayout({ width: 8, depth: 6 }, ids);
    const { layout } = addTableSet(before, "table-2-seats", { x: 1, y: 1 }, ids);
    expect(before.objects).toHaveLength(0);
    expect(layout.objects).toHaveLength(3);
    expect(checkTableSetIntegrity(layout)).toEqual([]);
  });
});

describe("Group Move", () => {
  it("ย้ายโต๊ะ → เก้าอี้ลูกทุกตัวย้ายตามด้วย delta เดียวกัน", () => {
    const { layout, table, chairs, kitchen } = setup();
    const moved = moveObject(layout, table.id, { x: 5.1, y: 1.4 });
    const t = tableOf(moved, table.id);
    expect([t.x, t.y]).toEqual([5, 1.5]);
    for (const chair of chairs) {
      const after = findObject(moved, chair.id) as Chair;
      expect(after.x).toBeCloseTo(chair.x + 2, 9);
      expect(after.y).toBeCloseTo(chair.y - 1.5, 9);
      expect(after.rotation).toBe(chair.rotation);
    }
    expect(relativeCenters(moved, table.id)).toEqual(relativeCenters(layout, table.id));
    expect(findObject(moved, kitchen.id)).toBe(kitchen); // วัตถุอื่นไม่ถูกแตะ
    expectTucksWithinLimit(moved, table.id);
  });

  it("ลากเก้าอี้ → ย้ายทั้งชุดโต๊ะ (เก้าอี้ไม่เป็นวัตถุอิสระ)", () => {
    const { layout, table, chairs } = setup();
    const chair = chairs[0]!;
    const moved = moveObject(layout, chair.id, { x: chair.x + 1, y: chair.y + 0.5 });
    const t = tableOf(moved, table.id);
    expect([t.x, t.y]).toEqual([4, 3.5]);
    expect(relativeCenters(moved, table.id)).toEqual(relativeCenters(layout, table.id));
  });

  it("delta ที่ snap แล้วเป็นศูนย์ คืนผังเดิม", () => {
    const { layout, table } = setup();
    expect(moveObject(layout, table.id, { x: 3.05, y: 2.95 })).toBe(layout);
    expect(moveObject(layout, "missing", { x: 1, y: 1 })).toBe(layout);
  });

  it("Non-blocking: ย้ายไปชนครัวหรือออกนอกร้านได้ (ให้ Validation รายงาน)", () => {
    const { layout, table, kitchen } = setup();
    const onKitchen = moveObject(layout, table.id, { x: kitchen.x, y: kitchen.y });
    expect(tableOf(onKitchen, table.id)).toMatchObject({ x: 0.5, y: 0.5 });
    const outside = moveObject(layout, table.id, { x: 7.5, y: -1 });
    expect(tableOf(outside, table.id)).toMatchObject({ x: 7.5, y: -1 });
  });

  it("ย้าย Kitchen / Counter เดี่ยว ๆ พร้อม snap", () => {
    const ids = createSequentialIds();
    const counter = createCounter({ position: { x: 5, y: 0.5 } }, ids);
    const layout = { ...createEmptyLayout({ width: 8, depth: 6 }, ids), objects: [counter] };
    const moved = moveObject(layout, counter.id, { x: 4.6, y: 4.1 });
    expect(findObject(moved, counter.id)).toMatchObject({ x: 4.5, y: 4 });
  });
});

describe("Group Rotate", () => {
  it("หมุนโต๊ะ 90° → เก้าอี้ลูกหมุนรอบจุดศูนย์กลางโต๊ะและหมุนทิศตาม", () => {
    const { layout, table } = setup("table-2-seats");
    const before = relativeCenters(layout, table.id);
    const rotated = rotateObject(layout, table.id, 90);
    const t = tableOf(rotated, table.id);
    expect(t.rotation).toBe(90);
    expect(objectCenter(t)).toEqual(objectCenter(table));

    const after = relativeCenters(rotated, table.id);
    for (const [i, b] of before.entries()) {
      const a = after[i]!;
      // (dx, dy) หมุนตามเข็มนาฬิกา → (−dy, dx)
      expect(a.dx).toBeCloseTo(-b.dy, 9);
      expect(a.dy).toBeCloseTo(b.dx, 9);
      expect(a.rotation).toBe((b.rotation + 90) % 360);
    }
    expectTucksWithinLimit(rotated, table.id);
  });

  it("เก้าอี้ฝั่งเหนือ (หันใต้) ย้ายไปฝั่งตะวันออก (หันตะวันตก) หลังหมุน 90°", () => {
    const { layout, table, chairs } = setup("table-2-seats");
    const north = chairs.find((c) => c.rotation === 180)!;
    const rotated = rotateObject(layout, table.id, 90);
    const chair = findObject(rotated, north.id) as Chair;
    expect(chair.rotation).toBe(270);
    expect(objectCenter(chair).x).toBeGreaterThan(objectCenter(table).x);
  });

  it("หมุนครบ 4 ครั้ง (360°) กลับมาตำแหน่งเดิมทุกตัว", () => {
    const { layout, table } = setup();
    let current = layout;
    for (let i = 0; i < 4; i++) {
      current = rotateObject(current, table.id, 90);
      expectTucksWithinLimit(current, table.id);
    }
    expect(current.objects).toEqual(layout.objects);
  });

  it("หมุนทวนเข็ม (−90°) เท่ากับหมุน 270°", () => {
    const { layout, table } = setup();
    expect(rotateObject(layout, table.id, -90)).toEqual(rotateObject(layout, table.id, 270));
  });

  it("หมุนผ่านเก้าอี้ลูก = หมุนทั้งชุดโต๊ะ", () => {
    const { layout, table, chairs } = setup();
    expect(rotateObject(layout, chairs[1]!.id, 90)).toEqual(rotateObject(layout, table.id, 90));
  });

  it("โต๊ะไม่จัตุรัส: หมุนแล้วมุมซ้ายบนยัง snap กริด และระยะสัมพัทธ์ของเก้าอี้คงเดิม", () => {
    const { layout, table } = setup("table-2-seats", { x: 2, y: 2 });
    // ขยายโต๊ะเป็น 1.6 × 0.8 (จำลองการปรับขนาด) โดยเก้าอี้ยังสอด 0.10 ม.
    const wide: StoreLayout = {
      ...layout,
      objects: layout.objects.map((o) => (o.id === table.id ? { ...o, width: 1.6 } : o)).map((o) =>
        o.type === "chair" ? { ...o, x: o.x + 0.4 } : o,
      ),
    };
    expectTucksWithinLimit(wide, table.id);
    const rotated = rotateObject(wide, table.id, 90);
    const t = tableOf(rotated, table.id);
    expect(Number.isInteger(t.x * 4) && Number.isInteger(t.y * 4)).toBe(true);
    expectTucksWithinLimit(rotated, table.id);
    const back = rotateObject(rotated, table.id, 270);
    expect(relativeCenters(back, table.id)).toEqual(relativeCenters(wide, table.id));
  });

  it("หมุน Kitchen รอบจุดศูนย์กลางแล้ว snap มุมซ้ายบน", () => {
    const ids = createSequentialIds();
    const kitchen = createKitchen({ position: { x: 1, y: 1 } }, ids); // 2 × 1.5
    const layout = { ...createEmptyLayout({ width: 8, depth: 6 }, ids), objects: [kitchen] };
    const rotated = findObject(rotateObject(layout, kitchen.id), kitchen.id)!;
    expect(rotated.rotation).toBe(90);
    expect(footprint(rotated)).toMatchObject({ width: 1.5, depth: 2 });
    expect(Number.isInteger(rotated.x * 4) && Number.isInteger(rotated.y * 4)).toBe(true);
  });

  it("หมุน 0° หรือ id ที่ไม่มี คืนผังเดิม", () => {
    const { layout, table } = setup();
    expect(rotateObject(layout, table.id, 360)).toBe(layout);
    expect(rotateObject(layout, "missing")).toBe(layout);
  });
});

describe("Cascade Delete", () => {
  it("ลบโต๊ะ → เก้าอี้ลูกถูกลบทั้งหมด ไม่เหลือ Orphan Chair", () => {
    const { layout, table, kitchen } = setup();
    const after = deleteObject(layout, table.id);
    expect(after.objects).toEqual([kitchen]);
    expect(checkTableSetIntegrity(after)).toEqual([]);
  });

  it("ลบโต๊ะหนึ่งชุด ไม่กระทบชุดอื่น", () => {
    const { layout, table, ids } = setup();
    const { layout: two, tableSet: other } = addTableSet(layout, "table-2-seats", { x: 6, y: 4 }, ids);
    const after = deleteObject(two, table.id);
    expect(after.objects.filter((o) => o.type === "chair")).toEqual(other.chairs);
    expect(findObject(after, other.table.id)).toEqual(other.table);
    expect(checkTableSetIntegrity(after)).toEqual([]);
  });

  it("ลบโต๊ะแล้วเก็บกวาดเก้าอี้ที่อ้าง tableId แม้ไม่อยู่ใน chairIds", () => {
    const { layout, table, chairs } = setup();
    const stray: Chair = { ...chairs[0]!, id: "chair-stray" };
    const withStray = { ...layout, objects: [...layout.objects, stray] };
    expect(deleteObject(withStray, table.id).objects.some((o) => o.type === "chair")).toBe(false);
  });

  it("ลบเก้าอี้ตัวเดียว → ถอดออกจาก chairIds ของโต๊ะแม่", () => {
    const { layout, table, chairs } = setup();
    const after = deleteObject(layout, chairs[0]!.id);
    expect(tableOf(after, table.id).chairIds).toEqual(chairs.slice(1).map((c) => c.id));
    expect(checkTableSetIntegrity(after)).toEqual([]);
  });

  it("ลบวัตถุที่ไม่มี คืนผังเดิม", () => {
    const { layout } = setup();
    expect(deleteObject(layout, "missing")).toBe(layout);
  });
});

describe("Hierarchy integrity", () => {
  it("ตรวจพบ orphan chair, missing chair, chair-not-listed และ table-without-chairs", () => {
    const { layout, table, chairs } = setup("table-2-seats");
    const broken: StoreLayout = {
      ...layout,
      objects: [
        ...layout.objects.filter((o) => o.id !== chairs[1]!.id),
        { ...chairs[0]!, id: "chair-orphan", tableId: "table-gone" },
        { ...chairs[0]!, id: "chair-unlisted" },
        { ...table, id: "table-empty", chairIds: [] },
      ],
    };
    expect(checkTableSetIntegrity(broken)).toEqual(
      expect.arrayContaining([
        { kind: "missing-chair", tableId: table.id, chairId: chairs[1]!.id },
        { kind: "orphan-chair", chairId: "chair-orphan", tableId: "table-gone" },
        { kind: "chair-not-listed", tableId: table.id, chairId: "chair-unlisted" },
        { kind: "table-without-chairs", tableId: "table-empty" },
      ]),
    );
  });

  it("ตรวจพบเก้าอี้ที่ถูกอ้างโดยหลายโต๊ะ", () => {
    const { layout, table, chairs } = setup("table-2-seats");
    const dup = { ...table, id: "table-dup", chairIds: [chairs[0]!.id] };
    expect(checkTableSetIntegrity({ ...layout, objects: [...layout.objects, dup] })).toContainEqual({
      kind: "chair-in-multiple-tables",
      chairId: chairs[0]!.id,
      tableIds: [table.id, "table-dup"],
    });
  });

  it("orphan chair ย้าย/หมุนไม่ได้ (ไม่มีโต๊ะแม่)", () => {
    const { layout, chairs } = setup("table-2-seats");
    const orphan: Chair = { ...chairs[0]!, id: "chair-orphan", tableId: "table-gone" };
    const withOrphan = { ...layout, objects: [...layout.objects, orphan] };
    expect(moveObject(withOrphan, orphan.id, { x: 0, y: 0 })).toBe(withOrphan);
    expect(rotateObject(withOrphan, orphan.id)).toBe(withOrphan);
  });
});

describe("chairTuck", () => {
  const table: Table = { id: "t", type: "table", x: 2, y: 2, width: 1.2, depth: 1.2, rotation: 0, chairIds: ["c"] };
  const chair = (patch: Partial<Chair>): Chair => ({
    id: "c",
    type: "chair",
    tableId: "t",
    x: 2.35,
    y: 1.5,
    width: 0.5,
    depth: 0.5,
    rotation: 180,
    ...patch,
  });

  it("ไม่ทับ → depth 0", () => {
    expect(chairTuck(chair({ y: 1.4 }), table)).toEqual({ depth: 0, fromFront: false });
  });

  it("สอดจากด้านหน้าเกิน 0.10 ม. วัดได้ถูกต้อง", () => {
    expect(chairTuck(chair({ y: 1.75 }), table)).toEqual({ depth: 0.25, fromFront: true });
  });

  it("หันหลังให้โต๊ะแล้วทับ → ไม่ใช่การสอดจากด้านหน้า", () => {
    expect(chairTuck(chair({ y: 1.6, rotation: 0 }), table).fromFront).toBe(false);
  });

  it("ชนโต๊ะจากด้านข้างของเก้าอี้ → ไม่ใช่การสอดจากด้านหน้า", () => {
    // เก้าอี้หันใต้ แต่ชนขอบตะวันตกของโต๊ะด้วยด้านข้าง
    expect(chairTuck(chair({ x: 1.6, y: 2.2, rotation: 180 }), table).fromFront).toBe(false);
  });
});
