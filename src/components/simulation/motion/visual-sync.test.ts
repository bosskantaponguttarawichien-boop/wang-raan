import { describe, expect, it } from "vitest";
import { AGENT_STATE_CODE, STAFF_STATE_CODE, STAFF_WALK_SPEED } from "@/core/simulation";
import { DEFAULT_SIMULATION_CONFIG, Simulation } from "@/core/simulation/engine";
import { cafeLayout } from "@/test/fixtures/layouts";
import { paySpots } from "@/core/preview/staff-spots";
import { PAY_SECONDS } from "../walk-pacer";
import { StaffPacer } from "../staff-pacer";
import { VISUAL_WALK_SPEED, WalkPacer, doorFrame, wallDoorFrame } from "../walk-pacer";
import type { CustomerPresentation, PresentationSnapshot, StaffPresentation } from "@/core/simulation/presentation-contract";
import { CLEAR_DISTANCE, MAX_GATE_SECONDS, VisualSync } from "./visual-sync";

const SEATED = AGENT_STATE_CODE.seated;
const TO_SEAT = AGENT_STATE_CODE["to-seat"];
const TO_COUNTER = AGENT_STATE_CODE["to-counter"];
const LEAVING = AGENT_STATE_CODE.leaving;

const customer = (id: number, patch: Partial<CustomerPresentation> = {}): CustomerPresentation => ({
  renderAgentId: id, partyId: 1, memberIndex: 0, tableId: "t1", chairId: `c${id}`, serviceCycleId: "t1:1",
  activity: "waiting-order", seatingPhase: "seated", walkMetersPerSecond: 1, mealId: null,
  thought: { kind: "order-wait", waitSeconds: 0, severity: "normal" }, ...patch,
});
const member = (patch: Partial<StaffPresentation> = {}): StaffPresentation => ({
  staffId: 0, taskId: "task:1", taskKind: "take-order", tableId: "t1", serviceCycleId: "t1:1", activity: "walking",
  walkMetersPerSecond: 1.2, carryMealIds: [], servicePoint: { x: 5, y: 5 }, phaseStartedAtSeconds: 0, phaseEndsAtSeconds: 10,
  thought: null, ...patch,
});
const snapshot = (customers: CustomerPresentation[], staff: StaffPresentation[] = [member()]): PresentationSnapshot => ({
  version: 1, runId: "run", layoutRevision: "rev", sequence: 1, simTimeSeconds: 10, customers, staff, tables: [], meals: [], milestones: [],
});
const agents = (...rows: [number, number][]) => new Float32Array(rows.flatMap(([id, code]) => [id, 0, 0, code]));
const none = () => null;
const nothing = () => false;

describe("VisualSync — งานพนักงานและป้ายสถานะตามภาพ", () => {
  it("รับออเดอร์: รอจนทุกคนในกลุ่มนั่งบนจอ (ไม่นับคนที่กำลังลุก)", () => {
    const sync = new VisualSync();
    const party = snapshot([customer(1), customer(2)]);
    sync.observe(party, agents([1, SEATED], [2, TO_SEAT]), nothing, 0.1);
    expect(sync.taskOf(0)).toBe("task:1");
    expect(sync.open("task:1")).toBe(false);
    sync.observe(party, agents([1, SEATED], [2, SEATED]), nothing, 0.1);
    expect(sync.open("task:1")).toBe(true);
  });

  it("เก็บโต๊ะ: รอจนทุกคนในรอบนั้นลุกแล้วเดินห่างโต๊ะ ≥ CLEAR_DISTANCE แม้ออกจากการจำลองไปแล้ว", () => {
    const sync = new VisualSync();
    sync.observe(snapshot([customer(1)]), agents([1, SEATED]), nothing, 0.1);
    const clean = snapshot([], [member({ taskId: "task:2", taskKind: "clean" })]);
    sync.observe(clean, agents([1, SEATED]), () => true, 0.1);
    expect(sync.open("task:2")).toBe(false);
    // ลุกแล้วแต่ยังยืนข้างโต๊ะ → ยังไม่เข้าไป
    sync.observe(clean, agents([1, LEAVING]), nothing, 0.1);
    expect(sync.open("task:2")).toBe(false);
    sync.observe(clean, new Float32Array([1, 1.2, 0, LEAVING]), nothing, 0.1);
    expect(sync.open("task:2")).toBe(false);
    sync.observe(clean, new Float32Array([1, 1.2, 1, LEAVING]), nothing, 0.1);
    expect(sync.open("task:2")).toBe(true);
  });

  it("กันค้าง: ภาพลูกค้าไม่อยู่แล้ว หรือรอนานเกินกำหนด → ปล่อยให้เดินไปทำงาน", () => {
    const sync = new VisualSync();
    const party = snapshot([customer(1)]);
    sync.observe(party, agents(), nothing, 0.1);
    expect(sync.open("task:1")).toBe(true);
    sync.observe(party, agents([1, TO_SEAT]), nothing, 0.1);
    expect(sync.open("task:1")).toBe(false);
    sync.observe(party, agents([1, TO_SEAT]), nothing, MAX_GATE_SECONDS);
    expect(sync.open("task:1")).toBe(true);
    expect(sync.open("unknown")).toBe(true);
  });

  it("ป้ายลูกค้าตามภาพ: ยังเดินไม่ถึงโต๊ะไม่ขึ้นรอสั่ง, ยังเดินไปจ่ายเงินไม่ขึ้นออกจากร้าน", () => {
    const sync = new VisualSync();
    const walking = snapshot([customer(1)]);
    sync.observe(walking, agents([1, TO_SEAT]), nothing, 0.1);
    expect(sync.align(walking, agents([1, TO_SEAT]), new Float32Array(), none, nothing).customers[0]!.thought).toBeNull();
    expect(sync.align(walking, agents([1, SEATED]), new Float32Array(), none, nothing).customers[0]!.thought?.kind).toBe("order-wait");

    const bill = snapshot([customer(1, { activity: "finished", thought: { kind: "bill-wait", waitSeconds: 30, severity: "normal" } })]);
    sync.align(bill, agents([1, SEATED]), new Float32Array(), none, nothing);
    const leaving = snapshot([customer(1, { activity: "leaving", thought: { kind: "leaving", waitSeconds: 0, severity: "normal" } })]);
    expect(sync.align(leaving, agents([1, TO_COUNTER]), new Float32Array(), none, nothing).customers[0]!.thought?.kind).toBe("bill-wait");
    expect(sync.align(leaving, agents([1, LEAVING]), new Float32Array(), none, nothing).customers[0]!.thought?.kind).toBe("leaving");
  });

  it("ออกจากการจำลองแล้วแต่ภาพยังเดินอยู่: คงป้ายเช็คบิลจนเดินออกจริง แล้วขึ้นป้ายออกจากร้าน", () => {
    const sync = new VisualSync();
    const bill = snapshot([customer(1, { activity: "finished", thought: { kind: "bill-wait", waitSeconds: 30, severity: "normal" } })]);
    sync.observe(bill, agents([1, SEATED]), nothing, 0.1);
    sync.align(bill, agents([1, SEATED]), new Float32Array(), none, nothing);
    const empty = snapshot([], []);
    // ลุก (ยังแสดงนั่ง) → เดินไปเคาน์เตอร์ → เดินออก
    expect(sync.align(empty, agents([1, SEATED]), new Float32Array(), none, nothing).departing).toEqual([
      { renderAgentId: 1, thought: { kind: "bill-wait", waitSeconds: 30, severity: "normal" } },
    ]);
    expect(sync.align(empty, agents([1, TO_COUNTER]), new Float32Array(), none, nothing).departing?.[0]?.thought.kind).toBe("bill-wait");
    expect(sync.align(empty, agents([1, LEAVING]), new Float32Array(), none, nothing).departing?.[0]?.thought)
      .toEqual({ kind: "leaving", waitSeconds: 0, severity: "normal" });
    // คนที่ยังไม่มีป้ายมาก่อน (เช่นเริ่มเล่นภาพกลางทาง) ไม่ได้ป้ายใหม่
    expect(sync.align(empty, agents([2, LEAVING]), new Float32Array(), none, nothing).departing).toEqual([]);
  });

  it("เลิกรอคิวนอกร้านแล้วเดินจากไป: ป้ายไม่ได้รับบริการ", () => {
    const sync = new VisualSync();
    const queued = snapshot([customer(1, { tableId: null, chairId: null, serviceCycleId: null, activity: "walking", seatingPhase: null,
      thought: { kind: "queue-warning", waitSeconds: 400, severity: "warning" } })], []);
    const WAITING = AGENT_STATE_CODE["waiting-entrance"];
    sync.observe(queued, agents([1, WAITING]), nothing, 0.1);
    sync.align(queued, agents([1, WAITING]), new Float32Array(), none, nothing);
    expect(sync.align(snapshot([], []), agents([1, LEAVING]), new Float32Array(), none, nothing).departing?.[0]?.thought)
      .toEqual({ kind: "leaving", waitSeconds: 0, severity: "critical" });
  });

  it("ยังรอสั่งอาหารจนภาพพนักงานมารับออเดอร์ถึงโต๊ะ", () => {
    const sync = new VisualSync();
    const ordered = snapshot([customer(1)]);
    sync.observe(ordered, agents([1, SEATED]), nothing, 0.1);
    sync.align(ordered, agents([1, SEATED]), new Float32Array(), none, nothing);
    const food = snapshot([customer(1, { activity: "waiting-food", thought: { kind: "food-wait", waitSeconds: 5, severity: "normal" } })]);
    const pending = (taskId: string) => taskId === "task:1";
    expect(sync.align(food, agents([1, SEATED]), new Float32Array(), none, pending).customers[0]!.thought?.kind).toBe("order-wait");
    expect(sync.align(food, agents([1, SEATED]), new Float32Array(), none, nothing).customers[0]!.thought?.kind).toBe("food-wait");
  });

  it("พนักงานที่ยืนรอลูกค้า: ท่ายืนประจำ ไม่มีป้ายงาน; ป้ายพนักงานคิดจากท่าที่เห็น", () => {
    const sync = new VisualSync();
    const taking = snapshot([], [member({ activity: "taking-order", thought: { kind: "taking-order" } })]);
    const waiting = sync.align(taking, new Float32Array(), new Float32Array([0, 0, 0, 0]), () => "task:1", nothing).staff[0]!;
    expect(waiting).toMatchObject({ activity: "counter", thought: null });
    // ยังเดินไม่ถึงจุดรับออเดอร์ → ท่าเดิน ไม่มีป้ายรับออเดอร์
    const walking = sync.align(taking, new Float32Array(), new Float32Array([0, 0, 0, 1]), none, nothing).staff[0]!;
    expect(walking).toMatchObject({ activity: "walking", thought: null });
    const arrived = sync.align(taking, new Float32Array(), new Float32Array([0, 5, 5, 2]), none, nothing).staff[0]!;
    expect(arrived.thought?.kind).toBe("taking-order");
  });

  it("ร้านจริงที่ 30×: ลูกค้ายืนจ่ายหน้าจอ POS และพนักงานหลังจอขึ้นป้ายรับเงินระหว่างนั้น", () => {
    const layout = cafeLayout();
    const [spot] = paySpots(layout);
    // ครัวทำทัน ลูกค้าไม่เดินหนีก่อนได้จ่าย — จะได้มีหลายกลุ่มมาจ่ายเงิน
    const sim = new Simulation(layout, { ...DEFAULT_SIMULATION_CONFIG, seed: 2, customersPerHour: 40, closeSeconds: 3600,
      cooks: 3, cookMinutesPerDish: 1, patienceMinutes: 60 });
    sim.trackPaths(); sim.spawnFirstCustomer();
    const walk = new WalkPacer(), pacer = new StaffPacer(), sync = new VisualSync();
    walk.setDoor(doorFrame(layout)); pacer.setKitchenDoor(wallDoorFrame(layout, layout.kitchenDoor)); pacer.setGate(sync);
    sync.setPayPoints(paySpots(layout));
    const dt = 1 / 20, playback = 30;
    const payers = new Map<number, { far: number; badge: boolean }>();
    let strayBadges = 0;
    for (let frame = 0; frame < 20 * 600; frame++) {
      sim.step(dt * playback);
      const snap = sim.presentationSnapshot({ runId: "run", layoutRevision: "rev", sequence: frame });
      const agents = walk.update(sim.agentBuffer(), sim.drainPaths(), dt, VISUAL_WALK_SPEED * 1.75);
      sync.observe(snap, agents, id => walk.isRising(id), dt);
      const staff = pacer.update(sim.staffBuffer(), dt, STAFF_WALK_SPEED * 1.75, playback, true);
      for (const stop of sync.payStops) pacer.holdAt(stop.staffId, stop.point.x, stop.point.y, PAY_SECONDS * playback);
      const shown = sync.align(snap, agents, staff, i => pacer.waitingTask(i), () => false);
      const badge = shown.staff.some(m => m.thought?.kind === "taking-payment");
      let paying = false;
      for (let o = 0; o < agents.length; o += 4) {
        if (agents[o + 3] !== AGENT_STATE_CODE.ordering) continue;
        paying = true;
        const entry = payers.get(agents[o]!) ?? { far: 0, badge: false };
        entry.far = Math.max(entry.far, Math.hypot(agents[o + 1]! - spot!.customer.x, agents[o + 2]! - spot!.customer.y));
        entry.badge ||= badge;
        payers.set(agents[o]!, entry);
      }
      if (badge && !paying) strayBadges++;
    }
    expect(payers.size).toBeGreaterThan(3);
    // คนแรกในคิวยืนตรงหน้าจอ (ช่องกริด 0.25 ม.) — คนที่ต่อคิวอยู่ถัดไปไม่เกิน ~1 ม.
    expect(Math.min(...[...payers.values()].map(p => p.far))).toBeLessThan(0.2);
    expect([...payers.values()].every(p => p.far < 1.2)).toBe(true);
    // วัดได้ 100% (seed 2) — เผื่อไว้กรณีพนักงานติดงานอื่นจนไม่มีใครอยู่หลังจอ
    expect([...payers.values()].filter(p => p.badge).length / payers.size).toBeGreaterThan(0.9);
    expect(strayBadges).toBe(0);
  });

  it("ร้านจริงที่ 30×: พนักงานไม่ถึงโต๊ะก่อนลูกค้าพร้อมบนจอ (เดิมเกิน 2 ใน 3 ของงาน)", () => {
    for (const seed of [1, 2, 3]) {
      const gated = serviceArrivals(seed, true), ungated = serviceArrivals(seed, false);
      expect(gated.tasks).toBeGreaterThan(5);
      expect(gated.early).toEqual([]);
      // ตัววัดยังจับปัญหาเดิมได้จริง
      expect(ungated.early.length).toBeGreaterThan(0);
    }
  });
});

/** เล่นร้านจริง 10 นาทีที่ 30× ผ่าน pacer ทั้งสอง แล้วนับงานที่ภาพพนักงานเริ่มทำที่โต๊ะก่อนภาพลูกค้าพร้อม */
function serviceArrivals(seed: number, gated: boolean) {
  const layout = cafeLayout();
  const sim = new Simulation(layout, { ...DEFAULT_SIMULATION_CONFIG, seed, customersPerHour: 40, closeSeconds: 3600 });
  sim.trackPaths(); sim.spawnFirstCustomer();
  const walk = new WalkPacer(), pacer = new StaffPacer(), sync = new VisualSync();
  walk.setDoor(doorFrame(layout)); pacer.setKitchenDoor(wallDoorFrame(layout, layout.kitchenDoor));
  if (gated) pacer.setGate(sync);
  const cycles = new Map<number, string>();
  const work = new Map<string, { clean: boolean; cycle: string; point: { x: number; y: number } | null }>();
  const checked = new Set<string>(), early: string[] = [];
  const seats = new Map<number, { x: number; y: number }>();
  const dt = 1 / 20, playback = 30;
  for (let frame = 0; frame < 20 * 600; frame++) {
    sim.step(dt * playback);
    const snap = sim.presentationSnapshot({ runId: "run", layoutRevision: "rev", sequence: frame });
    const shownAgents = walk.update(sim.agentBuffer(), sim.drainPaths(), dt, VISUAL_WALK_SPEED * 1.75);
    sync.observe(snap, shownAgents, id => walk.isRising(id), dt);
    const shownStaff = pacer.update(sim.staffBuffer(), dt, STAFF_WALK_SPEED * 1.75, playback, true);
    for (const c of snap.customers) if (c.serviceCycleId) cycles.set(c.renderAgentId, c.serviceCycleId);
    for (const m of snap.staff) if (m.taskId && m.serviceCycleId && (m.taskKind === "take-order" || m.taskKind === "clean")) {
      const known = work.get(m.taskId);
      work.set(m.taskId, { clean: m.taskKind === "clean", cycle: m.serviceCycleId, point: m.servicePoint ?? known?.point ?? null });
    }
    const codes = new Map<number, number>(), at = new Map<number, { x: number; y: number }>();
    for (let o = 0; o < shownAgents.length; o += 4) {
      const id = shownAgents[o]!;
      codes.set(id, shownAgents[o + 3]!);
      at.set(id, { x: shownAgents[o + 1]!, y: shownAgents[o + 2]! });
      if (shownAgents[o + 3] === SEATED && !walk.isRising(id)) seats.set(id, at.get(id)!);
    }
    for (let o = 0; o < shownStaff.length; o += 4) {
      const index = shownStaff[o]!, code = shownStaff[o + 3]!;
      // ไม่มีประตูรอ pacer ไม่รู้งานบนภาพ — ใช้งานปัจจุบันของการจำลองแทน
      const taskId = gated ? pacer.currentTask(index) : snap.staff.find(m => m.staffId === index)?.taskId ?? null;
      const task = taskId ? work.get(taskId) : undefined;
      if (!taskId || !task || checked.has(taskId)) continue;
      // เก็บโต๊ะ: ตรวจตอนภาพพนักงานเริ่มออกเดิน (ลูกค้าอาจเดินผ่านใกล้โต๊ะอีกทีตอนไปประตู)
      // รับออเดอร์: ตรวจตอนภาพพนักงานถึงจุดรับออเดอร์
      if (!task.clean && (code !== STAFF_STATE_CODE["taking-order"] || !task.point ||
        Math.hypot(shownStaff[o + 1]! - task.point.x, shownStaff[o + 2]! - task.point.y) > 0.15)) continue;
      checked.add(taskId);
      const party = [...cycles].filter(([id, cycle]) => cycle === task.cycle && codes.has(id)).map(([id]) => id);
      const clear = (id: number) => {
        const seat = seats.get(id), now = at.get(id)!;
        return !seat || Math.hypot(now.x - seat.x, now.y - seat.y) >= CLEAR_DISTANCE - 1e-3;
      };
      const ready = task.clean ? party.every(id => codes.get(id) !== SEATED && clear(id)) : party.every(id => codes.get(id) === SEATED);
      if (!ready) early.push(`${task.clean ? "clean" : "take-order"} ${taskId}`);
    }
  }
  return { tasks: checked.size, early };
}
