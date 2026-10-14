import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { testBackend } from "@/test/backend";
import { cafeLayout } from "@/test/fixtures/layouts";
import { createRequestOtpHandler } from "./otp-handlers";
import { guestToMerge, syncSignIn } from "./account-sync";

let backend: ReturnType<typeof testBackend>;
let handler: ReturnType<typeof createRequestOtpHandler>;

beforeEach(() => {
  backend = testBackend();
  handler = createRequestOtpHandler({ client: backend.client });
});
afterEach(() => expect(backend.violations).toEqual([]));

const req = (body: unknown) =>
  new Request("http://localhost/api/auth/otp/request", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("POST /api/auth/otp/request", () => {
  it("ขอรหัสสำเร็จ → 200 { sent: true, expiresIn: 600 }", async () => {
    const res = await handler(req({ email: "user@example.com" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ sent: true, expiresIn: 600 });
  });

  it("อีเมลผิดรูปแบบ → 400 INVALID_REQUEST", async () => {
    const res = await handler(req({ email: "invalid-email" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe("INVALID_REQUEST");
  });

  it("ขอรหัสซ้ำก่อน 60 วินาที → 429 RATE_LIMITED", async () => {
    await handler(req({ email: "user@example.com" }));
    const res = await handler(req({ email: "user@example.com" }));
    expect(res.status).toBe(429);
    const data = await res.json();
    expect(data.error.code).toBe("RATE_LIMITED");
    expect(res.headers.get("retry-after")).toBeDefined();
  });

  it("Backend ล่ม → 502 DELIVERY_FAILED", async () => {
    const failingClient = {
      request: async () => {
        throw new Error("connection failed");
      },
    };
    const failHandler = createRequestOtpHandler({ client: failingClient });
    const res = await failHandler(req({ email: "user@example.com" }));
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error.code).toBe("DELIVERY_FAILED");
  });
});

describe("verifyOtp ผ่าน account repository", () => {
  const IP = "203.0.113.7";

  it("ขอรหัส → verify รหัสถูก → บัญชีใหม่ usr-<uuid> (created)", async () => {
    await handler(req({ email: "somchai@example.com" }));
    const { user, created } = await backend.accounts.verifyOtp("somchai@example.com", "123456", IP);
    expect(created).toBe(true);
    expect(user).toMatchObject({ email: "somchai@example.com", provider: "email" });
    expect(user.id).toMatch(/^usr-[0-9a-f-]{36}$/);
  });

  it("รหัสผิด / ไม่มีรหัส → OtpError พร้อม code ตามสัญญา", async () => {
    await handler(req({ email: "somchai@example.com" }));
    await expect(backend.accounts.verifyOtp("somchai@example.com", "999999", IP)).rejects.toMatchObject({ code: "OTP_INVALID" });
    await expect(backend.accounts.verifyOtp("nobody@example.com", "123456", IP)).rejects.toMatchObject({ code: "OTP_EXPIRED" });
  });

  it("Guest → Email OTP: ผังย้ายเข้าบัญชีครบ", async () => {
    const guest = (await backend.accounts.resolve({ provider: "guest" }, IP)).user.id;
    const layout = cafeLayout();
    await backend.layouts.create(guest, layout);
    await backend.layouts.create(guest, { ...layout, id: "second" });

    await handler(req({ email: "somchai@example.com" }));
    const { user } = await backend.accounts.verifyOtp("somchai@example.com", "123456", IP);
    expect(guestToMerge(user.id, guest)).toBe(guest);
    expect(await syncSignIn(backend.accounts, { userId: user.id, previousUserId: guest })).toEqual({ movedLayouts: 2, movedShares: 0, renamed: [] });
    expect((await backend.layoutIds(user.id)).sort()).toEqual([layout.id, "second"].sort());
    expect(await backend.layoutIds(guest)).toEqual([]);
  });
});
