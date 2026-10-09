import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLayoutStore } from "@/store/use-layout-store";
import { cafeLayout } from "@/test/fixtures/layouts";
import { createSequentialIds } from "@/core/layout";
import { createStore } from "zustand/vanilla";
import { DRAFT_KEY, clearDraft, loadDraft, saveDraft } from "./draft-storage";
import { restoreDraft, startAutosave, startNewLayout, type DraftStatusState } from "./draft-autosave";

/** localStorage จำลอง (จำกัดขนาดได้เพื่อทดสอบ QuotaExceeded) */
class MemoryStorage implements Storage {
  data = new Map<string, string>();
  constructor(private quota = Infinity) {}
  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  key(i: number) {
    return [...this.data.keys()][i] ?? null;
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  setItem(key: string, value: string) {
    if (value.length > this.quota) throw new DOMException("full", "QuotaExceededError");
    this.data.set(key, value);
  }
}

const savedAt = "2026-10-10T03:00:00.000Z";
const statusStore = () => createStore<DraftStatusState>()(() => ({ status: "idle", restoredAt: null, lastSavedAt: null }));

describe("draft-storage", () => {
  it("บันทึกแล้วอ่านกลับได้ครบทั้งผังและประวัติ", () => {
    const storage = new MemoryStorage();
    const a = cafeLayout();
    const b = { ...a, width: 9 };
    expect(saveDraft(storage, { savedAt, history: [a, b], historyIndex: 1 })).toEqual({ ok: true, keptHistory: 2 });
    expect(loadDraft(storage)).toEqual({ savedAt, history: [a, b], historyIndex: 1 });
  });

  it.each([
    ["JSON เสีย", "{not json"],
    ["schema เวอร์ชันอื่น", JSON.stringify({ schema: 2, savedAt, history: [cafeLayout()], historyIndex: 0 })],
    ["historyIndex เกิน", JSON.stringify({ schema: 1, savedAt, history: [cafeLayout()], historyIndex: 3 })],
    ["ผังผิด schema", JSON.stringify({ schema: 1, savedAt, history: [{ ...cafeLayout(), width: 99 }], historyIndex: 0 })],
  ])("%s → ทิ้งร่าง ไม่ทำให้ Editor พัง", (_name, raw) => {
    const storage = new MemoryStorage();
    storage.setItem(DRAFT_KEY, raw);
    expect(loadDraft(storage)).toBeNull();
    expect(storage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("ไม่มี storage / ไม่มีร่าง → null", () => {
    expect(loadDraft(null)).toBeNull();
    expect(loadDraft(new MemoryStorage())).toBeNull();
    expect(saveDraft(null, { savedAt, history: [cafeLayout()], historyIndex: 0 })).toEqual({ ok: false, reason: "unavailable" });
    clearDraft(null);
  });

  it("getItem โยน error (โหมดส่วนตัว) → null", () => {
    const storage = new MemoryStorage();
    storage.getItem = () => {
      throw new Error("denied");
    };
    expect(loadDraft(storage)).toBeNull();
  });

  it("พื้นที่เต็ม → ตัดประวัติเก่าทิ้งแต่เก็บผังปัจจุบันเสมอ", () => {
    const layout = cafeLayout();
    const one = JSON.stringify({ schema: 1, savedAt, history: [layout], historyIndex: 0 }).length;
    const storage = new MemoryStorage(one * 4);
    const history = Array.from({ length: 20 }, (_, i) => ({ ...layout, version: i + 1 }));
    const result = saveDraft(storage, { savedAt, history, historyIndex: 15 });
    expect(result.ok).toBe(true);
    const draft = loadDraft(storage)!;
    expect(draft.history.length).toBeLessThan(5);
    expect(draft.history[draft.historyIndex]!.version).toBe(16);

    expect(saveDraft(new MemoryStorage(10), { savedAt, history, historyIndex: 0 })).toEqual({ ok: false, reason: "quota" });
    const broken = new MemoryStorage();
    broken.setItem = () => {
      throw new Error("other");
    };
    expect(saveDraft(broken, { savedAt, history, historyIndex: 0 })).toEqual({ ok: false, reason: "error" });
  });
});

describe("draft-autosave (feat-028 gate: รีเฟรชแล้วผังและประวัติกลับมาครบ)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("แก้ไข → debounce บันทึก → 'รีโหลด' (store ใหม่) กู้คืนผังและ Undo/Redo ได้ครบ", () => {
    const storage = new MemoryStorage();
    const status = statusStore();
    const store = createLayoutStore({ newId: createSequentialIds() });
    const autosave = startAutosave(store, storage, { delayMs: 300, status, now: () => new Date(savedAt) });
    store.getState().addKitchen();
    store.getState().addCounter();
    store.getState().addTableSet("table-4-seats");
    store.getState().undo();
    expect(status.getState().status).toBe("saving");
    expect(storage.getItem(DRAFT_KEY)).toBeNull();
    vi.advanceTimersByTime(300);
    expect(status.getState()).toMatchObject({ status: "saved", lastSavedAt: savedAt });

    // ไม่บันทึกเมื่อเปลี่ยนแค่ selection / zoom
    const before = storage.getItem(DRAFT_KEY);
    store.getState().setZoom(2);
    store.getState().selectObject(null);
    vi.advanceTimersByTime(1000);
    expect(storage.getItem(DRAFT_KEY)).toBe(before);
    autosave.dispose();

    const reloaded = createLayoutStore({ newId: createSequentialIds() });
    const restoredStatus = statusStore();
    expect(restoreDraft(reloaded, storage, restoredStatus)).not.toBeNull();
    expect(reloaded.getState().layout).toEqual(store.getState().layout);
    expect(reloaded.getState().history).toEqual(store.getState().history);
    expect(reloaded.getState().historyIndex).toBe(2);
    reloaded.getState().redo();
    expect(reloaded.getState().layout.objects.filter((o) => o.type === "chair")).toHaveLength(4);
    expect(restoredStatus.getState().restoredAt).toBe(savedAt);
  });

  it("flush ตอนปิดแท็บบันทึกทันที / dispose บันทึกงานค้าง / ไม่มีงานค้าง flush ไม่ทำอะไร", () => {
    const storage = new MemoryStorage();
    const store = createLayoutStore({ newId: createSequentialIds() });
    const autosave = startAutosave(store, storage, { status: statusStore() });
    autosave.flush();
    expect(storage.getItem(DRAFT_KEY)).toBeNull();
    store.getState().addKitchen();
    autosave.flush();
    expect(loadDraft(storage)!.history).toHaveLength(2);
    store.getState().addCounter();
    autosave.dispose();
    expect(loadDraft(storage)!.history).toHaveLength(3);
  });

  it("บันทึกไม่สำเร็จ → สถานะ error", () => {
    const status = statusStore();
    const store = createLayoutStore({ newId: createSequentialIds() });
    const autosave = startAutosave(store, null, { status });
    store.getState().addKitchen();
    autosave.flush();
    expect(status.getState().status).toBe("error");
    autosave.dispose();
  });

  it("เริ่มผังใหม่ล้างร่างและประวัติ", () => {
    const storage = new MemoryStorage();
    const status = statusStore();
    status.setState({ restoredAt: savedAt });
    const store = createLayoutStore({ newId: createSequentialIds() });
    store.getState().addKitchen();
    saveDraft(storage, { savedAt, history: store.getState().history, historyIndex: 1 });
    startNewLayout(store, storage, status);
    expect(storage.getItem(DRAFT_KEY)).toBeNull();
    expect(store.getState().history).toHaveLength(1);
    expect(status.getState().restoredAt).toBeNull();
  });
});
