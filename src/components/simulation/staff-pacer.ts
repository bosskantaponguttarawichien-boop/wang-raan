/**
 * StaffPacer — ให้ภาพพนักงานเดินด้วยความเร็วคนเดินจริง และแวะเข้าครัวก่อนเสิร์ฟ (คู่กับ WalkPacer ของลูกค้า)
 * - เวลาจำลองไม่เปลี่ยน: ตำแหน่งจาก engine เป็นจุดหมายที่ต่อคิวไว้ ภาพเดินตามทางเดิมทีละจุดด้วยความเร็วคนเดิน
 * - เดินตามความเร็วที่กำหนด ไม่เร่งไล่คิว; เมื่อคิวเต็มให้ controller จัด resync ที่จุดพัก
 * - รับอาหารที่ประตูครัว = เดินผ่านประตูเข้าไปในครัว หายตัว KITCHEN_SECONDS วินาที แล้วถือถาดออกมาเสิร์ฟ
 * ผลลัพธ์อยู่ในรูปแบบเดียวกับ TickMessage.staff (index, x, y, stateCode) เพื่อให้ overlay 2D / 3D ใช้ได้เหมือนเดิม
 */
import { STAFF_STATE_CODE, STAFF_STRIDE } from "@/core/simulation";
import type { DoorFrame } from "./walk-pacer";
import type { Point } from "@/core/layout/types";

/** หาทางเดินบนผังระหว่างสองจุด ([] = เดินตรงได้/หาทางไม่ได้) */
export type StaffRouter = (from: Point, to: Point) => Point[];

/**
 * รหัสสถานะเฉพาะภาพ: อยู่ในครัว (เลยผนังออกไป) — ผังไม่ต้องวาดพนักงานคนนี้
 * ต่อท้ายรหัสของ engine (STAFF_STATE_CODE) จึงไม่ชนกัน
 */
export const STAFF_KITCHEN_CODE = 5;
/** อยู่ในครัวนานเท่านี้ (วินาทีจริงที่ x1) ก่อนถือถาดออกมา */
export const KITCHEN_SECONDS = 5;
/** เดินพ้นแนวผนังเข้าไปในครัวเท่านี้ (ม.) แล้วจึงหายตัว */
export const KITCHEN_DEPTH = 0.4;
/**
 * จำกัดคิวเส้นทาง โดยไม่ตัดมุมหรือเร่งความเร็วเมื่อคิวมาก
 */
export const MAX_QUEUED_STAFF_POINTS = 1024;

const SERVING = STAFF_STATE_CODE.serving;

/** จุดหมายหนึ่งจุดบนคิวเดิน (hold > 0 = ถึงแล้วยืนรอกี่วินาทีจำลอง) */
interface Step {
  x: number;
  y: number;
  code: number;
  hold: number;
  /** งานที่การจำลองทำอยู่ตอนส่งตำแหน่งนี้มา (null = ว่างงาน) */
  task: string | null;
}

/**
 * ประตูรอของงาน: ภาพพนักงานเริ่มเดินไปทำงานใหม่ได้เมื่อภาพลูกค้าพร้อมแล้ว (เช่นนั่งที่โต๊ะบนจอแล้ว)
 * ไม่งั้นยืนรอที่เดิม — การจำลองล้ำหน้าภาพลูกค้าได้หลายวินาทีที่เวลาเร่ง
 */
export interface StaffTaskGate {
  /** งานปัจจุบันของพนักงานคนนี้ในการจำลอง */
  taskOf(index: number): string | null;
  /** เริ่มงานนี้บนภาพได้แล้วหรือยัง */
  open(taskId: string): boolean;
}

interface Server {
  x: number;
  y: number;
  /** stateCode ที่แสดงอยู่ (ของจุดที่กำลังเดินไป ไม่ใช่ของ engine ที่อาจล้ำหน้าไปแล้ว) */
  code: number;
  queue: Step[];
  /** stateCode ล่าสุดจาก engine — ใช้จับจังหวะที่เริ่มเสิร์ฟ (รับอาหารที่ประตูครัว) */
  simCode: number;
  /** วินาทีจำลองที่ยังต้องยืนรออยู่กับที่ */
  holding: number;
  /** งานที่ภาพกำลังทำอยู่ (งานของจุดที่เดินไปล่าสุด) */
  task: string | null;
  /** งานถัดไปที่ภาพยืนรอให้ประตูเปิดอยู่ (null = ไม่ได้รอ) */
  waiting: string | null;
  /** เข้าครัวไปรับอาหารอยู่ (โหมด metadata) — จุดช่องประตูที่จะเดินออกมา */
  kitchenDoorway: { x: number; y: number } | null;
}

export class StaffPacer {
  private readonly servers = new Map<number, Server>();
  private door: DoorFrame | null = null;
  private overflow = false;
  private router: StaffRouter | null = null;
  private gate: StaffTaskGate | null = null;
  /** งานที่กำลังต่อคิวอยู่ (ของพนักงานที่กำลัง push) */
  private tagging: string | null = null;
  get needsResync() { return this.overflow; }

  /**
   * ตัวหาทางบนผัง — ที่ความเร็วสูง ตำแหน่งจาก engine ห่างกันหลายเมตรต่อ TICK เดินตรงระหว่างจุดจะตัดมุมทะลุ
   * เคาน์เตอร์/โต๊ะ จึงเติมทางเดินจริงเมื่อเส้นตรงไม่ว่าง (null = เดินตรงตามเดิม)
   */
  setRouter(router: StaffRouter | null) {
    this.router = router;
  }

  /** ประตูรอของงาน — null = เดินตามการจำลองทันที */
  setGate(gate: StaffTaskGate | null) {
    this.gate = gate;
  }

  /** งานที่ภาพพนักงานคนนี้ยืนรอให้ลูกค้าพร้อมอยู่ (null = ไม่ได้รอ) */
  waitingTask(index: number): string | null {
    return this.servers.get(index)?.waiting ?? null;
  }

  /** งานที่ภาพพนักงานคนนี้กำลังทำอยู่ (ไม่ใช่งานล่าสุดของการจำลองที่อาจล้ำหน้าไปแล้ว) */
  currentTask(index: number): string | null {
    return this.servers.get(index)?.task ?? null;
  }

  /** งานที่ภาพพนักงานยังไปไม่ถึงจุดรับออเดอร์ (ยืนรอ หรือยังเดินอยู่) */
  pendingOrders(): Set<string> {
    const out = new Set<string>();
    for (const server of this.servers.values()) {
      if (server.waiting) out.add(server.waiting);
      for (const step of server.queue) if (step.task && step.code === STAFF_STATE_CODE["taking-order"]) out.add(step.task);
    }
    return out;
  }

  reset() {
    this.servers.clear();
    this.overflow = false;
  }

  /**
   * ภาพค้างหลังการจำลองนานสุดกี่วินาทีจริง (คนที่ค้างมากที่สุด) — ใช้ชะลอนาฬิกาให้ภาพไล่ทัน
   * @param speed ความเร็วเดินบนภาพ (ม./วินาทีจริง)
   * @param timeScale วินาทีจำลองต่อวินาทีจริง ใช้กับเวลาที่ยืนรอ
   */
  backlogSeconds(speed: number, timeScale: number): number {
    let worst = 0;
    for (const index of this.servers.keys()) worst = Math.max(worst, this.backlogFor(index, speed, timeScale));
    return worst;
  }

  /**
   * ให้ภาพพนักงานหยุดที่จุดนี้ (ที่ต่อคิวไว้แล้ว) นาน `simSeconds` วินาทีจำลองเมื่อเดินถึง — ใช้เล่นท่าวางจาน
   * คืน false เมื่อไม่พบจุดในคิว (ภาพเดินผ่านไปแล้ว)
   */
  holdAt(index: number, x: number, y: number, simSeconds: number): boolean {
    const step = this.servers.get(index)?.queue.find(entry => Math.hypot(entry.x - x, entry.y - y) <= 1e-3);
    if (!step) return false;
    step.hold = Math.max(step.hold, simSeconds);
    return true;
  }

  /** ภาพของพนักงานคนนี้ยังต้องเดิน/ยืนรออีกกี่วินาทีจริงจึงถึงตำแหน่งล่าสุดของการจำลอง */
  backlogFor(index: number, speed: number, timeScale: number): number {
    const server = this.servers.get(index);
    if (!server || !(speed > 0) || !(timeScale > 0)) return 0;
    let distance = 0;
    let hold = server.holding;
    let x = server.x, y = server.y;
    for (const step of server.queue) {
      distance += Math.hypot(step.x - x, step.y - y);
      hold += step.hold;
      x = step.x; y = step.y;
    }
    return distance / speed + hold / timeScale;
  }

  /**
   * ระยะ (ม.) ที่ภาพพนักงานคนนี้ยังต้องเดินก่อนหยุด (ถึงจุดที่ต้องยืนรอ หรือสุดคิว) — 0 เมื่อยืนรออยู่
   * ใช้ลดการเบี่ยงหลบคนอื่นลงให้ถึงจุดทำงานตรงตำแหน่ง (crowd-avoidance)
   */
  remainingDistance(index: number, cap = Infinity): number {
    const server = this.servers.get(index);
    // ยืนรอให้ประตูของงานเปิด = ยืนนิ่ง (ให้หลบทางคนอื่นได้ ไม่ใช่นับเป็นกำลังเดิน)
    if (!server || server.holding > 0 || server.waiting !== null) return 0;
    let distance = 0;
    let x = server.x, y = server.y;
    for (const step of server.queue) {
      distance += Math.hypot(step.x - x, step.y - y);
      x = step.x; y = step.y;
      if (step.hold > 0 || distance >= cap) break;
    }
    return Math.min(distance, cap);
  }

  /** จุดที่ภาพพนักงานคนนี้จะหยุดถัดไป (จุดที่ต้องยืนรอ หรือสุดคิว) — null เมื่อไม่มีทางต้องเดิน */
  nextStop(index: number): Point | null {
    const queue = this.servers.get(index)?.queue;
    if (!queue || queue.length === 0) return null;
    const stop = queue.find(step => step.hold > 0) ?? queue[queue.length - 1]!;
    return { x: stop.x, y: stop.y };
  }

  /** ประตูครัวของผังที่กำลังจำลอง — null = ไม่ต้องแวะเข้าครัว (รับอาหารหน้าประตูเหมือนเดิม) */
  setKitchenDoor(door: DoorFrame | null) {
    this.door = door;
  }

  /**
   * รับตำแหน่งพนักงานจากการจำลอง แล้วคืนตำแหน่งที่จะแสดง
   * @param dt วินาทีจริงตั้งแต่ครั้งก่อน
   * @param speed ความเร็วเดินบนภาพ (ม./วินาทีจริง — คูณความเร็วเล่นภาพมาแล้ว) หรือแยกรายคน (เช่นชะลอหลีกทาง)
   * @param timeScale ตัวคูณความเร็วเล่นภาพ (วินาทีจำลองต่อวินาทีจริง) ใช้กับเวลาที่ยืนรอ
   */
  update(staff: Float32Array, dt: number, speed: number | ((index: number) => number), timeScale = 1, metadataDriven = false): Float32Array {
    const live = new Set<number>();
    for (let o = 0; o < staff.length; o += STAFF_STRIDE) {
      const index = staff[o]!;
      const x = staff[o + 1]!;
      const y = staff[o + 2]!;
      const code = staff[o + 3]!;
      live.add(index);
      this.tagging = this.gate?.taskOf(index) ?? null;
      let server = this.servers.get(index);
      if (!server) {
        // เริ่มเล่นภาพ: พนักงานอยู่ที่ตำแหน่งจริงเลย (ยืนประจำหลังเคาน์เตอร์)
        server = { x, y, code, queue: [], simCode: code, holding: 0, task: this.gate?.taskOf(index) ?? null, waiting: null, kitchenDoorway: null };
        this.servers.set(index, server);
      }
      // Modern metadata already includes kitchen pickup time; do not add a second wait.
      if (!metadataDriven && code === SERVING && server.simCode !== SERVING && this.door) this.enterKitchen(server);
      if (metadataDriven && code === STAFF_KITCHEN_CODE) {
        // รับอาหารในครัว: เดินให้ถึงจุดรับอาหาร → ผ่านช่องประตูเข้าไป แล้วจึงหายตัว
        // (เดิมสถานะ "อยู่ในครัว" ทับจุดที่กำลังเดินไป ตัวจึงหายกลางร้านก่อนถึงประตู)
        if (server.simCode !== STAFF_KITCHEN_CODE) {
          this.push(server, x, y, STAFF_STATE_CODE.walking);
          if (this.door) this.enterKitchen(server, null);
        }
        server.simCode = code;
        continue;
      }
      // ออกจากครัว: โผล่ที่ช่องประตูก่อน แล้วค่อยเดินต่อในร้าน
      if (server.kitchenDoorway) {
        if (server.queue.length < MAX_QUEUED_STAFF_POINTS) server.queue.push({ ...server.kitchenDoorway, code: STAFF_KITCHEN_CODE, hold: 0, task: this.tagging });
        else this.overflow = true;
        server.kitchenDoorway = null;
      }
      server.simCode = code;
      this.push(server, x, y, code);
    }
    this.tagging = null;
    for (const index of [...this.servers.keys()]) if (!live.has(index)) this.servers.delete(index);

    const out: number[] = [];
    for (let o = 0; o < staff.length; o += STAFF_STRIDE) {
      const index = staff[o]!;
      const server = this.servers.get(index)!;
      this.move(server, dt, typeof speed === "number" ? speed : speed(index), timeScale);
      out.push(index, server.x, server.y, server.code);
    }
    return new Float32Array(out);
  }

  /**
   * ต่อคิว: ผ่านช่องประตูครัว → เข้าไปในครัว (หายตัว) → ออกมาที่ช่องประตูพร้อมถาด
   * @param hold null = ยังไม่ออกมา รอ engine บอกว่ารับอาหารเสร็จ (โหมด metadata เวลารับอาหารมาจากการจำลอง)
   */
  private enterKitchen(server: Server, hold: number | null = KITCHEN_SECONDS) {
    if (server.queue.length + 3 > MAX_QUEUED_STAFF_POINTS) { this.overflow = true; return; }
    const { center, outward } = this.door!;
    const tail = server.queue[server.queue.length - 1];
    const from = tail ?? server;
    // ระยะจากจุดรับอาหาร (ช่องติดผนัง) ถึงแนวผนัง แล้วเดินเลยเข้าไปในครัว
    const toWall = (center.x - from.x) * outward.x + (center.y - from.y) * outward.y;
    const doorway = { x: from.x + outward.x * toWall, y: from.y + outward.y * toWall };
    const inside = { x: doorway.x + outward.x * KITCHEN_DEPTH, y: doorway.y + outward.y * KITCHEN_DEPTH };
    const task = this.tagging;
    server.queue.push({ ...doorway, code: STAFF_STATE_CODE.walking, hold: 0, task });
    server.queue.push({ ...inside, code: STAFF_KITCHEN_CODE, hold: hold ?? 0, task });
    // ขากลับยังนับว่าอยู่ในครัวจนถึงช่องประตู — โผล่ออกมาที่ประตูพร้อมถาด ไม่เดินทะลุผนัง
    if (hold === null) server.kitchenDoorway = doorway;
    else server.queue.push({ ...doorway, code: STAFF_KITCHEN_CODE, hold: 0, task });
  }

  private push(server: Server, x: number, y: number, code: number) {
    const tail = server.queue[server.queue.length - 1];
    const last = tail ?? server;
    if (Math.hypot(x - last.x, y - last.y) <= 1e-4) {
      // ยืนอยู่กับที่ งานเดิม: ไม่ต้องเพิ่มจุด แค่ให้สถานะล่าสุดตามไปด้วย (ยืนรอในครัวไม่เปลี่ยน)
      if (tail ? tail.task === this.tagging : server.task === this.tagging) {
        if (tail) tail.code = code;
        else if (server.holding <= 0) server.code = code;
        return;
      }
      // งานใหม่ที่จุดเดิม (เช่นรับเงินที่จุดยืนประจำ): ต่อคิวจุดเดิม เพื่อให้ผ่านประตูของงานและได้สถานะใหม่
    }
    const before = server.queue.at(-2);
    if (tail && before && !tail.hold && !before.hold && tail.code === code && before.code === code &&
      tail.task === this.tagging && before.task === this.tagging &&
      Math.abs((tail.x - before.x) * (y - tail.y) - (tail.y - before.y) * (x - tail.x)) < 1e-7 &&
      (tail.x - before.x) * (x - tail.x) + (tail.y - before.y) * (y - tail.y) >= 0) {
      tail.x = x; tail.y = y; return;
    }
    if (this.router && code !== STAFF_KITCHEN_CODE && last.code !== STAFF_KITCHEN_CODE) {
      const route = this.router(last, { x, y });
      // จุดกลางทาง (ไม่รวมต้น/ปลาย) ใช้รหัสสถานะเดียวกับจุดหมาย
      for (const point of route.slice(1, -1)) {
        if (server.queue.length >= MAX_QUEUED_STAFF_POINTS) { this.overflow = true; return; }
        server.queue.push({ x: point.x, y: point.y, code, hold: 0, task: this.tagging });
      }
    }
    if (server.queue.length >= MAX_QUEUED_STAFF_POINTS) { this.overflow = true; return; }
    server.queue.push({ x, y, code, hold: 0, task: this.tagging });
  }

  private move(server: Server, dt: number, speed: number, timeScale: number) {
    if (![dt, speed, timeScale].every(Number.isFinite) || dt <= 0 || speed <= 0 || timeScale <= 0) return;
    server.waiting = null;
    if (server.holding > 0) {
      const wait = server.holding / timeScale;
      server.holding = Math.max(0, server.holding - dt * timeScale);
      dt = Math.max(0, dt - wait);
      if (dt === 0) return;
    }
    const { queue } = server;
    if (queue.length === 0) return;
    let budget = speed * dt;
    while (queue.length > 0 && budget > 0) {
      const step = queue[0]!;
      if (step.task !== server.task) {
        if (step.task && this.gate && !this.gate.open(step.task)) {
          // งานใหม่ยังไม่พร้อมบนภาพ: ยืนรอที่เดิมในท่ายืนประจำ
          server.waiting = step.task;
          server.code = STAFF_STATE_CODE.counter;
          break;
        }
        server.task = step.task;
      }
      const dx = step.x - server.x;
      const dy = step.y - server.y;
      const distance = Math.hypot(dx, dy);
      server.code = step.code;
      if (distance > budget) {
        server.x += (dx / distance) * budget;
        server.y += (dy / distance) * budget;
        break;
      }
      server.x = step.x;
      server.y = step.y;
      budget -= distance;
      queue.shift();
      if (step.hold > 0) {
        server.holding = step.hold;
        this.move(server, budget / speed, speed, timeScale);
        break;
      }
    }
  }
}
