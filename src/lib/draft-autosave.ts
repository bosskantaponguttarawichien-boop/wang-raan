/**
 * เชื่อม Layout Store ↔ Draft storage: กู้คืนตอนเปิด Editor และบันทึกอัตโนมัติหลังแก้ไข (debounce)
 * แยกจาก React เพื่อทดสอบได้ด้วย store + storage จำลอง
 */
import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";
import type { LayoutStoreState } from "@/store/use-layout-store";
import { clearDraft, loadDraft, saveDraft, type Draft } from "./draft-storage";

export type DraftSaveStatus = "idle" | "saving" | "saved" | "error";

export interface DraftStatusState {
  status: DraftSaveStatus;
  /** ISO เวลาที่กู้คืนร่าง (null = เริ่มผังใหม่) */
  restoredAt: string | null;
  lastSavedAt: string | null;
}

export const draftStatusStore = createStore<DraftStatusState>()(() => ({ status: "idle", restoredAt: null, lastSavedAt: null }));

export function useDraftStatus<T>(selector: (s: DraftStatusState) => T): T {
  return useStore(draftStatusStore, selector);
}

/** กู้คืนร่างเข้า store — คืน Draft ที่กู้ได้ หรือ null */
export function restoreDraft(store: StoreApi<LayoutStoreState>, storage: Storage | null, status = draftStatusStore): Draft | null {
  const draft = loadDraft(storage);
  if (!draft) return null;
  store.getState().restoreHistory(draft.history, draft.historyIndex);
  status.setState({ restoredAt: draft.savedAt, status: "saved", lastSavedAt: draft.savedAt });
  return draft;
}

export interface AutosaveOptions {
  delayMs?: number;
  now?: () => Date;
  status?: StoreApi<DraftStatusState>;
}

/** เริ่มบันทึกอัตโนมัติ — คืน { flush, dispose } (flush ใช้ตอน pagehide) */
export function startAutosave(store: StoreApi<LayoutStoreState>, storage: Storage | null, options: AutosaveOptions = {}) {
  const delay = options.delayMs ?? 400;
  const now = options.now ?? (() => new Date());
  const status = options.status ?? draftStatusStore;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    const { history, historyIndex } = store.getState();
    const savedAt = now().toISOString();
    const result = saveDraft(storage, { savedAt, history, historyIndex });
    status.setState(result.ok ? { status: "saved", lastSavedAt: savedAt } : { status: "error" });
  };

  const unsubscribe = store.subscribe((state, prev) => {
    // บันทึกเฉพาะเมื่อผังหรือประวัติเปลี่ยน (ไม่ใช่ selection / zoom / ผลตรวจ)
    if (state.history === prev.history && state.historyIndex === prev.historyIndex) return;
    if (state.history.length === 1) {
      // ผังเริ่มต้นใหม่ที่ยังไม่มีการแก้ไข (เริ่มผังใหม่) → ไม่มีอะไรต้องกู้คืน
      if (timer) clearTimeout(timer);
      timer = null;
      clearDraft(storage);
      status.setState({ status: "idle" });
      return;
    }
    status.setState({ status: "saving" });
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, delay);
  });

  return {
    flush: () => {
      if (timer) flush();
    },
    dispose: () => {
      unsubscribe();
      if (timer) flush();
    },
  };
}

/** เริ่มผังใหม่: ล้างร่างและประวัติ */
export function startNewLayout(store: StoreApi<LayoutStoreState>, storage: Storage | null, status = draftStatusStore) {
  clearDraft(storage);
  store.getState().resetLayout();
  status.setState({ restoredAt: null });
}
