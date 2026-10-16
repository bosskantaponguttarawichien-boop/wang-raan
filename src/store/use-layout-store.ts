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
  addTableSet as coreAddTableSet,
  clampRoomDimension,
  createCounter,
  createEmptyLayout,
  createEntrance,
  createKitchen,
  createSampleCafeLayout,
  deleteObject as coreDeleteObject,
  findAvailableSpot,
  moveObject as coreMoveObject,
  randomId,
  resizeObject as coreResizeObject,
  resizeTableSet as coreResizeTableSet,
  setTableSetChairCount as coreSetTableSetChairCount,
  setTableSetStyle as coreSetTableSetStyle,
  rotateObject as coreRotateObject,
  toggleTablePreset as coreToggleTablePreset,
  type IdFactory,
  type LayoutObject,
  type Meters,
  type Point,
  type StoreLayout,
  type Chair,
  type Table,
  type TableSetCreationOptions,
  type TableSetPreset,
  type TableSetStylePatch,
  type ValidationResult,
  type Wall,
} from "@/core/layout";
import { canStartSimulation, computeLayoutRevision, validateLayout } from "@/core/validation";

/** จำนวนขั้น Undo สูงสุด */
export const HISTORY_LIMIT = 40;
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 3;

export type PlaygroundTab = "add" | "shop" | "check";

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
  addTableSet: (preset: TableSetPreset, position?: Point, options?: TableSetCreationOptions) => string;
  addKitchen: (position?: Point) => string;
  addCounter: (position?: Point) => string;

  // Drag & Transform
  updateObjectPosition: (id: string, x: number, y: number) => void;
  rotateObject: (id: string, deltaDegrees?: number) => void;
  deleteObject: (id: string) => void;
  resizeObject: (id: string, width: number, depth: number) => void;
  /** สลับ preset โต๊ะ 2 ↔ 4 ที่นั่ง (เก้าอี้ตามทั้งชุด) */
  toggleTableSeats: (id: string) => boolean;
  /** ปรับขนาดหน้าโต๊ะ (เลือกโต๊ะหรือเก้าอี้ลูก) — เก้าอี้ทั้งชุดจัดตำแหน่งใหม่ตาม */
  resizeTableSet: (id: string, width: number, depth: number) => void;
  /** ปรับจำนวนเก้าอี้ของชุดโต๊ะ โดยไม่เกินความจุของหน้าโต๊ะ */
  setTableSetChairCount: (id: string, chairCount: number) => boolean;
  /** เปลี่ยนทรง/ขา/สีของโต๊ะ และแบบ/ขา/สีของเก้าอี้ทั้งชุด */
  setTableSetStyle: (id: string, patch: TableSetStylePatch) => void;
  /** ทำซ้ำวัตถุ (วางในที่ว่างใกล้สุดและเลือกวัตถุใหม่) */
  duplicateObject: (id: string) => string | null;
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
  activeTab: PlaygroundTab;
  setActiveTab: (tab: PlaygroundTab) => void;

  // Validation
  runValidation: () => ValidationResult;
  invalidateValidation: () => void;

  // Metadata
  /** ชื่อผังร้าน (1–80 ตัวอักษร) */
  layoutName: string;
  setLayoutName: (name: string) => void;
  /** รหัสผังออนไลน์ (null = ร่างในเครื่อง / Guest) */
  layoutId: string | null;
  setLayoutId: (id: string | null) => void;

  // History & Persistence
  undo: () => void;
  redo: () => void;
  loadLayout: (layout: StoreLayout, name?: string, id?: string | null) => void;
  /** แทนผังทั้งฉบับ (เช่น นำเข้าไฟล์) เป็นการแก้ไขหนึ่งขั้น — Undo กลับผังเดิมได้ */
  replaceLayout: (layout: StoreLayout) => void;
  /** โหลดผังตัวอย่าง "คาเฟ่ 8×6 ม." แทนผังเดิม — Undo กลับผังเดิมได้ */
  loadSampleLayout: () => void;
  /** กู้คืนผังพร้อมประวัติ Undo/Redo (Draft) — ตัดประวัติให้ไม่เกิน HISTORY_LIMIT */
  restoreHistory: (history: StoreLayout[], historyIndex: number, name?: string) => void;
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
      const at = position ?? findAvailableSpot(layout, type);
      const create = type === "kitchen" ? createKitchen : createCounter;
      const obj: LayoutObject = create({ position: at }, newId);
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
      activeTab: "add",
      setActiveTab: (activeTab) => set({ activeTab }),
      interactionBase: null,

      addTableSet: (preset, position, options) => {
        const { layout } = get();
        const at = position ?? findAvailableSpot(layout, preset);
        const result = coreAddTableSet(layout, preset, at, newId, options);
        commit(result.layout, result.tableSet.table.id);
        return result.tableSet.table.id;
      },
      addKitchen: (position) => addAreaObject("kitchen", position),
      addCounter: (position) => addAreaObject("counter", position),

      updateObjectPosition: (id, x, y) => commit(coreMoveObject(get().layout, id, { x, y })),
      rotateObject: (id, deltaDegrees = 90) => commit(coreRotateObject(get().layout, id, deltaDegrees)),
      deleteObject: (id) => commit(coreDeleteObject(get().layout, id)),
      resizeObject: (id, width, depth) => commit(coreResizeObject(get().layout, id, width, depth)),
      resizeTableSet: (id, width, depth) => commit(coreResizeTableSet(get().layout, id, width, depth)),
      setTableSetChairCount: (id, chairCount) => {
        const { layout } = get();
        const obj = layout.objects.find((object) => object.id === id);
        const tableId = obj?.type === "table" ? obj.id : obj?.type === "chair" ? obj.tableId : null;
        if (!tableId) return false;
        const next = coreSetTableSetChairCount(layout, tableId, chairCount, newId);
        if (next === layout) return false;
        commit(next, tableId);
        return true;
      },
      setTableSetStyle: (id, patch) => commit(coreSetTableSetStyle(get().layout, id, patch)),
      toggleTableSeats: (id) => {
        const { layout } = get();
        const obj = layout.objects.find((o) => o.id === id);
        if (!obj) return false;
        const targetTableId = obj.type === "table" ? obj.id : obj.type === "chair" ? obj.tableId : null;
        if (!targetTableId) return false;
        const res = coreToggleTablePreset(layout, targetTableId, newId);
        if (!res) return false;
        commit(res.layout, res.newTable.id);
        return true;
      },
      duplicateObject: (id) => {
        const { layout } = get();
        const obj = layout.objects.find((o) => o.id === id);
        if (!obj) return null;
        if (obj.type === "table" || obj.type === "chair") {
          const table =
            obj.type === "table"
              ? obj
              : (layout.objects.find((o) => o.id === obj.tableId) as Table | undefined);
          if (!table || table.type !== "table") return null;
          const preset = table.preset ?? "table-4-seats";
          const at = findAvailableSpot(layout, preset);
          const sourceChair = layout.objects.find((o): o is Chair => o.type === "chair" && o.tableId === table.id);
          const res = coreAddTableSet(layout, preset, at, newId, {
            width: table.width,
            depth: table.depth,
            chairCount: table.chairIds.length,
            style: { table: table.style, chair: sourceChair?.style },
          });
          let newLayout = res.layout;
          if (table.rotation !== 0) {
            newLayout = coreRotateObject(newLayout, res.tableSet.table.id, table.rotation);
          }
          commit(newLayout, res.tableSet.table.id);
          return res.tableSet.table.id;
        }

        if (obj.type === "counter" || obj.type === "kitchen") {
          const at = findAvailableSpot(layout, obj.type);
          const create = obj.type === "kitchen" ? createKitchen : createCounter;
          const newObj = create(
            { position: at, width: obj.width, depth: obj.depth, rotation: obj.rotation },
            newId,
          );
          commit({ ...layout, objects: [...layout.objects, newObj] }, newObj.id);
          return newObj.id;
        }

        return null;
      },
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

      layoutName: "ร้านกาแฟของฉัน",
      setLayoutName: (name: string) => set({ layoutName: name }),
      layoutId: null,
      setLayoutId: (id: string | null) => set({ layoutId: id }),

      undo: () => {
        set({ interactionBase: null });
        travel(get().historyIndex - 1);
      },
      redo: () => travel(get().historyIndex + 1),

      loadLayout: (layout, name, id) =>
        set((prev) => ({
          layout,
          layoutName: name ?? prev.layoutName,
          layoutId: id !== undefined ? id : prev.layoutId,
          layoutRevision: computeLayoutRevision(layout),
          validation: null,
          selectedObjectId: null,
          history: [layout],
          historyIndex: 0,
          interactionBase: null,
        })),

      replaceLayout: (layout) => commit(layout, null),
      loadSampleLayout: () => commit(createSampleCafeLayout(newId), null),

      restoreHistory: (history, historyIndex, name) => {
        if (history.length === 0) return;
        const start = Math.max(0, history.length - (HISTORY_LIMIT + 1));
        const kept = history.slice(start);
        const index = Math.min(kept.length - 1, Math.max(0, historyIndex - start));
        const layout = kept[index]!;
        set((prev) => ({
          layout,
          layoutName: name ?? prev.layoutName,
          layoutRevision: computeLayoutRevision(layout),
          validation: null,
          selectedObjectId: null,
          history: kept,
          historyIndex: index,
          interactionBase: null,
        }));
      },

      resetLayout: () => {
        set({ layoutId: null, layoutName: "ร้านกาแฟของฉัน" });
        get().loadLayout(createInitialLayout(newId));
      },
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

/** เรียก action ของ store นอก React render (event handler) โดยไม่ subscribe */
export const layoutActions = () => layoutStore.getState();

export function useLayoutStore<T>(selector: (state: LayoutStoreState) => T): T {
  return useStore(layoutStore, selector);
}
