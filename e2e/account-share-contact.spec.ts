import { mkdir, writeFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { buildReadyCafe } from "./helpers";

/** feat-030 / 031 / 032 / 033: เข้าสู่ระบบ → บันทึกผ่าน React Query → แชร์ลิงก์สาธารณะ, ฟอร์มติดต่อ + Rate limit */
const cloud = (page: Page) => page.getByTestId("cloud-panel");

async function signInAsGuest(page: Page) {
  await page.goto("/playground");
  await cloud(page).getByRole("button", { name: "เข้าสู่ระบบแบบผู้ใช้ทั่วไป" }).click();
  await expect(page.getByTestId("signed-in-as")).toContainText("ผู้ใช้ทั่วไป");
}

test.describe("บัญชี + ผังออนไลน์ + แชร์", () => {
  test("API ต้องมี Session: ไม่ล็อกอิน → 401", async ({ request }) => {
    const res = await request.get("/api/layouts");
    expect(res.status()).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHORIZED");
    expect((await request.post("/api/share", { data: { layoutId: "x" } })).status()).toBe(401);
  });

  test("Guest → Session Cookie HttpOnly → บันทึก/โหลด/ลบผัง → แชร์ → เปิดลิงก์แบบไม่ล็อกอิน", async ({ page, browser }) => {
    await signInAsGuest(page);
    const cookie = (await page.context().cookies()).find((c) => c.name.endsWith("authjs.session-token"))!;
    expect(cookie).toBeTruthy();
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe("Lax");

    await expect(cloud(page).getByText("ยังไม่มีผังที่บันทึกไว้")).toBeVisible();
    // ผัง Blocked บันทึกไม่ได้ (BFF Re-validate → 422) และรายการ optimistic ถูก rollback
    await cloud(page).getByRole("button", { name: "บันทึกลงบัญชี" }).click();
    await expect(page.getByTestId("cloud-message")).toContainText("ผังยังไม่ผ่านกฎจำเป็น");
    await expect(cloud(page).getByText("ยังไม่มีผังที่บันทึกไว้")).toBeVisible();

    await buildReadyCafe(page);
    await cloud(page).getByRole("button", { name: "บันทึกลงบัญชี" }).click();
    await expect(page.getByTestId("cloud-message")).toContainText("บันทึกแล้วเมื่อ");
    const saved = page.getByTestId("saved-layouts").getByRole("listitem");
    await expect(saved).toHaveCount(1);
    await expect(saved.first()).toContainText("ร้าน 8 × 6 ม. · 7 ชิ้น · กำลังเปิดอยู่");
    await expect(cloud(page).getByRole("button", { name: "บันทึกทับ" })).toBeVisible();

    // รีโหลด: รายการมาจาก BFF (ไม่ใช่ localStorage)
    await page.reload();
    await expect(page.getByTestId("saved-layouts").getByRole("listitem")).toHaveCount(1);

    // แชร์
    await cloud(page).getByRole("button", { name: "แชร์ลิงก์" }).click();
    const link = page.getByTestId("share-link");
    await expect(link).toBeVisible();
    const url = (await link.getAttribute("href"))!;
    expect(url).toMatch(/\/share\/[A-Za-z0-9_-]{43}$/);

    // เปิดในเบราว์เซอร์ใหม่ที่ไม่มี cookie
    const anonymous = await browser.newContext();
    const viewer = await anonymous.newPage();
    await viewer.goto(url);
    await expect(viewer.getByRole("heading", { level: 1 })).toHaveText("ผังร้าน 8 × 6 เมตร");
    await expect(viewer.getByTestId("share-plan").locator("svg")).toBeVisible();
    await expect(viewer.getByTestId("share-plan").locator('[data-type="chair"]')).toHaveCount(4);
    await expect(viewer.getByRole("status")).toContainText("พร้อมจำลอง");
    await expect(viewer.getByRole("button", { name: "เข้าสู่ระบบแบบผู้ใช้ทั่วไป" })).toHaveCount(0); // read-only ไม่มีเครื่องมือแก้ไข
    await viewer.getByRole("button", { name: "ตัวอย่าง 3D" }).click();
    await expect(viewer.getByRole("img", { name: /ไอโซเมตริก/ })).toBeVisible();
    expect(await viewer.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    // Dynamic OG Image
    const og = await viewer.locator('meta[property="og:image"]').getAttribute("content");
    expect(og).toContain("/opengraph-image");
    const image = await viewer.request.get(og!);
    expect(image.status()).toBe(200);
    expect(image.headers()["content-type"]).toBe("image/png");
    await mkdir("e2e/.results/screens", { recursive: true });
    await writeFile("e2e/.results/screens/share-og.png", await image.body());
    expect(await viewer.locator('meta[name="robots"]').getAttribute("content")).toContain("noindex");
    await viewer.screenshot({ path: "e2e/.results/screens/share-page.png", fullPage: true });
    for (const width of [320, 768]) {
      await viewer.setViewportSize({ width, height: 800 });
      expect(await viewer.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${width}px`).toBe(true);
    }
    await anonymous.close();

    // ลิงก์มั่ว → 404
    const missing = await page.request.get("/share/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
    expect(missing.status()).toBe(404);

    // ลบ (ยืนยัน) → รายการว่าง
    page.once("dialog", (d) => d.accept());
    await page.getByTestId("saved-layouts").getByRole("button", { name: /^ลบผังร้าน/ }).click();
    await expect(cloud(page).getByText("ยังไม่มีผังที่บันทึกไว้")).toBeVisible();
  });

  test("เปิดผังที่บันทึกไว้กลับมาแก้ต่อ และผู้ใช้อื่นมองไม่เห็น", async ({ page, browser }) => {
    await signInAsGuest(page);
    await buildReadyCafe(page);
    await cloud(page).getByRole("button", { name: "บันทึกลงบัญชี" }).click();
    await expect(page.getByTestId("saved-layouts").getByRole("listitem")).toHaveCount(1);

    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "เริ่มผังใหม่" }).click();
    await expect(page.getByTestId("artboard-stage").locator('[data-type="table"]')).toHaveCount(0);
    await page.getByTestId("saved-layouts").getByRole("button", { name: "เปิด" }).click();
    await expect(page.getByTestId("artboard-stage").locator('[data-type="chair"]')).toHaveCount(4);
    await expect(page.getByTestId("validation-status-bar")).toHaveAttribute("data-status", "ready");

    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await signInAsGuest(otherPage);
    await expect(cloud(otherPage).getByText("ยังไม่มีผังที่บันทึกไว้")).toBeVisible();
    await other.close();
  });

  test("ออกจากระบบ", async ({ page }) => {
    await signInAsGuest(page);
    await cloud(page).getByRole("button", { name: "ออกจากระบบ" }).click();
    await expect(cloud(page).getByRole("button", { name: "เข้าสู่ระบบแบบผู้ใช้ทั่วไป" })).toBeVisible();
    expect((await page.request.get("/api/layouts")).status()).toBe(401);
  });
});

test.describe("ฟอร์มติดต่อ (feat-032)", () => {
  test("ตรวจข้อมูลด้วย Zod → ส่งสำเร็จ → ส่งถี่เกินถูกบล็อก (429)", async ({ page }) => {
    // แยก IP ของเทสต์นี้ (Rate limit เก็บตาม IP ใน server เดียวกัน)
    const ip = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
    await page.route("**/api/contact", (route) => route.continue({ headers: { ...route.request().headers(), "x-forwarded-for": ip } }));
    await page.goto("/#contact");
    const form = page.getByTestId("contact-form");
    await form.getByRole("button", { name: "ส่งข้อความ" }).click();
    await expect(form.getByText("กรอกชื่อของคุณ")).toBeVisible();
    await expect(form.getByLabel("อีเมล")).toHaveAttribute("aria-invalid", "true");

    const fill = async () => {
      await form.getByLabel("ชื่อ").fill("สมหญิง");
      await form.getByLabel("อีเมล").fill("somying@example.com");
      await form.getByLabel("ข้อความ").fill("อยากให้ช่วยดูผังร้านขนมหวาน 30 ตร.ม.");
    };
    await fill();
    await form.getByRole("button", { name: "ส่งข้อความ" }).click();
    await expect(page.getByTestId("contact-result")).toHaveText("ส่งข้อความแล้ว ขอบคุณที่ติดต่อเรา เราจะตอบกลับทางอีเมล");
    await expect(form.getByLabel("ชื่อ")).toHaveValue("");

    for (let i = 0; i < 4; i++) {
      const res = await page.request.post("/api/contact", {
        headers: { "x-forwarded-for": ip },
        data: { name: "ทดสอบ", email: "t@example.com", message: "ข้อความทดสอบการส่งซ้ำ" },
      });
      expect(res.status()).toBe(202);
    }
    await fill();
    await form.getByRole("button", { name: "ส่งข้อความ" }).click();
    await expect(page.getByTestId("contact-result")).toContainText("ส่งข้อความถี่เกินไป กรุณารออีก 10 นาที");
    const blocked = await page.request.post("/api/contact", { headers: { "x-forwarded-for": ip }, data: { name: "a", email: "a@b.co", message: "1234567890" } });
    expect(blocked.status()).toBe(429);
    expect(Number(blocked.headers()["retry-after"])).toBeGreaterThan(500);
  });
});
