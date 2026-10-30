import { describe, expect, it } from "vitest";
import { STAFF_WALK_SPEED } from "@/core/simulation";
import { WalkPacer, MAX_QUEUED_WALK_POINTS } from "../walk-pacer";
import { StaffPacer, MAX_QUEUED_STAFF_POINTS } from "../staff-pacer";
import { PlaybackClock } from "./playback-clock";

const row = (id: number, x: number, y = 0, code = 3) => new Float32Array([id, x, y, code]);

describe("canonical movement clock", () => {
  for (const fps of [15, 30, 60, 120]) for (const rate of [1, 2, 5, 10, 30]) {
    it(`${fps}fps, ${rate}×: 6m staff route takes 5 simulation seconds; customers retain individual speeds`, () => {
      const clock = new PlaybackClock(); clock.reset(0, 0);
      const staff = new StaffPacer(); staff.update(row(0, 0), 0, STAFF_WALK_SPEED, 1, true);
      const customers = new WalkPacer(); customers.update(new Float32Array(), undefined, 0, 1);
      const target = new Float32Array([10, 100, 0, 3, 11, 100, 1, 3]);
      customers.update(target, new Float32Array([10, 2, 0, 0, 100, 0, 11, 2, 0, 1, 100, 1]), 0, 1);
      let time = 0, now = 0;
      let staffOut: Float32Array = row(0, 0), customerOut: Float32Array = new Float32Array();
      while (time < 5 - 1e-9) {
        const delta = Math.min(rate / fps, 5 - time);
        time += delta; now += delta / rate * 1000;
        const frame = clock.advance(time, now, rate);
        expect(frame.gap).toBe(false);
        staffOut = staff.update(row(0, 6), frame.seconds, STAFF_WALK_SPEED * rate, rate, true);
        customerOut = customers.update(target, undefined, frame.seconds, id => (id === 10 ? 1 : 1.4) * rate);
      }
      expect(staffOut[1]).toBeCloseTo(6, 5);
      expect(customerOut[1]).toBeCloseTo(5, 5);
      expect(customerOut[5]).toBeCloseTo(7, 5);
      // Same cumulative simulation time with deliberately jittered arrival times.
      clock.reset(0, 0);
      let seconds = 0;
      for (const [sim, wall] of [[0.1, 90], [0.3, 330], [0.65, 640], [1, 1000]] as const) seconds += clock.advance(sim * rate, wall, rate).seconds;
      expect(seconds).toBeCloseTo(1, 8);
    });
  }

  it("30 real seconds follows the selected rate without double scaling", () => {
    for (const rate of [1, 2, 5, 10, 30]) {
      const clock = new PlaybackClock(); clock.reset(0, 0);
      let time = 0;
      for (let i = 1; i <= 300; i++) time += clock.advance(i * 0.1 * rate, i * 100, rate).seconds * rate;
      expect(time).toBeCloseTo(30 * rate, 7);
    }
  });

  it("large wall/simulation gaps require a paused resync; reset never accumulates hidden time", () => {
    const clock = new PlaybackClock(); clock.reset(0, 0);
    expect(clock.advance(0.35, 350, 1)).toEqual({ seconds: 0.35, gap: false });
    expect(clock.advance(60, 60_000, 1).gap).toBe(true);
    clock.reset(60, 60_000);
    expect(clock.advance(60.1, 60_100, 1).seconds).toBeCloseTo(0.1);
    expect(clock.advance(100, 60_200, 1).gap).toBe(true);
    expect(clock.advance(NaN, Infinity, 0).seconds).toBe(0);
  });

  it("legacy frames use wall time and reset the anchor on resume", () => {
    const clock = new PlaybackClock(); clock.reset(null, 100);
    expect(clock.advance(500, 400, 1, false).seconds).toBeCloseTo(0.3);
    clock.reset(null, 60_400);
    expect(clock.advance(501, 60_500, 1, false)).toEqual({ seconds: 0.1, gap: false });
  });

  it("bounded queues preserve corners and request resync instead of speeding up", () => {
    const walker = new WalkPacer(); walker.update(row(1, 0, 0), undefined, 0, 1);
    const staff = new StaffPacer(); staff.update(row(0, 0), 0, 1);
    const count = Math.max(MAX_QUEUED_WALK_POINTS, MAX_QUEUED_STAFF_POINTS) + 100;
    for (let i = 1; i <= count; i++) {
      walker.update(row(1, i, i % 2), undefined, 0, 1);
      staff.update(row(0, i, i % 2), 0, 1, 1, true);
    }
    expect(walker.needsResync).toBe(true); expect(staff.needsResync).toBe(true);
    const customerOut = walker.update(row(1, count), undefined, 0.1, 1);
    const staffOut = staff.update(row(0, count), 0.1, 1, 1, true);
    expect(Math.hypot(customerOut[1]!, customerOut[2]!)).toBeCloseTo(0.1);
    expect(Math.hypot(staffOut[1]!, staffOut[2]!)).toBeCloseTo(0.1);
    // Actual queue storage is capped, not merely a warning flag.
    expect((walker as unknown as { walkers: Map<number, { queue: number[] }> }).walkers.get(1)!.queue.length).toBeLessThanOrEqual(MAX_QUEUED_WALK_POINTS * 2);
    expect((staff as unknown as { servers: Map<number, { queue: unknown[] }> }).servers.get(0)!.queue.length).toBeLessThanOrEqual(MAX_QUEUED_STAFF_POINTS);
    walker.reset(); staff.reset();
    expect(walker.needsResync).toBe(false); expect(staff.needsResync).toBe(false);
    // Bad path counts cannot create an unbounded decode loop.
    expect(() => walker.update(row(1, 0), new Float32Array([1, -1]), 0.1, 1)).not.toThrow();
  });

  it("modern pickup does not add a second kitchen wait", () => {
    const staff = new StaffPacer();
    staff.setKitchenDoor({ center: { x: 0, y: 0 }, outward: { x: 0, y: -1 }, along: { x: 1, y: 0 }, width: 1 });
    staff.update(row(0, 0, 0, 5), 0, 1.2, 1, true);
    expect(staff.update(row(0, 1.2, 0, 3), 1, 1.2, 1, true)[1]).toBeCloseTo(1.2);
  });
});
