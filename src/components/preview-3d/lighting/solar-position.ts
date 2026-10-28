/**
 * Pure TypeScript NOAA Solar Position Calculator (`feat-120`).
 *
 * Computes solar elevation (altitude), solar azimuth (0° = North, 90° = East, 180° = South, 270° = West),
 * solar phase, and 3D world-space sun vector (`+X = East`, `+Y = Up`, `+Z = South`) from an instant in time,
 * geographic coordinates (`latitude`, `longitude`), and `northOffsetDegrees`.
 *
 * Invariant: World-space sun direction depends ONLY on time, latitude, longitude, and northOffsetDegrees —
 * NEVER on camera `viewRotation`.
 */

export type SolarPhase = "day" | "civil-twilight" | "nautical-twilight" | "night";

export interface SolarObserverConfig {
  /** Geodetic latitude in degrees [-90, 90] (North positive). */
  readonly latitude: number;
  /** Geodetic longitude in degrees [-180, 180] (East positive). */
  readonly longitude: number;
  /**
   * Clockwise angle in degrees from layout top (-Z / layout North) to true geographic North.
   * Default `0` means layout North (-Z) points to true North.
   */
  readonly northOffsetDegrees?: number;
}

export interface WorldVector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface SolarPositionResult {
  /** UTC epoch milliseconds used for the calculation. */
  readonly timestampMs: number;
  /** Clamped observer latitude in degrees [-90, 90]. */
  readonly latitude: number;
  /** Clamped observer longitude in degrees [-180, 180]. */
  readonly longitude: number;
  /** Normalized north offset in degrees [-180, 180]. */
  readonly northOffsetDegrees: number;
  /** Solar elevation (altitude) above horizon in degrees [-90, 90] (includes atmospheric refraction near horizon). */
  readonly elevationDegrees: number;
  /** True geographic solar azimuth in degrees [0, 360) clockwise from true North (0=N, 90=E, 180=S, 270=W). */
  readonly azimuthDegrees: number;
  /** Solar azimuth in layout world space [0, 360) clockwise from layout North (-Z), incorporating northOffsetDegrees. */
  readonly layoutAzimuthDegrees: number;
  /** Solar declination angle in degrees. */
  readonly declinationDegrees: number;
  /** Equation of time in minutes. */
  readonly equationOfTimeMinutes: number;
  /** True solar time in minutes [0, 1440). */
  readonly trueSolarTimeMinutes: number;
  /** Qualitative phase of the day from solar elevation. */
  readonly phase: SolarPhase;
  /** Whether the sun disk is above the horizon (`elevationDegrees > -0.833`). */
  readonly isDaylight: boolean;
  /**
   * Unit vector pointing FROM the scene origin TOWARD the sun in layout world space
   * (`+X = East`, `+Y = Up`, `+Z = South`, `-Z = North`).
   */
  readonly sunDirection: WorldVector3;
  /**
   * Unit vector on the horizontal floor plane (`x, z`) pointing in the direction shadows are cast
   * (opposite the sun's horizontal projection).
   */
  readonly shadowFloorDirection: { readonly x: number; readonly z: number };
}

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const MS_PER_DAY = 86_400_000;
const J2000_MS = Date.UTC(2000, 0, 1, 12, 0, 0, 0); // JD 2451545.0

export function clampLatitude(lat: number): number {
  if (!Number.isFinite(lat)) return 13.7563;
  return Math.max(-90, Math.min(90, lat));
}

export function clampLongitude(lon: number): number {
  if (!Number.isFinite(lon)) return 100.5018;
  return Math.max(-180, Math.min(180, lon));
}

export function normalizeSignedDegrees(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  let wrapped = ((deg + 180) % 360 + 360) % 360 - 180;
  if (Object.is(wrapped, -0)) wrapped = 0;
  return wrapped;
}

export function normalizeCompassDegrees(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  const wrapped = ((deg % 360) + 360) % 360;
  return wrapped === 360 ? 0 : wrapped;
}

export function classifySolarPhase(elevationDegrees: number): SolarPhase {
  if (elevationDegrees > 0) return "day";
  if (elevationDegrees > -6) return "civil-twilight";
  if (elevationDegrees > -12) return "nautical-twilight";
  return "night";
}

/** Approximate NOAA atmospheric refraction correction in degrees for apparent solar elevation. */
function atmosphericRefractionDegrees(trueElevationDegrees: number): number {
  if (trueElevationDegrees > 85) return 0;
  const te = Math.tan(trueElevationDegrees * DEG_TO_RAD);
  let refractionArcSeconds = 0;
  if (trueElevationDegrees > 5) {
    refractionArcSeconds =
      58.1 / te - 0.07 / (te * te * te) + 0.000086 / (te * te * te * te * te);
  } else if (trueElevationDegrees > -0.575) {
    refractionArcSeconds =
      1735 +
      trueElevationDegrees *
        (-518.2 +
          trueElevationDegrees *
            (103.4 + trueElevationDegrees * (-12.79 + trueElevationDegrees * 0.711)));
  } else {
    refractionArcSeconds = -20.774 / te;
  }
  return refractionArcSeconds / 3600;
}

/**
 * Computes solar position using the NOAA solar geometry equations from a UTC Date or epoch milliseconds.
 * Never double-applies timezone offsets because UTC instant + observer longitude uniquely determine solar hour angle.
 */
export function computeSolarPosition(
  instant: Date | number,
  config: SolarObserverConfig,
): SolarPositionResult {
  const rawMs = typeof instant === "number" ? instant : instant.getTime();
  const timestampMs = Number.isFinite(rawMs) ? rawMs : Date.now();
  const latitude = clampLatitude(config.latitude);
  const longitude = clampLongitude(config.longitude);
  const northOffsetDegrees = normalizeSignedDegrees(config.northOffsetDegrees ?? 0);

  // Julian centuries since J2000.0
  const julianDaysSinceJ2000 = (timestampMs - J2000_MS) / MS_PER_DAY;
  const T = julianDaysSinceJ2000 / 36525;

  // Geometric mean longitude of the sun (deg)
  const L0 = normalizeCompassDegrees(280.46646 + T * (36000.76983 + 0.0003032 * T));
  // Geometric mean anomaly of the sun (deg)
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const Mrad = M * DEG_TO_RAD;

  // Eccentricity of Earth's orbit
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);

  // Sun equation of center (deg)
  const C =
    Math.sin(Mrad) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
    Math.sin(2 * Mrad) * (0.019993 - 0.000101 * T) +
    Math.sin(3 * Mrad) * 0.000289;

  // Sun true longitude & apparent longitude
  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136 * T;
  const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(omega * DEG_TO_RAD);

  // Mean obliquity of the ecliptic (deg) & corrected obliquity
  const epsilon0 =
    23 +
    (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const epsilon = epsilon0 + 0.00256 * Math.cos(omega * DEG_TO_RAD);
  const epsRad = epsilon * DEG_TO_RAD;

  // Solar declination
  const sinDec = Math.sin(epsRad) * Math.sin(lambda * DEG_TO_RAD);
  const declinationRad = Math.asin(Math.max(-1, Math.min(1, sinDec)));
  const declinationDegrees = declinationRad * RAD_TO_DEG;

  // Equation of time (minutes)
  const y = Math.tan(epsRad / 2) ** 2;
  const L0rad = L0 * DEG_TO_RAD;
  const eqTimeRad =
    y * Math.sin(2 * L0rad) -
    2 * e * Math.sin(Mrad) +
    4 * e * y * Math.sin(Mrad) * Math.cos(2 * L0rad) -
    0.5 * y * y * Math.sin(4 * L0rad) -
    1.25 * e * e * Math.sin(2 * Mrad);
  const equationOfTimeMinutes = 4 * eqTimeRad * RAD_TO_DEG;

  // UTC minutes of day [0, 1440)
  const dayModMs = ((timestampMs % MS_PER_DAY) + MS_PER_DAY) % MS_PER_DAY;
  const utcMinutes = dayModMs / 60_000;

  // True solar time (minutes)
  const trueSolarTimeMinutes =
    (((utcMinutes + equationOfTimeMinutes + 4 * longitude) % 1440) + 1440) % 1440;

  // Hour angle (degrees, [-180, 180))
  const hourAngleDegrees = trueSolarTimeMinutes / 4 - 180;
  const haRad = hourAngleDegrees * DEG_TO_RAD;
  const latRad = latitude * DEG_TO_RAD;

  // Solar zenith angle
  const cosZenith = Math.max(
    -1,
    Math.min(
      1,
      Math.sin(latRad) * Math.sin(declinationRad) +
        Math.cos(latRad) * Math.cos(declinationRad) * Math.cos(haRad),
    ),
  );
  const zenithRad = Math.acos(cosZenith);
  const zenithDegrees = zenithRad * RAD_TO_DEG;
  const trueElevationDegrees = 90 - zenithDegrees;
  const elevationDegrees = Math.max(
    -90,
    Math.min(90, trueElevationDegrees + atmosphericRefractionDegrees(trueElevationDegrees)),
  );

  // Solar azimuth (degrees clockwise from true North: 0=N, 90=E, 180=S, 270=W)
  const sinZenith = Math.sin(zenithRad);
  let azimuthDegrees = 180;
  if (sinZenith > 1e-6 && Math.cos(latRad) > 1e-6) {
    const cosAz = Math.max(
      -1,
      Math.min(
        1,
        (Math.sin(latRad) * cosZenith - Math.sin(declinationRad)) /
          (Math.cos(latRad) * sinZenith),
      ),
    );
    const baseAz = Math.acos(cosAz) * RAD_TO_DEG;
    azimuthDegrees =
      hourAngleDegrees > 0
        ? normalizeCompassDegrees(baseAz + 180)
        : normalizeCompassDegrees(540 - baseAz);
  }

  // Convert geographic azimuth into layout world azimuth:
  // If northOffsetDegrees = +90 (true North is toward layout East +X), then a sun at geographic North (0°)
  // lies at layout azimuth +90° (+X).
  const layoutAzimuthDegrees = normalizeCompassDegrees(azimuthDegrees + northOffsetDegrees);
  const layoutAzRad = layoutAzimuthDegrees * DEG_TO_RAD;
  const elRad = elevationDegrees * DEG_TO_RAD;

  // Unit vector pointing toward the sun in layout world space (+X = East, +Y = Up, +Z = South, -Z = North)
  const cosEl = Math.cos(elRad);
  const sunX = cosEl * Math.sin(layoutAzRad);
  const sunY = Math.sin(elRad);
  const sunZ = -cosEl * Math.cos(layoutAzRad);
  const len = Math.hypot(sunX, sunY, sunZ) || 1;

  const sunDirection: WorldVector3 = {
    x: Number((sunX / len).toFixed(6)),
    y: Number((sunY / len).toFixed(6)),
    z: Number((sunZ / len).toFixed(6)),
  };

  // Horizontal shadow direction points opposite the sun's horizontal projection
  const horizX = -Math.sin(layoutAzRad);
  const horizZ = Math.cos(layoutAzRad);
  const horizLen = Math.hypot(horizX, horizZ) || 1;
  const shadowFloorDirection = {
    x: Number((horizX / horizLen).toFixed(6)),
    z: Number((horizZ / horizLen).toFixed(6)),
  };

  return {
    timestampMs,
    latitude,
    longitude,
    northOffsetDegrees,
    elevationDegrees: Number(elevationDegrees.toFixed(4)),
    azimuthDegrees: Number(azimuthDegrees.toFixed(4)),
    layoutAzimuthDegrees: Number(layoutAzimuthDegrees.toFixed(4)),
    declinationDegrees: Number(declinationDegrees.toFixed(4)),
    equationOfTimeMinutes: Number(equationOfTimeMinutes.toFixed(4)),
    trueSolarTimeMinutes: Number(trueSolarTimeMinutes.toFixed(4)),
    phase: classifySolarPhase(elevationDegrees),
    isDaylight: elevationDegrees > -0.833,
    sunDirection,
    shadowFloorDirection,
  };
}

