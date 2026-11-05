import { describe, expect, it } from "vitest";
import { GAIT_CADENCE_VARIATION, START_WALK_SPEED, createLocomotionState, gaitProfile, measureLocomotion, staffGaitKey } from "./locomotion";

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

describe("gaitProfile — ไม่เดินก้าวพร้อมกันเหมือนทหาร", () => {
  const keys = [...Array.from({ length: 20 }, (_, i) => i), ...Array.from({ length: 6 }, (_, i) => staffGaitKey(i))];
  const profiles = keys.map(gaitProfile);

  it("แต่ละคนก้าวถี่ต่างกันเล็กน้อย ไม่เกิน ±GAIT_CADENCE_VARIATION", () => {
    for (const { cadence, phase } of profiles) {
      expect(Math.abs(cadence - 1)).toBeLessThanOrEqual(GAIT_CADENCE_VARIATION + 1e-9);
      expect(phase).toBeGreaterThanOrEqual(0);
      expect(phase).toBeLessThan(1);
    }
    const cadences = profiles.map(p => p.cadence);
    expect(Math.max(...cadences) - Math.min(...cadences)).toBeGreaterThan(GAIT_CADENCE_VARIATION);
  });

  it("เริ่มก้าวแรกคนละจังหวะ กระจายทั่วรอบคลิป", () => {
    const quarters = new Set(profiles.map(p => Math.floor(p.phase * 4)));
    expect(quarters.size).toBe(4);
    // ลูกค้าที่เข้าร้านติด ๆ กัน (id ต่อกัน) ไม่เริ่มก้าวที่จังหวะเดียวกัน
    for (let i = 1; i < 20; i++) {
      const gap = Math.abs(profiles[i]!.phase - profiles[i - 1]!.phase);
      expect(Math.min(gap, 1 - gap)).toBeGreaterThan(0.15);
    }
  });

  it("คงที่ต่อคน: เล่นซ้ำได้ภาพเดิม", () => {
    expect(gaitProfile(7)).toEqual(gaitProfile(7));
    expect(gaitProfile(staffGaitKey(0))).not.toEqual(gaitProfile(0));
  });
});
