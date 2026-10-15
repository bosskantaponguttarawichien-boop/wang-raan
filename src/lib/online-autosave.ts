"use client";

/**
 * บันทึกผังออนไลน์อัตโนมัติ (feat-064) — debounce 800ms แล้ว PUT /api/layouts/[id]
 * - ผัง Blocked ไม่ส่งขึ้น Backend (Dual-Tier: BFF จะตอบ 422 อยู่แล้ว) — งานจึงค้างอยู่ในหน้านี้เท่านั้น
 *   (ผังออนไลน์ไม่เก็บร่างใน localStorage) → เตือนก่อนปิดแท็บเมื่อยังมีงานที่ไม่ได้บันทึก
 * - ออกจากหน้า Editor (เช่น ไป /projects) ระหว่างรอ debounce → บันทึกทันที ไม่ทิ้งการแก้ไขล่าสุด
 */
import * as React from "react";
import { api } from "@/lib/api-client";
import { draftStatusStore } from "@/lib/draft-autosave";
import type { StoreLayout } from "@/core/layout";
import { useLayoutStore } from "@/store/use-layout-store";
import { validateLayout } from "@/core/validation";

const DEBOUNCE_MS = 800;

/** งานที่รอบันทึก — เก็บเป็น snapshot เพราะตอนบันทึกจริงผู้ใช้อาจเปิดผังอื่นไปแล้ว */
interface PendingSave {
  layout: StoreLayout;
  name: string;
}

async function saveNow({ layout, name }: PendingSave) {
  try {
    await api.updateLayout(layout, name);
    draftStatusStore.setState({ status: "saved", lastSavedAt: new Date().toISOString() });
  } catch {
    draftStatusStore.setState({ status: "error" });
  }
}

export function useOnlineAutosave() {
  const layoutId = useLayoutStore((s) => s.layoutId);
  const layout = useLayoutStore((s) => s.layout);
  const layoutName = useLayoutStore((s) => s.layoutName);
  const historyIndex = useLayoutStore((s) => s.historyIndex);

  const initialRender = React.useRef(true);
  const timerRef = React.useRef<NodeJS.Timeout | null>(null);
  /** งานที่รอบันทึก (ยังไม่ถึงเวลา debounce) */
  const pendingRef = React.useRef<PendingSave | null>(null);

  React.useEffect(() => {
    // ถ้าไม่ใช่ผังออนไลน์ ไม่ต้องทำอะไร
    if (!layoutId) return;

    // ข้ามการบันทึกในการ render ครั้งแรกหลังโหลดผัง
    if (initialRender.current) {
      initialRender.current = false;
      draftStatusStore.setState({ status: "saved", lastSavedAt: new Date().toISOString() });
      return;
    }

    // เปลี่ยนไปผังอื่นระหว่างรอ → บันทึกผังเดิมก่อน
    if (timerRef.current) clearTimeout(timerRef.current);
    if (pendingRef.current && pendingRef.current.layout.id !== layoutId) void saveNow(pendingRef.current);
    pendingRef.current = null;

    // ตรวจสอบสถานะผัง: ถ้าผังติด Blocked จะยังไม่บันทึกขึ้น Backend
    if (validateLayout(layout).status === "blocked") {
      draftStatusStore.setState({ status: "error" });
      return;
    }

    draftStatusStore.setState({ status: "saving" });
    const pending = { layout, name: layoutName };
    pendingRef.current = pending;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      pendingRef.current = null;
      void saveNow(pending);
    }, DEBOUNCE_MS);
  }, [layoutId, layout, layoutName, historyIndex]);

  // ออกจาก Editor → บันทึกที่ค้างอยู่ทันที
  React.useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (pending) void saveNow(pending);
    },
    [],
  );

  // ปิด/รีโหลดแท็บขณะยังมีงานที่ไม่ได้บันทึก (กำลังรอ หรือผัง Blocked / บันทึกไม่สำเร็จ) → ให้เบราว์เซอร์ถามก่อน
  React.useEffect(() => {
    if (!layoutId) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      const { status } = draftStatusStore.getState();
      if (status !== "saving" && status !== "error") return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [layoutId]);
}
