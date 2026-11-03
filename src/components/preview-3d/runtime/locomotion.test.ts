import { describe, expect, it } from "vitest";
import { START_WALK_SPEED, createLocomotionState, measureLocomotion } from "./locomotion";

describe("measureLocomotion", () => {
  it("ไม่สลับเดิน/ยืนตามการกระตุกเฟรมเดียว และค่อย ๆ หยุดเมื่อหยุดเดินจริง", () => {
    const state = createLocomotionState();
    const dt = 1 / 60;
    let x = 0;
    measureLocomotion(state, x, 0, 0, dt);
    let speed = 0;
    for (let i = 0; i < 30; i++) { x += 1.2 * dt; speed = measureLocomotion(state, x, 0, 0, dt); }
    expect(speed).toBeCloseTo(1.2, 1);
    // เฟรมเดียวที่ตำแหน่งไม่ขยับ (TICK มาช้า) ไม่ทำให้กลายเป็นท่ายืน
    expect(measureLocomotion(state, x, 0, 0, dt)).toBeGreaterThan(START_WALK_SPEED);
    for (let i = 0; i < 60; i++) speed = measureLocomotion(state, x, 0, 0, dt);
    expect(speed).toBe(0);
  });

  it("หมุนตัวอยู่กับที่นับเป็นการก้าวเท้า", () => {
    const state = createLocomotionState();
    const dt = 1 / 60;
    measureLocomotion(state, 0, 0, 0, dt);
    let speed = 0;
    for (let i = 1; i <= 20; i++) speed = measureLocomotion(state, 0, 0, i * 0.15, dt);
    expect(speed).toBeGreaterThan(0);
  });
});
