import type * as THREE from "three";
import type { StoreLayout } from "@/core/layout/types";
import type { PresentationSnapshot } from "@/core/simulation/presentation-contract";
import type { QualityLevel } from "../adaptive-quality";

export const SCENE_FEATURE_IDS = ["food", "table-service", "staff-actions", "customer-actions", "seating", "lighting"] as const;
export type SceneFeatureId = typeof SCENE_FEATURE_IDS[number];

/** Renderer time is monotonic. Delta is wall time; rate must be applied once. */
export interface SceneFrame {
  readonly nowMs: number;
  readonly realDeltaSeconds: number;
  readonly playbackRate: number;
  /** ท่าทาง (นั่ง/ลุก) เล่นเร็วกว่าคนจริงกี่เท่า — ไม่เร่งตามเวลาจำลอง; ไม่ระบุ = playbackRate */
  readonly motionRate?: number;
  /** คลิปที่ผูกกับเวลาจำลอง (คำที่กิน) ยืดกี่เท่า ให้ท่าทางไม่รัวเมื่อเร่งเวลา; ไม่ระบุ = 1 */
  readonly clipStretch?: number;
  readonly simulating: boolean;
  readonly paused: boolean;
  /** Absent until feat-114/115/122 connect optional Worker metadata. */
  readonly presentation?: PresentationSnapshot;
}

/** Shared capabilities are read-only; each feature owns its own root/resources. */
export interface SceneRuntimeContext {
  readonly scene: THREE.Scene;
  readonly camera: THREE.OrthographicCamera;
  readonly getLayout: () => StoreLayout | null;
  readonly getQuality: () => QualityLevel;
  readonly invalidate: () => void;
  readonly invalidateShadows: () => void;
}

export interface SceneFeatureContext extends SceneRuntimeContext {
  readonly root: THREE.Group;
}

export interface SceneFeature {
  /** Same layout object is not resent on camera rotation. */
  syncLayout(layout: StoreLayout): void;
  update(frame: SceneFrame): void;
  /** STOP or a fresh run: clear transient objects without rebuilding the host. */
  reset(): void;
  dispose(): void;
}

export type SceneFeatureFactory = (context: SceneFeatureContext) => SceneFeature;
export type SceneFeatureFactories = Partial<Record<SceneFeatureId, SceneFeatureFactory>>;
