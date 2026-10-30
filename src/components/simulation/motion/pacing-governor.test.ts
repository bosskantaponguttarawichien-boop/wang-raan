import { describe, expect, it } from "vitest";
import {
  BACKLOG_LIMIT_SECONDS, MAX_CATCH_UP_MOTION_RATE, MIN_SPEED_FRACTION, PacingGovernor, VISUAL_MOTION_RATE, clipStretch, motionRate,
} from "./pacing-governor";

/** เดินเวลา `seconds` วินาทีด้วยเฟรมละ 0.1 วินาทีที่ค้างหลังคงที่ */
function run(governor: PacingGovernor, selected: number, backlog: number, seconds: number) {
  let state = governor.state(selected);
  for (let t = 0; t < seconds; t += 0.1) state = governor.update(selected, backlog, 0.1);
  return state;
}

describe("PacingGovernor — เวลาย่อแบบเกม", () => {
  it("ท่าทางเร็วกว่าคนจริงไม่เกินเพดาน ส่วนความเร็วต่ำเล่นตามจริง", () => {
    expect(motionRate(1)).toBe(1);
    expect(motionRate(30)).toBe(VISUAL_MOTION_RATE);
    expect(clipStretch(1)).toBe(1);
    expect(clipStretch(30)).toBeCloseTo(30 / VISUAL_MOTION_RATE);
  });

  it("ภาพไม่ค้างหลัง → เล่นที่ความเร็วที่เลือกเต็ม ๆ และเดินตามเพดานภาพ", () => {
    const state = run(new PacingGovernor(), 30, 0.5, 10);
    expect(state).toEqual({ speed: 30, walkRate: VISUAL_MOTION_RATE });
  });

  it("ค้างหลังนาน → ชะลอนาฬิกาค่อย ๆ ลงไม่ต่ำกว่าขั้นต่ำ แล้วค่อยเร่งท่าเดินไม่เกินเพดานไล่", () => {
    const governor = new PacingGovernor();
    let previous = 30;
    for (let t = 0; t < 30; t += 0.1) {
      const { speed, walkRate } = governor.update(30, BACKLOG_LIMIT_SECONDS * 3, 0.1);
      // เปลี่ยนทีละน้อย: ตาจับไม่ได้
      expect(Math.abs(speed - previous)).toBeLessThanOrEqual(30 * 0.06 * 0.1 + 1e-9);
      expect(speed).toBeGreaterThanOrEqual(30 * MIN_SPEED_FRACTION - 1e-9);
      expect(walkRate).toBeLessThanOrEqual(MAX_CATCH_UP_MOTION_RATE + 1e-9);
      previous = speed;
    }
    const state = governor.state(30);
    expect(state.speed).toBeCloseTo(20);
    expect(state.walkRate).toBeCloseTo(MAX_CATCH_UP_MOTION_RATE);
  });

  it("ไล่ทันแล้ว → กลับไปความเร็วที่เลือกและท่าเดินปกติ", () => {
    const governor = new PacingGovernor();
    run(governor, 30, BACKLOG_LIMIT_SECONDS * 3, 30);
    expect(run(governor, 30, 0, 30)).toEqual({ speed: 30, walkRate: VISUAL_MOTION_RATE });
  });

  it("ความเร็วต่ำกว่าเพดานภาพไม่ถูกคุม", () => {
    expect(run(new PacingGovernor(), 1, 100, 10)).toEqual({ speed: 1, walkRate: 1 });
  });
});
