import { describe, expect, it } from "vitest";
import { StoreLayoutSchema } from "../validation/layout.schema";
import { KITCHEN_DOOR_DEFAULT_WIDTH } from "./constants";
import { kitchenDoorFromLegacy, migrateLayout, migrateLayoutData } from "./migrate";
import type { Entrance, StoreLayout } from "./types";

describe("migrateLayout", () => {
  const room = { width: 10, depth: 8 };

  it("แปลงกล่องครัวชิดผนังเหนือเป็นประตูครัวบนผนังเหนือ", () => {
    // ครัวอยู่ใกล้ผนังเหนือ (y = 0.5, x = 3, w = 2, d = 1)
    const kitchen = {
      id: "legacy-k1",
      x: 3,
      y: 0.5,
      width: 2,
      depth: 1,
      rotation: 0 as const,
    };
    const door = kitchenDoorFromLegacy(room, kitchen, null);
    expect(door).not.toBeNull();
    expect(door?.wall).toBe("north");
    expect(door?.width).toBe(KITCHEN_DOOR_DEFAULT_WIDTH);
    // จุดกึ่งกลาง x คือ 3 + 2/2 = 4.0; position ปัดเข้า snap grid 0.25m: 3.55 -> 3.5
    expect(door?.position).toBe(3.5);
    expect(door?.id).toBe("legacy-k1");
  });

  it("แปลงกล่องครัวชิดผนังตะวันตกเป็นประตูครัวบนผนังตะวันตก", () => {
    // ครัวอยู่ใกล้ผนังตะวันตก (x = 0.2, y = 3, w = 1, d = 2)
    const kitchen = {
      id: "legacy-k2",
      x: 0.2,
      y: 3,
      width: 1,
      depth: 2,
      rotation: 0 as const,
    };
    const door = kitchenDoorFromLegacy(room, kitchen, null);
    expect(door).not.toBeNull();
    expect(door?.wall).toBe("west");
    expect(door?.width).toBe(KITCHEN_DOOR_DEFAULT_WIDTH);
    // จุดกึ่งกลาง y คือ 3 + 2/2 = 4.0 -> snap grid 0.25m: 3.55 -> 3.5
    expect(door?.position).toBe(3.5);
  });

  it("ครัวกลางห้อง เลือกระยะทางที่ใกล้ที่สุด หรือใช้ tie-break ตามลำดับ เหนือ -> ตะวันตก -> ตะวันออก -> ใต้", () => {
    // กล่องครัวอยู่กึ่งกลางห้องพอดี (w = 10, d = 8, center at 5, 4)
    // distance north = 3.5, south = 3.5, west = 4.5, east = 4.5
    // north และ south ระยะเท่ากัน (3.5) -> stable sort ต้องเลือก north
    const kitchen = {
      id: "center-k",
      x: 4.5,
      y: 3.5,
      width: 1,
      depth: 1,
      rotation: 0 as const,
    };
    const door = kitchenDoorFromLegacy(room, kitchen, null);
    expect(door).not.toBeNull();
    expect(door?.wall).toBe("north");
  });

  it("ครัวทับทางเข้า — ขยับหลบทางเข้าบนผนังเดียวกัน หรือเลือกผนังถัดไป", () => {
    // ทางเข้าอยู่บนผนัง north ที่ position 3.5 (กว้าง 1.0 -> ช่วง [3.5, 4.5])
    const entrance: Entrance = {
      id: "ent-1",
      wall: "north",
      position: 3.5,
      width: 1.0,
    };
    // ครัวเดิม center x = 4.0 (x = 3.5, w = 1) ซึ่งจะทับ entrance พอดี
    const kitchen = {
      id: "overlap-k",
      x: 3.5,
      y: 0.1,
      width: 1,
      depth: 1,
      rotation: 0 as const,
    };
    const door = kitchenDoorFromLegacy(room, kitchen, entrance);
    expect(door).not.toBeNull();
    expect(door?.wall).toBe("north");
    // ประตูต้องไม่ทับ entrance
    const doorStart = door!.position;
    const doorEnd = door!.position + door!.width;
    const entStart = entrance.position;
    const entEnd = entrance.position + entrance.width;
    expect(doorEnd <= entStart || doorStart >= entEnd).toBe(true);
  });

  it("ผังปัจจุบันไม่ถูกแก้ไข และคืน reference เดิม", () => {
    const currentLayout: StoreLayout = {
      id: "layout-curr",
      version: 1,
      units: "m",
      width: 8,
      depth: 6,
      entrance: { id: "ent-1", wall: "south", position: 3, width: 1 },
      kitchenDoor: { id: "kd-1", wall: "north", position: 2, width: 0.9 },
      objects: [
        {
          id: "cnt-1",
          type: "counter",
          x: 2,
          y: 2,
          width: 2,
          depth: 0.6,
          rotation: 0,
        },
      ],
    };

    const migrated = migrateLayout(currentLayout);
    expect(migrated).toBe(currentLayout);
  });

  it("StoreLayoutSchema รับผังเก่าได้โดยไม่ error และแปลงเป็นโมเดลปัจจุบัน", () => {
    const legacyRaw = {
      id: "legacy-layout",
      version: 1,
      units: "m",
      width: 8,
      depth: 6,
      entrance: { id: "ent-1", wall: "south", position: 3, width: 1 },
      objects: [
        {
          id: "legacy-k",
          type: "kitchen",
          x: 2,
          y: 0.5,
          width: 2,
          depth: 1,
          rotation: 0,
        },
        {
          id: "tbl-1",
          type: "table",
          x: 4,
          y: 3,
          width: 1,
          depth: 1,
          rotation: 0,
          chairIds: [],
        },
      ],
    };

    const parsed = StoreLayoutSchema.parse(legacyRaw);
    expect(parsed.kitchenDoor).not.toBeNull();
    expect(parsed.kitchenDoor?.wall).toBe("north");
    expect(parsed.kitchenDoor?.id).toBe("legacy-k");
    // กล่องครัวต้องถูกนำออกจาก objects
    expect(parsed.objects.some((o) => (o as { type: string }).type === "kitchen")).toBe(false);
    expect(parsed.objects).toHaveLength(1);
    expect(parsed.objects[0]?.id).toBe("tbl-1");
  });

  it("คืนข้อมูลเดิมหากไม่ใช่ object หรือไม่มี objects", () => {
    expect(migrateLayoutData(null)).toBeNull();
    expect(migrateLayoutData("invalid")).toBe("invalid");
    expect(migrateLayoutData({ foo: "bar" })).toEqual({ foo: "bar" });
  });
});
