/**
 * Draft Auto-Save (PRD §3.1 ข้อ 1, feat-028) — เก็บผังล่าสุด + ประวัติ Undo/Redo ลง localStorage
 *
 * - ตรวจข้อมูลที่อ่านกลับด้วย Zod (StoreLayoutSchema) ทุกครั้ง: ข้อมูลเสีย/เวอร์ชันเก่า → ทิ้ง ไม่ทำให้ Editor พัง
 * - พื้นที่เต็ม (QuotaExceeded) → ลดประวัติลงทีละครึ่งจนเหลือผังปัจจุบันอย่างเดียว
 * - ไม่บันทึก selection / zoom / มุมมอง (เป็นสถานะชั่วคราวของหน้าจอ)
 */
import { z } from "zod";
import type { StoreLayout } from "@/core/layout";
import { StoreLayoutSchema } from "@/core/validation";

export const DRAFT_KEY = "wang-raan:draft:v1";

export interface Draft {
  savedAt: string;
  history: StoreLayout[];
  historyIndex: number;
}

const DraftSchema = z
  .object({
    schema: z.literal(1),
    savedAt: z.string().datetime(),
    history: z.array(StoreLayoutSchema).min(1).max(41),
    historyIndex: z.number().int().min(0),
  })
  .refine((d) => d.historyIndex < d.history.length, { message: "historyIndex เกินประวัติ" });

/** อ่าน storage แบบปลอดภัย — โหมดส่วนตัว/ปิดคุกกี้อาจโยน error ตั้งแต่เข้าถึง */
export function getDraftStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function loadDraft(storage: Storage | null): Draft | null {
  if (!storage) return null;
  let raw: string | null;
  try {
    raw = storage.getItem(DRAFT_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = DraftSchema.safeParse(JSON.parse(raw));
    if (parsed.success) {
      const { savedAt, history, historyIndex } = parsed.data;
      return { savedAt, history: history as StoreLayout[], historyIndex };
    }
  } catch {
    // JSON เสีย → ทิ้งด้านล่าง
  }
  clearDraft(storage);
  return null;
}

export type SaveResult = { ok: true; keptHistory: number } | { ok: false; reason: "unavailable" | "quota" | "error" };

export function saveDraft(storage: Storage | null, draft: Draft): SaveResult {
  if (!storage) return { ok: false, reason: "unavailable" };
  let { history, historyIndex } = draft;
  for (;;) {
    try {
      storage.setItem(DRAFT_KEY, JSON.stringify({ schema: 1, savedAt: draft.savedAt, history, historyIndex }));
      return { ok: true, keptHistory: history.length };
    } catch (error) {
      if (!isQuotaError(error)) return { ok: false, reason: "error" };
      if (history.length === 1) return { ok: false, reason: "quota" };
      // เก็บผังปัจจุบันไว้เสมอ ตัดประวัติด้านเก่าทิ้งครึ่งหนึ่ง (Redo ด้านหน้าตัดทิ้งก่อน)
      const current = history[historyIndex]!;
      const before = history.slice(0, historyIndex);
      const keep = Math.floor(before.length / 2);
      history = [...before.slice(before.length - keep), current];
      historyIndex = history.length - 1;
    }
  }
}

export function clearDraft(storage: Storage | null) {
  try {
    storage?.removeItem(DRAFT_KEY);
  } catch {
    // ไม่มีอะไรต้องทำ
  }
}

function isQuotaError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED" || error.code === 22)
  );
}
