import { describe, expect, it, vi } from "vitest";
import { OrthographicCamera, Scene } from "three";
import { cafeLayout } from "@/test/fixtures/layouts";
import { QUALITY_LEVELS } from "../adaptive-quality";
import { createSceneRuntime } from "./scene-runtime";
import { SCENE_FEATURE_IDS, type SceneFeature, type SceneRuntimeContext } from "./contracts";

function context(): SceneRuntimeContext {
  return { scene: new Scene(), camera: new OrthographicCamera(), getLayout: () => null, getQuality: () => QUALITY_LEVELS[0]!, invalidate: vi.fn(), invalidateShadows: vi.fn() };
}
const feature = (): SceneFeature => ({ syncLayout: vi.fn(), update: vi.fn(), reset: vi.fn(), dispose: vi.fn() });

describe("scene feature host", () => {
  it("mounts six empty roots and removes only its own objects", () => {
    const ctx = context();
    const legacy = new Scene();
    ctx.scene.add(legacy);
    const runtime = createSceneRuntime(ctx);
    for (const id of SCENE_FEATURE_IDS) expect(runtime.getRoot(id).children).toHaveLength(0);
    expect(ctx.scene.children).toHaveLength(7);
    runtime.dispose(); runtime.dispose();
    expect(ctx.scene.children).toEqual([legacy]);
  });
  it("passes layout once, forwards frame unchanged and disposes in reverse order once", () => {
    const ctx = context(), first = feature(), second = feature();
    const disposal: string[] = [];
    vi.mocked(first.dispose).mockImplementation(() => { disposal.push("food"); });
    vi.mocked(second.dispose).mockImplementation(() => { disposal.push("seating"); });
    const runtime = createSceneRuntime(ctx, {
      food: received => { expect(received.root.name).toBe("Feature:food"); expect(received.getLayout()).toBeNull(); return first; },
      seating: () => second,
    });
    const layout = cafeLayout();
    runtime.syncLayout(layout); runtime.syncLayout(layout);
    expect(first.syncLayout).toHaveBeenCalledExactlyOnceWith(layout);
    const frame = { nowMs: 100, realDeltaSeconds: 0, playbackRate: 1, simulating: true, paused: true };
    runtime.update(frame);
    expect(second.update).toHaveBeenCalledExactlyOnceWith(frame);
    runtime.reset();
    expect(second.reset).toHaveBeenCalledTimes(1);
    runtime.dispose(); runtime.dispose(); runtime.update(frame); runtime.reset();
    expect(disposal).toEqual(["seating", "food"]);
    expect(second.update).toHaveBeenCalledTimes(1);
    expect(second.reset).toHaveBeenCalledTimes(1);
  });
  it("rolls back prior features and detaches the failing root if creation fails", () => {
    const ctx = context(), existing = feature();
    expect(() => createSceneRuntime(ctx, { food: () => existing, lighting: () => { throw new Error("asset failure"); } })).toThrow("asset failure");
    expect(existing.dispose).toHaveBeenCalledTimes(1);
    expect(ctx.scene.children).toHaveLength(0);
  });
  it("continues disposal when one feature throws", () => {
    const ctx = context(), first = feature(), failing = feature();
    vi.mocked(failing.dispose).mockImplementation(() => { throw new Error("cleanup failed"); });
    const runtime = createSceneRuntime(ctx, { food: () => first, lighting: () => failing });
    expect(() => runtime.dispose()).toThrow(AggregateError);
    expect(first.dispose).toHaveBeenCalledTimes(1);
    expect(ctx.scene.children).toHaveLength(0);
    expect(() => runtime.dispose()).not.toThrow();
  });
});
