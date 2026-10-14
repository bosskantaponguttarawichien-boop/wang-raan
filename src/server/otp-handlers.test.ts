import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { testBackend } from "@/test/backend";
import { cafeLayout } from "@/test/fixtures/layouts";
import { createRequestOtpHandler } from "./otp-handlers";
import { guestToMerge, syncSignIn } from "./account-sync";
import { readBody, send } from "./backend";

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

describe("Email OTP Verify via Backend & Guest Migration", () => {
  it("ขอรหัส → verify รหัสถูก → คืน user ใหม่", async () => {
    await handler(req({ email: "somchai@example.com" }));

    // verify รหัสตรงกับ backend
    const res = await send(
      backend.client,
      "anonymous",
      "/v1/auth/otp/verify",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "somchai@example.com", code: "123456" }),
      },
      [400, 429],
    );
    expect(res.status).toBe(200);
    const data = await readBody<{ user: { id: string; email: string; provider: string } }>(res);
    expect(data.user.email).toBe("somchai@example.com");
    expect(data.user.provider).toBe("email");
    expect(data.user.id).toMatch(/^email-/);
  });

  it("verify รหัสผิด → 400 OTP_INVALID", async () => {
    await handler(req({ email: "somchai@example.com" }));
    const res = await send(
      backend.client,
      "anonymous",
      "/v1/auth/otp/verify",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "somchai@example.com", code: "999999" }),
      },
      [400, 429],
    );
    expect(res.status).toBe(400);
    const err = await res.json();
    expect(err.error.code).toBe("OTP_INVALID");
    expect(err.error.attemptsLeft).toBe(4);
  });

  it("Guest → Email OTP: ย้ายผังจาก Guest เข้าบัญชี email สำเร็จ", async () => {
    const GUEST_ID = `guest-${globalThis.crypto.randomUUID()}`;
    const EMAIL_USER_ID = `email-${globalThis.crypto.randomUUID()}`;

    // Guest มีผังในระบบ
    const layout = cafeLayout();
    await backend.layouts.create(GUEST_ID, layout);
    expect((await backend.layouts.list(GUEST_ID)).length).toBe(1);

    // ย้ายผัง
    expect(guestToMerge(EMAIL_USER_ID, GUEST_ID)).toBe(GUEST_ID);
    const mergeResult = await syncSignIn(backend.accounts, {
      userId: EMAIL_USER_ID,
      profile: { email: "somchai@example.com", name: "Somchai" },
      previousUserId: GUEST_ID,
    });
    expect(mergeResult).toEqual({ movedLayouts: 1, movedShares: 0, renamed: [] });

    // ผังย้ายไปอยู่ใต้ EMAIL_USER_ID
    expect((await backend.layouts.list(EMAIL_USER_ID)).map((l) => l.id)).toEqual([layout.id]);
    expect(await backend.layouts.list(GUEST_ID)).toEqual([]);
  });
});
