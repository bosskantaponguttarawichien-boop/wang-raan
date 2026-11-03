/** Wall-clock gap between two ticks that still continues without a resync (seconds). */
export const MAX_WALL_GAP_SECONDS = 2;

/** Authoritative simulation seconds, independent of renderer FPS and TICK arrival jitter. */
export class PlaybackClock {
  private simulationTime: number | null = null;
  private wallTime: number | null = null;

  reset(simulationTime: number | null = null, wallTime: number | null = null) {
    this.simulationTime = simulationTime; this.wallTime = wallTime;
  }

  advance(simulationTime: number, nowMs: number, rate: number, modern = true) {
    if (![simulationTime, nowMs, rate].every(Number.isFinite) || rate <= 0) return { seconds: 0, gap: false };
    const simulationDelta = this.simulationTime === null ? 0 : Math.max(0, simulationTime - this.simulationTime);
    const wallDelta = this.wallTime === null ? 0 : Math.max(0, (nowMs - this.wallTime) / 1000);
    this.simulationTime = simulationTime; this.wallTime = nowMs;
    // Explicit pause/resume or visibility handling owns resynchronisation. Never accelerate.
    const seconds = modern ? simulationDelta / rate : wallDelta;
    // A main-thread stall (GC, model upload) delays delivery but the worker still stepped in small,
    // bounded slices: the simulated delta stays honest, so only a long wall gap forces a resync.
    // Resyncing on every half-second hitch teleported everyone on screen.
    return { seconds, gap: seconds > 0.5 || wallDelta > MAX_WALL_GAP_SECONDS };
  }
}
