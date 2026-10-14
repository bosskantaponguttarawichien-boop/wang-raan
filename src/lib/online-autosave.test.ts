// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { layoutStore } from "@/store/use-layout-store";
import { api } from "@/lib/api-client";
import { createSampleCafeLayout } from "@/core/layout";
import { useOnlineAutosave } from "./online-autosave";

describe("useOnlineAutosave", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
  });
  // hook ของเทสต์ก่อนต้องไม่ค้างฟัง store ที่ใช้ร่วมกัน
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
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

  function editedOnline(change: (l: ReturnType<typeof createSampleCafeLayout>) => ReturnType<typeof createSampleCafeLayout>) {
    const sample = createSampleCafeLayout();
    layoutStore.setState({ layoutId: "layout-xyz", layout: sample, layoutName: "ร้าน", historyIndex: 0 });
    const hook = renderHook(() => useOnlineAutosave());
    layoutStore.setState({ layout: change(sample), historyIndex: 1 });
    hook.rerender();
    return hook;
  }

  it("ออกจาก Editor ก่อนครบ debounce → บันทึกทันที (ไม่ทิ้งการแก้ไขล่าสุด)", () => {
    const updateSpy = vi.spyOn(api, "updateLayout").mockResolvedValue({} as never);
    const { unmount } = editedOnline((l) => ({ ...l, width: 10 }));
    expect(updateSpy).not.toHaveBeenCalled();
    unmount();
    expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ width: 10 }), "ร้าน");
  });

  it("ผัง Blocked ไม่ส่งขึ้น Backend แต่เตือนก่อนปิดแท็บ", () => {
    const updateSpy = vi.spyOn(api, "updateLayout").mockResolvedValue({} as never);
    editedOnline((l) => ({ ...l, objects: l.objects.filter((o) => o.type !== "counter") }));
    vi.advanceTimersByTime(2000);
    expect(updateSpy).not.toHaveBeenCalled();
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("บันทึกเสร็จแล้ว → ปิดแท็บได้โดยไม่ถาม", async () => {
    vi.spyOn(api, "updateLayout").mockResolvedValue({} as never);
    editedOnline((l) => ({ ...l, width: 10 }));
    await vi.advanceTimersByTimeAsync(1000);
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it("เปิดผังอื่นก่อนครบ debounce → บันทึกงานล่าสุดของผังเดิมก่อน", () => {
    const updateSpy = vi.spyOn(api, "updateLayout").mockResolvedValue({} as never);
    const { rerender } = editedOnline((l) => ({ ...l, id: "layout-xyz", width: 10 }));
    const other = { ...createSampleCafeLayout(), id: "layout-other" };
    layoutStore.setState({ layoutId: "layout-other", layout: other, layoutName: "ร้านอื่น", historyIndex: 0 });
    rerender();
    expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ id: "layout-xyz", width: 10 }), "ร้าน");
  });
});
