import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { BREAKPOINTS } from "./helpers";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

test.describe("หน้าเข้าสู่ระบบ /login (feat-062)", () => {
  test("โฟลว์เข้าสู่ระบบด้วย Email OTP: อีเมล → รหัส (123456) → ถึง /projects", async ({ page }) => {
    await page.goto("/login");

    // ตรวจสอบ Step 1: อีเมล
    await expect(page.getByRole("heading", { name: "เข้าสู่ระบบ" })).toBeVisible();
    await expect(page.getByLabel("อีเมล")).toBeVisible();

    // กรอกอีเมล
    await page.getByLabel("อีเมล").fill("owner@example.com");
    await page.getByRole("button", { name: "ส่งรหัสเข้าสู่ระบบ" }).click();

    // เข้าสู่ Step 2: กรอกรหัส
    await expect(page.getByRole("heading", { name: "กรอกรหัส 6 หลัก" })).toBeVisible();
    await expect(page.getByText("owner@example.com")).toBeVisible();

    // ทดสอบกรอกรหัสผิด
    const codeInput = page.getByLabel("รหัสเข้าสู่ระบบ");
    await codeInput.fill("000000");
    await page.getByRole("button", { name: "ยืนยันรหัส" }).click();
    await expect(page.getByText("รหัสไม่ถูกต้อง")).toBeVisible();

    // กรอกรหัสที่ถูกต้อง (mock OTP = 123456)
    await codeInput.fill("123456");
    await page.getByRole("button", { name: "ยืนยันรหัส" }).click();

    // สำเร็จ → พาไปที่ /projects
    await page.waitForURL("**/projects", { timeout: 10000 });
    expect(page.url()).toContain("/projects");
  });

  test("พารามิเตอร์ ?next= พากลับหน้าที่ระบุถูกต้อง และกัน Open Redirect", async ({ page }) => {
    // 1. Safe path
    await page.goto("/login?next=/playground");
    await page.getByLabel("อีเมล").fill("nexttest@example.com");
    await page.getByRole("button", { name: "ส่งรหัสเข้าสู่ระบบ" }).click();
    await page.getByLabel("รหัสเข้าสู่ระบบ").fill("123456");
    await page.getByRole("button", { name: "ยืนยันรหัส" }).click();
    await page.waitForURL("**/playground", { timeout: 10000 });
    expect(page.url()).toContain("/playground");

    // 2. Malicious Open Redirect (?next=https://evil.com) → ต้องกลับไป /projects
    const context = await page.context().browser()!.newContext();
    const maliciousPage = await context.newPage();
    await maliciousPage.goto("/login?next=https://evil.com");
    await maliciousPage.getByLabel("อีเมล").fill("attacker@example.com");
    await maliciousPage.getByRole("button", { name: "ส่งรหัสเข้าสู่ระบบ" }).click();
    await maliciousPage.getByLabel("รหัสเข้าสู่ระบบ").fill("123456");
    await maliciousPage.getByRole("button", { name: "ยืนยันรหัส" }).click();
    await maliciousPage.waitForURL("**/projects", { timeout: 10000 }).catch(() => {});
    expect(maliciousPage.url()).not.toContain("evil.com");
    expect(maliciousPage.url()).toContain("/projects");
    await context.close();
  });

  test("การเข้าถึงด้วยคีย์บอร์ด (Keyboard Navigation)", async ({ page }) => {
    await page.goto("/login");

    // โฟกัสช่องอีเมลและกด Enter เพื่อส่ง
    const emailField = page.getByLabel("อีเมล");
    await emailField.focus();
    await emailField.fill("keyboard@example.com");
    await emailField.press("Enter");

    await expect(page.getByRole("heading", { name: "กรอกรหัส 6 หลัก" })).toBeVisible();

    // ช่อง OTP ได้รับโฟกัส กรอกรหัสและกด Enter
    const codeField = page.getByLabel("รหัสเข้าสู่ระบบ");
    await codeField.focus();
    await codeField.fill("123456");
    await codeField.press("Enter");

    await page.waitForURL("**/projects", { timeout: 10000 });
    expect(page.url()).toContain("/projects");
  });

  test("Axe Accessibility Audit (WCAG 2.1 AA) บนหน้า /login", async ({ page }) => {
    await page.goto("/login");
    await page.addStyleTag({
      content: "*,*::before,*::after{animation:none!important;transition:none!important}",
    });

    // ตรวจ Step 1
    const res1 = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(res1.violations).toEqual([]);

    // ไป Step 2
    await page.getByLabel("อีเมล").fill("a11y@example.com");
    await page.getByRole("button", { name: "ส่งรหัสเข้าสู่ระบบ" }).click();
    await expect(page.getByRole("heading", { name: "กรอกรหัส 6 หลัก" })).toBeVisible();

    // ตรวจ Step 2
    const res2 = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(res2.violations).toEqual([]);
  });
});

test.describe("Responsive 6 Breakpoints บนหน้า /login", () => {
  for (const width of BREAKPOINTS) {
    test(`${width}px: ไม่มี horizontal scrollbar`, async ({ page }) => {
      await page.setViewportSize({ width, height: width < 768 ? 812 : 900 });
      await page.goto("/login");

      await expect(page.getByRole("heading", { name: "เข้าสู่ระบบ" })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});
