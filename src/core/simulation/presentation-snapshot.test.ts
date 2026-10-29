import { describe, expect, it } from "vitest";
import { cafeLayout } from "@/test/fixtures/layouts";
import { objectCenter } from "../layout/geometry";
import { Simulation } from "./engine";
import { foodKindFor, resolveCustomerThought, resolveStaffThought, type PartyView } from "./presentation-snapshot";
import type { PresentationSnapshot } from "./presentation-contract";

const envelope = { runId: "test-run", layoutRevision: "revision", sequence: 1 };
function quick(seed = 4) {
  return new Simulation(cafeLayout(), { seed, customersPerHour: 1, closeSeconds: 1, cooks: 4, frontStaff: 2,
    cookMinutesPerDish: 0.01, takeOrderSeconds: [1, 1], dineMinutes: [0.1, 0.1], paySeconds: [1, 1], cleanTableSeconds: [45, 45], patienceMinutes: 100 });
}

describe("presentation snapshots", () => {
  it("binds parties of 1, 2 and 4 to distinct chairs, matching buffer and path identities", () => {
    const seenSizes = new Set<number>();
    for (let seed = 1; seed <= 20 && ![1, 2, 4].every(size => seenSizes.has(size)); seed++) {
      const sim = quick(seed); sim.trackPaths(); sim.spawnFirstCustomer();
      const first = sim.presentationSnapshot(envelope);
      const party = first.customers.filter(customer => customer.partyId === first.customers[0]!.partyId);
      seenSizes.add(party.length);
      expect(new Set(party.map(customer => customer.chairId)).size).toBe(party.length);
      for (let t = 0; t < 100; t++) {
        sim.step(0.25);
        const snapshot = sim.presentationSnapshot(envelope), buffer = sim.agentBuffer(), paths = sim.drainPaths();
        for (let offset = 0; offset < paths.length;) {
          expect(first.customers.some(customer => customer.renderAgentId === paths[offset])).toBe(true);
          offset += 2 + paths[offset + 1]! * 2;
        }
        for (const customer of snapshot.customers.filter(customer => customer.seatingPhase === "seated")) {
          const chair = cafeLayout().objects.find(object => object.id === customer.chairId)!;
          const center = objectCenter(chair), offset = buffer.findIndex((value, index) => index % 4 === 0 && value === customer.renderAgentId);
          expect(buffer[offset + 1]).toBeCloseTo(center.x, 5);
          expect(buffer[offset + 2]).toBeCloseTo(center.y, 5);
        }
      }
    }
    expect([...seenSizes]).toEqual(expect.arrayContaining([1, 2, 4]));
  });
  it("reconstructs waiting → served → eating → dirty → wiping → clean, retaining used dishes", () => {
    const sim = quick(); sim.trackPaths(); sim.spawnFirstCustomer();
    const phases = new Set<string>();
    let dirtyTable: string | null = null, retainedAfterExit = false, clean = false;
    let saved: PresentationSnapshot | null = null, savedJSON = "";
    for (let t = 0; t < 480; t++) {
      sim.step(0.5);
      const snapshot = sim.presentationSnapshot({ ...envelope, sequence: t });
      for (const customer of snapshot.customers) phases.add(customer.activity);
      for (const staff of snapshot.staff) phases.add(staff.activity);
      if (snapshot.customers.some(customer => customer.activity === "waiting-order")) expect(snapshot.meals.filter(meal => meal.placedAtSeconds !== null)).toHaveLength(0);
      if (snapshot.meals.some(meal => meal.consumed > 0) && !saved) { saved = snapshot; savedJSON = JSON.stringify(snapshot); }
      for (const table of snapshot.tables) {
        if (table.availability === "dirty") dirtyTable = table.tableId;
        if (table.tableId === dirtyTable && (table.availability === "dirty" || table.availability === "cleaning")) {
          expect(table.mealIds.length).toBeGreaterThan(0);
          expect(table.stainAmount).toBeGreaterThan(0);
          if (snapshot.customers.length === 0) retainedAfterExit = true;
        }
        if (table.tableId === dirtyTable && table.availability === "clean") {
          expect(table.mealIds).toHaveLength(0); expect(table.stainAmount).toBe(0); expect(table.cleanCompletedAtSeconds).not.toBeNull(); clean = true;
        }
      }
      if (clean) break;
    }
    expect([...phases]).toEqual(expect.arrayContaining(["waiting-order", "waiting-food", "pickup", "put-down", "eating", "wiping"]));
    expect(retainedAfterExit).toBe(true); expect(clean).toBe(true); expect(saved).not.toBeNull(); expect(JSON.stringify(saved)).toBe(savedJSON);
  });
  it("does not deliver cancelled food, and never changes simulation metrics or RNG", () => {
    const config = { seed: 11, customersPerHour: 120, cooks: 1, patienceMinutes: 0.1 };
    const observed = new Simulation(cafeLayout(), config), plain = new Simulation(cafeLayout(), config);
    observed.trackPaths();
    for (let time = 0; time < 1800; time++) {
      observed.step(1); plain.step(1);
      const snapshot = observed.presentationSnapshot({ ...envelope, sequence: time });
      observed.drainPaths();
      expect(observed.getMetrics()).toEqual(plain.getMetrics());
      expect(observed.agentBuffer()).toEqual(plain.agentBuffer());
      for (const customer of snapshot.customers.filter(customer => customer.activity === "leaving" && customer.mealId === null)) {
        expect(snapshot.meals.some(meal => meal.ownerRenderAgentId === customer.renderAgentId)).toBe(false);
      }
      for (const task of snapshot.milestones) expect(snapshot.tables.some(table => table.serviceCycleId === task.serviceCycleId)).toBe(true);
      expect(snapshot.milestones.length).toBeLessThanOrEqual(snapshot.tables.length * 4);
    }
    expect(observed.getMetrics().abandoned).toBeGreaterThan(0);
  });
  it("supports counter-order and starting path tracking in the middle of a run", () => {
    const sim = new Simulation(cafeLayout(), { serviceStyle: "counter-order", customersPerHour: 120, seed: 4, orderSeconds: [1, 1], dineMinutes: [1, 1] });
    sim.step(100); sim.trackPaths();
    const snapshot = sim.presentationSnapshot(envelope);
    expect(snapshot.customers.length).toBeGreaterThan(0);
    for (const customer of snapshot.customers.filter(customer => customer.activity === "eating")) {
      const meal = snapshot.meals.find(meal => meal.mealId === customer.mealId);
      expect(meal?.placedAtSeconds).not.toBeNull(); expect(meal?.chairId).toBe(customer.chairId);
    }
    expect(snapshot.staff.every(staff => staff.taskId === null)).toBe(true);
  });
  it("selects a stable food variety without consuming randomness", () => {
    expect(foodKindFor(4, 1, 0)).toBe(foodKindFor(4, 1, 0));
    expect(new Set(Array.from({ length: 100 }, (_, id) => foodKindFor(4, id, id % 4))).size).toBe(5);
  });

  it("resolves customer thoughts and severity across queue, order, food, and dining stages", () => {
    const baseParty: PartyView = {
      id: 1,
      state: "waiting-entrance",
      partySize: 2,
      chairIds: [],
      tableId: null,
      cycleId: null,
      speed: 1.2,
      fedAt: null,
      placedAt: null,
      dineSeconds: 600,
      cancelled: false,
      entranceQueuedAt: 100,
      seatedAt: 200,
    };

    // 1. รอคิวหน้าร้าน: ปกติ (รอ 2 นาที), เตือน (รอ 6 นาที), วิกฤต (รอ 12 นาที)
    expect(resolveCustomerThought(baseParty, 220, 0, 0)).toEqual({
      kind: "queue-wait",
      waitSeconds: 120,
      severity: "normal",
    });
    expect(resolveCustomerThought(baseParty, 460, 0, 0)).toEqual({
      kind: "queue-warning",
      waitSeconds: 360,
      severity: "warning",
    });
    expect(resolveCustomerThought(baseParty, 820, 0, 0)).toEqual({
      kind: "queue-critical",
      waitSeconds: 720,
      severity: "critical",
    });

    // 2. รอสั่งอาหารที่โต๊ะ: ปกติ (< 60 วินาที), เตือน (>= 60 วินาที)
    const orderParty: PartyView = { ...baseParty, state: "waiting-order", seatedAt: 300 };
    expect(resolveCustomerThought(orderParty, 330, 0, 0)).toEqual({
      kind: "order-wait",
      waitSeconds: 30,
      severity: "normal",
    });
    expect(resolveCustomerThought(orderParty, 390, 0, 0)).toEqual({
      kind: "order-wait",
      waitSeconds: 90,
      severity: "warning",
    });

    // 3. รออาหารที่โต๊ะ: ปกติ (< 6 นาที), เตือน (>= 6 นาที), วิกฤต (>= 12 นาที)
    const foodParty: PartyView = { ...baseParty, state: "waiting-food", seatedAt: 500 };
    expect(resolveCustomerThought(foodParty, 700, 0, 0)).toEqual({
      kind: "food-wait",
      waitSeconds: 200,
      severity: "normal",
    });
    expect(resolveCustomerThought(foodParty, 900, 0, 0)).toEqual({
      kind: "food-warning",
      waitSeconds: 400,
      severity: "warning",
    });
    expect(resolveCustomerThought(foodParty, 1300, 0, 0)).toEqual({
      kind: "food-critical",
      waitSeconds: 800,
      severity: "critical",
    });

    // 4. ทานอาหาร (consumed < 1)
    const eatingParty: PartyView = { ...baseParty, state: "seated", fedAt: 1000 };
    expect(resolveCustomerThought(eatingParty, 1200, 0, 0.5)).toEqual({
      kind: "eating",
      waitSeconds: 200,
      severity: "normal",
    });

    // 5. ทานเสร็จแล้ว รอเช็คบิล (consumed >= 1)
    expect(resolveCustomerThought(eatingParty, 1600, 0, 1.0)).toEqual({
      kind: "bill-wait",
      waitSeconds: 600,
      severity: "normal",
    });

    // 6. เดินออก หรือ cancelled
    expect(resolveCustomerThought({ ...eatingParty, cancelled: true }, 1600, 0, 1.0)).toBeNull();
    expect(resolveCustomerThought({ ...eatingParty, state: "leaving" }, 1600, 0, 1.0)).toBeNull();
  });

  it("resolves staff thoughts for active tasks", () => {
    expect(resolveStaffThought("taking-order")).toEqual({ kind: "taking-order" });
    expect(resolveStaffThought("carrying")).toEqual({ kind: "serving" });
    expect(resolveStaffThought("wiping")).toEqual({ kind: "cleaning" });
    expect(resolveStaffThought("counter")).toBeNull();
    expect(resolveStaffThought("walking")).toBeNull();
  });
});
