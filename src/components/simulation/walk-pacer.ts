/**
 * WalkPacer — ให้ภาพลูกค้าเดินด้วยความเร็วคนเดินจริง แม้เวลาในร้านเดินเร็วกว่าเวลาจริงหลายสิบเท่า
 * - เวลาจำลองไม่เปลี่ยน: ใช้ความเร็วของแต่ละคน โดยไม่เร่งไล่ตำแหน่งที่ค้าง
 * - เดินตามทางที่ engine เดินจริง (Simulation.drainPaths) จึงไม่ตัดผ่านโต๊ะ แม้ tick ห่างกันหลายเมตร
 * - นอกร้าน (เฉพาะภาพ — engine เริ่ม/จบที่ช่องประตู): ลูกค้าใหม่เดินมาจากนอกร้านเข้าประตู,
 *   คนที่ยังไม่มีโต๊ะยืนต่อแถวนอกประตู, คนที่กลับเดินออกประตูไปจนพ้นร้านก่อนหายไป
 * ผลลัพธ์อยู่ในรูปแบบเดียวกับ TickMessage.agents เพื่อให้ overlay 2D / isometric / 3D ใช้ได้เหมือนเดิม
 */
import type { Point, StoreLayout, WallDoor } from "@/core/layout";
import { AGENT_STATE_CODE, AGENT_STRIDE } from "@/core/simulation";
import type { PathRefiner } from "@/core/simulation/path-smoothing";
import { entranceSegment } from "@/core/validation";

/** ความเร็วเดินบนภาพ (ม. ต่อวินาทีจริง) ที่ x1 — คูณตามความเร็วเล่นภาพ */
export const VISUAL_WALK_SPEED = 1.2;
export const MAX_QUEUED_WALK_POINTS = 1024;
/** ลูกค้าใหม่เริ่มเดินจากนอกร้านห่างประตูเท่านี้ (ม.) และคนที่กลับเดินออกไปถึงระยะนี้ก่อนหายไป */
export const OUTSIDE_DISTANCE = 3;
/** แถวรอโต๊ะนอกร้าน: คนแรกห่างประตู QUEUE_FIRST ม. คนถัดไปห่างกัน QUEUE_GAP ม. */
export const QUEUE_FIRST = 0.8;
export const QUEUE_GAP = 0.7;
/** จุดที่เดินผ่านประตู: นอกผนังเล็กน้อย */
const DOORSTEP = 0.3;
/**
 * เวลาท่าลุกจากเก้าอี้ (วินาทีท่าทางที่ 1×) = ดันเก้าอี้ออก + ลุกยืน (SEAT_CLIP_SECONDS.PushChair + StandUp
 * ใน preview-3d/seat-motion.ts) — ภาพลูกค้าที่ลุกจากโต๊ะรอเท่านี้ก่อนเริ่มเดิน ไม่งั้นจุดหมายบนจอเดินนำไป
 * หลายเมตรระหว่างที่ตัวยังนั่งอยู่ แล้วตัวละครพุ่งตามไปทันทีที่ลุกเสร็จ (ดูเหมือนวาร์ป)
 */
export const RISE_SECONDS = 1.8;
const SEATED = AGENT_STATE_CODE.seated;

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
  /** วินาทีจริงที่ต้องยืนรอก่อนเดิน (ระหว่างท่าลุกจากเก้าอี้) */
  hold: number;
  /** จุดในคิวก่อนตำแหน่งนี้ (นับเป็นจำนวนตัวเลข x,y) ห้ามตัดทิ้งหรือขยับ เช่นจุดหน้าประตู */
  fixed: number;
}

function decodePaths(paths: Float32Array | undefined): Map<number, Float32Array> {
  const out = new Map<number, Float32Array>();
  if (!paths) return out;
  for (let o = 0; o < paths.length; ) {
    const id = paths[o]!;
    const count = paths[o + 1]!;
    if (!Number.isSafeInteger(count) || count < 0 || o + 2 + count * 2 > paths.length) break;
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
  private overflow = false;
  private refiner: PathRefiner | null = null;
  private motionRate = 1;

  get needsResync() { return this.overflow; }

  /** สิ่งกีดขวางของผังที่กำลังจำลอง — ใช้ทำทางเดินบนจอให้เรียบและไม่เฉียดโต๊ะ (null = เดินตามจุดเดิม) */
  setRefiner(refiner: PathRefiner | null) {
    this.refiner = refiner;
  }

  /** ท่าทางเล่นเร็วกว่าคนจริงกี่เท่า — ใช้แปลงเวลาท่าลุกเป็นวินาทีจริง */
  setMotionRate(rate: number) {
    if (Number.isFinite(rate) && rate > 0) this.motionRate = rate;
  }
  has(id: number) { return this.walkers.has(id); }

  reset() {
    this.walkers.clear();
    this.started = false;
    this.overflow = false;
  }

  /**
   * ลูกค้าที่ยังอยู่ในร้านค้างหลังการจำลองนานสุดกี่วินาทีจริง (คนที่ออกจากร้านแล้วไม่นับ)
   * @param speed ความเร็วเดินบนภาพ (ม./วินาทีจริง) ต่อคน
   */
  backlogSeconds(speed: (id: number) => number): number {
    let worst = 0;
    for (const [id, walker] of this.walkers) {
      if (walker.gone || walker.queue.length === 0) continue;
      const pace = speed(id);
      if (!(pace > 0)) continue;
      let distance = 0;
      let x = walker.x, y = walker.y;
      for (let i = 0; i < walker.queue.length; i += 2) {
        distance += Math.hypot(walker.queue[i]! - x, walker.queue[i + 1]! - y);
        x = walker.queue[i]!; y = walker.queue[i + 1]!;
      }
      worst = Math.max(worst, distance / pace + walker.hold);
    }
    return worst;
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
  update(agents: Float32Array, paths: Float32Array | undefined, dt: number, speed: number | ((id: number) => number)): Float32Array {
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
          hold: 0,
          fixed: 0,
        };
        this.walkers.set(id, walker);
      }
      if (state === WAITING && walker.outside && this.door) {
        // ยืนต่อแถวนอกร้าน — เดินตรงไปช่องของตัวเอง (นอกร้านไม่มีสิ่งกีดขวาง) และขยับตามแถว
        const spot = this.outsidePoint(QUEUE_FIRST + waiting.indexOf(id) * QUEUE_GAP);
        walker.queue.length = 0;
        walker.fixed = 0;
        this.push(walker, spot.x, spot.y);
      } else {
        if (walker.outside && this.door) {
          // เดินผ่านประตูเข้าร้าน แล้วต่อด้วยทางเดินจริงใน engine
          const doorstep = this.outsidePoint(DOORSTEP);
          this.push(walker, doorstep.x, doorstep.y, true);
          walker.outside = false;
        }
        // ลุกจากโต๊ะ: รอท่าลุกบนจอให้จบก่อนออกเดิน
        if (walker.state === SEATED && state !== SEATED && walker.queue.length === 0) this.beginRise(walker);
        if (trail) for (let i = 0; i < trail.length; i += 2) this.push(walker, trail[i]!, trail[i + 1]!);
        this.push(walker, agents[o + 1]!, agents[o + 2]!);
      }
      walker.state = state;
      if (WALKING.has(state)) walker.walkState = state;
    }
    for (const [id, walker] of this.walkers) {
      if (live.has(id) || walker.gone) continue;
      walker.gone = true;
      if (walker.state === SEATED && walker.queue.length === 0) this.beginRise(walker);
      const trail = trails.get(id);
      if (trail) for (let i = 0; i < trail.length; i += 2) this.push(walker, trail[i]!, trail[i + 1]!);
      if (this.door && !walker.outside) {
        // เดินออกประตูไปจนพ้นร้านก่อนหายไป
        const doorstep = this.outsidePoint(DOORSTEP);
        const away = this.outsidePoint(OUTSIDE_DISTANCE, spread(id, 2) * this.door.width);
        this.push(walker, doorstep.x, doorstep.y, true);
        this.push(walker, away.x, away.y, true);
      }
    }
    this.started = true;

    const out: number[] = [];
    for (const [id, walker] of this.walkers) {
      this.move(walker, dt, typeof speed === "number" ? speed : speed(id));
      if (walker.gone && walker.queue.length === 0) {
        this.walkers.delete(id);
        continue;
      }
      out.push(id, walker.x, walker.y, this.displayState(walker));
    }
    return new Float32Array(out);
  }

  private beginRise(walker: Walker) {
    walker.hold = Math.max(walker.hold, RISE_SECONDS / this.motionRate);
  }

  /**
   * ต่อจุดหมายท้ายคิว — ถ้ามีสิ่งกีดขวางของผัง จุดก่อนหน้า (ที่ไม่ใช่จุดตายตัว) ถูกตัดทิ้งเมื่อเดินตรงถึงจุดใหม่ได้
   * (ไม่หักมุมซิกแซกตามกริด) หรือถูกดันให้ห่างโต๊ะเมื่อยังต้องเลี้ยว
   * @param fixed จุดนี้ห้ามตัด/ขยับ (หน้าประตู นอกร้าน)
   */
  private push(walker: Walker, x: number, y: number, fixed = false) {
    this.refine(walker, x, y);
    const n = walker.queue.length;
    const lastX = n > 0 ? walker.queue[n - 2]! : walker.x;
    const lastY = n > 0 ? walker.queue[n - 1]! : walker.y;
    if (Math.hypot(x - lastX, y - lastY) <= 1e-4) {
      if (fixed) walker.fixed = n;
      return;
    }
    if (n >= 4) {
      const ax = walker.queue[n - 4]!, ay = walker.queue[n - 3]!;
      if (n - 2 >= walker.fixed && Math.abs((lastX - ax) * (y - lastY) - (lastY - ay) * (x - lastX)) < 1e-7 && (lastX - ax) * (x - lastX) + (lastY - ay) * (y - lastY) >= 0) {
        walker.queue[n - 2] = x; walker.queue[n - 1] = y;
        if (fixed) walker.fixed = n;
        return;
      }
    }
    if (n >= MAX_QUEUED_WALK_POINTS * 2) { this.overflow = true; return; }
    walker.queue.push(x, y);
    if (fixed) walker.fixed = walker.queue.length;
  }

  /** ทำจุดท้ายคิวให้เรียบก่อนต่อจุดใหม่ (x, y) */
  private refine(walker: Walker, x: number, y: number) {
    const refiner = this.refiner;
    const n = walker.queue.length;
    if (!refiner || n < 2 || n - 2 < walker.fixed) return;
    const bx = walker.queue[n - 2]!, by = walker.queue[n - 1]!;
    const a = n >= 4 ? { x: walker.queue[n - 4]!, y: walker.queue[n - 3]! } : { x: walker.x, y: walker.y };
    const c = { x, y };
    if (Math.hypot(c.x - bx, c.y - by) <= 1e-4) return;
    if (refiner.segmentClear(a, c)) {
      walker.queue.length = n - 2;
      return;
    }
    const moved = refiner.nudge({ x: bx, y: by });
    if ((moved.x !== bx || moved.y !== by) && refiner.segmentClear(a, moved) && refiner.segmentClear(moved, c)) {
      walker.queue[n - 2] = moved.x; walker.queue[n - 1] = moved.y;
    }
  }

  private move(walker: Walker, dt: number, speed: number) {
    const { queue } = walker;
    if (queue.length === 0) return;
    if (walker.hold > 0 && Number.isFinite(dt) && dt > 0) {
      const wait = Math.min(walker.hold, dt);
      walker.hold -= wait;
      dt -= wait;
    }
    let budget = Number.isFinite(speed) && Number.isFinite(dt) ? Math.max(0, speed) * Math.max(0, dt) : 0;
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
    walker.fixed = Math.max(0, walker.fixed - consumed);
  }

  private displayState(walker: Walker): number {
    // ยังอยู่ระหว่างท่าลุก: คงสถานะนั่งไว้ให้ภาพเล่นท่าลุกที่เก้าอี้ให้จบก่อน
    if (walker.hold > 0) return SEATED;
    if (walker.gone) return LEAVING;
    if (walker.queue.length === 0) return walker.state;
    // ยังเดินไม่ถึง: แสดงท่าเดินแทนท่านั่ง/ยืนรอ
    return WALKING.has(walker.state) ? walker.state : walker.walkState;
  }
}
