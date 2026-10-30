/**
 * feat-119 · Types for the feat-112 clip provider, imported by this lane's tests only.
 *
 * The runtime keeps its own copies of these numbers in `seat-motion.ts` rather than importing a
 * build script; the unit tests assert the two never drift apart.
 */
declare module "*/character-clips/customer-seat.mjs" {
  export const SEAT_MOTION_PROFILE: {
    chair: { seatTopY: number; backrestTopY: number; backrestZ: number; seatHalfX: number };
    grip: { x: number; y: number; palmLocal: readonly number[] };
    seatPush: readonly number[];
    gripWindow: readonly [number, number];
    gripTravel: number;
    nominalPullDistance: number;
    minimumPullDistance: number;
    rootMotion: { ownedByController: string; clipTranslatesRoot: boolean; clipHipsLateralLimit: number };
    fallback: string;
    markerTimes: Record<string, number>;
    durations: Record<string, number>;
  };
}
