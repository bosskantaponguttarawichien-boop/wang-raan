/**
 * WalkPacer — ให้ภาพลูกค้าเดินด้วยความเร็วคนเดินจริง แม้เวลาในร้านเดินเร็วกว่าเวลาจริงหลายสิบเท่า
 * - เวลาจำลองไม่เปลี่ยน: ภาพตามหลังตำแหน่งจริงได้ไม่กี่วินาที แล้วไล่ทันตอนลูกค้านั่ง/ยืนรอ
 * - เดินตามทางที่ engine เดินจริง (Simulation.drainPaths) จึงไม่ตัดผ่านโต๊ะ แม้ tick ห่างกันหลายเมตร
 * - ลูกค้าที่ออกจากร้านไปแล้วยังเดินต่อจนถึงประตูก่อนหายไป
 * ผลลัพธ์อยู่ในรูปแบบเดียวกับ TickMessage.agents เพื่อให้ overlay 2D / isometric / 3D ใช้ได้เหมือนเดิม
 */
import { AGENT_STATE_CODE, AGENT_STRIDE } from "@/core/simulation";

/** ความเร็วเดินบนภาพ (ม. ต่อวินาทีจริง) ที่ x1 — คูณตามความเร็วเล่นภาพ */
export const VISUAL_WALK_SPEED = 1.4;
/** ภาพตามหลังไกลกว่านี้ (วินาทีเดินที่ค้าง) จะเร่งให้ทัน กันภาพหลุดจากการจำลอง */
export const MAX_VISUAL_LAG_SECONDS = 4;

const LEAVING = AGENT_STATE_CODE.leaving;
const WALKING = new Set([AGENT_STATE_CODE["to-counter"], AGENT_STATE_CODE["to-seat"], LEAVING]);

interface Walker {
  x: number;
  y: number;
  /** stateCode ล่าสุดจากการจำลอง */
  state: number;
  /** stateCode ตอนเดินครั้งล่าสุด — ใช้แสดงระหว่างภาพยังเดินไม่ถึง */
  walkState: number;
  /** จุดที่ยังต้องเดินไป (x, y ต่อจุด) */
  queue: number[];
  /** ออกจากร้านในการจำลองแล้ว */
  gone: boolean;
}

function decodePaths(paths: Float32Array | undefined): Map<number, Float32Array> {
  const out = new Map<number, Float32Array>();
  if (!paths) return out;
  for (let o = 0; o < paths.length; ) {
    const id = paths[o]!;
    const count = paths[o + 1]!;
    out.set(id, paths.subarray(o + 2, o + 2 + count * 2));
    o += 2 + count * 2;
  }
  return out;
}

export class WalkPacer {
  private readonly walkers = new Map<number, Walker>();
  private started = false;

  reset() {
    this.walkers.clear();
    this.started = false;
  }

  /**
   * รับตำแหน่งจากการจำลอง แล้วคืนตำแหน่งที่จะแสดง
   * @param dt วินาทีจริงตั้งแต่ครั้งก่อน
   * @param speed ความเร็วเดินบนภาพ (ม./วินาทีจริง)
   */
  update(agents: Float32Array, paths: Float32Array | undefined, dt: number, speed: number): Float32Array {
    const trails = decodePaths(paths);
    const live = new Set<number>();
    for (let o = 0; o < agents.length; o += AGENT_STRIDE) {
      const id = agents[o]!;
      const state = agents[o + 3]!;
      const trail = trails.get(id);
      live.add(id);
      let walker = this.walkers.get(id);
      if (!walker) {
        // คนที่อยู่ในร้านตั้งแต่เริ่มเล่นภาพ แสดงที่ตำแหน่งจริงเลย; คนมาใหม่เริ่มจากจุดแรกที่เดิน (ประตู)
        const fromTrail = this.started && trail && trail.length >= 2;
        walker = {
          x: fromTrail ? trail[0]! : agents[o + 1]!,
          y: fromTrail ? trail[1]! : agents[o + 2]!,
          state,
          walkState: WALKING.has(state) ? state : AGENT_STATE_CODE["to-seat"],
          queue: [],
          gone: false,
        };
        this.walkers.set(id, walker);
      }
      if (trail) for (let i = 0; i < trail.length; i += 2) this.push(walker, trail[i]!, trail[i + 1]!);
      this.push(walker, agents[o + 1]!, agents[o + 2]!);
      walker.state = state;
      if (WALKING.has(state)) walker.walkState = state;
    }
    for (const [id, walker] of this.walkers) {
      if (live.has(id) || walker.gone) continue;
      walker.gone = true;
      const trail = trails.get(id);
      if (trail) for (let i = 0; i < trail.length; i += 2) this.push(walker, trail[i]!, trail[i + 1]!);
    }
    this.started = true;

    const out: number[] = [];
    for (const [id, walker] of this.walkers) {
      this.move(walker, dt, speed);
      if (walker.gone && walker.queue.length === 0) {
        this.walkers.delete(id);
        continue;
      }
      out.push(id, walker.x, walker.y, this.displayState(walker));
    }
    return new Float32Array(out);
  }

  private push(walker: Walker, x: number, y: number) {
    const n = walker.queue.length;
    const lastX = n > 0 ? walker.queue[n - 2]! : walker.x;
    const lastY = n > 0 ? walker.queue[n - 1]! : walker.y;
    if (Math.hypot(x - lastX, y - lastY) > 1e-4) walker.queue.push(x, y);
  }

  private move(walker: Walker, dt: number, speed: number) {
    const { queue } = walker;
    if (queue.length === 0) return;
    let left = 0;
    let px = walker.x;
    let py = walker.y;
    for (let i = 0; i < queue.length; i += 2) {
      left += Math.hypot(queue[i]! - px, queue[i + 1]! - py);
      px = queue[i]!;
      py = queue[i + 1]!;
    }
    // ค้างเกิน MAX_VISUAL_LAG_SECONDS → เร่งให้ระยะที่ค้างหายไปในเวลาราวนั้น
    let budget = Math.max(speed, left / MAX_VISUAL_LAG_SECONDS) * dt;
    let consumed = 0;
    while (consumed < queue.length && budget > 0) {
      const dx = queue[consumed]! - walker.x;
      const dy = queue[consumed + 1]! - walker.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= budget) {
        walker.x = queue[consumed]!;
        walker.y = queue[consumed + 1]!;
        budget -= dist;
        consumed += 2;
      } else {
        walker.x += (dx / dist) * budget;
        walker.y += (dy / dist) * budget;
        budget = 0;
      }
    }
    queue.splice(0, consumed);
  }

  private displayState(walker: Walker): number {
    if (walker.gone) return LEAVING;
    if (walker.queue.length === 0) return walker.state;
    // ยังเดินไม่ถึง: แสดงท่าเดินแทนท่านั่ง/ยืนรอ
    return WALKING.has(walker.state) ? walker.state : walker.walkState;
  }
}
