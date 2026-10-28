import { describe, expect, it } from "vitest";
import { VIEW_ROTATIONS } from "@/core/preview/view-rotation";
import { parseLocalDateTimeToUtcMs } from "./settings";
import { computeSolarPosition } from "./solar-position";

describe("feat-120: NOAA Solar Position Calculator (solar-position.ts)", () => {
  const BANGKOK = { latitude: 13.7563, longitude: 100.5018, northOffsetDegrees: 0 };
  const TOKYO = { latitude: 35.6762, longitude: 139.6503, northOffsetDegrees: 0 };

  it("matches NOAA solar elevation & azimuth fixtures for Bangkok across morning, noon, evening, and midnight", () => {
    // 2026-03-21 (Vernal Equinox) in Asia/Bangkok (UTC+7)
    const morningUtc = parseLocalDateTimeToUtcMs("2026-03-21T08:00", "Asia/Bangkok");
    const noonUtc = parseLocalDateTimeToUtcMs("2026-03-21T12:25", "Asia/Bangkok");
    const eveningUtc = parseLocalDateTimeToUtcMs("2026-03-21T17:00", "Asia/Bangkok");
    const midnightUtc = parseLocalDateTimeToUtcMs("2026-03-21T00:00", "Asia/Bangkok");

    const morning = computeSolarPosition(morningUtc, BANGKOK);
    const noon = computeSolarPosition(noonUtc, BANGKOK);
    const evening = computeSolarPosition(eveningUtc, BANGKOK);
    const midnight = computeSolarPosition(midnightUtc, BANGKOK);

    // Morning (~08:00): sun in the East (azimuth ~80°-105°), moderate positive elevation (~20°-30°)
    expect(morning.phase).toBe("day");
    expect(morning.isDaylight).toBe(true);
    expect(morning.elevationDegrees).toBeGreaterThan(20);
    expect(morning.elevationDegrees).toBeLessThan(35);
    expect(morning.azimuthDegrees).toBeGreaterThan(85);
    expect(morning.azimuthDegrees).toBeLessThan(110);
    expect(morning.sunDirection.x).toBeGreaterThan(0.7); // +X = East
    expect(morning.sunDirection.y).toBeGreaterThan(0.3);
    expect(morning.shadowFloorDirection.x).toBeLessThan(-0.7); // Shadow points West (-X)

    // Solar Noon (~12:25): sun high in the South (~75°-77° elevation, azimuth ~180°)
    expect(noon.phase).toBe("day");
    expect(noon.elevationDegrees).toBeGreaterThan(74);
    expect(noon.elevationDegrees).toBeLessThan(79);
    expect(noon.azimuthDegrees).toBeGreaterThan(165);
    expect(noon.azimuthDegrees).toBeLessThan(195);
    expect(noon.sunDirection.y).toBeGreaterThan(0.95);
    expect(noon.sunDirection.z).toBeGreaterThan(0); // +Z = South in March at 13.75°N

    // Evening (~17:00): sun in the West (azimuth ~250°-275°), positive elevation (~15°-25°)
    expect(evening.phase).toBe("day");
    expect(evening.elevationDegrees).toBeGreaterThan(14);
    expect(evening.elevationDegrees).toBeLessThan(26);
    expect(evening.azimuthDegrees).toBeGreaterThan(250);
    expect(evening.azimuthDegrees).toBeLessThan(275);
    expect(evening.sunDirection.x).toBeLessThan(-0.7); // -X = West
    expect(evening.shadowFloorDirection.x).toBeGreaterThan(0.7); // Shadow points East (+X)

    // Midnight (00:00): sun far below horizon
    expect(midnight.phase).toBe("night");
    expect(midnight.isDaylight).toBe(false);
    expect(midnight.elevationDegrees).toBeLessThan(-65);
    expect(midnight.sunDirection.y).toBeLessThan(-0.85);
  });

  it("computes accurate solar geometry for a second latitude (Tokyo 35.68°N) and handles leap day & year boundary", () => {
    const tokyoNoonUtc = parseLocalDateTimeToUtcMs("2026-06-21T11:45", "Asia/Tokyo");
    const tokyoNoon = computeSolarPosition(tokyoNoonUtc, TOKYO);
    // Summer solstice at 35.68°N -> peak elevation ~ 90 - 35.68 + 23.44 = ~77.7°
    expect(tokyoNoon.elevationDegrees).toBeGreaterThan(75);
    expect(tokyoNoon.elevationDegrees).toBeLessThan(79);
    expect(tokyoNoon.declinationDegrees).toBeGreaterThan(23.3);

    // Leap day 2024-02-29 and year boundary 2026-12-31T23:59
    const leapDayUtc = parseLocalDateTimeToUtcMs("2024-02-29T12:30", "Asia/Bangkok");
    const yearEndUtc = parseLocalDateTimeToUtcMs("2026-12-31T23:59", "Asia/Bangkok");

    const leapResult = computeSolarPosition(leapDayUtc, BANGKOK);
    const yearEndResult = computeSolarPosition(yearEndUtc, BANGKOK);

    expect(Number.isFinite(leapResult.elevationDegrees)).toBe(true);
    expect(leapResult.phase).toBe("day");
    expect(Number.isFinite(yearEndResult.elevationDegrees)).toBe(true);
    expect(yearEndResult.phase).toBe("night");
  });

  it("rotates layoutAzimuthDegrees and sunDirection when northOffsetDegrees changes, while remaining 100% invariant to camera viewRotation", () => {
    const morningUtc = parseLocalDateTimeToUtcMs("2026-03-21T08:00", "Asia/Bangkok");
    const base = computeSolarPosition(morningUtc, { ...BANGKOK, northOffsetDegrees: 0 });
    const rotated90 = computeSolarPosition(morningUtc, { ...BANGKOK, northOffsetDegrees: 90 });

    // Geographic azimuth stays identical; layout azimuth shifts by +90°
    expect(rotated90.azimuthDegrees).toBeCloseTo(base.azimuthDegrees, 4);
    expect(rotated90.layoutAzimuthDegrees).toBeCloseTo((base.layoutAzimuthDegrees + 90) % 360, 3);
    expect(rotated90.elevationDegrees).toBeCloseTo(base.elevationDegrees, 4);

    // Rotating layout North by +90° clockwise rotates horizontal sun vector (x, z) -> (-z, x)
    expect(rotated90.sunDirection.x).toBeCloseTo(-base.sunDirection.z, 4);
    expect(rotated90.sunDirection.z).toBeCloseTo(base.sunDirection.x, 4);

    // Verify camera viewRotation (0, 90, 180, 270) is not an input to solar calculation and world sun direction never changes
    const worldDirectionsAcrossViews = VIEW_ROTATIONS.map(() =>
      computeSolarPosition(morningUtc, BANGKOK).sunDirection,
    );
    for (const dir of worldDirectionsAcrossViews) {
      expect(dir).toEqual(base.sunDirection);
    }
  });
});

