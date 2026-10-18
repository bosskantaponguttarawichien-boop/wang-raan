import { describe, expect, it } from "vitest";
import {
  addTableSet,
  createCounter,
  createEmptyLayout,
  createEntrance,
  createSequentialIds,
  findAvailableSpot,
  getDoorZone,
  getItemBoundingBox,
  rectsIntersect,
  type StoreLayout,
} from "./index";
import { cafeLayout } from "@/test/fixtures/layouts";
import { validateLayout } from "../validation";

describe("spot-finder (feat-051)", () => {
  it("คำนวณ door clearance zone ถูกต้องสำหรับผนังทั้ง 4 ด้าน", () => {
    const ids = createSequentialIds();
    const layoutNorth = {
      ...createEmptyLayout({ width: 8, depth: 6 }, ids),
      entrance: createEntrance({ width: 8, depth: 6 }, { wall: "north", position: 2, width: 1.2 }, ids),
    };
    expect(getDoorZone(layoutNorth)).toEqual({ x: 2, y: 0, width: 1.2, depth: 1.2 });

    const layoutSouth = {
      ...createEmptyLayout({ width: 8, depth: 6 }, ids),
      entrance: createEntrance({ width: 8, depth: 6 }, { wall: "south", position: 3, width: 1.2 }, ids),
    };
    expect(getDoorZone(layoutSouth)).toEqual({ x: 3, y: 4.8, width: 1.2, depth: 1.2 });

    const layoutWest = {
      ...createEmptyLayout({ width: 8, depth: 6 }, ids),
      entrance: createEntrance({ width: 8, depth: 6 }, { wall: "west", position: 1.5, width: 1.2 }, ids),
    };
    expect(getDoorZone(layoutWest)).toEqual({ x: 0, y: 1.5, width: 1.2, depth: 1.2 });

    const layoutEast = {
      ...createEmptyLayout({ width: 8, depth: 6 }, ids),
      entrance: createEntrance({ width: 8, depth: 6 }, { wall: "east", position: 2.5, width: 1.2 }, ids),
    };
    expect(getDoorZone(layoutEast)).toEqual({ x: 6.8, y: 2.5, width: 1.2, depth: 1.2 });
  });

  it("หาจุดว่างสำหรับวัตถุทั้ง 4 ชนิดในห้องว่างได้ลงกริด 0.25 ม. และไม่ทับประตู", () => {
    const ids = createSequentialIds();
    const layout: StoreLayout = {
      ...createEmptyLayout({ width: 8, depth: 6 }, ids),
      entrance: createEntrance({ width: 8, depth: 6 }, { wall: "south", position: 3, width: 1.2 }, ids),
      objects: [],
    };
    const doorZone = getDoorZone(layout)!;

    const items = ["table-2-seats", "table-4-seats", "counter"] as const;
    for (const item of items) {
      const spot = findAvailableSpot(layout, item);
      expect(spot.x % 0.25).toBeCloseTo(0);
      expect(spot.y % 0.25).toBeCloseTo(0);

      const bbox = getItemBoundingBox(item, spot);
      expect(bbox.x).toBeGreaterThanOrEqual(0);
      expect(bbox.y).toBeGreaterThanOrEqual(0);
      expect(bbox.x + bbox.width).toBeLessThanOrEqual(layout.width + 1e-6);
      expect(bbox.y + bbox.depth).toBeLessThanOrEqual(layout.depth + 1e-6);

      // ต้องไม่ทับประตู
      expect(rectsIntersect(bbox, doorZone)).toBe(false);
    }
  });

  it("หาจุดว่างต่อเนื่องโดยไม่ชนกับวัตถุเดิมในร้าน", () => {
    const ids = createSequentialIds();
    let layout: StoreLayout = {
      ...createEmptyLayout({ width: 8, depth: 6 }, ids),
      entrance: createEntrance({ width: 8, depth: 6 }, { wall: "south", position: 3.5, width: 1.2 }, ids),
      kitchenDoor: { id: "kitchen-door-01", wall: "north", position: 1, width: 0.9 },
      objects: [],
    };

    // วาง Counter
    const cSpot = findAvailableSpot(layout, "counter");
    layout = { ...layout, objects: [...layout.objects, createCounter({ position: cSpot }, ids)] };

    // วาง Table 4 ที่นั่ง
    const t4Spot = findAvailableSpot(layout, "table-4-seats");
    layout = addTableSet(layout, "table-4-seats", t4Spot, ids).layout;

    // วาง Table 2 ที่นั่ง
    const t2Spot = findAvailableSpot(layout, "table-2-seats");
    layout = addTableSet(layout, "table-2-seats", t2Spot, ids).layout;

    expect(layout.objects.length).toBe(1 + 5 + 3); // counter + (table+4chairs) + (table+2chairs) = 9 objects

    // ตรวจสอบว่าไม่มีวัตถุใดชนกัน
    const validation = validateLayout(layout);
    const collisionIssues = validation.issues.filter((i) => i.id.startsWith("collision/"));
    expect(collisionIssues).toHaveLength(0);
  });

  it("ผังตัวอย่าง cafeLayout ได้สถานะ Ready เสมอ", () => {
    const layout = cafeLayout();
    const result = validateLayout(layout);
    expect(result.status).toBe("ready");
    expect(result.issues).toHaveLength(0);
  });
});
