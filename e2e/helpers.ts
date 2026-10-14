import { expect, type APIRequestContext, type Page } from "@playwright/test";

/** Backend จำลอง (หรือ fault proxy หน้า Backend จริง) ที่ playwright.config.ts เปิดไว้ — มีคำสั่งควบคุม /__mock/* สำหรับเทสต์ */
export const MOCK_BACKEND = "http://localhost:4010";

/** สั่ง Backend จำลอง / fault proxy (เช่น `mockControl(request, "outage", { subject })`) */
export async function mockControl(request: APIRequestContext, path: string, data?: unknown) {
  const res = await request.post(`${MOCK_BACKEND}/__mock/${path}`, data === undefined ? {} : { data });
  if (!res.ok()) throw new Error(`mock control ${path} → ${res.status()}`);
}

/** id ผู้ใช้ของ session ปัจจุบัน (ใช้สั่ง outage เฉพาะผู้ใช้) */
export async function sessionUserId(page: Page): Promise<string> {
  const session = await (await page.request.get("/api/auth/session")).json();
  return session.user.id as string;
}

/** 6 breakpoints ตาม AGENTS.md / PRD */
export const BREAKPOINTS = [320, 375, 480, 768, 1024, 1440] as const;

export type PlaygroundTab = "add" | "shop" | "check";

/** เปิดแท็บใน Rail ของ Playground: add = เพิ่ม, shop = ร้าน (ขนาด/ทางเข้า), check = จำลอง (ตรวจผัง + เริ่มจำลอง) */
export async function openTab(page: Page, tab: PlaygroundTab) {
  const button = page.locator(`#rail [data-tab="${tab}"]`);
  // มือถือ: แผงเป็น bottom sheet ที่ปิดเองหลังเพิ่มของ — กดแท็บเดิมซ้ำ = เปิด/ปิด sheet
  if ((await button.getAttribute("aria-pressed")) !== "true" || !(await page.locator("#panel").isVisible())) await button.click();
  await expect(page.locator("#panel")).toBeVisible();
}

/** ปิด dialog ที่เปิดค้าง (เช่น บัญชีและผังออนไลน์) ก่อนจัดผัง */
export async function closeDialogs(page: Page) {
  const dialog = page.getByRole("dialog");
  if (await dialog.count()) {
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  }
}

/** แผง "บัญชีและผังออนไลน์" (เมนูโปรเจกต์ → บัญชีและผังออนไลน์) — เปิดให้ถ้ายังไม่เปิด แล้วคืน locator ของแผง */
export async function cloud(page: Page) {
  const panel = page.getByTestId("cloud-panel");
  if (!(await panel.count())) {
    await page.getByRole("button", { name: "เมนูโปรเจกต์" }).click();
    await page.locator('[data-act="cloud"]').click();
  }
  await expect(panel).toBeVisible();
  return panel;
}

/** กดเพิ่มของจาก palette ในแท็บ "เพิ่ม" — ของที่เพิ่มถูกเลือกอยู่ และมี toolbar ลอยติด */
export async function addItem(page: Page, name: "ครัว" | "เคาน์เตอร์" | "ชุดโต๊ะ 2 ที่นั่ง" | "ชุดโต๊ะ 4 ที่นั่ง") {
  await closeDialogs(page);
  await openTab(page, "add");
  await page.getByRole("button", { name: new RegExp(`^เพิ่ม\\s*${name}`) }).click();
  await page.getByTestId("selection-toolbar").waitFor();
}

/** ย้ายวัตถุที่เลือกไปที่พิกัด (ม.) ผ่านป๊อปโอเวอร์ "ปรับละเอียด" ของ selection toolbar — เลือกเก้าอี้อยู่จะย้ายทั้งชุดโต๊ะ */
export async function placeSelected(page: Page, x: number, y: number) {
  const toolbar = page.getByTestId("selection-toolbar");
  await toolbar.getByRole("button", { name: "ปรับละเอียด" }).click();
  await toolbar.getByLabel("ซ้าย-ขวา").fill(String(x));
  await toolbar.getByLabel("บน-ล่าง").fill(String(y));
  await toolbar.getByLabel("บน-ล่าง").press("Enter"); // Enter = นำไปใช้และปิดป๊อปโอเวอร์
}

/** สร้างผังคาเฟ่ 8 × 6 ม. ที่ผ่านทุกกฎผ่าน UI จริง (ครัว + เคาน์เตอร์ + ชุดโต๊ะ 4 ที่นั่ง) */
export async function buildReadyCafe(page: Page) {
  await addItem(page, "ครัว");
  await placeSelected(page, 0.5, 0.5);
  await addItem(page, "เคาน์เตอร์");
  await placeSelected(page, 5, 0.5);
  await addItem(page, "ชุดโต๊ะ 4 ที่นั่ง");
  await placeSelected(page, 4, 3.25);
}

/** ย้ายชิ้นงานที่เลือก (โฟกัสอยู่) ด้วยลูกศร: ทีละ 1 ม. (Shift) และ 0.25 ม. */
export async function moveSelected(page: Page, dx: number, dy: number) {
  const selected = page.locator('[data-id][aria-pressed="true"]').first();
  await selected.focus();
  const press = async (key: string, meters: number) => {
    const whole = Math.trunc(meters);
    const quarters = Math.round((meters - whole) / 0.25);
    for (let i = 0; i < whole; i++) await page.keyboard.press(`Shift+${key}`);
    for (let i = 0; i < quarters; i++) await page.keyboard.press(key);
  };
  await press(dx >= 0 ? "ArrowRight" : "ArrowLeft", Math.abs(dx));
  await press(dy >= 0 ? "ArrowDown" : "ArrowUp", Math.abs(dy));
}

/** เปิดหัวข้อเดิม (ก่อน UX ใหม่) — แมปเข้าแท็บของ Rail */
export async function openSection(page: Page, key: "room" | "add" | "simulation" | "shop" | "check") {
  const tab: Record<typeof key, PlaygroundTab> = { add: "add", room: "shop", shop: "shop", simulation: "check", check: "check" };
  await openTab(page, tab[key]);
}

/** เริ่มที่แท็บ "เพิ่ม" */
export async function openAllSections(page: Page) {
  await openTab(page, "add");
}

/** ล็อกอินด้วย credentials provider ของ Auth.js ผ่าน HTTP แบบเดียวกับ signIn() ฝั่ง client — คืน URL ปลายทาง (มี ?code= เมื่อไม่สำเร็จ) */
export async function credentialsSignIn(request: APIRequestContext, provider: string, fields: Record<string, string> = {}) {
  const { csrfToken } = await (await request.get("/api/auth/csrf")).json();
  const res = await request.post(`/api/auth/callback/${provider}`, {
    form: { csrfToken, callbackUrl: "/", ...fields },
    headers: { "x-auth-return-redirect": "1" },
    maxRedirects: 0,
  });
  const { url } = (await res.json()) as { url: string };
  return new URL(url);
}
