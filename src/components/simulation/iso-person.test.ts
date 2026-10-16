import { describe, expect, it } from "vitest";
import { behaviorFromState, facingFrom, personLook } from "./iso-person";

describe("ตัวคน chibi ในมุมมอง 3D", () => {
  it("หน้าตาคงที่ต่อ id และมีความหลากหลายทั้งทรงผม/หมวกและสีเสื้อ", () => {
    expect(personLook(42)).toEqual(personLook(42));
    const looks = Array.from({ length: 60 }, (_, i) => personLook(i + 1));
    expect(new Set(looks.map((l) => l.style)).size).toBe(6);
    expect(new Set(looks.map((l) => l.shirt)).size).toBeGreaterThanOrEqual(6);
  });

  it.each([
    // เดินบนผัง (dx, dy) → ทิศบนจอ: x+ = ขวาลง (หน้า/ขวา), y+ = ซ้ายลง (หน้า/ซ้าย)
    [1, 0, { front: true, right: true }],
    [0, 1, { front: true, right: false }],
    [-1, 0, { front: false, right: false }],
    [0, -1, { front: false, right: true }],
  ] as const)("เดิน (%s, %s) → หัน %o", (dx, dy, expected) => {
    expect(facingFrom(dx * 0.05, dy * 0.05, { front: false, right: false })).toEqual(expected);
  });

  it("แทบไม่ขยับ → คงทิศเดิม (กันหันกลับไปมา)", () => {
    const previous = { front: false, right: true };
    expect(facingFrom(0.0001, 0, previous)).toBe(previous);
  });

  it("จับคู่สถานะจำลองกับท่าทางที่ผู้ใช้เข้าใจได้", () => {
    expect(behaviorFromState(0)).toBe("walking");
    expect(behaviorFromState(1)).toBe("queueing");
    expect(behaviorFromState(2)).toBe("ordering");
    expect(behaviorFromState(3)).toBe("walking");
    expect(behaviorFromState(4)).toBe("dining");
    expect(behaviorFromState(5)).toBe("leaving");
  });
});
