import { describe, expect, it } from "vitest";
import {
  CHAIR_PULL,
  CHAIR_RETURN_DELAY,
  CHAIR_SLIDE_SECONDS,
  GRIP_TRAVEL,
  SEAT_CLIP_SECONDS,
  SEAT_MARKER_TIMES,
  createChairSlide,
  startRise,
  startSeat,
  stepChair,
  stepSeat,
  type ChairSlide,
  type SeatEvent,
  type SeatMotion,
} from "./seat-motion";

const DT = 1 / 60;

/** เดินเฟรมจนเกิดเหตุการณ์ หรือครบเวลา — คืนเหตุการณ์และผลเฟรมสุดท้าย */
function runUntil(motion: SeatMotion, chair: ChairSlide, event: SeatEvent, maxSeconds = 10) {
  const offsets: number[] = [];
  for (let t = 0; t < maxSeconds; t += DT) {
    stepChair(chair, DT);
    const frame = stepSeat(motion, chair, DT);
    offsets.push(frame.offset);
    if (frame.event === event) return { frame, offsets };
  }
  throw new Error(`ไม่เกิด ${event}`);
}

describe("จังหวะนั่ง/ลุกเก้าอี้ (3D)", () => {
  it("นั่ง: ดึงเก้าอี้ออกสุดก่อนเริ่มท่านั่ง แล้วดันเก้าอี้พร้อมคนกลับเข้าโต๊ะ", () => {
    const chair = createChairSlide();
    const motion = startSeat(chair, 7, 1, 0.8);
    expect(chair.occupant).toBe(7);

    const { offsets } = runUntil(motion, chair, "sit");
    // ระหว่างดึงเก้าอี้ ลูกค้ายืนอยู่ที่เดิม และยังไม่นั่ง
    expect(offsets.every((o) => o === 0)).toBe(true);
    expect(chair.pull).toBe(1);
    expect(offsets.length * DT).toBeGreaterThanOrEqual(CHAIR_SLIDE_SECONDS - DT);

    // นั่งลงบนเก้าอี้ที่ดึงออกมา แล้วดันเข้า
    for (let t = 0; t < 1 + CHAIR_SLIDE_SECONDS + 0.2; t += DT) {
      stepChair(chair, DT);
      stepSeat(motion, chair, DT);
    }
    expect(motion.phase).toBe("seated");
    expect(chair.pull).toBe(0);
    expect(stepSeat(motion, chair, DT)).toEqual({ offset: 0, seated: true, event: null });
  });

  it("ลุก: เลื่อนเก้าอี้ออกก่อนลุก ลุกเสร็จจึงปล่อยเก้าอี้ให้เลื่อนกลับหลังคนเดินพ้น", () => {
    const chair = createChairSlide();
    const motion = startSeat(chair, 1, 0.5, 0.4);
    runUntil(motion, chair, "sit");
    for (let t = 0; t < 2; t += DT) {
      stepChair(chair, DT);
      stepSeat(motion, chair, DT);
    }
    expect(motion.phase).toBe("seated");

    expect(startRise(motion, chair)).toBe(true);
    const rise = runUntil(motion, chair, "rise");
    expect(rise.frame.offset).toBeCloseTo(CHAIR_PULL);
    // ขณะเลื่อนออก ยังนั่งอยู่บนเก้าอี้ (ระยะเพิ่มตามเก้าอี้)
    expect(rise.offsets.at(-2)!).toBeLessThanOrEqual(CHAIR_PULL);

    const done = runUntil(motion, chair, "done");
    expect(done.frame).toEqual({ offset: 0, seated: false, event: "done" });
    expect(chair.occupant).toBeNull();
    expect(chair.target).toBe(0);
    expect(chair.delay).toBe(CHAIR_RETURN_DELAY);

    // รอให้คนเดินพ้นก่อน แล้วเก้าอี้ค่อยเลื่อนกลับ
    expect(stepChair(chair, CHAIR_RETURN_DELAY / 2)).toBe(false);
    expect(chair.pull).toBe(1);
    for (let t = 0; t < CHAIR_RETURN_DELAY + CHAIR_SLIDE_SECONDS + 0.1; t += DT) stepChair(chair, DT);
    expect(chair.pull).toBe(0);
  });

  it("ถูกเรียกให้ลุกก่อนนั่งทัน: ปล่อยเก้าอี้ทันทีและเดินต่อ", () => {
    const chair = createChairSlide();
    const motion = startSeat(chair, 2, 1, 1);
    stepChair(chair, DT);
    expect(startRise(motion, chair)).toBe(false);
    expect(chair.occupant).toBeNull();
    expect(chair.target).toBe(0);
  });
});

describe("ค่าคงที่ของที่นั่งตรงกับคลิป feat-112", () => {
  it("ระยะดึง ระยะเกาะพนัก ความยาวคลิป และ marker ตรงกับ SEAT_MOTION_PROFILE จริง", async () => {
    const provider = await import("../../../scripts/character-clips/customer-seat.mjs");
    const profile = provider.SEAT_MOTION_PROFILE;
    expect(CHAIR_PULL).toBe(profile.nominalPullDistance);
    expect(GRIP_TRAVEL).toBe(profile.gripTravel);
    expect(GRIP_TRAVEL).toBe(profile.minimumPullDistance);
    expect(SEAT_MARKER_TIMES).toEqual(profile.markerTimes);
    expect([SEAT_MARKER_TIMES.pullGrip, SEAT_MARKER_TIMES.pullRelease]).toEqual(profile.gripWindow);
    expect(SEAT_CLIP_SECONDS.PullChair).toBe(profile.durations.PullChair);
    expect(SEAT_CLIP_SECONDS.PushChair).toBe(profile.durations.PushChair);
    // คลิปไม่เลื่อน root ของโมเดล ระยะถอยจึงเป็นของ controller ฝั่งนี้เท่านั้น
    expect(profile.rootMotion.clipTranslatesRoot).toBe(false);
  });
});
