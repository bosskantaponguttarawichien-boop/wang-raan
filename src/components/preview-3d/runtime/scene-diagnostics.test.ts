import { describe, expect, it, vi } from "vitest";
import {
  DIAGNOSTICS_FLAG,
  DIAGNOSTICS_KEY,
  installSceneDiagnostics,
  readRendererCounters,
  type SceneDiagnostics,
} from "./scene-diagnostics";

function fakeDiagnostics(): SceneDiagnostics {
  return {
    version: 1,
    staffActions: () => [],
    customerActions: () => [],
    seating: () => [],
    tableService: () => null,
    renderer: () => null,
    frame: () => ({
      modern: false, simulating: false, running: false, simTimeSeconds: null,
      playbackRate: 1, frameDebtSeconds: 0, customerCount: 0, staffCount: 0,
    }),
    quality: () => ({
      level: 0, maxPixelRatio: 1.5, characterShadows: true, shadowMapSize: 2048,
      pixelRatio: 1, shadowAutoUpdate: true, visibleShadowProxies: 0,
      sampler: { samplesInWindow: 0, measuredMs: 0, warmupMs: 0, lastSampleMs: 0 },
      sceneInstances: 1,
    }),
  };
}

describe("scene diagnostics hook", () => {
  it("stays off for an ordinary visitor", () => {
    const scope: Record<string, unknown> = {};
    const remove = installSceneDiagnostics(scope, fakeDiagnostics());
    expect(scope[DIAGNOSTICS_KEY]).toBeUndefined();
    remove();
    expect(Object.keys(scope)).toEqual([]);
  });

  it.each([false, "true", 1, undefined])("refuses a flag that is not exactly true: %p", value => {
    const scope: Record<string, unknown> = { [DIAGNOSTICS_FLAG]: value };
    installSceneDiagnostics(scope, fakeDiagnostics());
    expect(scope[DIAGNOSTICS_KEY]).toBeUndefined();
  });

  it("installs when the flag was set before the scene mounted, and removes itself", () => {
    const scope: Record<string, unknown> = { [DIAGNOSTICS_FLAG]: true };
    const diagnostics = fakeDiagnostics();
    const remove = installSceneDiagnostics(scope, diagnostics);
    expect(scope[DIAGNOSTICS_KEY]).toBe(diagnostics);
    remove();
    expect(scope[DIAGNOSTICS_KEY]).toBeUndefined();
    // Removing twice is safe.
    remove();
    expect(scope[DIAGNOSTICS_KEY]).toBeUndefined();
  });

  it("never removes a hook a later scene installed", () => {
    const scope: Record<string, unknown> = { [DIAGNOSTICS_FLAG]: true };
    const first = fakeDiagnostics();
    const removeFirst = installSceneDiagnostics(scope, first);
    const second = fakeDiagnostics();
    installSceneDiagnostics(scope, second);
    removeFirst();
    expect(scope[DIAGNOSTICS_KEY]).toBe(second);
  });

  it("does nothing without a scope (server rendering)", () => {
    expect(() => installSceneDiagnostics(undefined, fakeDiagnostics())()).not.toThrow();
  });

  it("exposes getters only — the scene cannot be driven through it", () => {
    const scope: Record<string, unknown> = { [DIAGNOSTICS_FLAG]: true };
    const staffActions = vi.fn(() => []);
    installSceneDiagnostics(scope, { ...fakeDiagnostics(), staffActions });
    const hook = scope[DIAGNOSTICS_KEY] as SceneDiagnostics;
    expect(Object.keys(hook).filter(key => typeof (hook as unknown as Record<string, unknown>)[key] === "function").sort())
      .toEqual(["customerActions", "frame", "quality", "renderer", "seating", "staffActions", "tableService"]);
    hook.staffActions();
    expect(staffActions).toHaveBeenCalledTimes(1);
  });
});

describe("renderer counters", () => {
  it("reads the three.js info object without importing Three", () => {
    expect(readRendererCounters({
      render: { calls: 42, triangles: 1234, lines: 1, points: 2 },
      memory: { geometries: 7, textures: 3 },
      programs: { length: 5 },
    })).toEqual({ calls: 42, triangles: 1234, lines: 1, points: 2, geometries: 7, textures: 3, programs: 5 });
  });

  it("treats a missing program list as zero and a missing info object as unknown", () => {
    expect(readRendererCounters({ render: { calls: 1, triangles: 2, lines: 0, points: 0 }, memory: { geometries: 1, textures: 0 } })?.programs).toBe(0);
    expect(readRendererCounters(null)).toBeNull();
    expect(readRendererCounters(undefined)).toBeNull();
  });
});
