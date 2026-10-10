import type { APIRequestContext, Page } from "@playwright/test";

/** Backend จำลองที่ playwright.config.ts เปิดไว้ — มีคำสั่งควบคุม /__mock/* สำหรับเทสต์ */
export const MOCK_BACKEND = "http://localhost:4010";

/** สั่ง Backend จำลอง (เช่น `mockControl(request, "outage", { subject })`) */
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

/** สร้างผังคาเฟ่ที่ผ่านทุกกฎผ่าน UI จริง (เพิ่มจาก palette แล้วย้ายด้วยคีย์บอร์ด) */
export async function buildReadyCafe(page: Page) {
  await page.getByRole("button", { name: /^เพิ่ม\s*ครัว/ }).click();
  await moveSelected(page, -2.5, -1.75); // ครัว (3, 2.25) → (0.5, 0.5)
  await page.getByRole("button", { name: /^เพิ่ม\s*เคาน์เตอร์/ }).click();
  await moveSelected(page, 2.25, -2.25); // เคาน์เตอร์ (2.75, 2.75) → (5, 0.5)
  await page.getByRole("button", { name: /^เพิ่ม\s*ชุดโต๊ะ 4 ที่นั่ง/ }).click();
  await moveSelected(page, 0.5, 0.75); // โต๊ะ (3.5, 2.5) → (4, 3.25)
}

/** ย้ายชิ้นงานที่เลือก (โฟกัสอยู่) ด้วยลูกศร: ทีละ 1 ม. (Shift) และ 0.25 ม. */
async function moveSelected(page: Page, dx: number, dy: number) {
  const selected = page.locator('[data-id][aria-pressed="true"]');
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
