"use client";

/**
 * ฟอร์มแบบ "นำไปใช้ทันที" (ไม่มีปุ่ม นำไปใช้)
 * - พิมพ์อยู่: ยังไม่แตะ store (Canvas ไม่ re-render ระหว่างพิมพ์ — feat-027)
 * - นำไปใช้เมื่อ: ออกจากฟอร์ม (โฟกัสไปที่อื่น), กด Enter ในช่องกรอก, หรือเปลี่ยนตัวเลือกใน select
 * - การนำไปใช้หนึ่งครั้ง = Undo หนึ่งขั้น (ช่องที่แก้ทั้งหมดถูกนำไปใช้พร้อมกัน)
 * ฟอร์มถูกสร้างใหม่หลังผังเปลี่ยน (key) จึงจำช่องที่โฟกัสไว้แล้วคืนโฟกัสให้หลังสร้างใหม่
 */
import * as React from "react";

let pendingFocusId: string | null = null;

/** เรียกใน component ฟอร์มที่ถูกสร้างใหม่ด้วย key — คืนโฟกัสให้ช่องที่ผู้ใช้กำลังไป */
export function useRestoreFocus() {
  React.useEffect(() => {
    if (!pendingFocusId) return;
    const el = document.getElementById(pendingFocusId);
    pendingFocusId = null;
    if (el && (document.activeElement === null || document.activeElement === document.body)) el.focus();
  }, []);
}

/** `isDirty` อ่านตอนเกิดเหตุการณ์ (ไม่ใช่ค่าจาก render ก่อนหน้า) เพราะ select เพิ่งเปลี่ยนค่าในเหตุการณ์เดียวกัน */
export function autoApplyProps(apply: () => void, isDirty: () => boolean) {
  const run = (form: HTMLFormElement, next: Element | null) => {
    if (!isDirty()) return;
    pendingFocusId = next && form.contains(next) && next.id ? next.id : null;
    apply();
  };
  return {
    onBlur: (event: React.FocusEvent<HTMLFormElement>) => {
      const next = event.relatedTarget as Element | null;
      if (next && event.currentTarget.contains(next)) return; // ย้ายไปช่องอื่นในฟอร์มเดียวกัน → ยังไม่นำไปใช้
      run(event.currentTarget, null);
    },
    onChange: (event: React.ChangeEvent<HTMLFormElement>) => {
      const target = event.target as Element;
      if (target.tagName === "SELECT") run(event.currentTarget, target);
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLFormElement>) => {
      const target = event.target as Element;
      if (event.key !== "Enter" || target.tagName !== "INPUT") return;
      event.preventDefault();
      run(event.currentTarget, target);
    },
  };
}
