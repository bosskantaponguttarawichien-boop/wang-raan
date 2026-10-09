import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  clampRoomDimension,
  createCounter,
  createEmptyLayout,
  createEntrance,
  createKitchen,
  createSequentialIds,
  footprint,
  normalizeRotation,
  rectsIntersect,
  rotatePoint,
  snapToGrid,
} from "./index";

describe("snap grid 0.25 ม.", () => {
  it.each([
    [0, 0],
    [0.12, 0],
    [0.13, 0.25],
    [1.374, 1.25],
    [1.376, 1.5],
    [2.9, 3],
    [-0.1, 0],
  ])("snapToGrid(%s) = %s", (input, expected) => {
    expect(snapToGrid(input)).toBe(expected);
  });

  it("ไม่มีเศษ floating point หลัง snap", () => {
    for (let i = 0; i < 400; i++) {
      const v = snapToGrid(i * 0.1);
      expect(Math.round(v * 4)).toBe(v * 4);
    }
  });

  it.each([
    [1, 2],
    [2, 2],
    [8.1, 8],
    [30, 30],
    [45, 30],
    [Number.NaN, 2],
  ])("ขนาดร้าน %s → %s (2–30 ม.)", (input, expected) => {
    expect(clampRoomDimension(input)).toBe(expected);
  });
});

describe("rotation และ footprint", () => {
  it("normalizeRotation ให้ค่า 0/90/180/270 เสมอ", () => {
    expect(normalizeRotation(360)).toBe(0);
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(450)).toBe(90);
    expect(normalizeRotation(89)).toBe(90);
  });

  it("footprint สลับกว้าง/ลึกที่ 90° และ 270°", () => {
    const base = { x: 1, y: 2, width: 2.4, depth: 0.7 };
    expect(footprint({ ...base, rotation: 0 })).toEqual({ x: 1, y: 2, width: 2.4, depth: 0.7 });
    expect(footprint({ ...base, rotation: 90 })).toEqual({ x: 1, y: 2, width: 0.7, depth: 2.4 });
    expect(footprint({ ...base, rotation: 180 })).toEqual({ x: 1, y: 2, width: 2.4, depth: 0.7 });
    expect(footprint({ ...base, rotation: 270 })).toEqual({ x: 1, y: 2, width: 0.7, depth: 2.4 });
  });

  it("rotatePoint หมุนตามเข็มนาฬิกา (แกน y ชี้ลง)", () => {
    const c = { x: 0, y: 0 };
    const north = { x: 0, y: -1 };
    const rot = (r: 90 | 180 | 270) => {
      const p = rotatePoint(north, c, r);
      return { x: p.x + 0, y: p.y + 0 }; // ตัด -0
    };
    expect(rot(90)).toEqual({ x: 1, y: 0 }); // เหนือ → ตะวันออก
    expect(rot(180)).toEqual({ x: 0, y: 1 });
    expect(rot(270)).toEqual({ x: -1, y: 0 });
  });

  it("rectsIntersect ไม่นับการแตะขอบ", () => {
    const a = { x: 0, y: 0, width: 1, depth: 1 };
    expect(rectsIntersect(a, { x: 1, y: 0, width: 1, depth: 1 })).toBe(false);
    expect(rectsIntersect(a, { x: 0.9, y: 0.9, width: 1, depth: 1 })).toBe(true);
  });
});

describe("entities", () => {
  const ids = () => createSequentialIds();

  it("ผังเปล่าใช้หน่วยเมตร ยังไม่มีทางเข้าและวัตถุ", () => {
    const layout = createEmptyLayout({ width: 8, depth: 6.1 }, ids());
    expect(layout).toEqual({
      id: "layout-01",
      version: 1,
      units: "m",
      width: 8,
      depth: 6,
      entrance: null,
      objects: [],
    });
  });

  it("Kitchen และ Counter ใช้ขนาดเริ่มต้นตาม design-system และ snap ตำแหน่ง", () => {
    const next = ids();
    expect(createKitchen({ position: { x: 0.6, y: 0.4 } }, next)).toEqual({
      id: "kitchen-01",
      type: "kitchen",
      x: 0.5,
      y: 0.5,
      width: 2,
      depth: 1.5,
      rotation: 0,
    });
    expect(createCounter({ position: { x: 5.1, y: 0.5 }, rotation: 270 }, next)).toMatchObject({
      type: "counter",
      x: 5,
      width: 2.4,
      depth: 0.7,
      rotation: 270,
    });
  });

  it("Entrance กว้าง 1.20 ม. เป็นค่าเริ่มต้น และไม่ยื่นเลยผนัง", () => {
    const room = { width: 8, depth: 6 };
    expect(createEntrance(room, { wall: "south", position: 1.2 }, ids())).toEqual({
      id: "entrance-01",
      wall: "south",
      position: 1.25,
      width: 1.2,
    });
    expect(createEntrance(room, { wall: "east", position: 99 }, ids()).position).toBeLessThanOrEqual(6 - 1.2);
    expect(createEntrance(room, { wall: "west", position: -3, width: 0.2 }, ids())).toMatchObject({
      position: 0,
      width: 0.6,
    });
  });

  it("randomId สร้าง id ไม่ซ้ำโดยไม่พึ่ง DOM", () => {
    const a = createKitchen({ position: { x: 0, y: 0 } });
    const b = createKitchen({ position: { x: 0, y: 0 } });
    expect(a.id).toMatch(/^kitchen-/);
    expect(a.id).not.toBe(b.id);
  });
});

describe("boundary: src/core เป็น Pure TypeScript", () => {
  const coreDir = resolve(__dirname, "..");
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(path);
    }
  };
  walk(coreDir);

  it("ไม่มีไฟล์ .tsx ใน src/core", () => {
    expect(files.filter((f) => f.endsWith(".tsx"))).toEqual([]);
  });

  it.each(files.map((f) => [f.slice(coreDir.length + 1), f]))("%s ไม่ import React/Next/Zustand/DOM", (_, file) => {
    const source = readFileSync(file, "utf8");
    expect(source).not.toMatch(/from\s+["'](react|react-dom|next|zustand|@radix-ui)[/"']/);
    expect(source).not.toMatch(/from\s+["']@\/(components|store)\//);
    expect(source).not.toMatch(/\b(window|document|localStorage|navigator)\./);
  });
});
