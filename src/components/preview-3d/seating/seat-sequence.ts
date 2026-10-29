/**
 * feat-119 · The sit-down / stand-up sequence, as a pure state machine.
 *
 * Time advances only by the simulation delta the host passes in, so 15 fps and 120 fps take exactly
 * the same number of simulated seconds, and a paused frame (delta 0) freezes every phase including
 * the chair slide. Clip positions are normalised times taken straight from the feat-112 markers, so
 * nothing here depends on an animation finishing.
 *
 * The chair and the hand are tied together by construction: between `pullGrip` and `pullRelease`
 * the chair travels exactly GRIP_TRAVEL — the distance the clip authored the hand to follow — and
 * only the remainder is covered after the hand lets go.
 */
import { CHAIR_PULL, CHAIR_RETURN_DELAY, GRIP_TRAVEL, SEAT_CLIP_SECONDS, SEAT_MARKER_TIMES } from "../seat-motion";

/** Phases this lane drives, matching `SeatingPhase` in the presentation contract. */
export type SeatSequencePhase = "approach" | "pull" | "sit" | "push" | "seated" | "rise-pull" | "rise" | "depart";

export interface SeatSequenceState {
  readonly phase: SeatSequencePhase;
  /** Seconds elapsed inside the current phase. */
  readonly elapsed: number;
  /** Metres the chair sits out from its layout position. */
  readonly chairPull: number;
  /** Metres the body sits out from the layout chair position, along the same axis. */
  readonly outwardOffset: number;
  /** Normalised position in the clip this phase plays; null when no seating clip applies. */
  readonly clipPhase: number | null;
  /** True while the hand is authored to be holding the backrest. */
  readonly handOnBackrest: boolean;
  /** False when the space was too tight and the fallback pose is used instead. */
  readonly usesChairClips: boolean;
  /** True once the body has cleared the chair and the chair may travel home. */
  readonly bodyClear: boolean;
}

export interface SeatSequenceOptions {
  /** Metres the chair may travel, from `chairPullSpace`. */
  readonly effectivePull: number;
  readonly usesChairClips: boolean;
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (value: number) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);

/** Seconds each phase lasts. The chair slide is inside the clip, not a separate wait. */
export function phaseSeconds(phase: SeatSequencePhase): number {
  switch (phase) {
    case "pull": return SEAT_CLIP_SECONDS.PullChair;
    case "sit": return SEAT_CLIP_SECONDS.SitDown;
    case "push": return SEAT_CLIP_SECONDS.PushChair;
    case "rise-pull": return SEAT_CLIP_SECONDS.PushChair;
    case "rise": return SEAT_CLIP_SECONDS.StandUp;
    case "depart": return CHAIR_RETURN_DELAY;
    default: return Infinity;
  }
}

/**
 * Chair travel during PullChair. Flat until the hand grips, exactly GRIP_TRAVEL while it holds,
 * and the remainder once it has let go — so the hand never drags a chair it is not touching.
 */
export function pullChairTravel(clipPhase: number, effectivePull: number): number {
  const { pullGrip, pullRelease } = SEAT_MARKER_TIMES;
  const t = clamp01(clipPhase);
  const target = Math.max(GRIP_TRAVEL, Math.min(CHAIR_PULL, effectivePull));
  if (t <= pullGrip) return 0;
  if (t <= pullRelease) return GRIP_TRAVEL * ((t - pullGrip) / (pullRelease - pullGrip));
  if (target <= GRIP_TRAVEL) return GRIP_TRAVEL;
  return GRIP_TRAVEL + (target - GRIP_TRAVEL) * smooth((t - pullRelease) / (1 - pullRelease));
}

export function createSeatSequence(): SeatSequenceState {
  return {
    phase: "approach", elapsed: 0, chairPull: 0, outwardOffset: 0, clipPhase: null,
    handOnBackrest: false, usesChairClips: true, bodyClear: true,
  };
}

/** What the engine wants this customer to be doing, reduced to the two states that matter here. */
export type SeatIntent = "approach" | "sit" | "leave";

/** Order used for reset and for refusing a backwards jump mid-transition. */
const SEQUENCE: readonly SeatSequencePhase[] = ["approach", "pull", "sit", "push", "seated", "rise-pull", "rise", "depart"];

function nextPhase(phase: SeatSequencePhase, intent: SeatIntent): SeatSequencePhase | null {
  if (intent === "leave") {
    switch (phase) {
      // Interrupted before the body ever left the floor: drop the chair and walk away.
      case "approach": return null;
      case "pull": return "depart";
      case "sit": return "rise";
      case "push":
      case "seated": return "rise-pull";
      case "rise-pull": return "rise";
      case "rise": return "depart";
      case "depart": return null;
    }
  }
  switch (phase) {
    case "approach": return "pull";
    case "pull": return "sit";
    case "sit": return "push";
    case "push": return "seated";
    // The chair is home again, so the sequence is ready for a fresh arrival.
    case "depart": return "approach";
    default: return null;
  }
}

function describe(
  phase: SeatSequencePhase,
  elapsed: number,
  options: SeatSequenceOptions,
): Omit<SeatSequenceState, "phase" | "elapsed"> {
  const pull = Math.max(GRIP_TRAVEL, Math.min(CHAIR_PULL, options.effectivePull));
  const span = phaseSeconds(phase);
  const progress = Number.isFinite(span) && span > 0 ? clamp01(elapsed / span) : 0;
  const shared = { usesChairClips: options.usesChairClips };
  const { pullGrip, pullRelease, pushGrip } = SEAT_MARKER_TIMES;
  switch (phase) {
    case "approach":
      return { ...shared, chairPull: 0, outwardOffset: 0, clipPhase: null, handOnBackrest: false, bodyClear: true };
    case "pull":
      // Without the chair clips the body simply waits where the chair stands.
      return options.usesChairClips
        ? {
          ...shared, chairPull: pullChairTravel(progress, pull), outwardOffset: 0, clipPhase: progress,
          handOnBackrest: progress >= pullGrip && progress <= pullRelease, bodyClear: true,
        }
        : { ...shared, chairPull: 0, outwardOffset: 0, clipPhase: 0, handOnBackrest: false, bodyClear: true };
    case "sit": {
      // The body moves back onto the chair that is now standing out; the chair itself holds still.
      const seatedPull = options.usesChairClips ? pull : 0;
      return {
        ...shared, chairPull: seatedPull, outwardOffset: smooth(progress) * seatedPull,
        clipPhase: progress, handOnBackrest: progress >= SEAT_MARKER_TIMES.sitSupport, bodyClear: false,
      };
    }
    case "push": {
      const seatedPull = options.usesChairClips ? pull : 0;
      const remaining = (1 - smooth(progress)) * seatedPull;
      return {
        ...shared, chairPull: remaining, outwardOffset: remaining, clipPhase: progress,
        handOnBackrest: false, bodyClear: false,
      };
    }
    case "seated":
      return { ...shared, chairPull: 0, outwardOffset: 0, clipPhase: null, handOnBackrest: false, bodyClear: false };
    case "rise-pull": {
      const seatedPull = options.usesChairClips ? pull : 0;
      const travelled = smooth(progress) * seatedPull;
      return {
        ...shared, chairPull: travelled, outwardOffset: travelled,
        // PushChair runs backwards, so its grip marker is mirrored too.
        clipPhase: 1 - progress, handOnBackrest: 1 - progress <= pushGrip, bodyClear: false,
      };
    }
    case "rise": {
      const seatedPull = options.usesChairClips ? pull : 0;
      // The chair stays out while the body stands up and steps back to where the chair used to be.
      return {
        ...shared, chairPull: seatedPull, outwardOffset: (1 - smooth(progress)) * seatedPull,
        clipPhase: progress, handOnBackrest: progress <= SEAT_MARKER_TIMES.standPush, bodyClear: progress >= 1,
      };
    }
    case "depart": {
      // Only now may the chair travel home: the body has already stepped clear of it.
      const seatedPull = options.usesChairClips ? pull : 0;
      return {
        ...shared, chairPull: (1 - smooth(progress)) * seatedPull, outwardOffset: 0, clipPhase: null,
        handOnBackrest: false, bodyClear: true,
      };
    }
  }
}

/**
 * Advances one frame. `deltaSeconds` is simulation time that has already been scaled once, so
 * playback rate and frame rate cannot change how long a phase takes.
 */
export function advanceSeatSequence(
  state: SeatSequenceState,
  deltaSeconds: number,
  intent: SeatIntent,
  options: SeatSequenceOptions,
): SeatSequenceState {
  const delta = Number.isFinite(deltaSeconds) && deltaSeconds > 0 ? deltaSeconds : 0;
  let phase = state.phase;
  let elapsed = state.elapsed + delta;

  // An interruption is applied before time is spent in a phase that is no longer wanted.
  const redirect = intent === "leave" && !["rise-pull", "rise", "depart"].includes(phase);
  if (redirect) {
    const target = nextPhase(phase, "leave");
    if (target === null) {
      return { phase: "approach", elapsed: 0, ...describe("approach", 0, options) };
    }
    if (target !== phase) {
      // Standing up from a half-finished sit resumes from where the body actually is.
      const carried = phase === "sit" && target === "rise"
        ? Math.max(0, phaseSeconds("rise") * (1 - clamp01(state.elapsed / phaseSeconds("sit"))))
        : 0;
      phase = target;
      elapsed = carried + delta;
    }
  }

  // Waiting to be seated costs no clip time, so arriving starts the pull on this very frame.
  if (phase === "approach") {
    if (intent !== "sit") {
      return { phase: "approach", elapsed: 0, ...describe("approach", 0, options) };
    }
    phase = "pull";
    elapsed = delta;
  }

  // Several short phases can complete inside one long frame; none of them is skipped.
  for (let guard = 0; guard < SEQUENCE.length + 1; guard += 1) {
    const span = phaseSeconds(phase);
    if (!Number.isFinite(span) || elapsed < span) break;
    const target = nextPhase(phase, intent === "leave" ? "leave" : "approach");
    if (target === null || target === phase) {
      elapsed = span;
      break;
    }
    elapsed -= span;
    phase = target;
  }

  if (phase === "approach") elapsed = 0;
  return { phase, elapsed, ...describe(phase, Math.max(0, elapsed), options) };
}

/** Snapshot of a sequence at rest, used by reset and when a chair changes occupant. */
export function describeSeatSequence(state: SeatSequenceState, options: SeatSequenceOptions): SeatSequenceState {
  return { phase: state.phase, elapsed: state.elapsed, ...describe(state.phase, state.elapsed, options) };
}

/** True once a sequence has nothing left to animate and its chair is home. */
export function isSequenceIdle(state: SeatSequenceState): boolean {
  return (state.phase === "approach" || state.phase === "depart") && state.chairPull <= 1e-6 && state.bodyClear;
}
