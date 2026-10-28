import { describe, expect, it } from "vitest";
import { Simulation } from "@/core/simulation/engine";
import { SimulationWorkerRuntime } from "@/core/simulation/worker-runtime";
import { validateLayout } from "@/core/validation/engine";
import { cafeLayout } from "@/test/fixtures/layouts";
import { PresentationBridge, parsePresentation } from "./presentation-bridge";

const layout = cafeLayout(), validation = validateLayout(layout);
function runtime() {
  const rt = new SimulationWorkerRuntime();
  rt.handle({ type: "SYNC_LAYOUT", requestId: 1, payload: { layout, validation } });
  return rt;
}
function start(rt: SimulationWorkerRuntime) {
  const result = rt.handle({ type: "START", requestId: 2, layoutRevision: validation.layoutRevision, config: { customersPerHour: 120, seed: 4, speed: 1, skipQuiet: true } });
  if (result.response.type !== "STARTED") throw new Error("not started");
  return { ...result, response: result.response };
}
function snapshot(sequence = 0) {
  return new Simulation(layout, { seed: 4 }).presentationSnapshot({ runId: "run1", layoutRevision: validation.layoutRevision, sequence });
}

describe("presentation transport and gate", () => {
  it("sends initial/full TICK snapshots with stable run identity, without detaching engine state", () => {
    const rt = runtime(), started = start(rt);
    const initial = structuredClone(started.response, { transfer: started.transfer });
    expect(initial.initial!.presentation!.sequence).toBe(0);
    expect(parsePresentation(initial.initial!.presentation)).not.toBeNull();
    const bridge = new PresentationBridge();
    bridge.begin(validation.layoutRevision, { runId: initial.runId, presentation: initial.initial!.presentation });
    const before = JSON.stringify(bridge.current);
    const tick = rt.tick(50)!;
    const copied = structuredClone(tick.response, { transfer: tick.transfer });
    expect(copied.agents.length).toBeGreaterThan(0);
    expect(copied.presentation!.customers.length * 4).toBe(copied.agents.length);
    expect(copied.presentation!.simTimeSeconds).toBe(copied.metrics.time);
    expect(copied.runId).toBe(initial.runId);
    expect(bridge.accept(copied)).toBe(true);
    expect(bridge.current!.sequence).toBe(1);
    expect(before).not.toBe(JSON.stringify(bridge.current));
    expect(rt.tick(50)!.response.agents.length).toBe(copied.agents.length);
  });
  it("rejects old runs, duplicate/out-of-order sequence, stale layout and malformed values", () => {
    const bridge = new PresentationBridge(); bridge.begin(validation.layoutRevision, { runId: "run1", presentation: snapshot() });
    const one = snapshot(1);
    expect(bridge.accept({ presentation: one })).toBe(true);
    expect(bridge.accept({ presentation: one })).toBe(false);
    expect(bridge.accept({ presentation: snapshot(0) })).toBe(false);
    expect(bridge.accept({ presentation: { ...snapshot(2), runId: "old-run" } })).toBe(false);
    expect(bridge.accept({ presentation: { ...snapshot(2), layoutRevision: "old-layout" } })).toBe(false);
    expect(bridge.accept({ presentation: { ...snapshot(2), simTimeSeconds: NaN } })).toBe(false);
    expect(bridge.accept({ runId: "run1", sequence: 9, presentation: snapshot(2) })).toBe(false);
    expect(bridge.current).toEqual(one);
    bridge.reset(); expect(bridge.accept({ presentation: snapshot(3) })).toBe(false);
  });
  it("accepts legacy and unsupported-version motion with no invented semantic state", () => {
    const bridge = new PresentationBridge(); bridge.begin(validation.layoutRevision);
    expect(bridge.accept({})).toBe(true); expect(bridge.current).toBeNull();
    bridge.begin(validation.layoutRevision, { runId: "run1" });
    expect(bridge.accept({ runId: "run1", sequence: 1, presentation: { ...snapshot(1), version: 99 } })).toBe(true);
    expect(bridge.current).toBeNull();
    expect(bridge.accept({})).toBe(false); // Do not accept an unidentified old tick in a modern run.
    expect(bridge.accept({ presentation: snapshot(2) })).toBe(true);
    expect(bridge.current!.version).toBe(1);
  });
  it("keeps the same identity across pause/resume, and changes it on every START/runtime", () => {
    const rt = runtime(), first = start(rt).response;
    rt.handle({ type: "PAUSE", requestId: 3 }); expect(rt.tick(50)).toBeNull();
    rt.handle({ type: "RESUME", requestId: 4 }); expect(rt.tick(50)!.response.runId).toBe(first.runId);
    rt.handle({ type: "STOP", requestId: 5 }); expect(rt.tick(50)).toBeNull();
    const next = start(rt).response; expect(next.runId).not.toBe(first.runId);
    expect(start(runtime()).response.runId).not.toBe(next.runId);
  });
  it("blocked layout sync invalidates an active run, rather than emitting stale frames", () => {
    const rt = runtime(); start(rt);
    const blocked = { ...layout, kitchenDoor: null };
    expect(rt.handle({ type: "SYNC_LAYOUT", requestId: 3, payload: { layout: blocked, validation: validateLayout(blocked) } }).response).toMatchObject({ type: "ERROR", code: "BLOCKED" });
    expect(rt.tick(50)).toBeNull();
  });
  it("payload size grows with current actors, not elapsed event history", () => {
    const base = snapshot();
    const sizes = [1, 40, 80].map(count => {
      const customers = Array.from({ length: count }, (_, id) => ({ renderAgentId: id, partyId: id, memberIndex: 0, tableId: null, chairId: null, serviceCycleId: null, activity: "walking" as const, seatingPhase: null, walkMetersPerSecond: 1.2, mealId: null }));
      const data = { ...base, customers };
      expect(parsePresentation(data)).not.toBeNull();
      return Buffer.byteLength(JSON.stringify(data));
    });
    expect(sizes[2]).toBeLessThan(40_000);
    expect(sizes[2]! - sizes[1]!).toBeLessThan(40 * 500);
  });
});
