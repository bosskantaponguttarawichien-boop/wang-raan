/**
 * feat-122 · Frame delta that does not throw time away on a slow machine.
 *
 * The render loop clamps each frame's delta so one long stall cannot teleport a walking character.
 * Clamping alone *loses* the excess, so on a 15 fps machine every animation drifts behind the
 * simulation clock for as long as the frame rate stays low. This keeps the clamped excess as debt
 * and pays it back a little at a time, which closes the gap without a visible jump.
 *
 * Pure: no renderer, no timers. The caller owns `performance.now()`.
 */

/** Largest delta a single frame may advance an animation by (seconds). */
export const MAX_FRAME_DELTA = 0.1;
/** Fraction of a frame's own delta that may additionally be spent repaying debt. */
export const CARRY_RATIO = 0.4;
/**
 * Debt above this is genuinely dropped: past half a second the viewer has seen a stall, and
 * replaying it would contradict the "no catch-up" rule in contract v1 §2.
 */
export const MAX_FRAME_DEBT = 0.5;

export interface FrameStep {
  /** Seconds to advance animations by this frame. */
  readonly seconds: number;
  /** Raw delta the renderer reported, before clamping. */
  readonly realSeconds: number;
  /** Seconds still owed after this frame. */
  readonly debt: number;
  /** True when debt hit the cap and time was dropped rather than repaid. */
  readonly dropped: boolean;
}

export class FrameClock {
  private debt = 0;
  private dropped = false;

  reset() {
    this.debt = 0;
    this.dropped = false;
  }

  get pendingDebt() {
    return this.debt;
  }

  get hasDropped() {
    return this.dropped;
  }

  /**
   * @param realSeconds delta the renderer measured for this frame
   * @param advance false while paused or outside simulation: nothing is spent and nothing accrues
   */
  step(realSeconds: number, advance = true): FrameStep {
    const real = Number.isFinite(realSeconds) && realSeconds > 0 ? realSeconds : 0;
    if (!advance) {
      // A pause is not a stall: the debt is cleared so resuming does not replay it.
      this.debt = 0;
      return { seconds: 0, realSeconds: real, debt: 0, dropped: false };
    }
    const base = Math.min(real, MAX_FRAME_DELTA);
    this.debt += real - base;
    if (this.debt > MAX_FRAME_DEBT) {
      this.debt = MAX_FRAME_DEBT;
      this.dropped = true;
    }
    const repay = Math.min(this.debt, base * CARRY_RATIO);
    this.debt -= repay;
    return { seconds: base + repay, realSeconds: real, debt: this.debt, dropped: this.dropped };
  }
}
