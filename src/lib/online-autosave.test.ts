// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { layoutStore } from "@/store/use-layout-store";
import { api } from "@/lib/api-client";
import { createSampleCafeLayout } from "@/core/layout";
import { useOnlineAutosave } from "./online-autosave";

describe("useOnlineAutosave", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
  });

  it("ข้ามการบันทึกถ้า layoutId เป็น null", () => {
    const updateSpy = vi.spyOn(api, "updateLayout").mockResolvedValue({} as never);
    layoutStore.setState({ layoutId: null, layout: createSampleCafeLayout() });

    renderHook(() => useOnlineAutosave());
    vi.advanceTimersByTime(2000);

    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("บันทึกผังไปยัง Backend เมื่อมีการเปลี่ยนแปลงในผังออนไลน์", async () => {
    const updateSpy = vi.spyOn(api, "updateLayout").mockResolvedValue({} as never);
    const sample = createSampleCafeLayout();
    layoutStore.setState({ layoutId: "layout-xyz", layout: sample, layoutName: "ร้านกาแฟของฉัน", historyIndex: 0 });

    const { rerender } = renderHook(() => useOnlineAutosave());

    // เปลี่ยนผัง (เพิ่ม historyIndex)
    layoutStore.setState({
      layout: { ...sample, width: 10 },
      historyIndex: 1,
    });
    rerender();

    vi.advanceTimersByTime(1000);

    expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ width: 10 }), "ร้านกาแฟของฉัน");
  });
});
