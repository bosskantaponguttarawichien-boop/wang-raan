// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { layoutStore } from "@/store/use-layout-store";
import { SaveOnlineDialog } from "./save-online-dialog";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

describe("SaveOnlineDialog", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("แสดง input พร้อมชื่อปัจจุบัน และ redirect ไป /login?next=/playground?sync=1 เมื่อ submit", () => {
    layoutStore.setState({ layoutName: "ร้านกาแฟสุขใจ" });
    const onOpenChange = vi.fn();
    render(<SaveOnlineDialog open={true} onOpenChange={onOpenChange} />);

    expect(screen.getByRole("heading", { name: "บันทึกผังออนไลน์" })).toBeInTheDocument();
    const input = screen.getByLabelText("ชื่อผังร้าน");
    expect(input).toHaveValue("ร้านกาแฟสุขใจ");

    fireEvent.change(input, { target: { value: "คาเฟ่ริมหาด" } });
    fireEvent.click(screen.getByRole("button", { name: /เข้าสู่ระบบเพื่อบันทึก/ }));

    expect(layoutStore.getState().layoutName).toBe("คาเฟ่ริมหาด");
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(pushMock).toHaveBeenCalledWith(`/login?next=${encodeURIComponent("/playground?sync=1")}`);
  });
});
