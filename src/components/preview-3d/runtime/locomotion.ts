/**
 * ความเร็วเดินบนจอที่ใช้เลือกท่า Walk/Idle และตั้งจังหวะก้าว — ใช้ร่วมกันทั้งลูกค้าและพนักงาน
 *
 * เดิมวัดความเร็วจากระยะที่ขยับในเฟรมเดียวแล้วใช้ตรง ๆ: จังหวะขาจึงเร็ว-ช้าสลับไปตามการกระตุกของตำแหน่ง
 * และเกณฑ์หยุดเดินค่าเดียว (0.02 ม./วิ) ทำให้ท่าสลับ Walk ↔ Idle ถี่ ๆ ตอนชะลอเข้าเป้า
 * - เฉลี่ยความเร็วแบบ exponential (~SPEED_SMOOTHING_SECONDS)
 * - เริ่มเดินเมื่อเร็วกว่า START_WALK_SPEED หยุดเดินเมื่อช้ากว่า STOP_WALK_SPEED (สองเกณฑ์ ไม่สลับไปมา)
 * - หมุนตัวอยู่กับที่ก็นับเป็นการขยับเท้า (ก้าวหมุนตัว) ไม่หมุนลอย ๆ ด้วยท่ายืน
 */

/** เวลาเฉลี่ยความเร็ว (วินาที) */
export const SPEED_SMOOTHING_SECONDS = 0.12;
/** เร็วกว่านี้ (ม./วิ) จึงเริ่มเล่นท่าเดิน */
export const START_WALK_SPEED = 0.12;
/** ช้ากว่านี้ (ม./วิ) จึงกลับเป็นท่ายืน */
export const STOP_WALK_SPEED = 0.04;
/** หมุนตัว 1 เรเดียนเท้าขยับราวเท่านี้ (ม.) — ใช้แปลงการหมุนอยู่กับที่เป็นจังหวะก้าว */
export const TURN_STEP_METERS_PER_RADIAN = 0.16;
/** ระยะผสมท่าเมื่อเปลี่ยนคลิป (วินาที) — สั้นพอไม่ให้แขนดูตีกัน แต่ไม่ตัดภาพทันที */
export const CLIP_FADE_SECONDS = 0.18;

const MIN_FRAME_SECONDS = 1e-4;

/**
 * จังหวะก้าวประจำตัว (เดิมทุกคนก้าวเร็วเท่ากันและเริ่มก้าวแรกที่ต้นคลิปพร้อมกัน → เดินเหมือนทหาร)
 * แต่ละคนก้าวถี่/ห่างต่างกันไม่เกิน ±GAIT_CADENCE_VARIATION โดยความเร็วบนพื้นเท่าเดิม (ก้าวยาว/สั้นต่างกันแทน)
 * และเริ่มท่าเดินที่จังหวะต่างกัน — คงที่ต่อคน เล่นซ้ำได้ภาพเดิม
 */
export const GAIT_CADENCE_VARIATION = 0.08;

export interface GaitProfile {
  /** ตัวคูณจังหวะก้าว (1 ± GAIT_CADENCE_VARIATION) */
  cadence: number;
  /** จุดเริ่มในรอบคลิปเดิน 0..1 */
  phase: number;
}

const unit = (value: number) => {
  let h = Math.imul(value | 0, 0x9e3779b1) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 0x1_0000_0000;
};

/** key: renderAgentId ของลูกค้า หรือ -(staffId + 1) ของพนักงาน (ไม่ชนกัน) */
export function gaitProfile(key: number): GaitProfile {
  // ลำดับอัตราส่วนทอง: id ติดกัน (คนในกลุ่มเดียวกัน) ห่างกันในรอบก้าวเสมอ แล้วเหลื่อมอีกเล็กน้อยไม่ให้เป็นแบบแผน
  const spread = key * 0.618_033_988_75 + unit(key ^ 0x5bd1e995) * 0.2;
  return { cadence: 1 + (unit(key) * 2 - 1) * GAIT_CADENCE_VARIATION, phase: ((spread % 1) + 1) % 1 };
}

/** key จังหวะก้าวของพนักงาน — แยกจาก id ลูกค้าที่เริ่มจาก 0 เหมือนกัน */
export const staffGaitKey = (staffId: number) => -(staffId + 1);

export interface LocomotionState {
  lastX: number | null;
  lastZ: number | null;
  lastYaw: number | null;
  /** ความเร็วพื้นที่เฉลี่ยแล้ว (ม./วิ) */
  smoothed: number;
  moving: boolean;
}

export function createLocomotionState(): LocomotionState {
  return { lastX: null, lastZ: null, lastYaw: null, smoothed: 0, moving: false };
}

/**
 * ความเร็วเดินที่จะส่งให้ตัวเลือกท่า: 0 = ยืน (ท่า Idle/Work), มากกว่า 0 = เดินด้วยจังหวะนั้น
 * @param deltaSeconds วินาทีของเฟรมนี้ (0 = หยุดชั่วคราว ไม่เปลี่ยนค่า)
 */
export function measureLocomotion(state: LocomotionState, x: number, z: number, yaw: number, deltaSeconds: number): number {
  if (state.lastX === null || state.lastZ === null || state.lastYaw === null) {
    state.lastX = x; state.lastZ = z; state.lastYaw = yaw;
    return 0;
  }
  if (!(deltaSeconds > MIN_FRAME_SECONDS)) return state.moving ? state.smoothed : 0;
  const moved = Math.hypot(x - state.lastX, z - state.lastZ);
  const turned = Math.abs(Math.atan2(Math.sin(yaw - state.lastYaw), Math.cos(yaw - state.lastYaw)));
  state.lastX = x; state.lastZ = z; state.lastYaw = yaw;
  const raw = (moved + turned * TURN_STEP_METERS_PER_RADIAN) / deltaSeconds;
  // กระโดดไกล (ตั้งต้นภาพใหม่) ไม่ใช่การเดิน — ไม่ให้ดันค่าเฉลี่ยพุ่ง
  const sample = Number.isFinite(raw) && raw < 20 ? raw : state.smoothed;
  state.smoothed += (sample - state.smoothed) * Math.min(1, deltaSeconds / SPEED_SMOOTHING_SECONDS);
  if (state.moving ? state.smoothed < STOP_WALK_SPEED : state.smoothed > START_WALK_SPEED) state.moving = !state.moving;
  return state.moving ? Math.max(state.smoothed, STOP_WALK_SPEED) : 0;
}
