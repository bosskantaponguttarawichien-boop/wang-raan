/**
 * ตำแหน่งตัวละครที่ลื่นระหว่าง TICK — ใช้กับภาพ 3D
 *
 * Worker ส่งตำแหน่ง ~20 ครั้ง/วินาที และเวลาที่มาถึงคลาดเคลื่อนได้ (setInterval 50 ms มักเป็น 50–70 ms)
 * เดิมภาพ 3D ใช้ `position.lerp(target, delta * 14)` ไล่เป้าหมายล่าสุด ตัวละครจึงพุ่งทันทีที่ได้เป้าใหม่
 * แล้วช้าลงจนเกือบหยุดก่อน TICK ถัดไป (กระตุก 20 ครั้ง/วินาที) และเร็ว-ช้าตามจังหวะที่ TICK มาถึง
 *
 * ที่นี่เก็บ TICK ล่าสุดไว้สองสามอัน แล้ววาดย้อนหลังเล็กน้อย (ราว 1.5 ช่วง TICK) โดยเฉลี่ยตำแหน่งเป็นเส้นตรง
 * ระหว่างสอง TICK ที่คร่อมเวลานั้น — ระยะที่ pacer เดินในแต่ละ TICK คงที่อยู่แล้ว ภาพจึงเดินความเร็วคงที่จริง
 * ไม่เดาตำแหน่งล่วงหน้า (extrapolate): ถ้า TICK มาช้าเกินช่วงหน่วง ตัวละครหยุดรอที่จุดล่าสุด
 */

/** ค่าต่อคนใน buffer: id, x, y, stateCode */
const STRIDE = 4;
/** เก็บ TICK ล่าสุดไม่เกินเท่านี้ */
const MAX_FRAMES = 8;
/** ช่วงหน่วงการวาด = ช่วง TICK เฉลี่ย × เท่านี้ (เผื่อ TICK มาช้ากว่าปกติครึ่งช่วง) */
const DELAY_INTERVALS = 1.5;
const MIN_DELAY_MS = 40;
const MAX_DELAY_MS = 200;
/** ขยับไกลกว่านี้ (ม.) ภายในหนึ่ง TICK = ตั้งต้นใหม่/ย้ายที่ ไม่เฉลี่ยระหว่างกลาง */
export const MAX_INTERPOLATED_STEP = 1.5;

export interface InterpolatorFrame {
  /** เวลาที่ได้รับ (ms, นาฬิกาเดียวกับที่ส่งให้ sample) */
  readonly at: number;
  readonly agents: Float32Array;
  readonly staff: Float32Array;
}

export interface InterpolatedPositions {
  agents: Float32Array;
  staff: Float32Array;
}

function blend(older: Float32Array, newer: Float32Array, f: number): Float32Array {
  if (f >= 1 || older.length === 0) return newer;
  const index = new Map<number, number>();
  for (let o = 0; o < older.length; o += STRIDE) index.set(older[o]!, o);
  const out = new Float32Array(newer.length);
  for (let o = 0; o < newer.length; o += STRIDE) {
    const id = newer[o]!;
    const x = newer[o + 1]!, y = newer[o + 2]!;
    out[o] = id; out[o + 3] = newer[o + 3]!;
    const from = index.get(id);
    if (from === undefined) { out[o + 1] = x; out[o + 2] = y; continue; }
    const px = older[from + 1]!, py = older[from + 2]!;
    if (Math.hypot(x - px, y - py) > MAX_INTERPOLATED_STEP) { out[o + 1] = x; out[o + 2] = y; continue; }
    out[o + 1] = px + (x - px) * f;
    out[o + 2] = py + (y - py) * f;
  }
  return out;
}

export class FrameInterpolator {
  private frames: InterpolatorFrame[] = [];
  private intervalMs = 50;
  private sampleAt: number | null = null;

  reset() {
    this.frames = [];
    this.intervalMs = 50;
    this.sampleAt = null;
  }

  /** ช่วงหน่วงการวาดปัจจุบัน (ms) */
  get delayMs() {
    return Math.min(MAX_DELAY_MS, Math.max(MIN_DELAY_MS, this.intervalMs * DELAY_INTERVALS));
  }

  /** รับ TICK ใหม่ (เรียกซ้ำด้วย frame เดิมได้ — ไม่นับซ้ำ) */
  push(frame: InterpolatorFrame) {
    const last = this.frames[this.frames.length - 1];
    if (last && (last === frame || (last.agents === frame.agents && last.staff === frame.staff))) return;
    if (last && frame.at > last.at) {
      const interval = frame.at - last.at;
      // ช่วงยาวผิดปกติ (หยุดชั่วคราว/แท็บถูกพัก) ไม่นับเป็นจังหวะ TICK
      if (interval < 500) this.intervalMs += (interval - this.intervalMs) * 0.1;
    }
    if (last && frame.at < last.at) this.frames = [];
    this.frames.push(frame);
    if (this.frames.length > MAX_FRAMES) this.frames.shift();
  }

  /**
   * ตำแหน่งที่จะวาดตอนนี้
   * @param running false = หยุดชั่วคราว: ภาพค้างที่จุดเดิม ไม่ไหลต่อ
   */
  sample(nowMs: number, running = true): InterpolatedPositions | null {
    const frames = this.frames;
    if (frames.length === 0) return null;
    const newest = frames[frames.length - 1]!;
    let time = nowMs - this.delayMs;
    if (!running && this.sampleAt !== null) time = this.sampleAt;
    // เวลาวาดไม่ย้อนหลัง (TICK ที่มาช้าทำให้ช่วงหน่วงเปลี่ยนได้)
    if (this.sampleAt !== null && time < this.sampleAt) time = Math.min(this.sampleAt, newest.at);
    this.sampleAt = time;
    if (frames.length === 1 || time >= newest.at) return { agents: newest.agents, staff: newest.staff };
    if (time <= frames[0]!.at) return { agents: frames[0]!.agents, staff: frames[0]!.staff };
    for (let i = frames.length - 2; i >= 0; i--) {
      const older = frames[i]!;
      if (time < older.at) continue;
      const newer = frames[i + 1]!;
      const span = newer.at - older.at;
      const f = span > 0 ? (time - older.at) / span : 1;
      return { agents: blend(older.agents, newer.agents, f), staff: blend(older.staff, newer.staff, f) };
    }
    return { agents: newest.agents, staff: newest.staff };
  }
}

/**
 * เลื่อนตำแหน่งที่วาดเข้าหาเป้าหมายด้วยความเร็วไม่เกิน `maxSpeed` (ม./วินาที) — ไม่พุ่งตามเป้าที่กระโดด
 * (เช่นตอนลุกจากเก้าอี้แล้วกลับมาเดินตามทาง) ส่วนการกระโดดไกลกว่า `snapDistance` (ตั้งต้นภาพใหม่) วางที่เป้าทันที
 * คืนระยะที่เลื่อนจริง
 */
export function followTarget(
  position: { x: number; z: number },
  target: { x: number; z: number },
  deltaSeconds: number,
  maxSpeed: number,
  snapDistance = 2.5,
): number {
  const dx = target.x - position.x;
  const dz = target.z - position.z;
  const distance = Math.hypot(dx, dz);
  if (distance < 1e-5) return 0;
  const step = Math.max(0, maxSpeed) * Math.max(0, deltaSeconds);
  if (distance > snapDistance || step >= distance) {
    position.x = target.x; position.z = target.z;
    return distance;
  }
  position.x += (dx / distance) * step;
  position.z += (dz / distance) * step;
  return step;
}

/**
 * ไล่ตามเป้าหมายตามทางที่เป้าหมายเดินผ่านมา (ไม่ใช่เส้นตรง) — เมื่อภาพตามหลัง เช่นเพิ่งลุกจากเก้าอี้
 * หรือเครื่องค้าง การไล่เป็นเส้นตรงจะตัดมุมทะลุเคาน์เตอร์/โต๊ะ จึงเก็บจุดที่เป้าหมายผ่านไว้แล้วเดินตามทีละจุด
 */
export class TrailFollower {
  private readonly trail: { x: number; z: number }[] = [];

  /** ล้างทาง (เช่นตอนตัวละครถูกวางที่เก้าอี้) */
  reset() {
    this.trail.length = 0;
  }

  /**
   * @returns ระยะที่เลื่อนจริง
   */
  follow(
    position: { x: number; z: number },
    target: { x: number; z: number },
    deltaSeconds: number,
    maxSpeed: number,
    snapDistance = 2.5,
  ): number {
    const last = this.trail[this.trail.length - 1];
    if (!last || Math.hypot(target.x - last.x, target.z - last.z) > 0.01) this.trail.push({ x: target.x, z: target.z });
    else { last.x = target.x; last.z = target.z; }
    // ทางยาวผิดปกติ (ตั้งต้นภาพใหม่/วาร์ปตั้งใจ) → วางที่เป้าทันที
    let remaining = 0;
    let px = position.x, pz = position.z;
    for (const point of this.trail) { remaining += Math.hypot(point.x - px, point.z - pz); px = point.x; pz = point.z; }
    if (remaining > snapDistance * 2 || this.trail.length > 256 || Math.hypot(target.x - position.x, target.z - position.z) > snapDistance) {
      position.x = target.x; position.z = target.z;
      this.trail.length = 0;
      this.trail.push({ x: target.x, z: target.z });
      return remaining;
    }
    let budget = Math.max(0, maxSpeed) * Math.max(0, deltaSeconds);
    let moved = 0;
    while (budget > 1e-9 && this.trail.length > 0) {
      const next = this.trail[0]!;
      const dx = next.x - position.x, dz = next.z - position.z;
      const distance = Math.hypot(dx, dz);
      if (distance <= budget) {
        position.x = next.x; position.z = next.z;
        budget -= distance; moved += distance;
        // จุดสุดท้าย (= เป้าหมายปัจจุบัน) เก็บไว้เป็นจุดอ้างอิงของเฟรมถัดไป
        if (this.trail.length > 1) this.trail.shift(); else break;
      } else {
        position.x += (dx / distance) * budget; position.z += (dz / distance) * budget;
        moved += budget; budget = 0;
      }
    }
    return moved;
  }
}
