import { describe, expect, it } from "vitest";
import { placeToolbar } from "./selection-toolbar";

const size = { w: 160, h: 40 };
const area = { w: 480, h: 360 };

describe("placeToolbar — แถบเครื่องมือลอยต้องไม่บังชิ้นงานอื่น", () => {
  it("ที่ว่างด้านบน → วางเหนือชิ้นงาน กึ่งกลางแนวนอน", () => {
    expect(placeToolbar({ x: 200, y: 150, w: 80, h: 80 }, [], size, area)).toEqual({ x: 160, y: 100 });
  });

  it("ด้านบนมีชิ้นอื่น → ย้ายไปด้านล่าง", () => {
    const kitchen = { x: 150, y: 60, w: 180, h: 80 };
    expect(placeToolbar({ x: 200, y: 150, w: 80, h: 80 }, [kitchen], size, area)).toEqual({ x: 160, y: 240 });
  });

  it("ชิดขอบบนจนแถบหลุดพื้นที่ → ใช้ด้านล่างแทน", () => {
    expect(placeToolbar({ x: 20, y: 0, w: 120, h: 90 }, [], size, area).y).toBe(100);
  });

  it("บนและล่างมีชิ้นอื่น → ไปด้านขวา", () => {
    const above = { x: 150, y: 90, w: 180, h: 50 };
    const below = { x: 150, y: 240, w: 180, h: 60 };
    expect(placeToolbar({ x: 200, y: 150, w: 80, h: 80 }, [above, below], size, area)).toEqual({ x: 290, y: 170 });
  });
});
