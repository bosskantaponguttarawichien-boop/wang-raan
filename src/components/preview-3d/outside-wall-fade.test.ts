import { describe, expect, it } from "vitest";
import { OUTSIDE_FADE_SECONDS, OUTSIDE_WALL_OPACITY, OutsideWallFade, wallsWithPeopleOutside } from "./outside-wall-fade";

const agents = (...points: [number, number][]) => new Float32Array(points.flatMap(([x, y], id) => [id, x, y, 6]));

describe("ผนังโปร่งเมื่อมีคนอยู่ด้านนอก", () => {
  it("หาผนังที่มีคนอยู่ด้านนอกตามพิกัดผัง", () => {
    const size = { width: 6, depth: 5 };
    expect([...wallsWithPeopleOutside(agents([3, 2]), size)]).toEqual([]);
    expect([...wallsWithPeopleOutside(agents([-1, 2], [3, -0.5]), size)].sort()).toEqual(["north", "west"]);
    expect([...wallsWithPeopleOutside(agents([7, 6]), size)].sort()).toEqual(["east", "south"]);
  });

  it("ค่อย ๆ จางเมื่อมีคนรอข้างนอก แล้วกลับทึบเมื่อไม่มีใคร", () => {
    const fade = new OutsideWallFade();
    expect(fade.update(new Set(["west"]), OUTSIDE_FADE_SECONDS / 2, false)).toBe(true);
    expect(fade.factor("west")).toBeCloseTo(1 - (1 - OUTSIDE_WALL_OPACITY) / 2, 6);
    expect(fade.factor("north")).toBe(1);
    fade.update(new Set(["west"]), OUTSIDE_FADE_SECONDS, false);
    expect(fade.factor("west")).toBe(OUTSIDE_WALL_OPACITY);
    // นิ่งแล้วไม่ต้องวาดใหม่
    expect(fade.update(new Set(["west"]), 0.1, false)).toBe(false);
    fade.update(new Set(), OUTSIDE_FADE_SECONDS, false);
    expect(fade.factor("west")).toBe(1);
  });

  it("ผู้ใช้ลดการเคลื่อนไหว: เปลี่ยนทันทีไม่มีจาง", () => {
    const fade = new OutsideWallFade();
    fade.update(new Set(["south"]), 0.01, true);
    expect(fade.factor("south")).toBe(OUTSIDE_WALL_OPACITY);
  });
});
