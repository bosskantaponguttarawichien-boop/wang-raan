import type { APIRequestContext, Page } from "@playwright/test";

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

/** เปิดหัวข้อหรือแท็บในแถบเครื่องมือของ Playground (รองรับทั้ง PlaygroundRail ใหม่ และ Accordion เดิม) */
export async function openSection(page: Page, key: "selected" | "room" | "add" | "simulation" | "file" | "cloud" | "shop" | "check") {
  const toggle = page.locator(`[data-section-toggle="${key}"]`);
  if (await toggle.count() > 0) {
    if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
    return;
  }
  // แมป key เดิมเข้ากับ tabs ใหม่ใน PlaygroundRail
  const tabMap: Record<string, string> = {
    add: "add",
    room: "shop",
    shop: "shop",
    simulation: "check",
    check: "check",
  };
  const targetTab = tabMap[key];
  if (targetTab) {
    const tabBtn = page.locator(`[data-tab="${targetTab}"]`);
    if (await tabBtn.count() > 0) {
      await tabBtn.click();
    }
  }
}

/** เปิดหัวข้อหลักให้พร้อมใช้งาน (สลับไปแท็บ "เพิ่ม" เริ่มต้น) */
export async function openAllSections(page: Page) {
  const toggles = page.locator("[data-section-toggle]");
  if (await toggles.count() > 0) {
    for (const key of ["room", "add", "simulation", "file", "cloud"] as const) {
      await openSection(page, key);
    }
  } else {
    // โครงสร้าง UX ใหม่: เริ่มต้นที่แท็บ 'add' (เพิ่ม)
    const addTab = page.locator('[data-tab="add"]');
    if (await addTab.count() > 0) {
      await addTab.click();
    }
  }
}
