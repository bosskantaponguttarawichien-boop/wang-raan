// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as nextAuthReact from "next-auth/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cafeLayout } from "@/test/fixtures/layouts";
import * as apiClientModule from "@/lib/api-client";
import { ProjectsList } from "./projects-list";

const mockReplace = vi.fn();
const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
}));

vi.mock("next-auth/react", () => ({
  useSession: vi.fn(() => ({
    data: { user: { id: "user-123", email: "somchai@example.com" }, expires: "2099-01-01" },
    status: "authenticated",
    update: vi.fn(),
  })),
  signOut: vi.fn(),
}));

describe("ProjectsList (feat-063)", () => {
  const sampleLayout = cafeLayout();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(nextAuthReact.useSession).mockReturnValue({
      data: { user: { id: "user-123", email: "somchai@example.com" }, expires: "2099-01-01" },
      status: "authenticated",
      update: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("ผู้ใช้ที่ยังไม่ล็อกอิน → redirect ไป /login?next=/projects", () => {
    vi.mocked(nextAuthReact.useSession).mockReturnValue({
      data: null,
      status: "unauthenticated",
      update: vi.fn(),
    });

    render(<ProjectsList />);
    expect(mockReplace).toHaveBeenCalledWith("/login?next=/projects");
  });

  it("ยังไม่มีผังร้าน → แสดง Empty state พร้อมปุ่มสร้างผังแรก", async () => {
    vi.spyOn(apiClientModule.api, "listLayouts").mockResolvedValueOnce([]);

    render(<ProjectsList />);

    expect(await screen.findByRole("heading", { name: "ยังไม่มีผังร้าน" })).toBeDefined();
    expect(screen.getByText(/เริ่มจากผังเปล่า หรือเลือกผังตัวอย่างคาเฟ่/)).toBeDefined();
    expect(screen.getByRole("button", { name: "สร้างผังแรก" })).toBeDefined();
  });

  it("มีผังในรายการ → แสดงจำนวนผังและการ์ดผังร้าน", async () => {
    vi.spyOn(apiClientModule.api, "listLayouts").mockResolvedValueOnce([
      {
        id: "layout-01",
        name: "ร้านกาแฟสาขาสยาม",
        width: 8,
        depth: 6,
        objectCount: 7,
        status: "ready",
        updatedAt: new Date().toISOString(),
        layout: sampleLayout,
      },
    ]);

    render(<ProjectsList />);

    expect(await screen.findByText("1 ผัง")).toBeDefined();
    expect(screen.getByRole("heading", { name: "ร้านกาแฟสาขาสยาม" })).toBeDefined();
    expect(screen.getByText(/8 × 6 ม\./)).toBeDefined();
  });

  it("กดลบผังผ่านเมนู ⋯ และยืนยันใน dialog → ผังถูกลบและหายจากรายการ", async () => {
    vi.spyOn(apiClientModule.api, "listLayouts").mockResolvedValueOnce([
      {
        id: "layout-01",
        name: "ร้านกาแฟสาขาสยาม",
        width: 8,
        depth: 6,
        objectCount: 7,
        status: "ready",
        updatedAt: new Date().toISOString(),
        layout: sampleLayout,
      },
    ]);
    const deleteSpy = vi.spyOn(apiClientModule.api, "deleteLayout").mockResolvedValueOnce();

    render(<ProjectsList />);

    const moreBtn = await screen.findByLabelText(/เมนูจัดการผัง ร้านกาแฟสาขาสยาม/);
    fireEvent.click(moreBtn);

    const deleteMenuItem = screen.getByRole("menuitem", { name: "ลบผัง" });
    fireEvent.click(deleteMenuItem);

    expect(await screen.findByRole("alertdialog")).toBeDefined();
    const confirmBtn = screen.getByRole("button", { name: "ลบผัง" });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith("layout-01");
      expect(screen.queryByText("ร้านกาแฟสาขาสยาม")).toBeNull();
    });
  });
});
