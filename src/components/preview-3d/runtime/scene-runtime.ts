import { Group } from "three";
import { SCENE_FEATURE_IDS, type SceneFeature, type SceneFeatureFactories, type SceneFeatureId, type SceneFrame, type SceneRuntimeContext } from "./contracts";
import type { StoreLayout } from "@/core/layout/types";

/** Empty until feat-122 explicitly registers the completed feature modules. */
export function createNoopFeature(): SceneFeature {
  return { syncLayout() {}, update() {}, reset() {}, dispose() {} };
}

export interface SceneRuntime {
  syncLayout(layout: StoreLayout): void;
  update(frame: SceneFrame): void;
  reset(): void;
  dispose(): void;
  getRoot(id: SceneFeatureId): Group;
}

/** Owns feature roots and lifecycle order, never feature geometry/materials. */
export function createSceneRuntime(context: SceneRuntimeContext, factories: SceneFeatureFactories = {}): SceneRuntime {
  const entries: { id: SceneFeatureId; root: Group; feature: SceneFeature }[] = [];
  let disposed = false;
  let layout: StoreLayout | null = null;
  const disposeEntries = () => {
    const errors: unknown[] = [];
    for (const entry of [...entries].reverse()) {
      try { entry.feature.dispose(); } catch (error) { errors.push(error); }
      finally { entry.root.removeFromParent(); }
    }
    return errors;
  };
  try {
    for (const id of SCENE_FEATURE_IDS) {
      const root = new Group();
      root.name = `Feature:${id}`;
      context.scene.add(root);
      try {
        const feature = (factories[id] ?? createNoopFeature)(Object.freeze({ ...context, root }));
        entries.push({ id, root, feature });
      } catch (error) {
        root.removeFromParent();
        throw error;
      }
    }
  } catch (error) {
    const cleanupErrors = disposeEntries();
    if (cleanupErrors.length) throw new AggregateError([error, ...cleanupErrors], "Scene feature initialization failed");
    throw error;
  }
  return {
    getRoot(id) { return entries.find(entry => entry.id === id)!.root; },
    syncLayout(next) {
      if (disposed || layout === next) return;
      for (const { feature } of entries) feature.syncLayout(next);
      layout = next;
    },
    update(frame) { if (!disposed) for (const { feature } of entries) feature.update(frame); },
    reset() { if (!disposed) for (const { feature } of entries) feature.reset(); },
    dispose() {
      if (disposed) return;
      disposed = true;
      const errors = disposeEntries();
      if (errors.length) throw new AggregateError(errors, "Scene feature disposal failed");
    },
  };
}
