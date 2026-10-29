import { expect, it } from "vitest";
import type { PresentationSnapshot } from "@/core/simulation/presentation-contract";
import { alignPresentation } from "./presentation-frame";

it("waits for the displayed seat/service point before playing eating or interaction actions", () => {
  const snapshot: PresentationSnapshot = {
    version: 1, runId: "run", layoutRevision: "layout", sequence: 1, simTimeSeconds: 20,
    customers: [{ renderAgentId: 10, partyId: 1, memberIndex: 0, tableId: "table", chairId: "chair", serviceCycleId: "cycle",
      activity: "eating", seatingPhase: "seated", walkMetersPerSecond: 1, mealId: "meal" }],
    staff: [{ staffId: 0, taskId: "task", taskKind: "clean", tableId: "table", serviceCycleId: "cycle", activity: "wiping",
      walkMetersPerSecond: 1.2, carryMealIds: [], servicePoint: { x: 5, y: 0 }, phaseStartedAtSeconds: 10, phaseEndsAtSeconds: 25 }],
    tables: [], meals: [], milestones: [],
  };
  const approaching = alignPresentation(snapshot, new Float32Array([10, 0, 0, 3]), new Float32Array([0, 0, 0, 2]));
  expect(approaching.customers[0]).toMatchObject({ activity: "waiting-food", seatingPhase: "approach" });
  expect(approaching.staff[0]!.activity).toBe("walking");
  const arrived = alignPresentation(snapshot, new Float32Array([10, 0, 0, 4]), new Float32Array([0, 5, 0, 2]));
  expect(arrived.customers[0]!.activity).toBe("eating");
  expect(arrived.staff[0]!.activity).toBe("wiping");
  expect(alignPresentation(snapshot, new Float32Array(), new Float32Array([0, 0, 0, 5])).staff[0]!.activity).toBe("pickup");

  // Clearing before reaching servicePoint and counter while StaffPacer is still walking back (code=1 or 3).
  const clearingSnapshot: PresentationSnapshot = {
    ...snapshot,
    staff: [
      { ...snapshot.staff[0]!, activity: "clearing" },
      { ...snapshot.staff[0]!, staffId: 1, activity: "counter", servicePoint: null },
    ],
  };
  const aligned = alignPresentation(clearingSnapshot, new Float32Array(), new Float32Array([0, 0, 0, 2, 1, 2, 2, 1]));
  expect(aligned.staff[0]!.activity).toBe("walking");
  expect(aligned.staff[1]!.activity).toBe("walking");

  expect(snapshot.customers[0]!.activity).toBe("eating");
  expect(snapshot.staff[0]!.activity).toBe("wiping");
  expect(approaching.tables).toBe(snapshot.tables);
});
