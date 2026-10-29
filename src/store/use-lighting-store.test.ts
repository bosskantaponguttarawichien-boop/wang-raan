import { describe, expect, it, vi } from "vitest";
import { emptyMetrics } from "@/core/simulation/engine";
import { parseLocalDateTimeToUtcMs } from "@/components/preview-3d/lighting/settings";
import { createLightingStore } from "./use-lighting-store";
import { createSimulationStore } from "./use-simulation-store";

const at = (time: string) => parseLocalDateTimeToUtcMs(`2026-03-21T${time}`, "Asia/Bangkok");

describe("lighting follows the restaurant simulation", () => {
  it("starts at opening, advances at engine speed once, pauses and resets without altering simulation state", () => {
    const simulation = createSimulationStore();
    simulation.getState().setConfig({ openTime: "10:00", closeTime: "20:00" });
    const lighting = createLightingStore({}, undefined, simulation);
    try {
      expect(lighting.getState().effectiveUtcMs).toBe(at("10:00"));
      const listener = vi.fn();
      lighting.subscribe(listener);
      simulation.setState({ status: "running", metrics: { ...emptyMetrics(), time: 8 * 3600 } });
      expect(lighting.getState().effectiveUtcMs).toBe(at("18:00"));
      simulation.getState().setConfig({ speed: 30 });
      expect(lighting.getState().effectiveUtcMs).toBe(at("18:00"));
      expect(listener).toHaveBeenCalledTimes(1);
      simulation.setState({ metrics: { ...emptyMetrics(), time: 8 * 3600 + 59 } });
      expect(listener).toHaveBeenCalledTimes(1);
      simulation.setState({ status: "paused" });
      lighting.getState().refreshSimulation();
      expect(lighting.getState().effectiveUtcMs).toBe(at("18:00"));
      simulation.setState({ status: "running", metrics: { ...emptyMetrics(), time: 10 * 3600 } });
      expect(lighting.getState().effectiveUtcMs).toBe(at("20:00"));
      expect(lighting.getState().solar.elevationDegrees).toBeLessThan(0);
      const before = simulation.getState();
      lighting.getState().setNorthOffsetDegrees(45);
      expect(simulation.getState()).toBe(before);
      simulation.setState({ status: "idle" });
      expect(lighting.getState().effectiveUtcMs).toBe(at("10:00"));
      simulation.getState().setConfig({ openTime: "19:00", closeTime: "23:00" });
      expect(lighting.getState().effectiveUtcMs).toBe(at("19:00"));
      expect(lighting.getState().solar.elevationDegrees).toBeLessThan(0);
      simulation.setState({ status: "starting", metrics: null });
      simulation.setState({ status: "running" });
      expect(lighting.getState().effectiveUtcMs).toBe(at("19:00"));
    } finally {
      lighting.dispose();
    }
  });

  it("keeps fixed previews independent and returns to current simulation time, including timezone changes", () => {
    const simulation = createSimulationStore();
    const lighting = createLightingStore({}, undefined, simulation);
    try {
      lighting.getState().setSettings({ mode: "fixed", fixedDateTimeLocal: "2026-03-21T23:30" });
      simulation.setState({ status: "running", metrics: { ...emptyMetrics(), time: 2 * 3600 } });
      expect(lighting.getState().effectiveUtcMs).toBe(at("23:30"));
      lighting.getState().setMode("simulation");
      expect(lighting.getState().effectiveUtcMs).toBe(at("12:00"));
      lighting.getState().setTimezone("Asia/Tokyo");
      expect(lighting.getState().effectiveUtcMs).toBe(at("12:00") - 2 * 3600_000);
      lighting.dispose();
      simulation.setState({ metrics: { ...emptyMetrics(), time: 3 * 3600 } });
      expect(lighting.getState().effectiveUtcMs).toBe(at("12:00") - 2 * 3600_000);
    } finally {
      lighting.dispose();
    }
  });
});
