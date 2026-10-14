// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";

describe("DeleteConfirmDialog (feat-063)", () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    layoutName: "ร้านกาแฟสยาม",
    onConfirm: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("แสดงผลชื่อผังในหัวข้อ และข้อความเตือนการลบถาวร", () => {
    render(<DeleteConfirmDialog {...defaultProps} />);

    expect(screen.getByRole("alertdialog")).toBeDefined();
    expect(screen.getByText(/ลบผัง “ร้านกาแฟสยาม”\?/)).toBeDefined();
    expect(screen.getByText(/ผังนี้และลิงก์แชร์ทั้งหมดของผังจะถูกลบถาวร กู้คืนไม่ได้/)).toBeDefined();
    expect(screen.getByRole("button", { name: "ยกเลิก" })).toBeDefined();
    expect(screen.getByRole("button", { name: "ลบผัง" })).toBeDefined();
  });

  it("กดปุ่มยกเลิก → เรียก onOpenChange(false)", () => {
    render(<DeleteConfirmDialog {...defaultProps} />);

    fireEvent.click(screen.getByRole("button", { name: "ยกเลิก" }));
    expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("กดปุ่มลบผัง → เรียก onConfirm()", async () => {
    render(<DeleteConfirmDialog {...defaultProps} />);

    fireEvent.click(screen.getByRole("button", { name: "ลบผัง" }));
    expect(defaultProps.onConfirm).toHaveBeenCalled();
  });
});
