// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import * as nextAuthReact from "next-auth/react";
import * as nextNavigation from "next/navigation";
import { api } from "@/lib/api-client";
import { layoutStore } from "@/store/use-layout-store";
import { PENDING_SYNC_KEY, useGuestSync } from "./guest-sync";

vi.mock("next-auth/react", () => ({
  useSession: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
  useSearchParams: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({
  api: {
    createLayout: vi.fn(),
  },
}));

describe("useGuestSync (feat-064)", () => {
  const replaceMock = vi.fn();
  const searchParamsGet = vi.fn();
  const toastMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(nextNavigation.useRouter).mockReturnValue({
      replace: replaceMock,
    } as unknown as ReturnType<typeof nextNavigation.useRouter>);
    vi.mocked(nextNavigation.useSearchParams).mockReturnValue({
      get: searchParamsGet,
    } as unknown as ReturnType<typeof nextNavigation.useSearchParams>);
  });

  it("ไม่ทำอะไรถ้าไม่มี query sync=1", async () => {
    searchParamsGet.mockReturnValue(null);
    vi.mocked(nextAuthReact.useSession).mockReturnValue({
      data: { user: { id: "usr_1" } },
      status: "authenticated",
    } as unknown as ReturnType<typeof nextAuthReact.useSession>);

    renderHook(() => useGuestSync({ onToast: toastMock }));

    expect(api.createLayout).not.toHaveBeenCalled();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("ไม่ทำอะไรถ้าเป็น guest หรือยังโหลด session", async () => {
    searchParamsGet.mockReturnValue("1");
    vi.mocked(nextAuthReact.useSession).mockReturnValue({
      data: { user: { id: "guest-123" } },
      status: "authenticated",
    } as unknown as ReturnType<typeof nextAuthReact.useSession>);

    renderHook(() => useGuestSync({ onToast: toastMock }));

    expect(api.createLayout).not.toHaveBeenCalled();
  });

  it("ไม่มี marker pending-sync (เช่น โหลด ?sync=1 ซ้ำ) → ไม่สร้างผัง กลับ /playground", async () => {
    searchParamsGet.mockReturnValue("1");
    vi.mocked(nextAuthReact.useSession).mockReturnValue({
      data: { user: { id: "usr_test" } },
      status: "authenticated",
    } as unknown as ReturnType<typeof nextAuthReact.useSession>);

    renderHook(() => useGuestSync({ onToast: toastMock }));

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/playground"));
    expect(api.createLayout).not.toHaveBeenCalled();
  });

  it("sync ผังและ redirect ไป /playground/[id] เมื่อ sync=1 และเป็น user — ล้างแค่ร่าง ไม่ล้างค่าอื่นใน localStorage", async () => {
    localStorage.setItem(PENDING_SYNC_KEY, JSON.stringify({ name: "คาเฟ่ทดสอบ" }));
    localStorage.setItem("wang-raan:other-pref", "keep");
    searchParamsGet.mockReturnValue("1");
    vi.mocked(nextAuthReact.useSession).mockReturnValue({
      data: { user: { id: "usr_test", email: "test@example.com" } },
      status: "authenticated",
    } as unknown as ReturnType<typeof nextAuthReact.useSession>);

    vi.mocked(api.createLayout).mockResolvedValue({
      name: "ผังร้านทดสอบ",
      layout: { ...layoutStore.getState().layout, id: "lay_new_123" },
      validation: {
        status: "ready",
        issues: [],
        layoutRevision: "rev-1",
        validatedAt: new Date().toISOString(),
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    renderHook(() => useGuestSync({ onToast: toastMock }));

    await waitFor(() => {
      expect(api.createLayout).toHaveBeenCalled();
      expect(replaceMock).toHaveBeenCalledWith("/playground/lay_new_123");
      expect(toastMock).toHaveBeenCalledWith("บันทึกผังในบัญชีของคุณเรียบร้อยแล้ว");
    });
    expect(vi.mocked(api.createLayout).mock.calls[0]![1]).toBe("คาเฟ่ทดสอบ");
    expect(localStorage.getItem(PENDING_SYNC_KEY)).toBeNull();
    expect(localStorage.getItem("wang-raan:other-pref")).toBe("keep");
  });

  it("จัดการ error เมื่อสร้างผังไม่สำเร็จ", async () => {
    localStorage.setItem(PENDING_SYNC_KEY, "{}");
    searchParamsGet.mockReturnValue("1");
    vi.mocked(nextAuthReact.useSession).mockReturnValue({
      data: { user: { id: "usr_test" } },
      status: "authenticated",
    } as unknown as ReturnType<typeof nextAuthReact.useSession>);

    vi.mocked(api.createLayout).mockRejectedValue({
      code: "LAYOUT_BLOCKED",
      message: "ผังยังไม่ผ่าน",
    });

    renderHook(() => useGuestSync({ onToast: toastMock }));

    await waitFor(() => {
      expect(api.createLayout).toHaveBeenCalled();
      expect(replaceMock).toHaveBeenCalledWith("/playground");
      expect(toastMock).toHaveBeenCalledWith(
        "ผังยังไม่ผ่านกฎจำเป็น จึงบันทึกไม่ได้ — แก้ไขตามแถบสถานะก่อน"
      );
    });
  });
});
