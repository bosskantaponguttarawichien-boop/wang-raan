/**
 * CrowdAvoider — ตัวละครบนจอเบี่ยงตัวหลบกัน และชะลอหลีกทางเมื่อสวนกันในทางแคบ (เฉพาะภาพ)
 *
 * engine และ pacer เดินตามทางของแต่ละคนโดยไม่สนใจคนอื่น ภาพจึงเดินทะลุกันได้ ที่นี่รับตำแหน่งที่ pacer
 * คำนวณแล้ว (ทุก TICK) แล้วเติม "การเบี่ยงด้านข้าง" ให้คนที่กำลังเดิน:
 * - มีคนอยู่ข้างหน้าในระยะ LOOKAHEAD และใกล้แนวเดินเกิน PERSONAL_DISTANCE → เบี่ยงออกด้านที่ห่างจากเขา
 *   สวนกันตรง ๆ ต่างคนต่างเบี่ยงไปทางขวาของตัวเองคนละครึ่ง
 * - เบี่ยงไม่ได้พอ (โต๊ะ/ผนังขวาง) และอีกฝ่ายเดินสวนมา → ฝ่ายที่สิทธิ์น้อยกว่าชะลอรอ
 *   (พนักงานถือถาดก่อนพนักงานอื่น คนเท่ากันให้ id มากกว่าหลีก)
 * - เดินตามหลังคนที่ไปทางเดียวกันใกล้เกิน → ชะลอเว้นระยะ
 * ลูกค้ามาก่อนเสมอ (ผู้ใช้กำหนด 2026-11-05): ลูกค้าเดินตรง ไม่หลบ/อ้อม/ชะลอให้พนักงาน — พนักงานเป็นฝ่ายหลบทั้งหมด
 * - พนักงานที่กำลังเดิน: เบี่ยงหลบลูกค้าเต็มระยะ เจอลูกค้าสวน/ตัดหน้าในทางที่เบี่ยงไม่พอ → หยุดรอ
 * - พนักงานที่ยืนทำงาน: ลูกค้าเดินผ่านมาทางนี้ → เบี่ยงตัวหลบให้ แล้วกลับที่เดิมเมื่อลูกค้าผ่านไป
 * - พนักงานใกล้ถึงจุดทำงาน (เช่นไปเช็ดโต๊ะ) แต่ยังมีลูกค้ากำลังลุก/เดินอยู่ตรงนั้น → หยุดรอห่าง ๆ จนลูกค้าพ้นไป
 * การเบี่ยงลดลงจนเป็น 0 เมื่อใกล้ถึงจุดหมาย (TAPER_DISTANCE) ตัวละครจึงนั่ง/ทำงานตรงตำแหน่งเดิม
 * จุดที่เบี่ยงไปต้องว่างจากเฟอร์นิเจอร์ และอยู่ในห้องห่างกำแพงอย่างน้อย WALL_MARGIN — กริดของผังไม่มีกำแพง
 * (นอกกริดถือว่าว่าง) จึงต้องกันเองที่นี่ ไม่งั้นคนที่หลบชิดกำแพง/เดินผ่านประตูเบี่ยงทะลุกำแพงออกไป
 * ผลจำลองไม่เปลี่ยน: ไม่แตะ engine — การชะลอเป็นตัวคูณความเร็วเดินของภาพใน pacer เท่านั้น
 */
import type { Point } from "@/core/layout/types";
import { AGENT_STATE_CODE, AGENT_STRIDE, STAFF_STATE_CODE, STAFF_STRIDE } from "@/core/simulation";
import { BODY_CLEARANCE } from "@/core/simulation/path-smoothing";
import { STAFF_KITCHEN_CODE } from "../staff-pacer";

/** ระยะห่างกลางตัวถึงกลางตัว (ม.) ที่ถือว่าเดินผ่านกันได้ไม่ชน */
export const PERSONAL_DISTANCE = 0.6;
/** มองคนข้างหน้าไกลเท่านี้ (ม.) — สวนกันเข้าหากันเร็วสองเท่า จึงต้องเริ่มเบี่ยงแต่ไกล */
export const LOOKAHEAD = 2;
/** ใกล้กว่านี้ (ม.) เบี่ยงเต็มที่ */
const FULL_AVOID_AHEAD = 1;
/** ยังหลบคนที่เพิ่งเดินผ่านไปจนเลยไหล่ไปเท่านี้ (ม.) ก่อนกลับเข้าแนวทางเดิน */
const BEHIND = 0.5;
/** เบี่ยงออกจากแนวทางเดินได้มากสุด (ม.) — พอให้อ้อมคนที่ยืนขวางกลางทางได้ทั้งตัว */
export const MAX_OFFSET = PERSONAL_DISTANCE;
/** ระยะก่อนถึงจุดหมาย (ม.) ที่การเบี่ยงค่อย ๆ ลดเป็น 0 */
export const TAPER_DISTANCE = 0.8;
/** จุดที่เบี่ยงไปต้องห่างกำแพงห้องอย่างน้อยเท่านี้ (ม.) — ครึ่งความกว้างไหล่ */
export const WALL_MARGIN = BODY_CLEARANCE;
/** เดินเข้าหากำแพง/ประตูข้างหน้า: เริ่มลดการเบี่ยงตั้งแต่ห่างแนว WALL_MARGIN เท่านี้ (ม.) จะได้กลับเข้าแนวทันก่อนถึง */
export const WALL_TAPER = 0.8;
/** พนักงานรอไม่เข้าจุดทำงานเมื่อมีลูกค้ากำลังลุก/เดินอยู่ใกล้จุดนั้นในรัศมีนี้ (ม.) */
export const STOP_CLEAR_RADIUS = 1;
/** เริ่มรอเมื่อเหลือทางถึงจุดทำงานไม่เกินเท่านี้ (ม.) — ยืนรอห่างโต๊ะ ไม่เดินเข้าไปเบียด */
export const STOP_WAIT_DISTANCE = 1.6;
/** ระยะทางที่เหลือ (ม.) ที่ controller ต้องส่งมาอย่างน้อย — ใช้ดูว่าลูกค้าจะเดินผ่านตัวพนักงานไหม */
export const REMAINING_CAP = LOOKAHEAD + 1;
/** สวนกันใกล้กว่านี้ (ม.) และเบี่ยงไม่พอ → ฝ่ายที่สิทธิ์น้อยกว่าชะลอ */
export const YIELD_DISTANCE = 1.3;
/** ตัวคูณความเร็วตอนหลีกทาง / ตอนเดินตามหลังใกล้เกิน */
export const YIELD_FACTOR = 0.15;
export const FOLLOW_FACTOR = 0.5;
/** ความเร็วขยับด้านข้าง (ม./วินาทีจริง ที่ท่าทาง 1×) */
const LATERAL_SPEED = 1;
/** ตัวคูณความเร็วเข้าหาค่าเป้าหมายเร็วแค่ไหน (ต่อวินาทีจริง ที่ท่าทาง 1×) */
const FACTOR_RATE = 4;
/** ขยับน้อยกว่านี้ (ม.) ใน TICK หนึ่ง = ไม่ได้เดิน (ไม่เปลี่ยนทิศ) */
const MOVE_EPSILON = 1e-3;
/** เหลือทางเดินน้อยกว่านี้ (ม.) = ถึงที่แล้ว */
const ARRIVED = 0.05;
/** สวนกัน = ทิศเดินทำมุมกันเกินราว 107° (cos < −0.3) */
const ONCOMING_COS = -0.3;
/** ไปทางเดียวกัน = ทิศเดินทำมุมกันไม่เกิน 60° */
const SAME_DIRECTION_COS = 0.5;

const SEATED = AGENT_STATE_CODE.seated;

export type SegmentClear = (a: Point, b: Point) => boolean;

export interface CrowdInput {
  /** ตำแหน่งลูกค้าจาก WalkPacer (id, x, y, stateCode) */
  agents: Float32Array;
  /** ตำแหน่งพนักงานจาก StaffPacer (index, x, y, stateCode) */
  staff: Float32Array;
  /** วินาทีจริงตั้งแต่ TICK ก่อน (0 = หยุด/ตั้งต้นใหม่: ไม่ขยับการเบี่ยง) */
  dt: number;
  /** ท่าทางเล่นเร็วกว่าคนจริงกี่เท่า — การเบี่ยงและการชะลอเร็วตามการเดินบนจอ */
  rate: number;
  remainingCustomer(id: number): number;
  remainingStaff(index: number): number;
  /** ลูกค้าคนนี้กำลังลุกจากเก้าอี้ (ภาพยังเป็นท่านั่งแต่กำลังจะเดินออก) */
  customerRising?(id: number): boolean;
  /** จุดที่พนักงานคนนี้จะหยุดถัดไป (จุดทำงาน) — null เมื่อไม่ได้เดินไปไหน */
  staffStop?(index: number): Point | null;
}

export interface CrowdOutput {
  agents: Float32Array;
  staff: Float32Array;
}

type Kind = "customer" | "staff";

interface Memory {
  prevX: number;
  prevY: number;
  dirX: number;
  dirY: number;
  ox: number;
  oy: number;
  factor: number;
}

interface Body {
  key: string;
  kind: Kind;
  id: number;
  /** ตำแหน่งในบัฟเฟอร์ผลลัพธ์ */
  offset: number;
  x: number;
  y: number;
  priority: number;
  moving: boolean;
  remaining: number;
  /** ลูกค้าที่กำลังลุกจากเก้าอี้ (ยังไม่เดิน) */
  rising: boolean;
  /** จุดที่พนักงานจะหยุดถัดไป */
  stop: Point | null;
  memory: Memory;
}

export class CrowdAvoider {
  private readonly memory = new Map<string, Memory>();
  private customerClear: SegmentClear = () => true;
  private staffClear: SegmentClear = () => true;
  private room: { width: number; depth: number } | null = null;

  /** ขนาดห้อง (กำแพงอยู่ที่ 0..width และ 0..depth) — null = ไม่จำกัด */
  setRoom(room: { width: number; depth: number } | null) {
    this.room = room;
  }

  /** เส้นตรงระหว่างสองจุดว่างจากโต๊ะ/ผนังไหม — ลูกค้ากับพนักงานใช้ผังคนละแบบ (พนักงานเข้าหลังเคาน์เตอร์ได้) */
  setClearance(customer: SegmentClear | null, staff: SegmentClear | null) {
    this.customerClear = customer ?? (() => true);
    this.staffClear = staff ?? (() => true);
  }

  reset() {
    this.memory.clear();
  }

  /** ตัวคูณความเร็วเดินบนจอของลูกค้า (1 = ปกติ) — ส่งให้ WalkPacer ใน TICK ถัดไป */
  customerFactor(id: number): number {
    return this.memory.get(`c${id}`)?.factor ?? 1;
  }

  /** ตัวคูณความเร็วเดินบนจอของพนักงาน (1 = ปกติ) — ส่งให้ StaffPacer ใน TICK ถัดไป */
  staffFactor(index: number): number {
    return this.memory.get(`s${index}`)?.factor ?? 1;
  }

  update(input: CrowdInput): CrowdOutput {
    const { dt, rate } = input;
    const stepping = Number.isFinite(dt) && dt > 0 && Number.isFinite(rate) && rate > 0;
    const bodies = this.collect(input, stepping);

    if (stepping) {
      const lateralStep = LATERAL_SPEED * rate * dt;
      const blend = Math.min(1, FACTOR_RATE * rate * dt);
      for (const body of bodies) {
        const { desired, factor } = body.moving ? this.steer(body, bodies)
          : body.kind === "staff" ? { desired: this.makeWay(body, bodies), factor: 1 } : { desired: { x: 0, y: 0 }, factor: 1 };
        const memory = body.memory;
        let dx = desired.x - memory.ox, dy = desired.y - memory.oy;
        const distance = Math.hypot(dx, dy);
        if (distance > lateralStep) { dx *= lateralStep / distance; dy *= lateralStep / distance; }
        memory.ox += dx; memory.oy += dy;
        this.keepClear(body);
        memory.factor += (factor - memory.factor) * blend;
      }
    }

    const agents = input.agents.slice();
    const staff = input.staff.slice();
    for (const body of bodies) {
      const target = body.kind === "customer" ? agents : staff;
      target[body.offset + 1] = body.x + body.memory.ox;
      target[body.offset + 2] = body.y + body.memory.oy;
      body.memory.prevX = body.x; body.memory.prevY = body.y;
    }
    return { agents, staff };
  }

  /** คนที่ยืน/เดินอยู่ในฉาก (ไม่รวมคนนั่งและพนักงานที่อยู่ในครัว) พร้อมทิศเดินล่าสุด */
  private collect(input: CrowdInput, stepping: boolean): Body[] {
    const bodies: Body[] = [];
    const live = new Set<string>();
    const add = (kind: Kind, id: number, offset: number, x: number, y: number, priority: number, remaining: number, rising = false, stop: Point | null = null) => {
      const key = `${kind === "customer" ? "c" : "s"}${id}`;
      live.add(key);
      let memory = this.memory.get(key);
      if (!memory) {
        memory = { prevX: x, prevY: y, dirX: 0, dirY: 0, ox: 0, oy: 0, factor: 1 };
        this.memory.set(key, memory);
      }
      const mx = x - memory.prevX, my = y - memory.prevY;
      const moved = Math.hypot(mx, my);
      if (stepping && moved > MOVE_EPSILON) { memory.dirX = mx / moved; memory.dirY = my / moved; }
      const moving = remaining > ARRIVED && (memory.dirX !== 0 || memory.dirY !== 0);
      bodies.push({ key, kind, id, offset, x, y, priority, moving, remaining, rising, stop, memory });
    };
    for (let o = 0; o < input.agents.length; o += AGENT_STRIDE) {
      const id = input.agents[o]!;
      // คนนั่งไม่นับ ยกเว้นคนที่กำลังลุก — พนักงานต้องรอให้เขาลุกเดินพ้นโต๊ะก่อน
      const rising = input.agents[o + 3] === SEATED && (input.customerRising?.(id) ?? false);
      if (input.agents[o + 3] === SEATED && !rising) continue;
      add("customer", id, o, input.agents[o + 1]!, input.agents[o + 2]!, 1, rising ? 0 : input.remainingCustomer(id), rising);
    }
    for (let o = 0; o < input.staff.length; o += STAFF_STRIDE) {
      const code = input.staff[o + 3]!;
      if (code === STAFF_KITCHEN_CODE) continue;
      const index = input.staff[o]!;
      add("staff", index, o, input.staff[o + 1]!, input.staff[o + 2]!, code === STAFF_STATE_CODE.serving ? 3 : 2, input.remainingStaff(index), false, input.staffStop?.(index) ?? null);
    }
    // คนที่ออกจากฉาก/นั่งลงแล้ว: ลืมการเบี่ยงเก่า (ลุกขึ้นมาใหม่เริ่มจากแนวทางเดินจริง)
    for (const key of this.memory.keys()) if (!live.has(key)) this.memory.delete(key);
    return bodies;
  }

  /** การเบี่ยงที่ต้องการ (เวกเตอร์ ม.) และตัวคูณความเร็วเป้าหมายของคนที่กำลังเดิน */
  private steer(body: Body, bodies: readonly Body[]) {
    const { dirX, dirY } = body.memory;
    // ซ้ายของทิศเดิน; ค่า lateral บวก = ทางซ้าย
    const perpX = -dirY, perpY = dirX;
    let left = 0, right = 0;
    let factor = 1;
    const oncoming: Body[] = [];
    const staffBody = body.kind === "staff";
    for (const other of bodies) {
      if (other === body) continue;
      // ลูกค้าเดินตรง: ไม่หลบ/ไม่ชะลอให้พนักงาน (พนักงานเป็นฝ่ายหลบ)
      if (!staffBody && other.kind === "staff") continue;
      const rx = other.x + other.memory.ox - body.x;
      const ry = other.y + other.memory.oy - body.y;
      const ahead = rx * dirX + ry * dirY;
      const lateral = rx * perpX + ry * perpY;
      if (ahead < -BEHIND || ahead > LOOKAHEAD || Math.abs(lateral) >= PERSONAL_DISTANCE + MAX_OFFSET) continue;
      const cos = other.moving ? dirX * other.memory.dirX + dirY * other.memory.dirY : 0;
      if (other.moving && cos > SAME_DIRECTION_COS) {
        // เดินตามหลังคนที่ไปทางเดียวกัน: ไม่แซงเบียด ชะลอเว้นระยะแทน
        if (ahead > 0 && ahead < PERSONAL_DISTANCE * 1.2 && Math.abs(lateral) < PERSONAL_DISTANCE) factor = Math.min(factor, FOLLOW_FACTOR);
        continue;
      }
      const headOn = other.moving && cos < ONCOMING_COS;
      // ยิ่งใกล้ยิ่งเบี่ยงเต็มที่ ไกลออกไปเริ่มเบี่ยงทีละน้อย
      const weight = ahead <= FULL_AVOID_AHEAD ? 1 : 1 - (ahead - FULL_AVOID_AHEAD) / (LOOKAHEAD - FULL_AVOID_AHEAD);
      // ใช้ตำแหน่งที่อีกฝ่ายเบี่ยงไปแล้ว: สวนกันต่างคนต่างเบี่ยงจนได้ระยะรวม PERSONAL_DISTANCE (คนละครึ่งโดยปริยาย)
      // อยู่ตรงแนวพอดีขณะสวนกัน: ชิดขวาของตัวเองทั้งคู่ จึงผ่านกันได้ไม่ชนกลางทาง
      const goRight = headOn && Math.abs(lateral) < 0.05 ? true : lateral > 0;
      if (goRight) right = Math.min(right, Math.min(0, lateral - PERSONAL_DISTANCE) * weight);
      else left = Math.max(left, Math.max(0, lateral + PERSONAL_DISTANCE) * weight);
      // พนักงานเจอลูกค้าสวนหรือเดินตัดหน้า (ไม่ใช่ไปทางเดียวกัน) ก็ถือว่าขวางทาง
      const blocking = staffBody && other.kind === "customer" && other.moving ? cos < SAME_DIRECTION_COS : headOn;
      if (blocking && ahead < YIELD_DISTANCE) oncoming.push(other);
    }

    const squeezed = left > 0 && right < 0;
    const wanted = squeezed ? (left < -right ? left : right) : left > 0 ? left : right;
    const limit = MAX_OFFSET * Math.min(1, body.remaining / TAPER_DISTANCE, this.wallFactor(body));
    let shift = Math.max(-limit, Math.min(limit, wanted));
    for (let attempt = 0; attempt < 3 && shift !== 0; attempt++) {
      if (this.canShift(body, { x: body.x + perpX * shift, y: body.y + perpY * shift })) break;
      shift = attempt === 1 ? 0 : shift / 2;
    }

    const shortOfRoom = squeezed || Math.abs(wanted) - Math.abs(shift) > 0.15;
    if (shortOfRoom && oncoming.some(other => this.yieldsTo(body, other))) factor = Math.min(factor, YIELD_FACTOR);
    if (staffBody && this.stopOccupied(body, bodies)) factor = 0;
    return { desired: { x: perpX * shift, y: perpY * shift }, factor };
  }

  /** ใครหลีกทาง: พนักงานหลีกให้ลูกค้าเสมอ; ประเภทเดียวกันสิทธิ์น้อยกว่าหลีก ถ้าเท่ากัน id มากกว่าหลีก */
  private yieldsTo(body: Body, other: Body) {
    if (body.kind !== other.kind) return body.kind === "staff";
    if (body.priority !== other.priority) return body.priority < other.priority;
    return body.id > other.id;
  }

  /** พนักงานใกล้ถึงจุดทำงานแล้ว แต่ยังมีลูกค้ากำลังลุก/เดินอยู่ใกล้จุดนั้น → ต้องรอ */
  private stopOccupied(body: Body, bodies: readonly Body[]) {
    const stop = body.stop;
    if (!stop || body.remaining > STOP_WAIT_DISTANCE) return false;
    return bodies.some(other => other.kind === "customer" && (other.moving || other.rising) &&
      Math.hypot(other.x + other.memory.ox - stop.x, other.y + other.memory.oy - stop.y) < STOP_CLEAR_RADIUS);
  }

  /**
   * พนักงานที่ยืนอยู่กับที่: ลูกค้าที่กำลังเดินผ่านแนวที่พนักงานยืน → เบี่ยงตัวออกจากแนวทางเดินของลูกค้า
   * ลูกค้าที่จะหยุดก่อนถึงตัวพนักงาน (เช่นเดินมาสั่งที่เคาน์เตอร์) ไม่ต้องหลบ
   */
  private makeWay(body: Body, bodies: readonly Body[]): Point {
    let best: Point = { x: 0, y: 0 };
    let bestMagnitude = 0;
    for (const other of bodies) {
      if (other.kind !== "customer" || !other.moving) continue;
      const { dirX, dirY } = other.memory;
      const rx = body.x - (other.x + other.memory.ox);
      const ry = body.y - (other.y + other.memory.oy);
      const ahead = rx * dirX + ry * dirY;
      if (ahead < -BEHIND || ahead > LOOKAHEAD || (ahead > 0 && other.remaining < ahead)) continue;
      const perpX = -dirY, perpY = dirX;
      const lateral = rx * perpX + ry * perpY;
      if (Math.abs(lateral) >= PERSONAL_DISTANCE) continue;
      const weight = ahead <= FULL_AVOID_AHEAD ? 1 : 1 - (ahead - FULL_AVOID_AHEAD) / (LOOKAHEAD - FULL_AVOID_AHEAD);
      const need = (PERSONAL_DISTANCE - Math.abs(lateral)) * weight;
      // อยู่กลางแนวพอดี: หลบไปฝั่งที่ว่าง (ลองซ้ายของลูกค้าก่อน)
      let side = Math.abs(lateral) < 0.05 ? 1 : Math.sign(lateral);
      if (Math.abs(lateral) < 0.05 && !this.canShift(body, { x: body.x + perpX * PERSONAL_DISTANCE, y: body.y + perpY * PERSONAL_DISTANCE })) side = -1;
      const shift = Math.min(MAX_OFFSET, need);
      if (shift > bestMagnitude) {
        bestMagnitude = shift;
        best = { x: perpX * side * shift, y: perpY * side * shift };
      }
    }
    for (let attempt = 0; attempt < 3 && bestMagnitude > 0; attempt++) {
      if (this.canShift(body, { x: body.x + best.x, y: body.y + best.y })) return best;
      best = attempt === 1 ? { x: 0, y: 0 } : { x: best.x / 2, y: best.y / 2 };
    }
    return best;
  }

  /** เบี่ยงจากแนวทางเดินไปจุด target ได้ไหม: ทางว่างจากเฟอร์นิเจอร์ และ target อยู่ในห้องห่างกำแพง */
  private canShift(body: Body, target: Point) {
    const clear = body.kind === "customer" ? this.customerClear : this.staffClear;
    return this.insideRoom(target) && clear({ x: body.x, y: body.y }, target);
  }

  private insideRoom(p: Point) {
    const room = this.room;
    if (!room) return true;
    return p.x >= WALL_MARGIN && p.y >= WALL_MARGIN && p.x <= room.width - WALL_MARGIN && p.y <= room.depth - WALL_MARGIN;
  }

  /**
   * 0..1 — ลดการเบี่ยงเมื่อเดินเข้าหากำแพง/ช่องประตูข้างหน้า และไม่เบี่ยงเลยเมื่ออยู่นอกห้องหรือชิดกำแพง
   * (กำลังผ่านประตู, ยืนแถวนอกร้าน) คิดเฉพาะกำแพงที่เดินเข้าหา — เดินขนานกำแพงยังเบี่ยงออกห่างกำแพงได้เต็มที่
   */
  private wallFactor(body: Body) {
    const room = this.room;
    if (!room) return 1;
    if (!this.insideRoom(body)) return 0;
    const { dirX, dirY } = body.memory;
    const toX = dirX > 0 ? (room.width - WALL_MARGIN - body.x) / dirX : dirX < 0 ? (WALL_MARGIN - body.x) / dirX : Infinity;
    const toY = dirY > 0 ? (room.depth - WALL_MARGIN - body.y) / dirY : dirY < 0 ? (WALL_MARGIN - body.y) / dirY : Infinity;
    return Math.max(0, Math.min(1, Math.min(toX, toY) / WALL_TAPER));
  }

  /** การเบี่ยงต้องไม่พาเข้าไปในโต๊ะหรือทะลุกำแพง — ทางแคบลงระหว่างเดิน ลดการเบี่ยงลงทันที */
  private keepClear(body: Body) {
    const memory = body.memory;
    if (memory.ox === 0 && memory.oy === 0) return;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (this.canShift(body, { x: body.x + memory.ox, y: body.y + memory.oy })) return;
      memory.ox /= 2; memory.oy /= 2;
    }
    memory.ox = 0; memory.oy = 0;
  }
}
