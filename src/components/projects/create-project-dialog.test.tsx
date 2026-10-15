// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CreateProjectDialog } from "./create-project-dialog";

describe("CreateProjectDialog (feat-063)", () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    defaultName: "ผังร้าน 1",
    onCreate: vi.fn(),
    onUseTemplate: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("แสดงผลฟิลด์เริ่มต้นครบถ้วน: ชื่อผัง, ขนาด 8 × 6 ม., ประตูทิศล่าง", () => {
    render(<CreateProjectDialog {...defaultProps} />);

    expect(screen.getByRole("heading", { name: "สร้างผังใหม่" })).toBeDefined();
    const nameInput = screen.getByLabelText("ชื่อผัง") as HTMLInputElement;
    expect(nameInput.value).toBe("ผังร้าน 1");

    const wInput = screen.getByLabelText("ความกว้าง (เมตร)") as HTMLInputElement;
    expect(wInput.value).toBe("8");

    const dInput = screen.getByLabelText("ความลึก (เมตร)") as HTMLInputElement;
    expect(dInput.value).toBe("6");

    const bottomRadio = screen.getByRole("radio", { name: "ล่าง" });
    expect(bottomRadio.getAttribute("aria-checked")).toBe("true");
  });

  it("ตรวจจับชื่อผังว่างเปล่า และแสดงข้อความแจ้งเตือนภาษาไทย", () => {
    render(<CreateProjectDialog {...defaultProps} />);

    const nameInput = screen.getByLabelText("ชื่อผัง");
    fireEvent.change(nameInput, { target: { value: "   " } });

    const submitBtn = screen.getByRole("button", { name: /สร้างผัง/ });
    fireEvent.click(submitBtn);

    expect(screen.getByText("กรุณาระบุชื่อผังร้าน")).toBeDefined();
    expect(nameInput.getAttribute("aria-invalid")).toBe("true");
    expect(defaultProps.onCreate).not.toHaveBeenCalled();
  });

  it("ตรวจจับชื่อผังยาวเกิน 80 ตัวอักษร", () => {
    render(<CreateProjectDialog {...defaultProps} />);

    const nameInput = screen.getByLabelText("ชื่อผัง");
    fireEvent.change(nameInput, { target: { value: "a".repeat(81) } });

    const submitBtn = screen.getByRole("button", { name: /สร้างผัง/ });
    fireEvent.click(submitBtn);

    expect(screen.getByText("ชื่อผังต้องไม่เกิน 80 ตัวอักษร")).toBeDefined();
    expect(defaultProps.onCreate).not.toHaveBeenCalled();
  });

  it("ตรวจจับขนาดร้านนอกช่วง 2 ถึง 30 เมตร", () => {
    render(<CreateProjectDialog {...defaultProps} />);

    const wInput = screen.getByLabelText("ความกว้าง (เมตร)");
    fireEvent.change(wInput, { target: { value: "1.5" } });

    const submitBtn = screen.getByRole("button", { name: /สร้างผัง/ });
    fireEvent.click(submitBtn);

    expect(screen.getByText("ความกว้างต้องอยู่ระหว่าง 2 ถึง 30 เมตร")).toBeDefined();
    expect(defaultProps.onCreate).not.toHaveBeenCalled();
  });

  it("เลือกผนังประตูได้ และส่งพารามิเตอร์ครบเมื่อกดสร้างผัง", () => {
    render(<CreateProjectDialog {...defaultProps} />);

    const nameInput = screen.getByLabelText("ชื่อผัง");
    fireEvent.change(nameInput, { target: { value: "ร้านกาแฟสุขใจ" } });

    const rightRadio = screen.getByRole("radio", { name: "ขวา" });
    fireEvent.click(rightRadio);
    expect(rightRadio.getAttribute("aria-checked")).toBe("true");

    const submitBtn = screen.getByRole("button", { name: /สร้างผัง/ });
    fireEvent.click(submitBtn);

    expect(defaultProps.onCreate).toHaveBeenCalledWith({
      name: "ร้านกาแฟสุขใจ",
      width: 8,
      depth: 6,
      wall: "east",
    });
  });

  it("กด 'ใช้ผังตัวอย่างแทน' ส่งชื่อผังไปยัง callback", () => {
    render(<CreateProjectDialog {...defaultProps} />);

    const nameInput = screen.getByLabelText("ชื่อผัง");
    fireEvent.change(nameInput, { target: { value: "ร้านกาแฟตัวอย่าง" } });

    const templateBtn = screen.getByRole("button", { name: /ใช้ผังตัวอย่างแทน/ });
    fireEvent.click(templateBtn);

    expect(defaultProps.onUseTemplate).toHaveBeenCalledWith("ร้านกาแฟตัวอย่าง");
  });
});
