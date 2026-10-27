/**
 * StaffPacer — ให้ภาพพนักงานเดินด้วยความเร็วคนเดินจริง และแวะเข้าครัวก่อนเสิร์ฟ (คู่กับ WalkPacer ของลูกค้า)
 * - เวลาจำลองไม่เปลี่ยน: ตำแหน่งจาก engine เป็นจุดหมายที่ต่อคิวไว้ ภาพเดินตามทางเดิมทีละจุดด้วยความเร็วคนเดิน
 * - ตามหลังไกลเกิน MAX_STAFF_LAG_SECONDS วินาทีเดิน ค่อยเร่งให้ทัน (เช่นหลัง worker ข้ามช่วงเงียบ)
 * - รับอาหารที่ประตูครัว = เดินผ่านประตูเข้าไปในครัว หายตัว KITCHEN_SECONDS วินาที แล้วถือถาดออกมาเสิร์ฟ
 * ผลลัพธ์อยู่ในรูปแบบเดียวกับ TickMessage.staff (index, x, y, stateCode) เพื่อให้ overlay 2D / 3D ใช้ได้เหมือนเดิม
 */
import { STAFF_STATE_CODE, STAFF_STRIDE } from "@/core/simulation";
import type { DoorFrame } from "./walk-pacer";

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
 * ภาพตามหลังได้ไม่เกินเท่านี้ (วินาทีเดินที่ค้าง) จะเร่งให้ทัน
 * มากกว่าของลูกค้าเพราะพนักงานหยุดแวะครัวทุกรอบเสิร์ฟ — เดินค้างเพราะรอในครัวจึงไม่ทำให้วิ่ง
 */
export const MAX_STAFF_LAG_SECONDS = 8;

const SERVING = STAFF_STATE_CODE.serving;

/** จุดหมายหนึ่งจุดบนคิวเดิน (hold > 0 = ถึงแล้วยืนรอกี่วินาทีจำลอง) */
interface Step {
  x: number;
  y: number;
  code: number;
  hold: number;
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
}

export class StaffPacer {
  private readonly servers = new Map<number, Server>();
  private door: DoorFrame | null = null;

  reset() {
    this.servers.clear();
  }

  /** ประตูครัวของผังที่กำลังจำลอง — null = ไม่ต้องแวะเข้าครัว (รับอาหารหน้าประตูเหมือนเดิม) */
  setKitchenDoor(door: DoorFrame | null) {
    this.door = door;
  }

  /**
   * รับตำแหน่งพนักงานจากการจำลอง แล้วคืนตำแหน่งที่จะแสดง
   * @param dt วินาทีจริงตั้งแต่ครั้งก่อน
   * @param speed ความเร็วเดินบนภาพ (ม./วินาทีจริง — คูณความเร็วเล่นภาพมาแล้ว)
   * @param timeScale ตัวคูณความเร็วเล่นภาพ (วินาทีจำลองต่อวินาทีจริง) ใช้กับเวลาที่ยืนรอ
   */
  update(staff: Float32Array, dt: number, speed: number, timeScale = 1): Float32Array {
    const live = new Set<number>();
    for (let o = 0; o < staff.length; o += STAFF_STRIDE) {
      const index = staff[o]!;
      const x = staff[o + 1]!;
      const y = staff[o + 2]!;
      const code = staff[o + 3]!;
      live.add(index);
      let server = this.servers.get(index);
      if (!server) {
        // เริ่มเล่นภาพ: พนักงานอยู่ที่ตำแหน่งจริงเลย (ยืนประจำหลังเคาน์เตอร์)
        server = { x, y, code, queue: [], simCode: code, holding: 0 };
        this.servers.set(index, server);
      }
      if (code === SERVING && server.simCode !== SERVING && this.door) this.enterKitchen(server);
      server.simCode = code;
      this.push(server, x, y, code);
    }
    for (const index of [...this.servers.keys()]) if (!live.has(index)) this.servers.delete(index);

    const out: number[] = [];
    for (let o = 0; o < staff.length; o += STAFF_STRIDE) {
      const index = staff[o]!;
      const server = this.servers.get(index)!;
      this.move(server, dt, speed, timeScale);
      out.push(index, server.x, server.y, server.code);
    }
    return new Float32Array(out);
  }

  /** ต่อคิว: ผ่านช่องประตูครัว → เข้าไปในครัว (หายตัว) → ออกมาที่ช่องประตูพร้อมถาด */
  private enterKitchen(server: Server) {
    const { center, outward } = this.door!;
    const tail = server.queue[server.queue.length - 1];
    const from = tail ?? server;
    // ระยะจากจุดรับอาหาร (ช่องติดผนัง) ถึงแนวผนัง แล้วเดินเลยเข้าไปในครัว
    const toWall = (center.x - from.x) * outward.x + (center.y - from.y) * outward.y;
    const doorway = { x: from.x + outward.x * toWall, y: from.y + outward.y * toWall };
    const inside = { x: doorway.x + outward.x * KITCHEN_DEPTH, y: doorway.y + outward.y * KITCHEN_DEPTH };
    server.queue.push({ ...doorway, code: STAFF_STATE_CODE.walking, hold: 0 });
    server.queue.push({ ...inside, code: STAFF_KITCHEN_CODE, hold: KITCHEN_SECONDS });
    // ขากลับยังนับว่าอยู่ในครัวจนถึงช่องประตู — โผล่ออกมาที่ประตูพร้อมถาด ไม่เดินทะลุผนัง
    server.queue.push({ ...doorway, code: STAFF_KITCHEN_CODE, hold: 0 });
  }

  private push(server: Server, x: number, y: number, code: number) {
    const tail = server.queue[server.queue.length - 1];
    const last = tail ?? server;
    if (Math.hypot(x - last.x, y - last.y) <= 1e-4) {
      // ยืนอยู่กับที่: ไม่ต้องเพิ่มจุด แค่ให้สถานะล่าสุดตามไปด้วย (ยืนรอในครัวไม่เปลี่ยน)
      if (tail) tail.code = code;
      else if (server.holding <= 0) server.code = code;
      return;
    }
    server.queue.push({ x, y, code, hold: 0 });
  }

  private move(server: Server, dt: number, speed: number, timeScale: number) {
    if (server.holding > 0) {
      server.holding -= dt * timeScale;
      return;
    }
    const { queue } = server;
    if (queue.length === 0) return;
    let left = 0;
    let px = server.x;
    let py = server.y;
    for (const step of queue) {
      left += Math.hypot(step.x - px, step.y - py);
      px = step.x;
      py = step.y;
    }
    // ค้างเกิน MAX_STAFF_LAG_SECONDS → เร่งให้ระยะที่ค้างหายไปในเวลาราวนั้น
    let budget = Math.max(speed, left / MAX_STAFF_LAG_SECONDS) * dt;
    while (queue.length > 0 && budget > 0) {
      const step = queue[0]!;
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
        break;
      }
    }
  }
}
