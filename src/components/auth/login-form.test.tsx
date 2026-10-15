// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import * as React from "react";
import { LoginForm, oauthErrorMessage } from "./login-form";
import * as nextAuthReact from "next-auth/react";

// Mock next/navigation
const mockPush = vi.fn();
const mockReplace = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
  useSearchParams: () => mockSearchParams,
}));

// Mock next-auth/react
vi.mock("next-auth/react", () => ({
  useSession: vi.fn(() => ({ data: null, status: "unauthenticated", update: vi.fn() })),
  signIn: vi.fn(),
}));

describe("LoginForm (feat-062)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    vi.mocked(nextAuthReact.useSession).mockReturnValue({
      data: null,
      status: "unauthenticated",
      update: vi.fn(),
    });
    global.fetch = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("แสดงผลขั้นตอนที่ 1 (กรอกอีเมล) ครบถ้วน", () => {
    render(<LoginForm />);

    expect(screen.getByRole("heading", { name: "เข้าสู่ระบบ" })).toBeDefined();
    expect(screen.getByText("เข้าสู่ระบบด้วย Google")).toBeDefined();
    expect(screen.getByLabelText("อีเมล")).toBeDefined();
    expect(screen.getByRole("button", { name: "ส่งรหัสเข้าสู่ระบบ" })).toBeDefined();
    expect(screen.getByText(/ยังไม่มีบัญชี\? ใช้อีเมลนี้ได้เลย/)).toBeDefined();
  });

  it("ตรวจจับอีเมลผิดรูปแบบและแสดงข้อความแจ้งเตือนพร้อม aria-invalid", async () => {
    render(<LoginForm />);

    const emailInput = screen.getByLabelText("อีเมล");
    fireEvent.change(emailInput, { target: { value: "invalid-email" } });

    const submitBtn = screen.getByRole("button", { name: "ส่งรหัสเข้าสู่ระบบ" });
    fireEvent.click(submitBtn);

    expect(await screen.findByText("อีเมลไม่ถูกต้อง ลองตรวจอีกครั้ง")).toBeDefined();
    expect(emailInput.getAttribute("aria-invalid")).toBe("true");
  });

  it("กรอกอีเมลถูกต้อง → ส่งคำขอขอ OTP สำเร็จ → เปลี่ยนเป็นขั้นตอนที่ 2 (OTP)", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ sent: true, expiresIn: 600 }), { status: 200, headers: { "content-type": "application/json" } }),
    );

    render(<LoginForm />);

    const emailInput = screen.getByLabelText("อีเมล");
    fireEvent.change(emailInput, { target: { value: "somchai@example.com" } });

    const submitBtn = screen.getByRole("button", { name: "ส่งรหัสเข้าสู่ระบบ" });
    fireEvent.click(submitBtn);

    expect(await screen.findByRole("heading", { name: "กรอกรหัส 6 หลัก" })).toBeDefined();
    expect(screen.getByText("somchai@example.com")).toBeDefined();
    expect(screen.getByLabelText("รหัสเข้าสู่ระบบ")).toBeDefined();
    expect(screen.getByRole("button", { name: "ยืนยันรหัส" })).toBeDefined();
  });

  it("ขั้นตอนที่ 2: กรองเฉพาะตัวเลข 6 หลัก และกดเปลี่ยนอีเมลย้อนกลับได้", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ sent: true, expiresIn: 600 }), { status: 200, headers: { "content-type": "application/json" } }),
    );

    render(<LoginForm />);

    fireEvent.change(screen.getByLabelText("อีเมล"), { target: { value: "somchai@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "ส่งรหัสเข้าสู่ระบบ" }));

    const codeInput = await screen.findByLabelText("รหัสเข้าสู่ระบบ");
    fireEvent.change(codeInput, { target: { value: "abc123xyz456extra" } });
    expect((codeInput as HTMLInputElement).value).toBe("123456");

    // กดปุ่มเปลี่ยนอีเมล
    const changeBtn = screen.getByRole("button", { name: /เปลี่ยนอีเมล/ });
    fireEvent.click(changeBtn);

    expect(await screen.findByRole("heading", { name: "เข้าสู่ระบบ" })).toBeDefined();
    expect((screen.getByLabelText("อีเมล") as HTMLInputElement).value).toBe("somchai@example.com");
  });

  it.each([
    ["OTP_INVALID", "รหัสไม่ถูกต้อง กรุณาตรวจอีกครั้ง"],
    ["OTP_EXPIRED", "รหัสหมดอายุแล้ว กรุณาขอรหัสใหม่"],
    ["OTP_ATTEMPTS_EXCEEDED", "กรอกรหัสผิดเกินจำนวนที่กำหนด กรุณาขอรหัสใหม่"],
    ["RATE_LIMITED", "ลองถี่เกินไป กรุณารอสักครู่แล้วลองใหม่"],
  ])("ขั้นตอนที่ 2: ตรวจรหัสไม่ผ่าน (%s) → แสดงข้อความตามสาเหตุ", async (code, message) => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ sent: true, expiresIn: 600 }), { status: 200, headers: { "content-type": "application/json" } }),
    );
    vi.mocked(nextAuthReact.signIn).mockResolvedValueOnce({
      error: "CredentialsSignin",
      status: 401,
      ok: false,
      url: null,
      code,
    });

    render(<LoginForm />);

    fireEvent.change(screen.getByLabelText("อีเมล"), { target: { value: "somchai@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "ส่งรหัสเข้าสู่ระบบ" }));

    const codeInput = await screen.findByLabelText("รหัสเข้าสู่ระบบ");
    fireEvent.change(codeInput, { target: { value: "000000" } });

    const verifyBtn = screen.getByRole("button", { name: "ยืนยันรหัส" });
    fireEvent.click(verifyBtn);

    expect(await screen.findByText(message)).toBeDefined();
  });

  it("กดปุ่ม Google → signIn('google') พร้อม ?next= ที่ปลอดภัย และปุ่มแสดงสถานะกำลังไป", async () => {
    mockSearchParams = new URLSearchParams("next=/playground/abc");
    vi.mocked(nextAuthReact.signIn).mockReturnValueOnce(new Promise(() => {}));
    render(<LoginForm />);
    fireEvent.click(screen.getByRole("button", { name: "เข้าสู่ระบบด้วย Google" }));
    expect(nextAuthReact.signIn).toHaveBeenCalledWith("google", { redirectTo: "/playground/abc" });
    const busy = await screen.findByRole("button", { name: "กำลังไปที่ Google..." });
    expect((busy as HTMLButtonElement).disabled).toBe(true);
  });

  it("กลับจาก Google ด้วย ?error= → แสดงข้อความภาษาไทย (role=alert)", () => {
    mockSearchParams = new URLSearchParams("error=AccessDenied");
    render(<LoginForm />);
    expect(screen.getByRole("alert").textContent).toContain("ถูกยกเลิก");
  });

  it("oauthErrorMessage: error ของ OAuth ทุกแบบมีข้อความ · ไม่มี error หรือเป็นของ credentials → null", () => {
    expect(oauthErrorMessage(null)).toBeNull();
    expect(oauthErrorMessage("CredentialsSignin")).toBeNull();
    expect(oauthErrorMessage("OAuthCallbackError")).toContain("ถูกยกเลิก");
    expect(oauthErrorMessage("Configuration")).toContain("ใช้อีเมลแทน");
  });

  it("ไม่ได้ตั้งค่า Google → ไม่แสดงปุ่ม Google", () => {
    render(<LoginForm hasGoogleProvider={false} />);
    expect(screen.queryByRole("button", { name: /Google/ })).toBeNull();
  });

  it("ขั้นตอนที่ 2: กรอกรหัสถูกต้อง → เข้าสู่ระบบสำเร็จ → แสดงสถานะสำเร็จ", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ sent: true, expiresIn: 600 }), { status: 200, headers: { "content-type": "application/json" } }),
    );
    vi.mocked(nextAuthReact.signIn).mockResolvedValueOnce({
      error: undefined,
      status: 200,
      ok: true,
      url: "/projects",
      code: undefined,
    });

    render(<LoginForm />);

    fireEvent.change(screen.getByLabelText("อีเมล"), { target: { value: "somchai@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "ส่งรหัสเข้าสู่ระบบ" }));

    const codeInput = await screen.findByLabelText("รหัสเข้าสู่ระบบ");
    fireEvent.change(codeInput, { target: { value: "123456" } });

    const verifyBtn = screen.getByRole("button", { name: "ยืนยันรหัส" });
    fireEvent.click(verifyBtn);

    expect(await screen.findByRole("heading", { name: "เข้าสู่ระบบแล้ว" })).toBeDefined();
    expect(screen.getByText(/ย้ายผังที่ทำไว้เข้าบัญชีเรียบร้อย/)).toBeDefined();
  });

  it("ล็อกอินอยู่แล้วด้วยบัญชีจริง (ไม่ใช่ Guest) → redirect ไป /projects ทันที", () => {
    vi.mocked(nextAuthReact.useSession).mockReturnValue({
      data: { user: { id: "email-user-123", email: "somchai@example.com" }, expires: "2099-01-01" },
      status: "authenticated",
      update: vi.fn(),
    });

    render(<LoginForm />);

    expect(mockReplace).toHaveBeenCalledWith("/projects");
  });

  it("เป็น Guest → ยังแสดงหน้า /login เพื่อให้ล็อกอินเข้าบัญชีจริงได้", () => {
    vi.mocked(nextAuthReact.useSession).mockReturnValue({
      data: { user: { id: "guest-abc-123", name: "ผู้ใช้ทั่วไป" }, expires: "2099-01-01" },
      status: "authenticated",
      update: vi.fn(),
    });

    render(<LoginForm />);

    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "เข้าสู่ระบบ" })).toBeDefined();
  });
});
