// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BrowserSupportNotice, isBrowserSupported } from "./browser-support-notice";

describe("isBrowserSupported", () => {
  it("ผ่านเมื่อรองรับครบทุกฟีเจอร์", () => {
    expect(isBrowserSupported({ supports: () => true })).toBe(true);
  });

  it("ไม่ผ่านเมื่อขาดฟีเจอร์ใดฟีเจอร์หนึ่ง หรือไม่มี CSS.supports", () => {
    expect(isBrowserSupported({ supports: (p: string) => p !== "width" })).toBe(false);
    expect(isBrowserSupported({} as Pick<typeof CSS, "supports">)).toBe(false);
  });
});

describe("BrowserSupportNotice", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("ไม่แสดงบนเบราว์เซอร์ที่รองรับ", () => {
    vi.spyOn(CSS, "supports").mockReturnValue(true);
    render(<BrowserSupportNotice />);
    expect(screen.queryByTestId("browser-support-notice")).toBeNull();
  });

  it("แสดงบนเบราว์เซอร์เก่า และปิดได้", () => {
    vi.spyOn(CSS, "supports").mockReturnValue(false);
    render(<BrowserSupportNotice />);
    expect(screen.getByRole("alert").textContent).toContain("เบราว์เซอร์นี้เก่าเกินไป");
    fireEvent.click(screen.getByRole("button", { name: "ปิดคำแจ้งเตือน" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
