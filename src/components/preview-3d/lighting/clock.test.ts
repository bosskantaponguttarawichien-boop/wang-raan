import { describe, expect, it, vi } from "vitest";
import { createSolarClock, resolveRestaurantSolarUtcMs } from "./clock";
import { BANGKOK_REFERENCE_DEFAULTS, parseLocalDateTimeToUtcMs } from "./settings";

describe("restaurant simulation solar clock", () => {
  it("uses opening time + simulated minutes across midnight and timezone changes", () => {
    const settings = BANGKOK_REFERENCE_DEFAULTS;
    expect(resolveRestaurantSolarUtcMs(settings, "10:00", 8 * 3600 + 59)).toBe(
      parseLocalDateTimeToUtcMs("2026-03-21T18:00", "Asia/Bangkok"),
    );
    expect(resolveRestaurantSolarUtcMs(settings, "23:00", 2 * 3600)).toBe(
      parseLocalDateTimeToUtcMs("2026-03-22T01:00", "Asia/Bangkok"),
    );
    expect(resolveRestaurantSolarUtcMs({ ...settings, timezone: "Asia/Tokyo" }, "10:00", 0)).toBe(
      parseLocalDateTimeToUtcMs("2026-03-21T10:00", "Asia/Tokyo"),
    );
    for (const elapsed of [-1, NaN, Infinity]) {
      expect(resolveRestaurantSolarUtcMs(settings, "invalid", elapsed)).toBe(
        parseLocalDateTimeToUtcMs("2026-03-21T10:00", "Asia/Bangkok"),
      );
    }
  });

  it("never runs an independent timer or follows device time while the simulation is paused", () => {
    vi.useFakeTimers();
    const opening = resolveRestaurantSolarUtcMs(BANGKOK_REFERENCE_DEFAULTS, "10:00", 0);
    let simulatedUtcMs = opening;
    const clock = createSolarClock({}, { nowMs: () => simulatedUtcMs });
    try {
      const listener = vi.fn();
      clock.subscribe(listener);
      clock.start();
      expect(clock.isRunning()).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
      vi.setSystemTime(new Date("2035-01-01T23:00:00Z"));
      vi.advanceTimersByTime(24 * 3600_000);
      expect(clock.getSnapshot().effectiveUtcMs).toBe(opening);
      expect(listener).toHaveBeenCalledTimes(1);
      simulatedUtcMs += 8 * 3600_000;
      expect(clock.refreshNow().effectiveUtcMs).toBe(simulatedUtcMs);
      simulatedUtcMs = opening;
      expect(clock.refreshNow().effectiveUtcMs).toBe(opening);
    } finally {
      clock.dispose();
      vi.useRealTimers();
    }
  });

  it("keeps fixed previews deterministic and returns to the current restaurant time", () => {
    const source = parseLocalDateTimeToUtcMs("2026-03-21T10:00", "Asia/Bangkok");
    const clock = createSolarClock({ mode: "fixed", fixedDateTimeLocal: "2026-03-21T22:00" }, {
      nowMs: () => source,
    });
    try {
      clock.start();
      expect(clock.getSnapshot().solar.phase).toBe("night");
      expect(clock.setSettings({ mode: "simulation" }).effectiveUtcMs).toBe(source);
      expect(clock.getSnapshot().solar.phase).toBe("day");
    } finally {
      clock.dispose();
    }
  });

  it("refreshes from the same simulation source on visibility/media changes and unsubscribes", () => {
    let hidden = false;
    let reduced = false;
    let visibility = () => {};
    let media = () => {};
    const unsubscribeVisibility = vi.fn();
    const unsubscribeMedia = vi.fn();
    const source = resolveRestaurantSolarUtcMs(BANGKOK_REFERENCE_DEFAULTS, "19:00", 0);
    const clock = createSolarClock({}, {
      nowMs: () => source,
      isDocumentHidden: () => hidden,
      isReducedMotionOrPrint: () => reduced,
      subscribeVisibility: (cb) => { visibility = cb; return unsubscribeVisibility; },
      subscribeMedia: (cb) => { media = cb; return unsubscribeMedia; },
    });
    clock.start();
    hidden = true;
    visibility();
    expect(clock.getSnapshot().hidden).toBe(true);
    hidden = false;
    visibility();
    reduced = true;
    media();
    expect(clock.getSnapshot().reducedMotionOrPrint).toBe(true);
    expect(clock.getSnapshot().effectiveUtcMs).toBe(source);
    clock.dispose();
    expect(unsubscribeVisibility).toHaveBeenCalledOnce();
    expect(unsubscribeMedia).toHaveBeenCalledOnce();
  });
});
