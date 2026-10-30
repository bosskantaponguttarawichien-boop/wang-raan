import { describe, expect, it } from "vitest";
import { CHAIR_PULL, CHAIR_RETURN_DELAY, GRIP_TRAVEL, SEAT_CLIP_SECONDS, SEAT_MARKER_TIMES } from "../seat-motion";
import {
  advanceSeatSequence,
  createSeatSequence,
  isSequenceIdle,
  phaseSeconds,
  pullChairTravel,
  type SeatIntent,
  type SeatSequenceOptions,
  type SeatSequencePhase,
  type SeatSequenceState,
} from "./seat-sequence";

const FULL: SeatSequenceOptions = { effectivePull: CHAIR_PULL, usesChairClips: true };
const TIGHT: SeatSequenceOptions = { effectivePull: GRIP_TRAVEL, usesChairClips: true };
const FALLBACK: SeatSequenceOptions = { effectivePull: GRIP_TRAVEL, usesChairClips: false };

/** Runs the sequence at a fixed frame rate and returns every frame it produced. */
function run(
  seconds: number,
  fps: number,
  intent: SeatIntent | ((elapsed: number) => SeatIntent),
  options: SeatSequenceOptions = FULL,
  from: SeatSequenceState = createSeatSequence(),
): SeatSequenceState[] {
  const dt = 1 / fps;
  const frames: SeatSequenceState[] = [];
  let state = from;
  for (let step = 0; step < Math.round(seconds * fps); step += 1) {
    const at = (step + 1) * dt;
    state = advanceSeatSequence(state, dt, typeof intent === "function" ? intent(at) : intent, options);
    frames.push(state);
  }
  return frames;
}

const SIT_TOTAL = SEAT_CLIP_SECONDS.PullChair + SEAT_CLIP_SECONDS.SitDown + SEAT_CLIP_SECONDS.PushChair;

describe("chair travel is tied to the hand", () => {
  it("moves exactly the grip travel while the hand holds the backrest", () => {
    const { pullGrip, pullRelease } = SEAT_MARKER_TIMES;
    expect(pullChairTravel(pullGrip, CHAIR_PULL)).toBe(0);
    expect(pullChairTravel(pullRelease, CHAIR_PULL)).toBeCloseTo(GRIP_TRAVEL, 6);
    expect(pullChairTravel(1, CHAIR_PULL)).toBeCloseTo(CHAIR_PULL, 6);
  });

  it("holds the chair still before the hand reaches it", () => {
    for (const t of [0, 0.1, 0.21]) expect(pullChairTravel(t, CHAIR_PULL)).toBe(0);
  });

  it("stops at the grip travel when that is all the space there is", () => {
    expect(pullChairTravel(SEAT_MARKER_TIMES.pullRelease, GRIP_TRAVEL)).toBeCloseTo(GRIP_TRAVEL, 6);
    expect(pullChairTravel(1, GRIP_TRAVEL)).toBeCloseTo(GRIP_TRAVEL, 6);
  });

  it("never moves the chair backwards as the clip plays", () => {
    let previous = -1;
    for (let t = 0; t <= 1.0001; t += 0.01) {
      const travel = pullChairTravel(t, CHAIR_PULL);
      expect(travel).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = travel;
    }
  });

  it("keeps the hand on the backrest for the whole grip window and nowhere else", () => {
    const frames = run(SEAT_CLIP_SECONDS.PullChair, 120, "sit");
    const pulling = frames.filter(frame => frame.phase === "pull");
    const held = pulling.filter(frame => frame.handOnBackrest);
    expect(held.length).toBeGreaterThan(0);
    for (const frame of held) {
      expect(frame.clipPhase!).toBeGreaterThanOrEqual(SEAT_MARKER_TIMES.pullGrip - 1e-9);
      expect(frame.clipPhase!).toBeLessThanOrEqual(SEAT_MARKER_TIMES.pullRelease + 1e-9);
    }
    // The chair only ever moves while a hand is on it or after it was released, never before.
    for (const frame of pulling) {
      if (frame.clipPhase! < SEAT_MARKER_TIMES.pullGrip) expect(frame.chairPull).toBe(0);
    }
  });
});

describe("the sit-down sequence", () => {
  it("runs pull → sit → push → seated and ends with the chair tucked back in", () => {
    const frames = run(SIT_TOTAL + 0.5, 60, "sit");
    const order: SeatSequencePhase[] = [];
    for (const frame of frames) if (order.at(-1) !== frame.phase) order.push(frame.phase);
    expect(order).toEqual(["pull", "sit", "push", "seated"]);
    const last = frames.at(-1)!;
    expect(last).toMatchObject({ phase: "seated", chairPull: 0, outwardOffset: 0, clipPhase: null });
  });

  it("keeps the body on the floor while the chair comes out, then moves it onto the chair", () => {
    const frames = run(SIT_TOTAL, 120, "sit");
    for (const frame of frames) {
      if (frame.phase === "pull") expect(frame.outwardOffset).toBe(0);
      // The body is never further out than the chair it is sitting on.
      expect(frame.outwardOffset).toBeLessThanOrEqual(frame.chairPull + 1e-9);
    }
  });

  it("moves the chair and the body continuously, with no jump between phases", () => {
    const frames = run(SIT_TOTAL + 0.2, 120, "sit");
    let chair = 0;
    let body = 0;
    for (const frame of frames) {
      expect(Math.abs(frame.chairPull - chair), `chair at ${frame.phase}`).toBeLessThan(0.02);
      expect(Math.abs(frame.outwardOffset - body), `body at ${frame.phase}`).toBeLessThan(0.02);
      chair = frame.chairPull;
      body = frame.outwardOffset;
    }
  });

  it("takes the same simulated time at every frame rate", () => {
    for (const fps of [15, 24, 30, 60, 120]) {
      const frames = run(SIT_TOTAL + 0.2, fps, "sit");
      const seatedAt = frames.findIndex(frame => frame.phase === "seated");
      expect(seatedAt, `fps ${fps}`).toBeGreaterThan(0);
      expect((seatedAt + 1) / fps).toBeCloseTo(SIT_TOTAL, 1);
    }
  });

  it("does not skip a phase when one frame is longer than the whole clip", () => {
    const state = advanceSeatSequence(createSeatSequence(), 10, "sit", FULL);
    expect(state).toMatchObject({ phase: "seated", chairPull: 0, outwardOffset: 0 });
  });

  it("freezes every phase while the host reports no elapsed time", () => {
    const halfway = run(SEAT_CLIP_SECONDS.PullChair / 2, 60, "sit").at(-1)!;
    let paused = halfway;
    for (let frame = 0; frame < 30; frame += 1) paused = advanceSeatSequence(paused, 0, "sit", FULL);
    expect(paused.phase).toBe(halfway.phase);
    expect(paused.elapsed).toBeCloseTo(halfway.elapsed, 9);
    expect(paused.chairPull).toBeCloseTo(halfway.chairPull, 9);
    expect(paused.outwardOffset).toBeCloseTo(halfway.outwardOffset, 9);
  });
});

describe("standing up", () => {
  const seated = () => run(SIT_TOTAL + 0.1, 120, "sit").at(-1)!;

  it("pulls the chair out again before the body rises, then returns it", () => {
    const frames = run(SEAT_CLIP_SECONDS.PushChair + SEAT_CLIP_SECONDS.StandUp + CHAIR_RETURN_DELAY + 0.3, 120, "leave", FULL, seated());
    const order: SeatSequencePhase[] = [];
    for (const frame of frames) if (order.at(-1) !== frame.phase) order.push(frame.phase);
    expect(order).toEqual(["rise-pull", "rise", "depart"]);
    expect(frames.at(-1)!.chairPull).toBeCloseTo(0, 6);
  });

  it("keeps the chair out until the body has stepped clear of it", () => {
    const frames = run(SEAT_CLIP_SECONDS.PushChair + SEAT_CLIP_SECONDS.StandUp + 0.1, 120, "leave", FULL, seated());
    for (const frame of frames) {
      if (frame.phase === "rise" && !frame.bodyClear) expect(frame.chairPull).toBeCloseTo(CHAIR_PULL, 6);
    }
    const rising = frames.filter(frame => frame.phase === "rise");
    // The body walks back in to where the chair used to stand.
    expect(rising.at(0)!.outwardOffset).toBeCloseTo(CHAIR_PULL, 2);
    expect(rising.at(-1)!.outwardOffset).toBeLessThan(0.02);
  });

  it("only moves the chair home once nothing is sitting on it", () => {
    const frames = run(SEAT_CLIP_SECONDS.PushChair + SEAT_CLIP_SECONDS.StandUp + CHAIR_RETURN_DELAY, 120, "leave", FULL, seated());
    for (const frame of frames) {
      if (frame.chairPull < CHAIR_PULL - 1e-6 && frame.phase === "rise") {
        throw new Error("the chair started home while the customer was still rising");
      }
    }
    const departing = frames.filter(frame => frame.phase === "depart");
    expect(departing.every(frame => frame.bodyClear)).toBe(true);
  });

  it("stands up from a half-finished sit without teleporting", () => {
    const half = run(SEAT_CLIP_SECONDS.PullChair + SEAT_CLIP_SECONDS.SitDown / 2, 120, "sit").at(-1)!;
    expect(half.phase).toBe("sit");
    const next = advanceSeatSequence(half, 1 / 120, "leave", FULL);
    expect(next.phase).toBe("rise");
    expect(Math.abs(next.outwardOffset - half.outwardOffset)).toBeLessThan
      (0.08);
  });

  it("drops the chair and walks away when interrupted before sitting", () => {
    const pulling = run(0.3, 120, "sit").at(-1)!;
    expect(pulling.phase).toBe("pull");
    const frames = run(CHAIR_RETURN_DELAY + 0.2, 120, "leave", FULL, pulling);
    expect(frames.at(0)!.phase).toBe("depart");
    expect(frames.at(-1)!.chairPull).toBeCloseTo(0, 6);
    expect(isSequenceIdle(frames.at(-1)!)).toBe(true);
  });

  it("returns to the start when the customer is cancelled before touching the chair", () => {
    const state = advanceSeatSequence(createSeatSequence(), 1 / 60, "leave", FULL);
    expect(state).toMatchObject({ phase: "approach", chairPull: 0, outwardOffset: 0 });
    expect(isSequenceIdle(state)).toBe(true);
  });
});

describe("tight spaces", () => {
  it("reduces the travel instead of pushing the chair through whatever is behind it", () => {
    const frames = run(SIT_TOTAL, 120, "sit", TIGHT);
    expect(Math.max(...frames.map(frame => frame.chairPull))).toBeCloseTo(GRIP_TRAVEL, 6);
    expect(Math.max(...frames.map(frame => frame.outwardOffset))).toBeCloseTo(GRIP_TRAVEL, 6);
  });

  it("uses the seated fallback when even the grip travel does not fit", () => {
    const frames = run(SIT_TOTAL + 0.2, 120, "sit", FALLBACK);
    expect(frames.every(frame => frame.chairPull === 0)).toBe(true);
    expect(frames.every(frame => frame.outwardOffset === 0)).toBe(true);
    expect(frames.every(frame => frame.usesChairClips === false)).toBe(true);
    expect(frames.at(-1)!.phase).toBe("seated");
  });

  it("still reaches the seated phase in the same time with the fallback", () => {
    const frames = run(SIT_TOTAL + 0.2, 60, "sit", FALLBACK);
    const seatedAt = frames.findIndex(frame => frame.phase === "seated");
    expect((seatedAt + 1) / 60).toBeCloseTo(SIT_TOTAL, 1);
  });
});

describe("phase durations", () => {
  it("matches the published clip lengths", () => {
    expect(phaseSeconds("pull")).toBe(SEAT_CLIP_SECONDS.PullChair);
    expect(phaseSeconds("sit")).toBe(SEAT_CLIP_SECONDS.SitDown);
    expect(phaseSeconds("push")).toBe(SEAT_CLIP_SECONDS.PushChair);
    expect(phaseSeconds("rise")).toBe(SEAT_CLIP_SECONDS.StandUp);
    expect(phaseSeconds("depart")).toBe(CHAIR_RETURN_DELAY);
    expect(phaseSeconds("seated")).toBe(Infinity);
  });
});
