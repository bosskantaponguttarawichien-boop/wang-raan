/**
 * feat-123 · Read-only window hook so automated QA can see what the scene decided.
 *
 * The features already compute everything an acceptance test needs — which clip a staff member is
 * playing, whether a customer is really eating, how much stain is left, how many draw calls the
 * renderer issued. None of it reaches the DOM, so an end-to-end test could otherwise only guess
 * from pixels.
 *
 * Safety: the hook installs **only** when `window.__wangraanDiagnostics === true` was set before
 * the scene mounted. Nothing in the product sets it, so a real visitor never gets the object; a
 * Playwright `addInitScript` does. It exposes getters only — no setter, no way to drive the scene —
 * and it is removed when the scene unmounts.
 */
import type { CustomerActionReport } from "../customer-actions";
import type { SeatingReport } from "../seating/contracts";
import type { StaffActionReport } from "../staff-actions";

export const DIAGNOSTICS_FLAG = "__wangraanDiagnostics";
export const DIAGNOSTICS_KEY = "__wangraanScene";

export interface SceneRendererCounters {
  readonly calls: number;
  readonly triangles: number;
  readonly lines: number;
  readonly points: number;
  readonly geometries: number;
  readonly textures: number;
  readonly programs: number;
}

export interface SceneFrameInfo {
  /** True while the simulation metadata path is driving the scene. */
  readonly modern: boolean;
  readonly simulating: boolean;
  readonly running: boolean;
  /** Simulation seconds of the snapshot being drawn, or null without metadata. */
  readonly simTimeSeconds: number | null;
  readonly playbackRate: number;
  /** Seconds the frame clock still owes after clamping slow frames. */
  readonly frameDebtSeconds: number;
  readonly customerCount: number;
  readonly staffCount: number;
}

export interface SceneTableServiceStats {
  readonly tableCount: number;
  readonly activeDishCount: number;
  readonly activeStainTableCount: number;
  readonly activeStainMeshCount: number;
}

export interface SceneDiagnostics {
  readonly version: 1;
  staffActions(): readonly StaffActionReport[];
  customerActions(): readonly CustomerActionReport[];
  seating(): readonly SeatingReport[];
  tableService(): SceneTableServiceStats | null;
  renderer(): SceneRendererCounters | null;
  frame(): SceneFrameInfo;
}

type DiagnosticsScope = Record<string, unknown>;

/**
 * Installs the hook when the flag is present. Returns a function that removes it again; calling it
 * twice is safe, and it never removes a hook some other scene installed afterwards.
 */
export function installSceneDiagnostics(scope: DiagnosticsScope | undefined, diagnostics: SceneDiagnostics): () => void {
  if (!scope || scope[DIAGNOSTICS_FLAG] !== true) return () => {};
  scope[DIAGNOSTICS_KEY] = diagnostics;
  let removed = false;
  return () => {
    if (removed) return;
    removed = true;
    if (scope[DIAGNOSTICS_KEY] === diagnostics) delete scope[DIAGNOSTICS_KEY];
  };
}

/** Reads three.js renderer counters without importing Three into this module. */
export function readRendererCounters(info: {
  render: { calls: number; triangles: number; lines: number; points: number };
  memory: { geometries: number; textures: number };
  programs?: { length: number } | null;
} | null | undefined): SceneRendererCounters | null {
  if (!info) return null;
  return {
    calls: info.render.calls,
    triangles: info.render.triangles,
    lines: info.render.lines,
    points: info.render.points,
    geometries: info.memory.geometries,
    textures: info.memory.textures,
    programs: info.programs?.length ?? 0,
  };
}
