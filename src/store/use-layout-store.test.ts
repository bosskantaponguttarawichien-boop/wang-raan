import { describe, expect, it } from "vitest";
import { checkTableSetIntegrity, createSequentialIds, type Chair } from "@/core/layout";
import { computeLayoutRevision } from "@/core/validation";
import {
  HISTORY_LIMIT,
  ZOOM_MAX,
  ZOOM_MIN,
  createLayoutStore,
  selectCanRedo,
  selectCanStartSimulation,
  selectCanUndo,
  selectSelectedObject,
  selectUndoDepth,
} from "./use-layout-store";

function setup() {
  return createLayoutStore({ newId: createSequentialIds(), now: () => new Date("2026-10-10T00:00:00Z") });
}

/** สร้างผังคาเฟ่ที่ผ่านทุกกฎผ่าน action ของ store */
function buildCafe(store = setup()) {
  const s = store.getState();
  s.addKitchen({ x: 0.5, y: 0.5 });
  s.addCounter({ x: 5, y: 0.5 });
  const tableId = s.addTableSet("table-4-seats", { x: 3, y: 3 });
  return { store, tableId };
}

describe("สถานะเริ่มต้น", () => {
  it("ร้าน 8 × 6 ม. มีทางเข้า ยังไม่มีวัตถุ และไม่มีผลตรวจ", () => {
    const state = setup().getState();
    expect(state.layout).toMatchObject({ width: 8, depth: 6, objects: [] });
    expect(state.layout.entrance).toMatchObject({ wall: "south", position: 3.5, width: 1.2 });
    expect(state.validation).toBeNull();
    expect(state.layoutRevision).toBe(computeLayoutRevision(state.layout));
    expect(selectCanUndo(state)).toBe(false);
    expect(selectCanRedo(state)).toBe(false);
  });
});

describe("Table Set Lifecycle ผ่าน Store", () => {
  it("addTableSet สร้างโต๊ะพร้อมเก้าอี้ลูกและเลือกโต๊ะ", () => {
    const store = setup();
    const id = store.getState().addTableSet("table-2-seats");
    const { layout, selectedObjectId } = store.getState();
    expect(selectedObjectId).toBe(id);
    expect(layout.objects.filter((o) => o.type === "chair")).toHaveLength(2);
    expect(checkTableSetIntegrity(layout)).toEqual([]);
    // วางกึ่งกลางร้าน (snap 0.25)
    expect(selectSelectedObject(store.getState())).toMatchObject({ x: 3.5, y: 2.5 });
  });

  it("addKitchen / addCounter วางกึ่งกลางเมื่อไม่ระบุตำแหน่ง", () => {
    const store = setup();
    store.getState().addKitchen();
    store.getState().addCounter();
    expect(store.getState().layout.objects.map((o) => [o.type, o.x, o.y])).toEqual([
      ["kitchen", 3, 2.25],
      ["counter", 2.75, 2.75],
    ]);
  });

  it("ย้าย / หมุน โต๊ะ → เก้าอี้ตามทั้งชุด; ลบโต๊ะ → cascade และล้าง selection", () => {
    const { store, tableId } = buildCafe();
    const chairsBefore = store.getState().layout.objects.filter((o): o is Chair => o.type === "chair");
    store.getState().updateObjectPosition(tableId, 4, 3);
    const moved = store.getState().layout.objects.filter((o): o is Chair => o.type === "chair");
    moved.forEach((c, i) => expect(c.x).toBeCloseTo(chairsBefore[i]!.x + 1, 9));

    store.getState().rotateObject(tableId);
    expect(selectSelectedObject(store.getState())).toMatchObject({ rotation: 90 });

    store.getState().deleteObject(tableId);
    const { layout, selectedObjectId } = store.getState();
    expect(layout.objects.some((o) => o.type === "table" || o.type === "chair")).toBe(false);
    expect(selectedObjectId).toBeNull();
  });

  it("แก้ไขที่ไม่เปลี่ยนผัง ไม่สร้าง history", () => {
    const { store, tableId } = buildCafe();
    const depth = selectUndoDepth(store.getState());
    store.getState().updateObjectPosition(tableId, 3.05, 2.95); // snap แล้วตำแหน่งเดิม
    store.getState().rotateObject(tableId, 0);
    store.getState().deleteObject("missing");
    store.getState().setRoomDimensions(8, 6);
    store.getState().setEntrance({ wall: "south", position: 3.5 });
    expect(selectUndoDepth(store.getState())).toBe(depth);
  });
});

describe("Room & Entrance", () => {
  it("ขนาดร้าน snap และบีบอยู่ในช่วง 2–30 ม. แล้วดึงทางเข้ากลับมาบนผนัง (id เดิม)", () => {
    const store = setup();
    const entranceId = store.getState().layout.entrance!.id;
    store.getState().setRoomDimensions(4.1, 50);
    const { layout } = store.getState();
    expect([layout.width, layout.depth]).toEqual([4, 30]);
    expect(layout.entrance).toMatchObject({ id: entranceId, wall: "south" });
    expect(layout.entrance!.position + layout.entrance!.width).toBeLessThanOrEqual(4);
  });

  it("setEntrance ย้ายผนัง/ตำแหน่ง คงความกว้างเดิม และสร้างทางเข้าใหม่เมื่อยังไม่มี", () => {
    const store = setup();
    store.getState().setEntrance({ wall: "east", position: 1.1, width: 1.5 });
    store.getState().setEntrance({ wall: "west", position: 2 });
    expect(store.getState().layout.entrance).toMatchObject({ wall: "west", position: 2, width: 1.5 });

    store.getState().loadLayout({ ...store.getState().layout, entrance: null });
    store.getState().setEntrance({ wall: "north", position: 0 });
    expect(store.getState().layout.entrance).toMatchObject({ id: expect.stringMatching(/^entrance-/), wall: "north" });
  });
});

describe("Validation ใน Store", () => {
  it("runValidation เก็บผล และทุกการแก้ไขทำให้ผลตรวจหมดอายุ (C-07)", () => {
    const { store, tableId } = buildCafe();
    const edits = [
      () => store.getState().updateObjectPosition(tableId, 3.5, 3),
      () => store.getState().rotateObject(tableId),
      () => store.getState().setRoomDimensions(9, 6),
      () => store.getState().setEntrance({ wall: "south", position: 1 }),
      () => store.getState().addTableSet("table-2-seats", { x: 6, y: 4 }),
      () => store.getState().deleteObject(tableId),
      () => store.getState().undo(),
      () => store.getState().redo(),
    ];
    for (const edit of edits) {
      const result = store.getState().runValidation();
      expect(store.getState().validation).toBe(result);
      edit();
      expect(store.getState().validation).toBeNull();
      expect(store.getState().layoutRevision).toBe(computeLayoutRevision(store.getState().layout));
    }
  });

  it("P2 Gate: Ready → เริ่มจำลองได้, Blocked หรือยังไม่ตรวจ → ไม่ได้", () => {
    const { store, tableId } = buildCafe();
    expect(selectCanStartSimulation(store.getState())).toBe(false); // ยังไม่ตรวจ
    expect(store.getState().runValidation().status).toBe("ready");
    expect(selectCanStartSimulation(store.getState())).toBe(true);

    const kitchen = store.getState().layout.objects.find((o) => o.type === "kitchen")!;
    store.getState().updateObjectPosition(tableId, kitchen.x, kitchen.y); // Non-blocking: วางทับครัวได้
    expect(selectCanStartSimulation(store.getState())).toBe(false);
    expect(store.getState().runValidation().status).toBe("blocked");
    expect(selectCanStartSimulation(store.getState())).toBe(false);
  });

  it("invalidateValidation ล้างผลตรวจ", () => {
    const { store } = buildCafe();
    store.getState().runValidation();
    store.getState().invalidateValidation();
    expect(store.getState().validation).toBeNull();
  });
});

describe(`Undo / Redo ${HISTORY_LIMIT} ขั้น`, () => {
  /** ทำ n การแก้ไขที่ต่างกันทุกครั้ง แล้วคืน snapshot หลังแต่ละขั้น (index 0 = ก่อนแก้) */
  function editMany(n: number) {
    const store = setup();
    const kitchenId = store.getState().addKitchen({ x: 0, y: 0 });
    const snapshots = [store.getState().layout];
    for (let i = 1; i <= n; i++) {
      store.getState().updateObjectPosition(kitchenId, (i % 20) * 0.25, Math.floor(i / 20) * 0.25 + 0.25);
      snapshots.push(store.getState().layout);
    }
    return { store, snapshots };
  }

  it("ครบ 40 ขั้น: undo 40 ครั้งกลับถึงสถานะแรกตรงทุกขั้น และ redo 40 ครั้งกลับมาเหมือนเดิม", () => {
    const { store, snapshots } = editMany(HISTORY_LIMIT);
    expect(selectUndoDepth(store.getState())).toBe(HISTORY_LIMIT);
    for (let i = HISTORY_LIMIT - 1; i >= 0; i--) {
      store.getState().undo();
      expect(store.getState().layout).toBe(snapshots[i]);
      expect(store.getState().layoutRevision).toBe(computeLayoutRevision(snapshots[i]!));
    }
    expect(selectCanUndo(store.getState())).toBe(false);
    for (let i = 1; i <= HISTORY_LIMIT; i++) {
      store.getState().redo();
      expect(store.getState().layout).toBe(snapshots[i]);
    }
    expect(selectCanRedo(store.getState())).toBe(false);
  });

  it("เกิน 40 ขั้น: เก็บเฉพาะ 40 ขั้นล่าสุด (undo ครั้งที่ 41 ไม่มีผล)", () => {
    const { store, snapshots } = editMany(55);
    expect(store.getState().history).toHaveLength(HISTORY_LIMIT + 1);
    for (let i = 0; i < 45; i++) store.getState().undo();
    expect(store.getState().layout).toBe(snapshots[55 - HISTORY_LIMIT]);
    expect(selectCanUndo(store.getState())).toBe(false);
  });

  it("แก้ไขใหม่หลัง undo → ล้างทาง redo", () => {
    const { store } = editMany(5);
    store.getState().undo();
    store.getState().undo();
    expect(selectCanRedo(store.getState())).toBe(true);
    store.getState().addCounter({ x: 5, y: 0.5 });
    expect(selectCanRedo(store.getState())).toBe(false);
    expect(selectUndoDepth(store.getState())).toBe(5);
  });

  it("undo / redo ที่ปลายสุดไม่มีผล", () => {
    const store = setup();
    const before = store.getState();
    store.getState().undo();
    store.getState().redo();
    expect(store.getState().layout).toBe(before.layout);
    expect(store.getState().historyIndex).toBe(0);
  });

  it("undo การลบโต๊ะ คืนโต๊ะพร้อมเก้าอี้ลูกครบชุด; selection ของวัตถุที่หายไปถูกล้าง", () => {
    const { store, tableId } = buildCafe();
    store.getState().deleteObject(tableId);
    store.getState().undo();
    expect(checkTableSetIntegrity(store.getState().layout)).toEqual([]);
    expect(store.getState().layout.objects.filter((o) => o.type === "chair")).toHaveLength(4);

    store.getState().selectObject(tableId);
    store.getState().undo(); // ย้อนไปก่อนเพิ่มโต๊ะ
    expect(store.getState().selectedObjectId).toBeNull();
  });

  it("loadLayout รีเซ็ต history และ selection", () => {
    const { store } = buildCafe();
    const loaded = { ...store.getState().layout, id: "loaded" };
    store.getState().loadLayout(loaded);
    expect(store.getState()).toMatchObject({ layout: loaded, historyIndex: 0, selectedObjectId: null, validation: null });
    expect(store.getState().history).toEqual([loaded]);
  });
});

describe("Selection & View", () => {
  it("selectObject รับเฉพาะ id ที่มีอยู่", () => {
    const { store, tableId } = buildCafe();
    store.getState().selectObject("missing");
    expect(store.getState().selectedObjectId).toBeNull();
    store.getState().selectObject(tableId);
    expect(selectSelectedObject(store.getState())?.type).toBe("table");
    store.getState().selectObject(null);
    expect(selectSelectedObject(store.getState())).toBeNull();
  });

  it("zoom ถูกบีบอยู่ในช่วงที่กำหนด และสลับมุมมอง 3D ได้", () => {
    const store = setup();
    store.getState().setZoom(10);
    expect(store.getState().zoom).toBe(ZOOM_MAX);
    store.getState().setZoom(0.1);
    expect(store.getState().zoom).toBe(ZOOM_MIN);
    store.getState().setZoom(Number.NaN);
    expect(store.getState().zoom).toBe(1);
    store.getState().set3DView(true);
    expect(store.getState().is3DView).toBe(true);
  });

  it("selection / zoom / view ไม่เข้า history", () => {
    const { store, tableId } = buildCafe();
    const depth = selectUndoDepth(store.getState());
    store.getState().selectObject(tableId);
    store.getState().setZoom(2);
    store.getState().set3DView(true);
    expect(selectUndoDepth(store.getState())).toBe(depth);
  });
});

describe("Interaction (ลากต่อเนื่อง) และปรับขนาด", () => {
  it("การลากหนึ่งครั้งที่ผ่านหลายตำแหน่ง = Undo หนึ่งขั้น", () => {
    const store = setup();
    const id = store.getState().addKitchen({ x: 0, y: 0 });
    const before = store.getState().layout;
    const depth = selectUndoDepth(store.getState());
    store.getState().beginInteraction();
    for (let i = 1; i <= 12; i++) store.getState().updateObjectPosition(id, i * 0.25, i * 0.1);
    store.getState().endInteraction();
    expect(selectUndoDepth(store.getState())).toBe(depth + 1);
    store.getState().undo();
    expect(store.getState().layout).toBe(before);
  });

  it("interaction ที่ไม่เปลี่ยนผังไม่สร้าง history และการแก้หลังจบ interaction ได้ขั้นใหม่", () => {
    const store = setup();
    const id = store.getState().addKitchen({ x: 0, y: 0 });
    const depth = selectUndoDepth(store.getState());
    store.getState().beginInteraction();
    store.getState().endInteraction();
    expect(selectUndoDepth(store.getState())).toBe(depth);
    store.getState().beginInteraction();
    store.getState().updateObjectPosition(id, 1, 1);
    store.getState().endInteraction();
    store.getState().updateObjectPosition(id, 2, 2);
    expect(selectUndoDepth(store.getState())).toBe(depth + 2);
  });

  it("interaction ทำงานถูกต้องแม้ history เต็ม 40 ขั้น", () => {
    const store = setup();
    const id = store.getState().addKitchen({ x: 0, y: 0 });
    for (let i = 1; i <= 45; i++) store.getState().updateObjectPosition(id, (i % 20) * 0.25, 0.25 * Math.floor(i / 20));
    store.getState().beginInteraction();
    store.getState().updateObjectPosition(id, 6, 4);
    store.getState().updateObjectPosition(id, 6.5, 4);
    store.getState().endInteraction();
    expect(store.getState().history).toHaveLength(HISTORY_LIMIT + 1);
    store.getState().undo();
    expect(store.getState().layout.objects[0]).toMatchObject({ x: 0.25 * (45 % 20), y: 0.5 });
  });

  it("resizeObject ปรับเฉพาะ Kitchen/Counter, snap 0.05 ม. ขั้นต่ำ 0.30 ม.", () => {
    const { store, tableId } = buildCafe();
    const counter = store.getState().layout.objects.find((o) => o.type === "counter")!;
    store.getState().resizeObject(counter.id, 3.02, 0.12);
    expect(store.getState().layout.objects.find((o) => o.id === counter.id)).toMatchObject({ width: 3, depth: 0.3 });
    const depth = selectUndoDepth(store.getState());
    store.getState().resizeObject(tableId, 2, 2);
    store.getState().resizeObject(counter.id, Number.NaN, 0.3);
    expect(store.getState().layout.objects.find((o) => o.id === counter.id)).toMatchObject({ width: 0.3 });
    expect(selectUndoDepth(store.getState())).toBe(depth + 1);
  });
});
