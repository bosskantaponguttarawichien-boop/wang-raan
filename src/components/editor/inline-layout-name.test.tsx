// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { layoutStore } from "@/store/use-layout-store";
import { api } from "@/lib/api-client";
import { InlineLayoutName } from "./inline-layout-name";

describe("InlineLayoutName", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });
  it("แสดงชื่อผังเริ่มต้นและเข้าสู่โหมดแก้ไขเมื่อคลิก", () => {
    layoutStore.setState({ layoutName: "คาเฟ่สุขใจ", layoutId: null });
    render(<InlineLayoutName />);

    const btn = screen.getByRole("button", { name: /ชื่อผัง คาเฟ่สุขใจ/ });
    expect(btn).toBeInTheDocument();

    fireEvent.click(btn);

    const input = screen.getByRole("textbox", { name: "แก้ไขชื่อผัง" });
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue("คาเฟ่สุขใจ");
  });

  it("กด Esc เพื่อยกเลิกการแก้ไขโดยไม่เปลี่ยนชื่อ", () => {
    layoutStore.setState({ layoutName: "ร้านเดิม", layoutId: null });
    render(<InlineLayoutName />);

    fireEvent.click(screen.getByRole("button", { name: /ชื่อผัง ร้านเดิม/ }));
    const input = screen.getByRole("textbox", { name: "แก้ไขชื่อผัง" });

    fireEvent.change(input, { target: { value: "ชื่อใหม่ที่ยกเลิก" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ชื่อผัง ร้านเดิม/ })).toBeInTheDocument();
    expect(layoutStore.getState().layoutName).toBe("ร้านเดิม");
  });

  it("กด Enter หรือ blur เพื่อบันทึกชื่อใหม่", () => {
    layoutStore.setState({ layoutName: "ร้านเดิม", layoutId: null });
    render(<InlineLayoutName />);

    fireEvent.click(screen.getByRole("button", { name: /ชื่อผัง ร้านเดิม/ }));
    const input = screen.getByRole("textbox", { name: "แก้ไขชื่อผัง" });

    fireEvent.change(input, { target: { value: "ร้านกาแฟชิค" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ชื่อผัง ร้านกาแฟชิค/ })).toBeInTheDocument();
    expect(layoutStore.getState().layoutName).toBe("ร้านกาแฟชิค");
  });

  it("ถ้ากรอกชื่อว่างเปล่า จะคืนชื่อเดิม", () => {
    layoutStore.setState({ layoutName: "ร้านคงเดิม", layoutId: null });
    render(<InlineLayoutName />);

    fireEvent.click(screen.getByRole("button", { name: /ชื่อผัง ร้านคงเดิม/ }));
    const input = screen.getByRole("textbox", { name: "แก้ไขชื่อผัง" });

    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.blur(input);

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ชื่อผัง ร้านคงเดิม/ })).toBeInTheDocument();
    expect(layoutStore.getState().layoutName).toBe("ร้านคงเดิม");
  });

  it("สำหรับผังออนไลน์ (layoutId มีค่า) จะเรียก api.updateLayout เมื่อเปลี่ยนชื่อ", async () => {
    const updateSpy = vi.spyOn(api, "updateLayout").mockResolvedValue({} as never);
    layoutStore.setState({ layoutName: "ผังออนไลน์", layoutId: "layout-123" });
    const onToast = vi.fn();
    render(<InlineLayoutName onToast={onToast} />);

    fireEvent.click(screen.getByRole("button", { name: /ชื่อผัง ผังออนไลน์/ }));
    const input = screen.getByRole("textbox", { name: "แก้ไขชื่อผัง" });

    fireEvent.change(input, { target: { value: "ผังออนไลน์ใหม่" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith(layoutStore.getState().layout, "ผังออนไลน์ใหม่");
    });
    expect(onToast).toHaveBeenCalledWith("เปลี่ยนชื่อผังเป็น “ผังออนไลน์ใหม่” แล้ว");
  });
});
