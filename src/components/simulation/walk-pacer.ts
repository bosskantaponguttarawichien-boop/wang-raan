/**
 * WalkPacer — ให้ภาพลูกค้าเดินด้วยความเร็วคนเดินจริง แม้เวลาในร้านเดินเร็วกว่าเวลาจริงหลายสิบเท่า
 * - เวลาจำลองไม่เปลี่ยน: ภาพตามหลังตำแหน่งจริงได้ไม่กี่วินาที แล้วไล่ทันตอนลูกค้านั่ง/ยืนรอ
 * - เดินตามทางที่ engine เดินจริง (Simulation.drainPaths) จึงไม่ตัดผ่านโต๊ะ แม้ tick ห่างกันหลายเมตร
 * - นอกร้าน (เฉพาะภาพ — engine เริ่ม/จบที่ช่องประตู): ลูกค้าใหม่เดินมาจากนอกร้านเข้าประตู,
 *   คนที่ยังไม่มีโต๊ะยืนต่อแถวนอกประตู, คนที่กลับเดินออกประตูไปจนพ้นร้านก่อนหายไป
 * ผลลัพธ์อยู่ในรูปแบบเดียวกับ TickMessage.agents เพื่อให้ overlay 2D / isometric / 3D ใช้ได้เหมือนเดิม
 */
import type { Point, StoreLayout, WallDoor } from "@/core/layout";
import { AGENT_STATE_CODE, AGENT_STRIDE } from "@/core/simulation";
import { entranceSegment } from "@/core/validation";

/** ความเร็วเดินบนภาพ (ม. ต่อวินาทีจริง) ที่ x1 — คูณตามความเร็วเล่นภาพ */
export const VISUAL_WALK_SPEED = 1.4;
/** ภาพตามหลังไกลกว่านี้ (วินาทีเดินที่ค้าง) จะเร่งให้ทัน กันภาพหลุดจากการจำลอง */
export const MAX_VISUAL_LAG_SECONDS = 4;
/** ลูกค้าใหม่เริ่มเดินจากนอกร้านห่างประตูเท่านี้ (ม.) และคนที่กลับเดินออกไปถึงระยะนี้ก่อนหายไป */
export const OUTSIDE_DISTANCE = 3;
/** แถวรอโต๊ะนอกร้าน: คนแรกห่างประตู QUEUE_FIRST ม. คนถัดไปห่างกัน QUEUE_GAP ม. */
export const QUEUE_FIRST = 0.8;
export const QUEUE_GAP = 0.7;
/** จุดที่เดินผ่านประตู: นอกผนังเล็กน้อย */
const DOORSTEP = 0.3;

const LEAVING = AGENT_STATE_CODE.leaving;
const WAITING = AGENT_STATE_CODE["waiting-entrance"];
const WALKING = new Set([AGENT_STATE_CODE["to-counter"], AGENT_STATE_CODE["to-seat"], LEAVING]);

/** ประตูทางเข้า: จุดกลางช่องประตูบนผนัง, ทิศออกนอกร้าน และทิศตามแนวผนัง (เวกเตอร์หน่วย) */
export interface DoorFrame {
  center: Point;
  outward: Point;
  along: Point;
  /** ความกว้างช่องประตู (ม.) */
  width: number;
}

/** กรอบของช่องประตูบนผนัง (ทางเข้า หรือประตูครัว) — null เมื่อไม่มีประตูนั้น */
export function wallDoorFrame(layout: StoreLayout, door: WallDoor | null): DoorFrame | null {
  const segment = door ? entranceSegment(layout, door) : null;
  if (!segment) return null;
  const { a, b } = segment;
  const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const horizontal = a.y === b.y;
  const outward = horizontal ? { x: 0, y: a.y === 0 ? -1 : 1 } : { x: a.x === 0 ? -1 : 1, y: 0 };
  return { center, outward, along: horizontal ? { x: 1, y: 0 } : { x: 0, y: 1 }, width: Math.hypot(b.x - a.x, b.y - a.y) };
}

/** กรอบประตูทางเข้าร้าน */
export function doorFrame(layout: StoreLayout): DoorFrame | null {
  return wallDoorFrame(layout, layout.entrance);
}

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
  /** ยังอยู่นอกร้าน (ยังไม่ได้เดินผ่านประตูเข้ามา) */
  outside: boolean;
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

/** −1..1 ที่คงที่ต่อคน (ไม่ต้องสุ่มจริง) */
function spread(id: number, salt: number) {
  const v = Math.sin(id * 12.9898 + salt * 78.233) * 43758.5453;
  return (v - Math.floor(v)) * 2 - 1;
}

export class WalkPacer {
  private readonly walkers = new Map<number, Walker>();
  private started = false;
  private door: DoorFrame | null = null;

  reset() {
    this.walkers.clear();
    this.started = false;
  }

  /** ประตูทางเข้าของผังที่กำลังจำลอง — null = ไม่แสดงการเดินนอกร้าน */
  setDoor(door: DoorFrame | null) {
    this.door = door;
  }

  /** จุดนอกร้านห่างประตู `distance` ม. เยื้องตามแนวผนัง `lateral` ม. */
  private outsidePoint(distance: number, lateral = 0): Point {
    const { center, outward, along } = this.door!;
    return { x: center.x + outward.x * distance + along.x * lateral, y: center.y + outward.y * distance + along.y * lateral };
  }

  /**
   * รับตำแหน่งจากการจำลอง แล้วคืนตำแหน่งที่จะแสดง
   * @param dt วินาทีจริงตั้งแต่ครั้งก่อน
   * @param speed ความเร็วเดินบนภาพ (ม./วินาทีจริง)
   */
  update(agents: Float32Array, paths: Float32Array | undefined, dt: number, speed: number): Float32Array {
    const trails = decodePaths(paths);
    const live = new Set<number>();
    // ลำดับในแถวรอโต๊ะ = ลำดับที่มาถึง (id น้อยมาก่อน)
    const waiting: number[] = [];
    for (let o = 0; o < agents.length; o += AGENT_STRIDE) if (agents[o + 3] === WAITING) waiting.push(agents[o]!);
    waiting.sort((a, b) => a - b);

    for (let o = 0; o < agents.length; o += AGENT_STRIDE) {
      const id = agents[o]!;
      const state = agents[o + 3]!;
      const trail = trails.get(id);
      live.add(id);
      let walker = this.walkers.get(id);
      if (!walker) {
        // คนที่อยู่ในร้านตั้งแต่เริ่มเล่นภาพ แสดงที่ตำแหน่งจริงเลย; คนมาใหม่เดินมาจากนอกร้าน (ไม่มีประตูก็เริ่มที่จุดแรกที่เดิน)
        const fromTrail = this.started && trail && trail.length >= 2;
        const start = this.door && this.started ? this.outsidePoint(OUTSIDE_DISTANCE, spread(id, 1) * this.door.width) : null;
        walker = {
          x: start?.x ?? (fromTrail ? trail[0]! : agents[o + 1]!),
          y: start?.y ?? (fromTrail ? trail[1]! : agents[o + 2]!),
          state,
          walkState: WALKING.has(state) ? state : AGENT_STATE_CODE["to-seat"],
          queue: [],
          gone: false,
          outside: start !== null || (this.door !== null && state === WAITING),
        };
        this.walkers.set(id, walker);
      }
      if (state === WAITING && walker.outside && this.door) {
        // ยืนต่อแถวนอกร้าน — เดินตรงไปช่องของตัวเอง (นอกร้านไม่มีสิ่งกีดขวาง) และขยับตามแถว
        const spot = this.outsidePoint(QUEUE_FIRST + waiting.indexOf(id) * QUEUE_GAP);
        walker.queue.length = 0;
        this.push(walker, spot.x, spot.y);
      } else {
        if (walker.outside && this.door) {
          // เดินผ่านประตูเข้าร้าน แล้วต่อด้วยทางเดินจริงใน engine
          const doorstep = this.outsidePoint(DOORSTEP);
          this.push(walker, doorstep.x, doorstep.y);
          walker.outside = false;
        }
        if (trail) for (let i = 0; i < trail.length; i += 2) this.push(walker, trail[i]!, trail[i + 1]!);
        this.push(walker, agents[o + 1]!, agents[o + 2]!);
      }
      walker.state = state;
      if (WALKING.has(state)) walker.walkState = state;
    }
    for (const [id, walker] of this.walkers) {
      if (live.has(id) || walker.gone) continue;
      walker.gone = true;
      const trail = trails.get(id);
      if (trail) for (let i = 0; i < trail.length; i += 2) this.push(walker, trail[i]!, trail[i + 1]!);
      if (this.door && !walker.outside) {
        // เดินออกประตูไปจนพ้นร้านก่อนหายไป
        const doorstep = this.outsidePoint(DOORSTEP);
        const away = this.outsidePoint(OUTSIDE_DISTANCE, spread(id, 2) * this.door.width);
        this.push(walker, doorstep.x, doorstep.y);
        this.push(walker, away.x, away.y);
      }
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
