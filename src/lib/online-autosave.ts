"use client";

import * as React from "react";
import { api } from "@/lib/api-client";
import { draftStatusStore } from "@/lib/draft-autosave";
import { layoutStore, useLayoutStore } from "@/store/use-layout-store";
import { validateLayout } from "@/core/validation";

export function useOnlineAutosave() {
  const layoutId = useLayoutStore((s) => s.layoutId);
  const layout = useLayoutStore((s) => s.layout);
  const layoutName = useLayoutStore((s) => s.layoutName);
  const historyIndex = useLayoutStore((s) => s.historyIndex);

  const initialRender = React.useRef(true);
  const timerRef = React.useRef<NodeJS.Timeout | null>(null);

  React.useEffect(() => {
    // ถ้าไม่ใช่ผังออนไลน์ ไม่ต้องทำอะไร
    if (!layoutId) return;

    // ข้ามการบันทึกในการ render ครั้งแรกหลังโหลดผัง
    if (initialRender.current) {
      initialRender.current = false;
      draftStatusStore.setState({ status: "saved", lastSavedAt: new Date().toISOString() });
      return;
    }

    // ถ้ายกเลิก timer เดิมก่อน
    if (timerRef.current) clearTimeout(timerRef.current);

    // ตรวจสอบสถานะผัง: ถ้าผังติด Blocked จะยังไม่บันทึกขึ้น Backend
    const validation = validateLayout(layout);
    if (validation.status === "blocked") {
      draftStatusStore.setState({ status: "error" });
      return;
    }

    draftStatusStore.setState({ status: "saving" });

    timerRef.current = setTimeout(async () => {
      try {
        const currentStore = layoutStore.getState();
        if (currentStore.layoutId !== layoutId) return;
        await api.updateLayout(currentStore.layout, currentStore.layoutName);
        draftStatusStore.setState({ status: "saved", lastSavedAt: new Date().toISOString() });
      } catch {
        draftStatusStore.setState({ status: "error" });
      }
    }, 800);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [layoutId, layout, layoutName, historyIndex]);
}
