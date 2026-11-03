import { describe, expect, it } from "vitest";
import {
  BACKLOG_LIMIT_SECONDS, MIN_SPEED_FRACTION, PacingGovernor, QUIET_DELAY_SECONDS, QUIET_SPEED_MULTIPLIER,
  VISUAL_MOTION_RATE, motionRate,
} from "./pacing-governor";

/** เดินเวลา `seconds` วินาทีด้วยเฟรมละ 0.1 วินาทีที่ค้างหลังคงที่ */
function run(governor: PacingGovernor, selected: number, backlog: number, seconds: number, taskLimit = Number.POSITIVE_INFINITY) {
  let state = governor.state(selected);
  for (let t = 0; t < seconds; t += 0.1) state = governor.update(selected, backlog, 0.1, taskLimit);
  return state;
}

describe("PacingGovernor — เวลาย่อแบบเกม", () => {
  it("ท่าทางเร็วกว่าคนจริงไม่เกินเพดาน ส่วนความเร็วต่ำเล่นตามจริง", () => {
    expect(motionRate(1)).toBe(1);
    expect(motionRate(30)).toBe(VISUAL_MOTION_RATE);
  });

  it("ภาพไม่ค้างหลัง → เล่นที่ความเร็วที่เลือกเต็ม ๆ และเดินตามเพดานภาพ", () => {
    const state = run(new PacingGovernor(), 30, 0.5, 10);
    expect(state).toEqual({ speed: 30, walkRate: VISUAL_MOTION_RATE });
  });

  it("ค้างหลังนาน → ชะลอนาฬิกาค่อย ๆ ลงไม่ต่ำกว่าขั้นต่ำ โดยความเร็วท่าเดินคงที่ตลอด", () => {
    const governor = new PacingGovernor();
    let previous = 30;
    for (let t = 0; t < 30; t += 0.1) {
      const { speed, walkRate } = governor.update(30, BACKLOG_LIMIT_SECONDS * 3, 0.1);
      // เปลี่ยนทีละน้อย ไม่กระโดด
      expect(Math.abs(speed - previous)).toBeLessThanOrEqual(30 * 0.4 * 0.1 + 1e-9);
      expect(speed).toBeGreaterThanOrEqual(30 * MIN_SPEED_FRACTION - 1e-9);
      expect(walkRate).toBe(VISUAL_MOTION_RATE);
      previous = speed;
    }
    const state = governor.state(30);
    expect(state.speed).toBeCloseTo(30 * MIN_SPEED_FRACTION);
    expect(state.walkRate).toBe(VISUAL_MOTION_RATE);
  });

  it("ไล่ทันแล้ว → กลับไปความเร็วที่เลือกและท่าเดินปกติ", () => {
    const governor = new PacingGovernor();
    run(governor, 30, BACKLOG_LIMIT_SECONDS * 3, 30);
    expect(run(governor, 30, 0, 30)).toEqual({ speed: 30, walkRate: VISUAL_MOTION_RATE });
  });

  it("งานที่โต๊ะที่ภาพยังเดินไม่ถึง → ชะลอตามที่ต้องการได้ถึง 1/4 ของที่เลือก และกลับเมื่อพ้นงาน", () => {
    const governor = new PacingGovernor();
    expect(run(governor, 30, 0, 5, 12).speed).toBeCloseTo(12);
    expect(run(governor, 30, 0, 5, 1).speed).toBeCloseTo(7.5);
    expect(run(governor, 30, 0, 30).speed).toBe(30);
  });

  it("ร้านเงียบต่อเนื่อง → เร่งนาฬิกาข้ามช่วงนิ่ง และกลับความเร็วที่เลือกทันทีเมื่อมีคนต้องเดิน", () => {
    const governor = new PacingGovernor();
    let state = governor.state(30);
    for (let t = 0; t < QUIET_DELAY_SECONDS - 0.2; t += 0.1) state = governor.update(30, 0, 0.1, Number.POSITIVE_INFINITY, true);
    expect(state.speed).toBe(30);
    for (let t = 0; t < 10; t += 0.1) state = governor.update(30, 0, 0.1, Number.POSITIVE_INFINITY, true);
    expect(state).toEqual({ speed: 30 * QUIET_SPEED_MULTIPLIER, walkRate: VISUAL_MOTION_RATE });
    expect(governor.update(30, 0.5, 0.1, Number.POSITIVE_INFINITY, false)).toEqual({ speed: 30, walkRate: VISUAL_MOTION_RATE });
    // งานที่โต๊ะยังรออยู่ = ไม่นับว่าเงียบ
    for (let t = 0; t < 10; t += 0.1) state = governor.update(30, 0, 0.1, 40, true);
    expect(state.speed).toBeLessThanOrEqual(30);
  });

  it("ความเร็วต่ำกว่าเพดานภาพไม่ถูกคุม", () => {
    expect(run(new PacingGovernor(), 1, 100, 10)).toEqual({ speed: 1, walkRate: 1 });
  });
});
