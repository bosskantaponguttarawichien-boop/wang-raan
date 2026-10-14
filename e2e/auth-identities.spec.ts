/**
 * บัญชีผู้ใช้ตามสัญญา v1.3.0 (feat-061) — ผ่าน HTTP จริงทั้งเส้น: เบราว์เซอร์ → Auth.js → BFF → Backend (จำลอง)
 * id ผู้ใช้มาจาก Backend เสมอ: Guest = `guest-<uuid>` จาก resolve, อีเมล OTP = `usr-<uuid>` จาก otp/verify
 * ไม่ผูกกับ selector ของ UI (หน้าจออยู่ใน login-otp / projects / playground-id-online)
 */
import { expect, test, type APIRequestContext } from "@playwright/test";
import { cafeLayout } from "../src/test/fixtures/layouts";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** ล็อกอินด้วย credentials provider ของ Auth.js แบบเดียวกับที่ signIn() ฝั่ง client ทำ */
async function credentialsSignIn(request: APIRequestContext, provider: string, fields: Record<string, string> = {}) {
  const { csrfToken } = await (await request.get("/api/auth/csrf")).json();
  const res = await request.post(`/api/auth/callback/${provider}`, {
    form: { csrfToken, callbackUrl: "/", ...fields },
    headers: { "x-auth-return-redirect": "1" },
    maxRedirects: 0,
  });
  const { url } = (await res.json()) as { url: string };
  return new URL(url);
}

async function sessionId(request: APIRequestContext): Promise<string | undefined> {
  return (await (await request.get("/api/auth/session")).json())?.user?.id;
}

test("Guest ได้ id จาก Backend → บันทึกผัง → ล็อกอิน OTP → ผังย้ายเข้าบัญชี usr- และ export มี identity อีเมล", async ({ page }) => {
  const request = page.request;

  // 1. Guest — id มาจาก resolve ของ Backend
  await credentialsSignIn(request, "guest");
  const guestId = await sessionId(request);
  expect(guestId).toMatch(new RegExp(`^guest-${UUID}$`));
  expect((await (await request.get("/api/me")).json()).provider).toBe("guest");

  const layout = { ...cafeLayout(), id: `e2e-identities-${Date.now()}` };
  expect((await request.post("/api/layouts", { data: { layout, name: "ร้านก่อนล็อกอิน" } })).status()).toBe(201);

  // 2. ล็อกอินด้วยอีเมล OTP (Backend จำลองใช้รหัส 123456)
  const email = `identities-${Date.now()}@example.com`;
  expect((await request.post("/api/auth/otp/request", { data: { email } })).ok()).toBe(true);
  await credentialsSignIn(request, "email-otp", { email, code: "123456" });
  const userId = await sessionId(request);
  expect(userId).toMatch(new RegExp(`^usr-${UUID}$`));

  // 3. ผังของ Guest ย้ายตามมา (merge-guest) และ export มี identity อีเมลที่ยืนยันแล้ว
  const page1 = await (await request.get("/api/layouts")).json();
  expect(page1.layouts.map((l: { id: string; name: string }) => [l.id, l.name])).toContainEqual([layout.id, "ร้านก่อนล็อกอิน"]);
  expect(page1).toHaveProperty("nextCursor", null);
  const exported = await (await request.get("/api/me/export")).json();
  expect(exported.user).toMatchObject({ id: userId, provider: "email", email });
  expect(exported.identities).toEqual([
    expect.objectContaining({ provider: "email", providerAccountId: email, emailVerified: true }),
  ]);

});

test("รหัส OTP ผิด → Auth.js ส่ง code OTP_INVALID กลับมา (หน้า /login เลือกข้อความจาก code)", async ({ page }) => {
  const email = `wrong-${Date.now()}@example.com`;
  await page.request.post("/api/auth/otp/request", { data: { email } });
  const url = await credentialsSignIn(page.request, "email-otp", { email, code: "000000" });
  expect(url.searchParams.get("error")).toBe("CredentialsSignin");
  expect(url.searchParams.get("code")).toBe("OTP_INVALID");
  expect(await sessionId(page.request)).toBeUndefined();
});

test("/api/layouts แบ่งหน้า: limit นอกช่วง → 400", async ({ page }) => {
  await credentialsSignIn(page.request, "guest");
  expect((await page.request.get("/api/layouts?limit=51")).status()).toBe(400);
  const first = await (await page.request.get("/api/layouts?limit=1")).json();
  expect(first).toEqual({ layouts: [], nextCursor: null });
});
