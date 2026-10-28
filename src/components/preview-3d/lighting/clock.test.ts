import { describe, expect, it, vi } from "vitest";
import { SOLAR_CLOCK_CADENCE_MS, createSolarClock } from "./clock";
import { BANGKOK_REFERENCE_DEFAULTS, parseLocalDateTimeToUtcMs } from "./settings";

describe("feat-120: Solar Wall-Clock & Fixed-Time Controller (clock.ts)", () => {
  it("uses Bangkok reference defaults and refreshes on a 60s cadence in realtime mode without coupling to simulation playbackRate", () => {
    vi.useFakeTimers();
    try {
      let fakeNowMs = parseLocalDateTimeToUtcMs("2026-03-21T08:00", "Asia/Bangkok");
      const listener = vi.fn();

      const clock = createSolarClock(
        {},
        {
          nowMs: () => fakeNowMs,
          isDocumentHidden: () => false,
          isReducedMotionOrPrint: () => false,
        },
      );

      expect(clock.getSnapshot().settings).toEqual(BANGKOK_REFERENCE_DEFAULTS);
      clock.subscribe(listener);
      clock.start();

      expect(clock.isRunning()).toBe(true);
      expect(listener).toHaveBeenCalledTimes(1);
      const initialAzimuth = clock.getSnapshot().solar.azimuthDegrees;

      // Advance 59 seconds: should NOT have fired interval yet
      fakeNowMs += 59_000;
      vi.advanceTimersByTime(59_000);
      expect(listener).toHaveBeenCalledTimes(1);

      // Advance 1 more second (total 60s = SOLAR_CLOCK_CADENCE_MS): fires update
      fakeNowMs += 1_000;
      vi.advanceTimersByTime(1_000);
      expect(listener).toHaveBeenCalledTimes(2);
      expect(clock.getSnapshot().effectiveUtcMs).toBe(fakeNowMs);
      expect(clock.getSnapshot().solar.azimuthDegrees).not.toBe(initialAzimuth);

      // Even if simulation were at 30x speed, solar clock only reads wall-clock fakeNowMs
      clock.dispose();
      expect(clock.isRunning()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("supports deterministic fixed mode and updates immediately when settings change", () => {
    vi.useFakeTimers();
    try {
      const fakeNowMs = parseLocalDateTimeToUtcMs("2026-03-21T22:00", "Asia/Bangkok");
      const clock = createSolarClock(
        {
          mode: "fixed",
          fixedDateTimeLocal: "2026-03-21T12:25",
        },
        {
          nowMs: () => fakeNowMs,
          isDocumentHidden: () => false,
          isReducedMotionOrPrint: () => false,
        },
      );

      clock.start();
      // In fixed mode, interval timer does not need to run
      expect(clock.isRunning()).toBe(false);
      // Uses fixedDateTimeLocal (12:25 solar noon) instead of fakeNowMs (22:00 night)
      expect(clock.getSnapshot().solar.phase).toBe("day");
      expect(clock.getSnapshot().solar.elevationDegrees).toBeGreaterThan(70);

      // Updating fixed time to midnight updates snapshot immediately
      const updated = clock.setSettings({ fixedDateTimeLocal: "2026-03-21T00:30" });
      expect(updated.solar.phase).toBe("night");
      expect(updated.solar.elevationDegrees).toBeLessThan(-60);

      clock.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("pauses interval timer when document is hidden or prefers-reduced-motion / print is active, and refreshes upon visibility resume", () => {
    vi.useFakeTimers();
    try {
      let fakeNowMs = parseLocalDateTimeToUtcMs("2026-03-21T09:00", "Asia/Bangkok");
      let hidden = false;
      let reducedMotion = false;
      let visibilityCallback: () => void = () => {};
      let mediaCallback: () => void = () => {};

      const clock = createSolarClock(
        { mode: "realtime" },
        {
          nowMs: () => fakeNowMs,
          isDocumentHidden: () => hidden,
          isReducedMotionOrPrint: () => reducedMotion,
          subscribeVisibility: (cb) => {
            visibilityCallback = cb;
            return () => {
              visibilityCallback = () => {};
            };
          },
          subscribeMedia: (cb) => {
            mediaCallback = cb;
            return () => {
              mediaCallback = () => {};
            };
          },
        },
      );

      clock.start();
      expect(clock.isRunning()).toBe(true);

      // Hide document -> timer stops
      hidden = true;
      visibilityCallback();
      expect(clock.isRunning()).toBe(false);
      expect(clock.getSnapshot().hidden).toBe(true);

      // Time passes while hidden -> no interval ticks
      fakeNowMs += SOLAR_CLOCK_CADENCE_MS * 5;
      vi.advanceTimersByTime(SOLAR_CLOCK_CADENCE_MS * 5);

      // Document becomes visible again -> refreshes immediately to latest wall-clock time and restarts timer
      hidden = false;
      visibilityCallback();
      expect(clock.isRunning()).toBe(true);
      expect(clock.getSnapshot().effectiveUtcMs).toBe(fakeNowMs);

      // Enable prefers-reduced-motion -> stops continuous interval ticking while preserving static solar position
      reducedMotion = true;
      mediaCallback();
      expect(clock.isRunning()).toBe(false);
      expect(clock.getSnapshot().reducedMotionOrPrint).toBe(true);
      expect(clock.getSnapshot().solar.phase).toBe("day");

      clock.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});
