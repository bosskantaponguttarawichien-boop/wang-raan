import { describe, expect, it } from "vitest";
import { limitLayoutName } from "./layout-name";

describe("limitLayoutName", () => {
  it("ตัดที่ 80 code point ไม่ผ่ากลาง emoji", () => {
    const name = "ก".repeat(79) + "☕️🍰";
    const limited = limitLayoutName(name);
    expect(Array.from(limited)).toHaveLength(80);
    expect(limited.endsWith("☕")).toBe(true);
    expect(limited).not.toMatch(/[\uD800-\uDBFF]$/);
    expect(limitLayoutName("ร้านกาแฟ")).toBe("ร้านกาแฟ");
  });
});
