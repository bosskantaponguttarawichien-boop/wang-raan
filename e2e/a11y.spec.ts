import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { buildReadyCafe } from "./helpers";

/** feat-023: WCAG 2.1 AA ด้วย axe-core (ต้องไม่มี violation) */
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function audit(page: Page) {
  // ให้ทุก section แสดงผลก่อนตรวจ contrast (reveal ตั้ง opacity 0 ไว้ก่อนเลื่อนถึง)
  // หยุด animation/transition เพื่อให้วัด contrast จากสีจริง (ไม่ใช่สีระหว่าง fade)
  await page.addStyleTag({
    content: "*,*::before,*::after{animation:none!important;transition:none!important}.reveal{opacity:1!important;transform:none!important}",
  });
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.slice(0, 3).map((n) => n.target.join(" ")) }));
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 375, height: 812 },
]) {
  test.describe(`axe ${viewport.width}px`, () => {
    test.use({ viewport });

    test("Landing", async ({ page }) => {
      await page.goto("/");
      expect(await audit(page)).toEqual([]);
    });

    test("Playground (ผังเปล่า / Blocked) + Drawer ที่มีรายการปัญหา", async ({ page }) => {
      await page.goto("/playground");
      await expect(page.getByRole("application")).toBeVisible();
      expect(await audit(page)).toEqual([]);
      await page.getByRole("button", { name: /ดูรายการ/ }).click();
      await expect(page.getByRole("dialog").getByText("ต้องแก้").first()).toBeVisible();
      expect(await audit(page)).toEqual([]);
    });

    test("Playground ระหว่างจำลอง + Drawer รายการปัญหา", async ({ page }) => {
      await page.goto("/playground");
      await buildReadyCafe(page);
      await expect(page.getByTestId("validation-status-bar")).toHaveAttribute("data-status", "ready");
      await page.getByTestId("start-simulation").click();
      await expect(page.getByTestId("simulation-status")).toContainText("กำลังจำลอง");
      expect(await audit(page)).toEqual([]);
      await page.getByRole("button", { name: /ดูรายการ/ }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      expect(await audit(page)).toEqual([]);
    });

    test("Playground: Inspector + ฟอร์มขนาดร้านที่มี error + ข้อความนำเข้าไฟล์", async ({ page }) => {
      await page.goto("/playground");
      await page.getByRole("button", { name: /^เพิ่ม\s*ครัว/ }).click();
      await expect(page.getByTestId("object-inspector")).toBeVisible();
      const form = page.getByTestId("room-settings-form");
      await form.getByLabel("กว้าง (ม.)", { exact: true }).fill("40");
      await form.getByRole("button", { name: "นำไปใช้" }).click();
      await expect(form.getByRole("alert")).toBeVisible();
      await page.getByTestId("import-input").setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from("{") });
      await expect(page.getByTestId("file-message")).toContainText("ไม่สำเร็จ");
      expect(await audit(page)).toEqual([]);
    });

    test("Landing: ฟอร์มติดต่อที่มี error", async ({ page }) => {
      await page.goto("/#contact");
      await page.getByTestId("contact-form").getByRole("button", { name: "ส่งข้อความ" }).click();
      await expect(page.getByText("กรอกชื่อของคุณ")).toBeVisible();
      expect(await audit(page)).toEqual([]);
    });

    test("Playground: แผงบัญชีหลังเข้าสู่ระบบ + หน้าแชร์", async ({ page, browser }) => {
      test.slow(); // หลายหน้า + axe 3 รอบ — บน wrangler dev (workerd ในเครื่อง) เกิน 30 วินาทีได้
      await page.goto("/playground");
      await page.getByRole("button", { name: "เข้าสู่ระบบแบบผู้ใช้ทั่วไป" }).click();
      await expect(page.getByTestId("signed-in-as")).toBeVisible();
      await buildReadyCafe(page);
      await page.getByRole("button", { name: "แชร์ลิงก์" }).click();
      await expect(page.getByTestId("share-link")).toBeVisible();
      expect(await audit(page)).toEqual([]);
      const url = (await page.getByTestId("share-link").getAttribute("href"))!;
      const context = await browser.newContext({ viewport });
      const viewer = await context.newPage();
      await viewer.goto(url);
      expect(await audit(viewer)).toEqual([]);
      await viewer.getByRole("button", { name: "ตัวอย่าง 3D" }).click();
      expect(await audit(viewer)).toEqual([]);
      await context.close();
    });

    test("Playground มุมมอง 3D", async ({ page }) => {
      await page.goto("/playground");
      await page.getByRole("button", { name: "ดูตัวอย่าง 3D" }).click();
      await expect(page.getByRole("img", { name: /ไอโซเมตริก/ })).toBeVisible();
      expect(await audit(page)).toEqual([]);
    });
  });
}
