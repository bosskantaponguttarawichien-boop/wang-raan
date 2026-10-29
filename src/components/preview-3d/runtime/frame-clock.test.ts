import { describe, expect, it } from "vitest";
import { CARRY_RATIO, FrameClock, MAX_FRAME_DEBT, MAX_FRAME_DELTA } from "./frame-clock";

describe("frame clock", () => {
  it("passes a healthy frame straight through", () => {
    const clock = new FrameClock();
    const step = clock.step(1 / 60);
    expect(step.seconds).toBeCloseTo(1 / 60, 9);
    expect(step).toMatchObject({ debt: 0, dropped: false });
  });

  it("clamps a long frame but keeps the excess as debt", () => {
    const clock = new FrameClock();
    const step = clock.step(0.25);
    expect(step.seconds).toBeCloseTo(MAX_FRAME_DELTA * (1 + CARRY_RATIO), 9);
    expect(step.debt).toBeCloseTo(0.15 - MAX_FRAME_DELTA * CARRY_RATIO, 9);
  });

  it("repays the debt over the following frames instead of in one jump", () => {
    const clock = new FrameClock();
    clock.step(0.25);
    const owed = clock.pendingDebt;
    const next = clock.step(1 / 60);
    expect(next.seconds).toBeGreaterThan(1 / 60);
    expect(next.seconds).toBeLessThanOrEqual((1 / 60) * (1 + CARRY_RATIO) + 1e-9);
    expect(next.debt).toBeLessThan(owed);
  });

  it("recovers the whole clamped time once the frame rate is healthy again", () => {
    const clock = new FrameClock();
    let total = clock.step(0.25).seconds;
    let real = 0.25;
    for (let frame = 0; frame < 200; frame += 1) {
      total += clock.step(1 / 60).seconds;
      real += 1 / 60;
    }
    expect(clock.pendingDebt).toBeLessThan(1e-6);
    expect(total).toBeCloseTo(real, 4);
  });

  it("keeps a steady 15 fps run in step with real time", () => {
    const clock = new FrameClock();
    let total = 0;
    for (let frame = 0; frame < 150; frame += 1) total += clock.step(1 / 15).seconds;
    // Each 66 ms frame is under the clamp, so nothing is lost at all.
    expect(total).toBeCloseTo(10, 6);
  });

  it("drops time rather than replaying a long stall", () => {
    const clock = new FrameClock();
    clock.step(5);
    expect(clock.pendingDebt).toBeLessThanOrEqual(MAX_FRAME_DEBT);
    expect(clock.hasDropped).toBe(true);
  });

  it("spends and accrues nothing while paused, and does not replay the pause", () => {
    const clock = new FrameClock();
    clock.step(0.25);
    expect(clock.pendingDebt).toBeGreaterThan(0);
    const paused = clock.step(2, false);
    expect(paused).toMatchObject({ seconds: 0, debt: 0 });
    expect(clock.step(1 / 60).seconds).toBeCloseTo(1 / 60, 9);
  });

  it("treats a missing or nonsense delta as no time at all", () => {
    const clock = new FrameClock();
    for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(clock.step(value).seconds, String(value)).toBe(0);
    }
  });

  it("forgets its debt on reset", () => {
    const clock = new FrameClock();
    clock.step(5);
    clock.reset();
    expect(clock.pendingDebt).toBe(0);
    expect(clock.hasDropped).toBe(false);
  });
});
