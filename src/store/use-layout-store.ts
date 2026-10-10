/**
 * Zustand Layout Store — architecture.md §5.1
 * ห่อ Core (Pure TS) ด้วย state ของ Editor: selection, history (Undo/Redo 40 ขั้น), zoom, มุมมอง และผลตรวจ
 *
 * กติกา:
 * - ทุกการแก้ไข geometry / hierarchy / ขนาดร้าน / Entrance → บันทึก history + invalidateValidation()
 * - การแก้ไขที่ไม่เปลี่ยนผัง (Core คืน reference เดิม) ไม่สร้าง history
 * - Non-blocking: ไม่กันการวางที่ชนหรือตกขอบ ปล่อยให้ Validation Engine รายงาน
 */
import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";
import {
  DEFAULT_SIZES,
  TABLE_SET_PRESETS,
  addTableSet as coreAddTableSet,
  clampRoomDimension,
  createCounter,
  createEmptyLayout,
  createEntrance,
  createKitchen,
  deleteObject as coreDeleteObject,
  moveObject as coreMoveObject,
  randomId,
  resizeObject as coreResizeObject,
  rotateObject as coreRotateObject,
  type IdFactory,
  type LayoutObject,
  type Meters,
  type Point,
  type StoreLayout,
  type TableSetPreset,
  type ValidationResult,
  type Wall,
} from "@/core/layout";
import { canStartSimulation, computeLayoutRevision, validateLayout } from "@/core/validation";

/** จำนวนขั้น Undo สูงสุด */
export const HISTORY_LIMIT = 40;
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 3;

export interface EntranceInput {
  wall: Wall;
  position: Meters;
  width?: Meters;
}

export interface LayoutStoreState {
  layout: StoreLayout;
  layoutRevision: string;
  validation: ValidationResult | null;
  selectedObjectId: string | null;
  /** snapshot ของผังทั้งหมด (รวมผังปัจจุบันที่ historyIndex) ยาวสุด HISTORY_LIMIT + 1 */
  history: StoreLayout[];
  historyIndex: number;
  zoom: number;
  is3DView: boolean;
  /** historyIndex ตอนเริ่มการลาก/ปรับต่อเนื่อง (null = ไม่ได้อยู่ระหว่าง interaction) */
  interactionBase: number | null;

  // Table Set Lifecycle & Objects — คืน id ของวัตถุที่สร้าง
  addTableSet: (preset: TableSetPreset, position?: Point) => string;
  addKitchen: (position?: Point) => string;
  addCounter: (position?: Point) => string;

  // Drag & Transform
  updateObjectPosition: (id: string, x: number, y: number) => void;
  rotateObject: (id: string, deltaDegrees?: number) => void;
  deleteObject: (id: string) => void;
  resizeObject: (id: string, width: number, depth: number) => void;
  /** เริ่ม/จบการลากต่อเนื่อง — การแก้ไขระหว่างนี้รวมเป็น Undo ขั้นเดียว */
  beginInteraction: () => void;
  endInteraction: () => void;

  // Room & Entrance
  setRoomDimensions: (width: number, depth: number) => void;
  setEntrance: (entrance: EntranceInput) => void;

  // Selection & View
  selectObject: (id: string | null) => void;
  setZoom: (zoom: number) => void;
  set3DView: (is3D: boolean) => void;

  // Validation
  runValidation: () => ValidationResult;
  invalidateValidation: () => void;

  // History & Persistence
  undo: () => void;
  redo: () => void;
  loadLayout: (layout: StoreLayout) => void;
  /** แทนผังทั้งฉบับ (เช่น นำเข้าไฟล์) เป็นการแก้ไขหนึ่งขั้น — Undo กลับผังเดิมได้ */
  replaceLayout: (layout: StoreLayout) => void;
  /** กู้คืนผังพร้อมประวัติ Undo/Redo (Draft) — ตัดประวัติให้ไม่เกิน HISTORY_LIMIT */
  restoreHistory: (history: StoreLayout[], historyIndex: number) => void;
  /** เริ่มผังใหม่ (ผังเริ่มต้น) และล้างประวัติ */
  resetLayout: () => void;
}

export interface LayoutStoreOptions {
  initialLayout?: StoreLayout;
  newId?: IdFactory;
  now?: () => Date;
}

/** ผังเริ่มต้น: ร้าน 8 × 6 ม. ทางเข้ากลางผนังทิศใต้ */
export function createInitialLayout(newId: IdFactory = randomId): StoreLayout {
  const layout = createEmptyLayout({ width: 8, depth: 6 }, newId);
  return { ...layout, entrance: createEntrance(layout, { wall: "south", position: 3.5 }, newId) };
}

/** ตำแหน่งวางเริ่มต้น: กึ่งกลางร้าน (Core จะ snap ให้) */
function centered(layout: StoreLayout, size: { width: Meters; depth: Meters }): Point {
  return { x: (layout.width - size.width) / 2, y: (layout.depth - size.depth) / 2 };
}

function selectionAfter(layout: StoreLayout, selectedId: string | null): string | null {
  return selectedId && layout.objects.some((o) => o.id === selectedId) ? selectedId : null;
}

export function createLayoutStore(options: LayoutStoreOptions = {}): StoreApi<LayoutStoreState> {
  const newId = options.newId ?? randomId;
  const initial = options.initialLayout ?? createInitialLayout(newId);

  return createStore<LayoutStoreState>()((set, get) => {
    /** บันทึกผังใหม่: history + revision + invalidate ผลตรวจ (ไม่ทำอะไรถ้าผังไม่เปลี่ยน) */
    const commit = (next: StoreLayout, selectedObjectId?: string | null) => {
      const state = get();
      if (next === state.layout) return;
      // ระหว่าง interaction: ขั้นแรกสร้าง history ใหม่ ขั้นต่อ ๆ ไปเขียนทับขั้นเดิม
      const coalesce = state.interactionBase !== null && state.historyIndex > state.interactionBase;
      const kept = state.history.slice(0, coalesce ? state.historyIndex : state.historyIndex + 1);
      const history = [...kept, next].slice(-(HISTORY_LIMIT + 1));
      const trimmed = kept.length + 1 - history.length;
      set({
        layout: next,
        layoutRevision: computeLayoutRevision(next),
        validation: null,
        history,
        historyIndex: history.length - 1,
        interactionBase: state.interactionBase === null ? null : Math.max(0, state.interactionBase - trimmed),
        selectedObjectId: selectionAfter(next, selectedObjectId === undefined ? state.selectedObjectId : selectedObjectId),
      });
    };

    const travel = (index: number) => {
      const state = get();
      const layout = state.history[index];
      if (!layout || index === state.historyIndex) return;
      set({
        layout,
        historyIndex: index,
        layoutRevision: computeLayoutRevision(layout),
        validation: null,
        selectedObjectId: selectionAfter(layout, state.selectedObjectId),
      });
    };

    const addAreaObject = (type: "kitchen" | "counter", position?: Point) => {
      const { layout } = get();
      const create = type === "kitchen" ? createKitchen : createCounter;
      const obj: LayoutObject = create({ position: position ?? centered(layout, DEFAULT_SIZES[type]) }, newId);
      commit({ ...layout, objects: [...layout.objects, obj] }, obj.id);
      return obj.id;
    };

    return {
      layout: initial,
      layoutRevision: computeLayoutRevision(initial),
      validation: null,
      selectedObjectId: null,
      history: [initial],
      historyIndex: 0,
      zoom: 1,
      is3DView: false,
      interactionBase: null,

      addTableSet: (preset, position) => {
        const { layout } = get();
        const spec = TABLE_SET_PRESETS[preset];
        const at = position ?? centered(layout, { width: spec.tableWidth, depth: spec.tableDepth });
        const result = coreAddTableSet(layout, preset, at, newId);
        commit(result.layout, result.tableSet.table.id);
        return result.tableSet.table.id;
      },
      addKitchen: (position) => addAreaObject("kitchen", position),
      addCounter: (position) => addAreaObject("counter", position),

      updateObjectPosition: (id, x, y) => commit(coreMoveObject(get().layout, id, { x, y })),
      rotateObject: (id, deltaDegrees = 90) => commit(coreRotateObject(get().layout, id, deltaDegrees)),
      deleteObject: (id) => commit(coreDeleteObject(get().layout, id)),
      resizeObject: (id, width, depth) => commit(coreResizeObject(get().layout, id, width, depth)),
      beginInteraction: () => set({ interactionBase: get().historyIndex }),
      endInteraction: () => set({ interactionBase: null }),

      setRoomDimensions: (width, depth) => {
        const { layout } = get();
        const w = clampRoomDimension(width);
        const d = clampRoomDimension(depth);
        if (w === layout.width && d === layout.depth) return;
        const resized = { ...layout, width: w, depth: d };
        // ทางเข้าต้องยังอยู่บนผนังหลังปรับขนาด (คง id เดิม)
        const entrance = layout.entrance
          ? createEntrance(resized, layout.entrance, () => layout.entrance!.id)
          : null;
        commit({ ...resized, entrance });
      },

      setEntrance: (input) => {
        const { layout } = get();
        const id = layout.entrance?.id;
        const entrance = createEntrance(
          layout,
          { width: layout.entrance?.width, ...input },
          id ? () => id : newId,
        );
        const prev = layout.entrance;
        if (
          prev &&
          prev.wall === entrance.wall &&
          prev.position === entrance.position &&
          prev.width === entrance.width
        ) {
          return;
        }
        commit({ ...layout, entrance });
      },

      selectObject: (id) => set({ selectedObjectId: selectionAfter(get().layout, id) }),
      setZoom: (zoom) => set({ zoom: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number.isFinite(zoom) ? zoom : 1)) }),
      set3DView: (is3DView) => set({ is3DView }),

      runValidation: () => {
        const validation = validateLayout(get().layout, { now: options.now });
        set({ validation });
        return validation;
      },
      invalidateValidation: () => set({ validation: null }),

      undo: () => {
        set({ interactionBase: null });
        travel(get().historyIndex - 1);
      },
      redo: () => travel(get().historyIndex + 1),

      loadLayout: (layout) =>
        set({
          layout,
          layoutRevision: computeLayoutRevision(layout),
          validation: null,
          selectedObjectId: null,
          history: [layout],
          historyIndex: 0,
          interactionBase: null,
        }),

      replaceLayout: (layout) => commit(layout, null),

      restoreHistory: (history, historyIndex) => {
        if (history.length === 0) return;
        const start = Math.max(0, history.length - (HISTORY_LIMIT + 1));
        const kept = history.slice(start);
        const index = Math.min(kept.length - 1, Math.max(0, historyIndex - start));
        const layout = kept[index]!;
        set({
          layout,
          layoutRevision: computeLayoutRevision(layout),
          validation: null,
          selectedObjectId: null,
          history: kept,
          historyIndex: index,
          interactionBase: null,
        });
      },

      resetLayout: () => get().loadLayout(createInitialLayout(newId)),
    };
  });
}

// ── Selectors ──────────────────────────────────────────────────────────────
export const selectCanUndo = (s: LayoutStoreState) => s.historyIndex > 0;
export const selectCanRedo = (s: LayoutStoreState) => s.historyIndex < s.history.length - 1;
export const selectUndoDepth = (s: LayoutStoreState) => s.historyIndex;
export const selectSelectedObject = (s: LayoutStoreState) =>
  s.layout.objects.find((o) => o.id === s.selectedObjectId) ?? null;
/** P2 Gate: ปุ่มเริ่มจำลองกดได้เมื่อผลตรวจสดใหม่และไม่ Blocked */
export const selectCanStartSimulation = (s: LayoutStoreState) => canStartSimulation(s.validation, s.layout);

// ── Singleton สำหรับ Editor (Client Components เท่านั้น) ──────────────────────
export const layoutStore = createLayoutStore();

export function useLayoutStore<T>(selector: (state: LayoutStoreState) => T): T {
  return useStore(layoutStore, selector);
}
