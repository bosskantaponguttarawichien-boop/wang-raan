/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createThoughtOverlayManager } from "./thought-overlay";
import type { PresentationSnapshot } from "@/core/simulation/presentation-contract";

describe("ThoughtOverlayManager", () => {
  const container = document.createElement("div");
  const canvas = document.createElement("canvas");
  Object.defineProperty(canvas, "clientWidth", { value: 800 });
  Object.defineProperty(canvas, "clientHeight", { value: 600 });
  const renderer = { domElement: canvas } as unknown as THREE.WebGLRenderer;
  const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
  camera.position.set(5, 5, 5);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();

  it("creates, updates, and removes thought bubbles for customers", () => {
    const manager = createThoughtOverlayManager(container);
    const model = new THREE.Object3D();
    model.position.set(0, 0, 0);
    model.updateMatrixWorld(true);
    const customers = new Map<number, { model: THREE.Object3D }>([[10, { model }]]);
    const staff: Array<{ model: THREE.Object3D }> = [];

    const snapshot: PresentationSnapshot = {
      version: 1,
      runId: "test",
      layoutRevision: "rev",
      sequence: 1,
      simTimeSeconds: 100,
      customers: [
        {
          renderAgentId: 10,
          partyId: 1,
          memberIndex: 0,
          tableId: "t1",
          chairId: "c1",
          serviceCycleId: "cy1",
          activity: "waiting-food",
          seatingPhase: "seated",
          walkMetersPerSecond: 1.2,
          mealId: null,
          thought: { kind: "food-warning", waitSeconds: 420, severity: "warning" },
        },
      ],
      meals: [],
      tables: [],
      staff: [],
      milestones: [],
    };

    // 1. Update with active thought
    manager.update(snapshot, camera, renderer, customers, staff, true);
    const bubble = container.querySelector('[data-agent-id="10"]');
    expect(bubble).not.toBeNull();
    expect(bubble?.getAttribute("aria-label")).toContain("รออาหารนาน");
    expect(bubble?.innerHTML).toContain("⏳");
    expect(bubble?.innerHTML).toContain("7น.");

    // Animation frames should move the existing DOM, not rebuild its SVG.
    const cloud = bubble?.firstElementChild;
    model.position.x = 1;
    model.updateMatrixWorld(true);
    manager.update(snapshot, camera, renderer, customers, staff, true);
    expect(bubble?.firstElementChild).toBe(cloud);

    const changedSnapshot: PresentationSnapshot = { ...snapshot, customers: [{ ...snapshot.customers[0]!, thought: { kind: "food-critical", waitSeconds: 900, severity: "critical" } }] };
    manager.update(changedSnapshot, camera, renderer, customers, staff, true);
    expect(bubble?.firstElementChild).not.toBe(cloud);
    expect(bubble?.getAttribute("aria-label")).toContain("รออาหารนานมาก");

    // 2. Hide when showThoughts is false
    manager.update(snapshot, camera, renderer, customers, staff, false);
    expect(container.querySelector('[data-agent-id="10"]')).toBeNull();

    // 3. Clear and dispose
    manager.update(snapshot, camera, renderer, customers, staff, true);
    expect(container.children.length).toBe(1);
    manager.dispose();
    expect(container.children.length).toBe(0);
  });

  it("renders staff thought bubbles", () => {
    const manager = createThoughtOverlayManager(container);
    const staffModel = new THREE.Object3D();
    staffModel.position.set(0, 0, 0);
    staffModel.updateMatrixWorld(true);
    const customers = new Map<number, { model: THREE.Object3D }>();
    const staff = [{ model: staffModel }];

    const snapshot: PresentationSnapshot = {
      version: 1,
      runId: "test",
      layoutRevision: "rev",
      sequence: 1,
      simTimeSeconds: 100,
      customers: [],
      meals: [],
      tables: [],
      staff: [
        {
          staffId: 0,
          taskId: "task-1",
          taskKind: "take-order",
          tableId: "t1",
          serviceCycleId: "cy1",
          activity: "taking-order",
          walkMetersPerSecond: 1.2,
          carryMealIds: [],
          servicePoint: null,
          phaseStartedAtSeconds: 90,
          phaseEndsAtSeconds: 110,
          thought: { kind: "taking-order" },
        },
      ],
      milestones: [],
    };

    manager.update(snapshot, camera, renderer, customers, staff, true);
    const staffBubble = container.querySelector('[data-staff-id="0"]');
    expect(staffBubble).not.toBeNull();
    expect(staffBubble?.innerHTML).toContain("📝");
    expect(staffBubble?.getAttribute("aria-label")).toContain("กำลังรับออร์เดอร์");
    const cloud = staffBubble?.firstElementChild;
    manager.update(snapshot, camera, renderer, customers, staff, true);
    expect(staffBubble?.firstElementChild).toBe(cloud);
    const changedSnapshot: PresentationSnapshot = { ...snapshot, staff: [{ ...snapshot.staff[0]!, thought: { kind: "cleaning" } }] };
    manager.update(changedSnapshot, camera, renderer, customers, staff, true);
    expect(staffBubble?.firstElementChild).not.toBe(cloud);
    expect(staffBubble?.getAttribute("aria-label")).toContain("กำลังเช็ด");
    manager.dispose();
  });
});
