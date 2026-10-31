/**
 * เวลาย่อแบบเกม: นาฬิกาจำลองเร่งตามที่ผู้ใช้เลือก แต่ท่าทางบนภาพ (เดิน นั่ง กิน) ไม่เร่งตาม
 *
 * - ท่าทางเล่นเร็วกว่าคนจริงได้ไม่เกิน VISUAL_MOTION_RATE เท่า (เดินเร็วแบบเกม ไม่วิ่ง)
 * - งานที่มีเวลาในการจำลอง (รับออร์เดอร์ เช็ดโต๊ะ ฯลฯ) ยังสั้นลงตามตัวคูณเวลา เพียงแต่ท่าทางไม่รัว
 * - ภาพพนักงานที่เดินช้ากว่าการจำลองจะค้างหลัง → ชะลอนาฬิกาจำลองลงให้ภาพไล่ทัน
 *   (ไม่ต่ำกว่า MIN_SPEED_FRACTION ของที่เลือก) ถ้ายังไม่ทันจึงค่อยให้เดินเร็วขึ้นเล็กน้อย
 * - พนักงานที่การจำลองเริ่มงานที่โต๊ะแล้ว (เช็ด รับออร์เดอร์ วางจาน) แต่ภาพยังเดินไม่ถึง → ชะลอให้ภาพ
 *   ไปถึงทันเห็นงานนั้นอย่างน้อย MIN_TASK_SHOW_SECONDS (ไม่ต่ำกว่า MIN_TASK_SPEED_FRACTION) — ไม่เสียรายละเอียด
 * ท่าทางไม่ผูกกับนาฬิกา การชะลอจึงไม่ทำให้ใครขยับช้าลง ตัวเลขผลจำลองไม่เปลี่ยนเพราะเวลาจำลองไม่ถูกข้าม
 */

/** ท่าทางบนภาพเร็วกว่าคนจริงได้ไม่เกินกี่เท่า */
export const VISUAL_MOTION_RATE = 1.75;
/** เมื่อชะลอเวลาจนสุดแล้วยังไม่ทัน ให้ท่าเดินเร่งได้ถึงกี่เท่าของคนจริง */
export const MAX_CATCH_UP_MOTION_RATE = 3;
/** ชะลอนาฬิกาได้ต่ำสุดเท่านี้ของความเร็วที่ผู้ใช้เลือก (30× → 20×) */
export const MIN_SPEED_FRACTION = 2 / 3;
/** ชะลอเพื่อให้ทันเห็นงานที่โต๊ะได้ต่ำสุดเท่านี้ของที่เลือก (30× → 7.5×) */
export const MIN_TASK_SPEED_FRACTION = 1 / 4;
/** ภาพพนักงานต้องทันเห็นงานที่โต๊ะอย่างน้อยกี่วินาทีจริง */
export const MIN_TASK_SHOW_SECONDS = 1.5;
/** ภาพพนักงานค้างหลังไม่เกินเท่านี้ (วินาทีจริง) ถือว่าปกติ — ไม่ชะลอ */
export const BACKLOG_TARGET_SECONDS = 2;
/** ค้างหลังถึงเท่านี้ชะลอเต็มที่ */
export const BACKLOG_LIMIT_SECONDS = 6;
/** ลูกค้าเดินเข้าร้านช้ากว่าการจำลองเป็นปกติ (ไม่กระทบงานต่อเนื่อง) — นับเฉพาะส่วนที่เกินนี้ */
export const CUSTOMER_BACKLOG_GRACE_SECONDS = 6;
/** ตัวคูณเวลาเร่งกลับได้ไม่เกินเท่านี้ต่อวินาที (สัดส่วนของที่เลือก) */
const SPEED_RISE_PER_SECOND = 0.06;
/** ชะลอได้เร็วกว่าเร่งกลับ: งานที่โต๊ะสั้น ต้องชะลอให้ทันก่อนงานจบ */
const SPEED_FALL_PER_SECOND = 0.4;
/** ความเร็วท่าเดินที่เร่งไล่เปลี่ยนได้ไม่เกินเท่านี้ต่อวินาที */
const BOOST_CHANGE_PER_SECOND = 0.25;
/** ค่าค้างหลังที่ใช้ตัดสินใจถูกเฉลี่ยราวเท่านี้วินาที — ไม่สะดุ้งตามทุกก้าวที่พนักงานรับงานใหม่ */
const BACKLOG_SMOOTHING_SECONDS = 2;

/** ท่าทางเล่นเร็วกว่าคนจริงกี่เท่าที่ตัวคูณเวลานี้ */
export function motionRate(playback: number): number {
  return Math.max(0, Math.min(playback, VISUAL_MOTION_RATE));
}

export interface PacingState {
  /** ตัวคูณเวลาที่ใช้จริง (วินาทีจำลองต่อวินาทีจริง) */
  speed: number;
  /** ท่าเดินบนภาพเร็วกว่าคนจริงกี่เท่า */
  walkRate: number;
}

export class PacingGovernor {
  private factor = 1;
  private boost = 1;
  private backlog = 0;

  reset() {
    this.factor = 1; this.boost = 1; this.backlog = 0;
  }

  /** สถานะปัจจุบันโดยไม่เดินเวลา */
  state(selected: number): PacingState {
    return this.compose(selected);
  }

  /**
   * @param selected ตัวคูณที่ผู้ใช้เลือก
   * @param backlogSeconds ภาพค้างหลังการจำลองกี่วินาทีจริง (ที่ความเร็วเดินปัจจุบัน)
   * @param dt วินาทีจริงตั้งแต่ครั้งก่อน
   * @param taskSpeedLimit ตัวคูณสูงสุดที่ยังทันให้ภาพพนักงานไปถึงงานที่โต๊ะ (Infinity = ไม่มีงานรอ)
   */
  update(selected: number, backlogSeconds: number, dt: number, taskSpeedLimit = Number.POSITIVE_INFINITY): PacingState {
    if (![selected, backlogSeconds, dt].every(Number.isFinite) || dt <= 0) return this.compose(selected);
    // ความเร็วต่ำจนท่าเดินตามการจำลองได้เองอยู่แล้ว ไม่ต้องคุม
    if (selected <= VISUAL_MOTION_RATE) { this.reset(); return this.compose(selected); }
    const blend = Math.min(1, dt / BACKLOG_SMOOTHING_SECONDS);
    this.backlog += (Math.max(0, backlogSeconds) - this.backlog) * blend;
    const over = (this.backlog - BACKLOG_TARGET_SECONDS) / (BACKLOG_LIMIT_SECONDS - BACKLOG_TARGET_SECONDS);
    const forBacklog = 1 - clamp01(over) * (1 - MIN_SPEED_FRACTION);
    const forTask = Number.isFinite(taskSpeedLimit) ? clamp01(Math.max(MIN_TASK_SPEED_FRACTION, taskSpeedLimit / selected)) : 1;
    const desired = Math.min(forBacklog, forTask);
    this.factor = desired < this.factor
      ? Math.max(desired, this.factor - SPEED_FALL_PER_SECOND * dt)
      : Math.min(desired, this.factor + SPEED_RISE_PER_SECOND * dt);
    // เร่งท่าเดินเฉพาะเมื่อชะลอเวลาจนสุดแล้วยังค้างหลังเกินเพดาน
    const saturated = this.factor <= Math.min(MIN_SPEED_FRACTION, forTask) + 1e-3 && this.backlog > BACKLOG_LIMIT_SECONDS;
    const relaxed = this.backlog < BACKLOG_TARGET_SECONDS;
    const maxBoost = MAX_CATCH_UP_MOTION_RATE / VISUAL_MOTION_RATE;
    const targetBoost = saturated ? maxBoost : relaxed ? 1 : this.boost;
    this.boost = approach(this.boost, targetBoost, BOOST_CHANGE_PER_SECOND * dt);
    return this.compose(selected);
  }

  private compose(selected: number): PacingState {
    if (!(selected > VISUAL_MOTION_RATE)) return { speed: selected, walkRate: Math.max(0, selected) };
    const speed = selected * this.factor;
    return { speed, walkRate: Math.min(speed, motionRate(speed) * this.boost) };
  }
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function approach(value: number, target: number, step: number) {
  return value < target ? Math.min(target, value + step) : Math.max(target, value - step);
}
