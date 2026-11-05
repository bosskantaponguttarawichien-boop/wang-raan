import { describe, expect, it } from "vitest";
import { AGENT_STATE_CODE, STAFF_STATE_CODE } from "@/core/simulation";
import type { Point } from "@/core/layout/types";
import { STAFF_KITCHEN_CODE } from "../staff-pacer";
import { CrowdAvoider, WALL_MARGIN, YIELD_FACTOR, type SegmentClear } from "./crowd-avoidance";

const WALK = AGENT_STATE_CODE["to-seat"];
const SPEED = 1.2;
const DT = 0.05;

interface Mover {
  kind: "customer" | "staff";
  id: number;
  code: number;
  x: number;
  y: number;
  target: Point;
  /** ลูกค้า: ยังนั่ง (กำลังลุก) จนถึง TICK นี้ แล้วจึงออกเดิน */
  risingUntil?: number;
}

/** เดินทุกคนเป็นเส้นตรงไปจุดหมาย (แทน pacer) แล้วให้ CrowdAvoider ปรับภาพ — คืนตำแหน่งที่แสดงทุก TICK */
function run(movers: Mover[], ticks: number, clear?: { customer?: SegmentClear; staff?: SegmentClear }, room?: { width: number; depth: number }) {
  const crowd = new CrowdAvoider();
  crowd.setClearance(clear?.customer ?? null, clear?.staff ?? null);
  crowd.setRoom(room ?? null);
  const remaining = (m: Mover) => Math.hypot(m.target.x - m.x, m.target.y - m.y);
  const frames: Array<Map<string, Point & { base: Point }>> = [];
  const factors: Array<Map<string, number>> = [];
  for (let tick = 0; tick < ticks; tick++) {
    const rising = (m: Mover) => m.risingUntil !== undefined && tick < m.risingUntil;
    for (const m of movers) {
      if (rising(m)) continue;
      const factor = m.kind === "customer" ? crowd.customerFactor(m.id) : crowd.staffFactor(m.id);
      const left = remaining(m);
      const step = Math.min(left, SPEED * factor * DT);
      if (left > 0) { m.x += (m.target.x - m.x) / left * step; m.y += (m.target.y - m.y) / left * step; }
    }
    const agents = movers.filter(m => m.kind === "customer").flatMap(m => [m.id, m.x, m.y, rising(m) ? AGENT_STATE_CODE.seated : m.code]);
    const staff = movers.filter(m => m.kind === "staff").flatMap(m => [m.id, m.x, m.y, m.code]);
    const out = crowd.update({
      agents: new Float32Array(agents), staff: new Float32Array(staff), dt: DT, rate: 1,
      remainingCustomer: id => remaining(movers.find(m => m.kind === "customer" && m.id === id)!),
      remainingStaff: index => remaining(movers.find(m => m.kind === "staff" && m.id === index)!),
      customerRising: id => rising(movers.find(m => m.kind === "customer" && m.id === id)!),
      staffStop: index => {
        const m = movers.find(entry => entry.kind === "staff" && entry.id === index)!;
        return remaining(m) > 0 ? m.target : null;
      },
    });
    const frame = new Map<string, Point & { base: Point }>();
    for (const [kind, buffer] of [["customer", out.agents], ["staff", out.staff]] as const) {
      for (let o = 0; o < buffer.length; o += 4) {
        const m = movers.find(entry => entry.kind === kind && entry.id === buffer[o])!;
        frame.set(`${kind}${buffer[o]}`, { x: buffer[o + 1]!, y: buffer[o + 2]!, base: { x: m.x, y: m.y } });
      }
    }
    frames.push(frame);
    factors.push(new Map(movers.map(m => [`${m.kind}${m.id}`, m.kind === "customer" ? crowd.customerFactor(m.id) : crowd.staffFactor(m.id)])));
  }
  return { frames, factors };
}

function minDistance(frames: Array<Map<string, Point>>, a: string, b: string) {
  return Math.min(...frames.map(frame => Math.hypot(frame.get(a)!.x - frame.get(b)!.x, frame.get(a)!.y - frame.get(b)!.y)));
}

describe("CrowdAvoider", () => {
  it("lets two guests walking head-on sidestep past each other instead of overlapping", () => {
    const { frames } = run([
      { kind: "customer", id: 1, code: WALK, x: 0, y: 5, target: { x: 10, y: 5 } },
      { kind: "customer", id: 2, code: WALK, x: 10, y: 5, target: { x: 0, y: 5 } },
    ], 200);
    expect(minDistance(frames, "customer1", "customer2")).toBeGreaterThanOrEqual(0.5);
    // ต่างคนต่างชิดขวาของตัวเอง: คนเดินไป +x เบี่ยงลง (−y) คนเดินไป −x เบี่ยงขึ้น (+y)
    const crossing = frames.find(frame => Math.abs(frame.get("customer1")!.x - frame.get("customer2")!.x) < 0.2)!;
    expect(crossing.get("customer1")!.y).toBeLessThan(5);
    expect(crossing.get("customer2")!.y).toBeGreaterThan(5);
  });

  it("walks around another guest standing still without stopping, and arrives exactly on its path", () => {
    const { frames, factors } = run([
      { kind: "customer", id: 1, code: WALK, x: 0, y: 5, target: { x: 7, y: 5 } },
      { kind: "customer", id: 2, code: AGENT_STATE_CODE.queuing, x: 4, y: 5, target: { x: 4, y: 5 } },
    ], 200);
    expect(minDistance(frames, "customer1", "customer2")).toBeGreaterThanOrEqual(0.5);
    expect(Math.min(...factors.map(f => f.get("customer1")!))).toBe(1);
    const last = frames.at(-1)!.get("customer1")!;
    expect(last.base).toEqual({ x: 7, y: 5 });
    expect(Math.hypot(last.x - 7, last.y - 5)).toBeLessThan(1e-6);
  });

  it("keeps the guest walking straight while walking staff sidesteps the whole way", () => {
    const { frames, factors } = run([
      { kind: "customer", id: 1, code: WALK, x: 0, y: 5, target: { x: 10, y: 5 } },
      { kind: "staff", id: 0, code: STAFF_STATE_CODE.serving, x: 10, y: 5, target: { x: 0, y: 5 } },
    ], 200);
    for (const frame of frames) expect(frame.get("customer1")!.y).toBe(5);
    expect(Math.min(...factors.map(f => f.get("customer1")!))).toBe(1);
    expect(minDistance(frames, "customer1", "staff0")).toBeGreaterThanOrEqual(0.5);
  });

  it("has standing staff step aside for a passing guest and return to the spot afterwards", () => {
    const { frames } = run([
      { kind: "customer", id: 1, code: WALK, x: 0, y: 5, target: { x: 8, y: 5 } },
      { kind: "staff", id: 0, code: STAFF_STATE_CODE.cleaning, x: 4, y: 5.1, target: { x: 4, y: 5.1 } },
    ], 200);
    for (const frame of frames) expect(frame.get("customer1")!.y).toBe(5);
    expect(minDistance(frames, "customer1", "staff0")).toBeGreaterThanOrEqual(0.5);
    const last = frames.at(-1)!.get("staff0")!;
    expect(Math.hypot(last.x - 4, last.y - 5.1)).toBeLessThan(1e-6);
  });

  it("does not make staff behind the counter shuffle for a guest who stops before reaching them", () => {
    const { frames } = run([
      { kind: "customer", id: 1, code: AGENT_STATE_CODE["to-counter"], x: 0, y: 5, target: { x: 3.2, y: 5 } },
      { kind: "staff", id: 0, code: STAFF_STATE_CODE.counter, x: 4, y: 5, target: { x: 4, y: 5 } },
    ], 120);
    for (const frame of frames) expect(frame.get("staff0")).toMatchObject({ x: 4, y: 5 });
  });

  it("makes staff wait away from the table until the rising guest has walked clear before going to wipe it", () => {
    // ลูกค้าลุกจากเก้าอี้ (5.3, 5.4) แล้วเดินออกไปทาง +y — พนักงานเดินมาเช็ดโต๊ะที่ (5, 5)
    const { frames } = run([
      { kind: "customer", id: 1, code: AGENT_STATE_CODE.leaving, x: 5.3, y: 5.4, target: { x: 5.3, y: 9.5 }, risingUntil: 40 },
      { kind: "staff", id: 0, code: STAFF_STATE_CODE.walking, x: 1, y: 5, target: { x: 5, y: 5 } },
    ], 200);
    for (const frame of frames) {
      const guest = frame.get("customer1")!.base;
      const staff = frame.get("staff0")!.base;
      if (Math.hypot(guest.x - 5, guest.y - 5) < 1) expect(Math.hypot(staff.x - 5, staff.y - 5)).toBeGreaterThan(1.2);
    }
    // ลูกค้าพ้นไปแล้วพนักงานเข้าไปเช็ดโต๊ะได้
    expect(frames.at(-1)!.get("staff0")!.base).toEqual({ x: 5, y: 5 });
  });

  it("makes staff give way to the guest in an aisle too narrow to sidestep", () => {
    const corridor: SegmentClear = (_a, b) => Math.abs(b.y - 5) < 0.05;
    const { frames, factors } = run([
      { kind: "customer", id: 1, code: WALK, x: 0, y: 5, target: { x: 10, y: 5 } },
      { kind: "staff", id: 0, code: STAFF_STATE_CODE.serving, x: 6, y: 5, target: { x: -2, y: 5 } },
    ], 120, { customer: corridor, staff: corridor });
    const guestSlowest = Math.min(...factors.map(f => f.get("customer1")!));
    const staffSlowest = Math.min(...factors.map(f => f.get("staff0")!));
    expect(staffSlowest).toBeLessThan(0.5);
    expect(guestSlowest).toBe(1);
    // ทางแคบ: ไม่มีใครถูกเบี่ยงออกนอกทางเดิน
    for (const frame of frames) for (const point of frame.values()) expect(Math.abs(point.y - 5)).toBeLessThan(0.05);
  });

  it("breaks a tie between two guests in a narrow aisle by letting the higher id wait", () => {
    const corridor: SegmentClear = (_a, b) => Math.abs(b.y - 5) < 0.05;
    const { factors } = run([
      { kind: "customer", id: 3, code: WALK, x: 0, y: 5, target: { x: 10, y: 5 } },
      { kind: "customer", id: 8, code: WALK, x: 4, y: 5, target: { x: -4, y: 5 } },
    ], 30, { customer: corridor });
    expect(Math.min(...factors.map(f => f.get("customer8")!))).toBeLessThan(YIELD_FACTOR + 0.3);
    expect(Math.min(...factors.map(f => f.get("customer3")!))).toBe(1);
  });

  it("never sidesteps into furniture", () => {
    // ฝั่งซ้ายของคนเดินไป +x (y > 5) เป็นโต๊ะ — คนที่ยืนเยื้องลงล่างเล็กน้อยทำให้อยากเบี่ยงขึ้น แต่ห้าม
    const tableAbove: SegmentClear = (_a, b) => b.y <= 5.0001;
    const { frames } = run([
      { kind: "customer", id: 1, code: WALK, x: 0, y: 5, target: { x: 8, y: 5 } },
      { kind: "customer", id: 2, code: AGENT_STATE_CODE.queuing, x: 4, y: 4.9, target: { x: 4, y: 4.9 } },
    ], 160, { customer: tableAbove });
    for (const frame of frames) expect(frame.get("customer1")!.y).toBeLessThanOrEqual(5.0001);
  });

  it("never sidesteps through a wall when two people pass in the aisle along it", () => {
    const room = { width: 10, depth: 10 };
    // คนเดินไป +x ชิดกำแพงล่าง (y = 0): ขวาของเขาคือฝั่งกำแพง เบี่ยงได้แค่ถึงแนว WALL_MARGIN อีกคนต้องเบี่ยงมากกว่า
    const { frames } = run([
      { kind: "customer", id: 1, code: WALK, x: 0.5, y: 0.45, target: { x: 9.5, y: 0.45 } },
      { kind: "customer", id: 2, code: WALK, x: 9.5, y: 0.45, target: { x: 0.5, y: 0.45 } },
    ], 200, undefined, room);
    for (const frame of frames) for (const point of frame.values()) {
      expect(point.y).toBeGreaterThanOrEqual(WALL_MARGIN - 1e-6);
      expect(point.x).toBeGreaterThanOrEqual(WALL_MARGIN - 1e-6);
    }
    expect(minDistance(frames, "customer1", "customer2")).toBeGreaterThanOrEqual(0.5);
  });

  it("stops sidestepping smoothly before walking out through the door, and never outside the room", () => {
    const room = { width: 10, depth: 10 };
    // เดินออกประตูที่กำแพงล่าง (x = 5) โดยมีคนยืนเยื้องทางใกล้ประตู — ต้องเบี่ยงแล้วกลับเข้าแนวก่อนถึงช่องประตู
    const { frames } = run([
      { kind: "customer", id: 1, code: AGENT_STATE_CODE.leaving, x: 5, y: 6, target: { x: 5, y: -2 } },
      { kind: "customer", id: 2, code: AGENT_STATE_CODE.queuing, x: 5.2, y: 2.4, target: { x: 5.2, y: 2.4 } },
    ], 200, undefined, room);
    let previousLateral = 0;
    for (const frame of frames) {
      const point = frame.get("customer1")!;
      const lateral = point.x - point.base.x;
      // เบี่ยงอยู่ = ต้องอยู่ในห้องห่างกำแพง; ช่วงผ่านประตู/นอกร้านเดินตรงแนวทางจริง
      if (Math.abs(lateral) > 1e-9) {
        expect(point.y).toBeGreaterThanOrEqual(WALL_MARGIN - 1e-6);
        expect(point.x).toBeGreaterThanOrEqual(WALL_MARGIN - 1e-6);
      }
      if (point.base.y < WALL_MARGIN) expect(Math.abs(lateral)).toBeLessThan(1e-9);
      // ไม่กระตุก: ขยับด้านข้างไม่เกินความเร็วด้านข้าง (1 ม./วิ × 0.05 วิ)
      expect(Math.abs(lateral - previousLateral)).toBeLessThanOrEqual(0.05 + 1e-6);
      previousLateral = lateral;
    }
    expect(Math.max(...frames.map(frame => Math.abs(frame.get("customer1")!.x - 5)))).toBeGreaterThan(0.2);
  });

  it("leaves seated guests and staff inside the kitchen untouched", () => {
    const crowd = new CrowdAvoider();
    const agents = new Float32Array([1, 2, 2, AGENT_STATE_CODE.seated, 2, 2.1, 2, WALK]);
    const staff = new Float32Array([0, 2.05, 2, STAFF_KITCHEN_CODE]);
    const input = { agents, staff, dt: DT, rate: 1, remainingCustomer: () => 3, remainingStaff: () => 3 };
    crowd.update(input);
    const out = crowd.update({ ...input, agents: new Float32Array([1, 2, 2, AGENT_STATE_CODE.seated, 2, 2.15, 2, WALK]) });
    expect([...out.agents.subarray(0, 4)]).toEqual([1, 2, 2, AGENT_STATE_CODE.seated]);
    expect([...out.staff]).toEqual([...staff]);
  });

  it("holds the current sidestep while paused (dt = 0)", () => {
    const crowd = new CrowdAvoider();
    const frame = (x1: number, x2: number) => ({
      agents: new Float32Array([1, x1, 5, WALK, 2, x2, 5, WALK]), staff: new Float32Array(0), dt: DT, rate: 1,
      remainingCustomer: () => 5, remainingStaff: () => 0,
    });
    crowd.update(frame(0, 1.2));
    const moving = crowd.update(frame(0.06, 1.14));
    const later = crowd.update(frame(0.12, 1.08));
    const paused = crowd.update({ ...frame(0.12, 1.08), dt: 0 });
    expect(later.agents[2]).not.toBe(moving.agents[2]);
    expect([...paused.agents]).toEqual([...later.agents]);
  });
});
