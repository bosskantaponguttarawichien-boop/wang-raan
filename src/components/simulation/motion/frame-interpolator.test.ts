import { describe, expect, it } from "vitest";
import { FrameInterpolator, MAX_INTERPOLATED_STEP, followTarget } from "./frame-interpolator";

const frame = (at: number, x: number, code = 3) => ({ at, agents: new Float32Array([7, x, 0, code]), staff: new Float32Array() });

describe("FrameInterpolator — ตำแหน่งลื่นระหว่าง TICK", () => {
  it("ระยะต่อเฟรมคงที่แม้ TICK มาไม่สม่ำเสมอ (ไม่พุ่ง-หยุดทุก TICK)", () => {
    const interpolator = new FrameInterpolator();
    // เดิน 0.1 ม. ต่อ 50 ms (2 ม./วิ) แต่เวลาที่ TICK มาถึงคลาด ±15 ms
    const arrivals = [0, 50, 112, 150, 205, 250, 300, 365, 400, 450, 500, 550, 600];
    const positions: number[] = [];
    let next = 0;
    for (let now = 0; now <= 600; now += 1000 / 60) {
      while (next < arrivals.length && arrivals[next]! <= now) { interpolator.push(frame(next * 50, next * 0.1)); next++; }
      const sample = interpolator.sample(now);
      positions.push(sample!.agents[1]!);
    }
    const steps = positions.slice(12, -6).map((x, i, all) => (i === 0 ? null : x - all[i - 1]!)).filter((v): v is number => v !== null);
    const expected = 0.1 / 50 * (1000 / 60);
    for (const step of steps) expect(step).toBeCloseTo(expected, 2);
  });

  it("หยุดชั่วคราวแล้วภาพค้าง ไม่ไหลต่อ", () => {
    const interpolator = new FrameInterpolator();
    interpolator.push(frame(0, 0)); interpolator.push(frame(50, 0.1)); interpolator.push(frame(100, 0.2));
    const before = interpolator.sample(120)!.agents[1]!;
    expect(interpolator.sample(400, false)!.agents[1]).toBeCloseTo(before, 6);
  });

  it("กระโดดไกลเกินหนึ่งก้าว (ตั้งต้นภาพใหม่) ไม่เฉลี่ยระหว่างกลาง", () => {
    const interpolator = new FrameInterpolator();
    interpolator.push(frame(0, 0)); interpolator.push(frame(50, MAX_INTERPOLATED_STEP + 1));
    expect(interpolator.sample(25 + interpolator.delayMs)!.agents[1]).toBe(MAX_INTERPOLATED_STEP + 1);
  });
});

describe("followTarget", () => {
  it("ไล่เป้าด้วยความเร็วไม่เกินเพดาน และวางทันทีเมื่อกระโดดไกลมาก", () => {
    const position = { x: 0, z: 0 };
    expect(followTarget(position, { x: 2, z: 0 }, 0.1, 3)).toBeCloseTo(0.3);
    expect(position.x).toBeCloseTo(0.3);
    followTarget(position, { x: 10, z: 0 }, 0.1, 3);
    expect(position.x).toBe(10);
  });
});
