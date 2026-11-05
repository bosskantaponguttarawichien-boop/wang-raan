import { AGENT_STATE_CODE, STAFF_STATE_CODE } from "@/core/simulation";
import type { PaySpot } from "@/core/preview/staff-spots";
import type {
  CustomerPresentation, CustomerThought, PresentationSnapshot, PresentationTaskKind, StaffThought,
} from "@/core/simulation/presentation-contract";
import { resolveStaffThought } from "@/core/simulation/presentation-snapshot";
import type { StaffTaskGate } from "../staff-pacer";
import { alignPresentation } from "./presentation-frame";

/**
 * ให้งานพนักงานและป้ายสถานะตามภาพ ไม่ใช่ตามการจำลองที่ล้ำหน้าไปแล้ว
 *
 * ที่เวลาเร่ง การจำลองให้ลูกค้านั่งที่โต๊ะทันที ขณะที่ภาพยังเดินเข้าร้านอีกหลายวินาที — พนักงานจึงไปยืนรอที่โต๊ะ
 * และป้ายขึ้นว่ารอสั่งอาหารทั้งที่ลูกค้ายังเดินอยู่ VisualSync:
 * - ประตูรอของงาน (StaffPacer): รับออเดอร์/เสิร์ฟเริ่มเมื่อทุกคนในกลุ่มนั่งบนจอแล้ว, เก็บโต๊ะเริ่มเมื่อไม่มีใครในรอบนั้น
 *   นั่งหรือกำลังลุกบนจอ — ระหว่างนั้นพนักงานยืนรอที่เดิม (รอนานเกิน MAX_GATE_SECONDS ปล่อยไปกันค้าง)
 * - ป้ายสถานะลูกค้าแสดงเฉพาะขั้นที่ภาพอยู่จริง; ป้ายพนักงานคิดจากท่าที่เห็น
 * ตัวเลขผลจำลองไม่เปลี่ยน — แก้เฉพาะสิ่งที่วาด
 */

/** ป้ายของลูกค้าที่ออกจากการจำลองแล้วแต่ภาพยังลุก/เดินออกอยู่ */
export interface DepartingThought {
  readonly renderAgentId: number;
  readonly thought: CustomerThought;
}

/**
 * snapshot ที่ปรับตามภาพแล้ว + ป้ายของคนที่กำลังออก — แยกช่องไว้ ไม่ใส่ลง customers
 * เพราะฉาก 3D ถือว่าคนที่ไม่อยู่ใน customers คือคนเดินออก (ปล่อยเก้าอี้/ท่าลุกตามนั้น)
 */
export type VisualPresentation = PresentationSnapshot & { readonly departing?: readonly DepartingThought[] };

/** ยืนรอลูกค้าบนจอนานสุดเท่านี้ (วินาทีจริง) แล้วปล่อยให้เดินไปทำงาน — กันค้างเมื่อภาพไม่ถึงสถานะที่รอ */
export const MAX_GATE_SECONDS = 20;
/** เก็บโต๊ะได้เมื่อลูกค้ารอบนั้นทุกคนเดินห่างเก้าอี้ที่นั่งบนจอเท่านี้ (ม.) — ไม่เดินสวนกลางกลุ่มที่เพิ่งลุก */
export const CLEAR_DISTANCE = 1.5;
/** พนักงานออกเดินไปหลังจอ POS เมื่อลูกค้าที่จะจ่ายเงินเดินมาใกล้หน้าจอเท่านี้ (ม.) — ไปถึงพร้อมกัน ไม่ไปยืนรอก่อน */
export const PAY_APPROACH = 1.5;
/** พนักงานยืนห่างจุดหลังจอ POS ไม่เกินนี้ (ม.) ถือว่าอยู่ที่จอ — ขึ้นป้ายรับเงินเมื่อมีลูกค้ายืนจ่าย */
const AT_POS = 0.3;
/** จำงาน/ลูกค้าย้อนหลังได้เท่านี้รายการ (ภาพตามหลังการจำลองไม่กี่งาน) */
const MEMORY = 256;

const SEATED = AGENT_STATE_CODE.seated;
const PAYING = AGENT_STATE_CODE.ordering;
const STAFF_COUNTER = STAFF_STATE_CODE.counter;
const STAFF_AT_WORK = STAFF_STATE_CODE["taking-order"];
const LEAVING = AGENT_STATE_CODE.leaving;
const BILL_CODES = new Set<number>([SEATED, AGENT_STATE_CODE["to-counter"], AGENT_STATE_CODE.queuing, AGENT_STATE_CODE.ordering]);
/** ออกจากร้านโดยยังไม่ได้กิน = ไม่ได้รับบริการ */
const UNSERVED = new Set<CustomerThought["kind"]>(["queue-wait", "queue-warning", "queue-critical", "order-wait", "food-wait", "food-warning", "food-critical"]);

interface TaskInfo { kind: PresentationTaskKind | null; cycleId: string | null }

function remember<K, V>(map: Map<K, V>, key: K, value: V) {
  map.delete(key);
  map.set(key, value);
  if (map.size > MEMORY) map.delete(map.keys().next().value!);
}

function codes(buffer: Float32Array) {
  const out = new Map<number, number>();
  for (let offset = 0; offset < buffer.length; offset += 4) out.set(buffer[offset]!, buffer[offset + 3]!);
  return out;
}

interface Spot { x: number; y: number }

export class VisualSync implements StaffTaskGate {
  /** รอบบริการของลูกค้าแต่ละคน — จำไว้หลังออกจากการจำลองแล้ว เพราะภาพยังลุก/เดินออกอยู่ */
  private readonly cycles = new Map<number, string>();
  private readonly tasks = new Map<string, TaskInfo>();
  private staffTasks = new Map<number, string | null>();
  /** รหัสสถานะที่ภาพลูกค้าแสดงอยู่ */
  private shown = new Map<number, number>();
  private positions = new Map<number, Spot>();
  /** ตำแหน่งที่ภาพลูกค้านั่งล่าสุด (เก้าอี้) */
  private readonly seats = new Map<number, Spot>();
  private rising: (id: number) => boolean = () => false;
  private readonly closedSince = new Map<string, number>();
  private payPoints: readonly PaySpot[] = [];
  /** งานรับเงินที่เห็นช่วงยืนหลังจอแล้ว (ส่งจุดให้ภาพพนักงานหยุดรับเงินครั้งเดียว) */
  private readonly payWorkSeen = new Set<string>();
  /** จุดที่ภาพพนักงานต้องยืนรับเงินใน TICK นี้ — controller สั่ง StaffPacer.holdAt */
  readonly payStops: { staffId: number; point: Spot }[] = [];
  private readonly lastThought = new Map<number, CustomerThought | null>();
  /** ป้ายล่าสุดจากการจำลองของแต่ละคน — ใช้บอกว่าคนที่ออกไปแล้วได้รับบริการหรือไม่ */
  private readonly lastSimThought = new Map<number, CustomerThought | null>();
  private clock = 0;

  reset() {
    this.cycles.clear(); this.tasks.clear(); this.staffTasks.clear(); this.shown.clear(); this.positions.clear(); this.seats.clear();
    this.closedSince.clear(); this.lastThought.clear(); this.lastSimThought.clear(); this.payWorkSeen.clear(); this.payStops.length = 0;
    this.clock = 0;
  }

  /**
   * รับสถานะล่าสุดก่อนเดินภาพพนักงานใน TICK นี้
   * @param agents ภาพลูกค้า (id, x, y, code) จาก WalkPacer
   * @param dt วินาทีจริงตั้งแต่ครั้งก่อน
   */
  /** จุดจ่ายเงินหน้าจอ POS ของผังที่กำลังจำลอง (paySpots) */
  setPayPoints(points: readonly PaySpot[]) {
    this.payPoints = points;
  }

  observe(snapshot: PresentationSnapshot | null, agents: Float32Array, rising: (id: number) => boolean, dt: number) {
    this.clock += Math.max(0, dt);
    this.payStops.length = 0;
    this.shown = codes(agents);
    this.positions = new Map();
    for (let offset = 0; offset < agents.length; offset += 4) {
      const id = agents[offset]!, spot = { x: agents[offset + 1]!, y: agents[offset + 2]! };
      this.positions.set(id, spot);
      if (agents[offset + 3] === SEATED && !rising(id)) this.seats.set(id, spot);
    }
    this.rising = rising;
    for (const id of [...this.cycles.keys()]) if (!this.shown.has(id)) this.cycles.delete(id);
    for (const id of [...this.seats.keys()]) if (!this.shown.has(id)) this.seats.delete(id);
    for (const id of [...this.lastThought.keys()]) if (!this.shown.has(id)) { this.lastThought.delete(id); this.lastSimThought.delete(id); }
    if (!snapshot) return;
    for (const customer of snapshot.customers) if (customer.serviceCycleId) remember(this.cycles, customer.renderAgentId, customer.serviceCycleId);
    this.staffTasks = new Map(snapshot.staff.map(member => [member.staffId, member.taskId]));
    for (const member of snapshot.staff) {
      if (member.taskId && !this.tasks.has(member.taskId)) remember(this.tasks, member.taskId, { kind: member.taskKind, cycleId: member.serviceCycleId });
      // ช่วงยืนหลังจอ POS: การจำลองจ่ายเสร็จในเสี้ยววินาทีที่เวลาเร่ง — ให้ภาพยืนรับเงินนานพอเห็นเมื่อไปถึง
      if (member.taskKind === "pay" && member.taskId && member.activity === "taking-order" && member.servicePoint && !this.payWorkSeen.has(member.taskId)) {
        this.payWorkSeen.add(member.taskId);
        if (this.payWorkSeen.size > MEMORY) this.payWorkSeen.delete(this.payWorkSeen.values().next().value!);
        this.payStops.push({ staffId: member.staffId, point: member.servicePoint });
      }
    }
  }

  taskOf(index: number): string | null {
    return this.staffTasks.get(index) ?? null;
  }

  open(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task?.cycleId || (task.kind === "pay" && this.payPoints.length === 0)) return true;
    const party = [...this.cycles].filter(([id, cycle]) => cycle === task.cycleId && this.shown.has(id)).map(([id]) => id);
    // ภาพลูกค้ารอบนี้ไม่อยู่แล้ว (ออกไปแล้ว หรือเริ่มเล่นภาพกลางทาง) — ไม่มีอะไรให้รอ
    if (party.length === 0) return true;
    const ready = task.kind === "clean"
      // ท่าลุกแสดงเป็นนั่งจนลุกเสร็จ: รอให้ทุกคนลุกแล้วเดินห่างโต๊ะไปก่อน
      ? party.every(id => this.shown.get(id) !== SEATED && this.clearOfSeat(id))
      : task.kind === "pay"
        // รับเงิน: ไปหลังจอ POS เมื่อลูกค้าเดินมาใกล้หน้าจอแล้ว
        ? party.some(id => this.shown.get(id) === PAYING || this.nearPay(id))
        : party.every(id => this.shown.get(id) === SEATED && !this.rising(id));
    if (ready) { this.closedSince.delete(taskId); return true; }
    if (!this.closedSince.has(taskId)) remember(this.closedSince, taskId, this.clock);
    return this.clock - this.closedSince.get(taskId)! >= MAX_GATE_SECONDS;
  }

  private nearPay(id: number): boolean {
    const at = this.positions.get(id);
    return !!at && this.payPoints.some(spot => Math.hypot(at.x - spot.customer.x, at.y - spot.customer.y) <= PAY_APPROACH);
  }

  private clearOfSeat(id: number): boolean {
    const seat = this.seats.get(id), at = this.positions.get(id);
    return !seat || !at || Math.hypot(at.x - seat.x, at.y - seat.y) >= CLEAR_DISTANCE;
  }

  /**
   * ท่าทาง/ป้ายสถานะตามภาพ
   * @param waiting งานที่ภาพพนักงานคนนี้ยืนรออยู่ (StaffPacer.waitingTask)
   * @param pending งานที่ภาพพนักงานยังไปไม่ถึงจุดทำงาน — ลูกค้ายังรอสั่งอาหารจนพนักงานมารับออเดอร์บนจอ
   */
  align(snapshot: PresentationSnapshot, agents: Float32Array, staff: Float32Array,
    waiting: (staffId: number) => string | null, pending: (taskId: string) => boolean): VisualPresentation {
    const aligned = alignPresentation(snapshot, agents, staff);
    const shown = codes(agents);
    const cashiers = this.cashiersNow(staff, shown);
    const ordering = new Set<string>();
    for (const [taskId, task] of this.tasks) if (task.kind === "take-order" && task.cycleId && pending(taskId)) ordering.add(task.cycleId);
    return {
      ...aligned,
      customers: aligned.customers.map(customer => {
        if (customer.thought === undefined) return customer;
        const code = shown.get(customer.renderAgentId);
        if (code === undefined) return customer;
        if (customer.thought) this.lastSimThought.set(customer.renderAgentId, customer.thought);
        const ordered = !(customer.serviceCycleId && ordering.has(customer.serviceCycleId));
        let thought = customer.thought;
        if (!visible(thought, code, customer, ordered)) {
          const last = this.lastThought.get(customer.renderAgentId) ?? null;
          thought = visible(last, code, customer, ordered) ? last : null;
        }
        this.lastThought.set(customer.renderAgentId, thought);
        return thought === customer.thought ? customer : { ...customer, thought };
      }),
      departing: this.departing(snapshot, shown),
      staff: aligned.staff.map(member => {
        // ยืนหลังจอ POS ขณะมีลูกค้าจ่าย = รับเงิน แม้กำลังรอเริ่มงานอื่นอยู่ก็ตาม
        if (cashiers.has(member.staffId) && member.thought !== undefined) {
          return { ...member, activity: "counter", carryMealIds: [], thought: { kind: "taking-payment" } };
        }
        if (waiting(member.staffId)) {
          return { ...member, activity: "counter", carryMealIds: [], ...(member.thought === undefined ? {} : { thought: null }) };
        }
        if (member.thought === undefined || member.thought?.kind === "resting") return member;
        // ป้ายรับเงินตามภาพ: ยืนอยู่หลังจอ POS ขณะมีลูกค้ายืนจ่ายอยู่หน้าจอ (ไม่ใช่ตามงานในการจำลองที่จ่ายเสร็จไปก่อนแล้ว)
        const thought: StaffThought | null = member.taskKind === "pay" ? null : resolveStaffThought(member.activity);
        return thought?.kind === member.thought?.kind ? member : { ...member, thought };
      }),
    };
  }

  /** พนักงานที่ยืนนิ่งหลังจอ POS ขณะมีลูกค้ายืนจ่ายเงินอยู่หน้าจอนั้น (จอละคน — คนที่ใกล้จอที่สุด) */
  private cashiersNow(staff: Float32Array, shown: Map<number, number>): Set<number> {
    const out = new Set<number>();
    for (const spot of this.payPoints) {
      if (!spot.staff) continue;
      const paying = [...shown].some(([id, code]) => {
        const at = this.positions.get(id);
        // เคยนั่งแล้วเท่านั้น: โหมดสั่งที่เคาน์เตอร์ใช้รหัส ordering ตอนสั่งอาหารด้วย ไม่ใช่การจ่ายเงิน
        return code === PAYING && this.seats.has(id) && !!at && Math.hypot(at.x - spot.customer.x, at.y - spot.customer.y) <= PAY_APPROACH;
      });
      if (!paying) continue;
      let best: number | null = null, bestDistance = AT_POS;
      for (let offset = 0; offset < staff.length; offset += 4) {
        const code = staff[offset + 3]!;
        const distance = Math.hypot(staff[offset + 1]! - spot.staff.x, staff[offset + 2]! - spot.staff.y);
        if ((code === STAFF_COUNTER || code === STAFF_AT_WORK) && distance <= bestDistance) { best = staff[offset]!; bestDistance = distance; }
      }
      if (best !== null) out.add(best);
    }
    return out;
  }

  /**
   * ป้ายของคนที่การจำลองให้ออกไปแล้ว แต่ภาพยังลุก/เดินไปจ่ายเงิน/เดินออกอยู่ (การจำลองล้ำหน้าภาพหลายวินาที)
   * เดินออกจริงบนจอ → "ออกจากร้าน" (ไม่ได้รับบริการถ้ายังไม่ได้กิน); ยังไม่ถึงขั้นนั้น → คงป้ายล่าสุดที่ยังตรงภาพ
   */
  private departing(snapshot: PresentationSnapshot, shown: Map<number, number>): DepartingThought[] {
    const listed = new Set(snapshot.customers.map(customer => customer.renderAgentId));
    const out: DepartingThought[] = [];
    for (const [id, code] of shown) {
      if (listed.has(id) || !this.lastThought.has(id)) continue;
      const before = this.lastSimThought.get(id) ?? null;
      let thought = this.lastThought.get(id) ?? null;
      if (code === LEAVING) {
        const unserved = before !== null && (UNSERVED.has(before.kind) || (before.kind === "leaving" && before.severity === "critical"));
        thought = thought?.kind === "leaving" ? thought : { kind: "leaving", waitSeconds: 0, severity: unserved ? "critical" : "normal" };
      } else if (thought?.kind !== "bill-wait" || !BILL_CODES.has(code)) {
        thought = null;
      }
      this.lastThought.set(id, thought);
      if (thought) out.push({ renderAgentId: id, thought });
    }
    return out;
  }
}

/** ป้ายนี้ตรงกับขั้นที่ภาพลูกค้าอยู่หรือไม่ */
function visible(thought: CustomerThought | null, code: number, customer: CustomerPresentation, ordered: boolean): boolean {
  if (!thought) return true;
  switch (thought.kind) {
    case "leaving":
      return code === LEAVING;
    case "order-wait":
      return code === SEATED;
    case "food-wait":
    case "food-warning":
    case "food-critical":
      return code === SEATED && ordered;
    case "eating":
      return code === SEATED && customer.activity === "eating";
    case "bill-wait":
      return BILL_CODES.has(code);
    default:
      return true;
  }
}
