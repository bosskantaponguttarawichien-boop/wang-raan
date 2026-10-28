/**
 * จังหวะนั่ง/ลุกของลูกค้าในมุมมอง 3D (เฉพาะภาพ — simulation รู้แค่ว่านั่งอยู่หรือไม่)
 * นั่ง: ดึงเก้าอี้ออก → นั่งลงบนเก้าอี้ที่ดึงออกมา → เลื่อนเก้าอี้ (พร้อมคนนั่ง) เข้าใต้โต๊ะ
 * ลุก: เลื่อนเก้าอี้ (พร้อมคนนั่ง) ออก → ลุกขึ้น → เดินไป แล้วเก้าอี้เลื่อนกลับเข้าโต๊ะ
 * ระยะทั้งหมดวัดตามแกน "ออกจากโต๊ะ" ของเก้าอี้ (ฝั่งพนักพิง) จากตำแหน่งเก้าอี้ในผัง
 */

/** ดึงเก้าอี้ออกจากโต๊ะเท่านี้ (ม.) */
export const CHAIR_PULL = 0.3;
/** เลื่อนเก้าอี้สุดระยะใช้เวลาเท่านี้ (วินาทีจริง) */
export const CHAIR_SLIDE_SECONDS = 0.45;
/** ลุกเสร็จแล้วรอเท่านี้ก่อนเลื่อนเก้าอี้กลับ — ให้คนเดินพ้นเก้าอี้ก่อน */
export const CHAIR_RETURN_DELAY = 0.35;

export interface ChairSlide {
  /** 0 = อยู่ที่ตำแหน่งในผัง, 1 = ดึงออกสุด */
  pull: number;
  target: number;
  /** วินาทีที่ต้องรอก่อนเริ่มเลื่อน */
  delay: number;
  /** id ลูกค้าที่จองเก้าอี้ตัวนี้อยู่ */
  occupant: number | null;
}

export type SeatPhase = "pull" | "sit" | "push" | "seated" | "rise-pull" | "rise";

export interface SeatMotion {
  phase: SeatPhase;
  /** วินาทีที่ผ่านไปในท่านั่งลง/ลุกขึ้น */
  elapsed: number;
  /** ความยาวท่านั่งลง / ลุกขึ้น (วินาที) */
  sitSeconds: number;
  riseSeconds: number;
}

/** เหตุการณ์ที่ผู้วาดต้องทำต่อ: เริ่มท่านั่ง, เริ่มท่าลุก, ลุกเสร็จ (กลับไปเดินตาม simulation) */
export type SeatEvent = "sit" | "rise" | "done" | null;

export function createChairSlide(): ChairSlide {
  return { pull: 0, target: 0, delay: 0, occupant: null };
}

/** เลื่อนเก้าอี้หนึ่งเฟรม — คืน true ถ้าตำแหน่งเปลี่ยน */
export function stepChair(chair: ChairSlide, dt: number): boolean {
  if (chair.delay > 0) {
    chair.delay = Math.max(0, chair.delay - dt);
    return false;
  }
  if (chair.pull === chair.target) return false;
  const step = dt / CHAIR_SLIDE_SECONDS;
  chair.pull = chair.pull < chair.target ? Math.min(chair.target, chair.pull + step) : Math.max(chair.target, chair.pull - step);
  return true;
}

/** ลูกค้ามาถึงเก้าอี้ — เริ่มดึงเก้าอี้ออก */
export function startSeat(chair: ChairSlide, occupant: number, sitSeconds: number, riseSeconds: number): SeatMotion {
  chair.occupant = occupant;
  chair.target = 1;
  chair.delay = 0;
  return { phase: "pull", elapsed: 0, sitSeconds, riseSeconds };
}

/** simulation บอกให้ลุก — คืน false ถ้ายังไม่ได้นั่ง (ปล่อยเก้าอี้ แล้วเดินต่อได้ทันที) */
export function startRise(motion: SeatMotion, chair: ChairSlide): boolean {
  if (motion.phase === "pull") {
    releaseChair(chair, 0);
    return false;
  }
  if (motion.phase !== "rise") motion.phase = "rise-pull";
  return true;
}

export function releaseChair(chair: ChairSlide, delay = CHAIR_RETURN_DELAY) {
  chair.occupant = null;
  chair.target = 0;
  chair.delay = delay;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/**
 * เดินจังหวะนั่ง/ลุกหนึ่งเฟรม (เรียกหลัง stepChair ของเฟรมนี้)
 * @returns offset ระยะตัวลูกค้าจากตำแหน่งเก้าอี้ในผังตามแกนออกจากโต๊ะ (ม.), seated = อยู่บนเก้าอี้แล้ว
 */
export function stepSeat(motion: SeatMotion, chair: ChairSlide, dt: number): { offset: number; seated: boolean; event: SeatEvent } {
  switch (motion.phase) {
    case "pull":
      // ยืนรอตรงที่เก้าอี้เคยอยู่จนดึงเก้าอี้ออกสุด
      if (chair.pull < 1) return { offset: 0, seated: false, event: null };
      motion.phase = "sit";
      motion.elapsed = 0;
      return { offset: 0, seated: false, event: "sit" };
    case "sit": {
      // นั่งลงพร้อมถอยตัวไปบนเก้าอี้ที่ดึงออกมา
      motion.elapsed += dt;
      const t = Math.min(1, motion.elapsed / Math.max(motion.sitSeconds, 1e-3));
      if (t >= 1) {
        motion.phase = "push";
        chair.target = 0;
      }
      return { offset: smooth(t) * CHAIR_PULL, seated: true, event: null };
    }
    case "push":
      if (chair.pull <= 0) motion.phase = "seated";
      return { offset: chair.pull * CHAIR_PULL, seated: true, event: null };
    case "seated":
      return { offset: chair.pull * CHAIR_PULL, seated: true, event: null };
    case "rise-pull":
      chair.target = 1;
      chair.delay = 0;
      if (chair.pull < 1) return { offset: chair.pull * CHAIR_PULL, seated: true, event: null };
      motion.phase = "rise";
      motion.elapsed = 0;
      return { offset: CHAIR_PULL, seated: true, event: "rise" };
    case "rise": {
      // ลุกขึ้นพร้อมก้าวออกจากเก้าอี้ไปยืนตรงที่เก้าอี้เคยอยู่
      motion.elapsed += dt;
      const t = Math.min(1, motion.elapsed / Math.max(motion.riseSeconds, 1e-3));
      if (t < 1) return { offset: (1 - smooth(t)) * CHAIR_PULL, seated: true, event: null };
      releaseChair(chair);
      return { offset: 0, seated: false, event: "done" };
    }
  }
}
