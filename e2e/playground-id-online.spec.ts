import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { BREAKPOINTS, credentialsSignIn, uniqueEmail } from "./helpers";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

test.describe("/playground/[id] และการบันทึกออนไลน์จาก Guest (feat-064)", () => {
  test("Guest จัดผัง → บันทึกออนไลน์ → ล็อกอิน OTP → ไปที่ /playground/[id] ข้อมูลครบ → refresh ยังอยู่", async ({
    page,
  }) => {
    // 1. Guest เข้า /playground
    await page.goto("/playground");
    await expect(page.locator("#rail")).toBeVisible();

    // 2. ใช้ผังตัวอย่าง เพื่อให้มีวัตถุและสถานะ Ready
    await page.locator("#projBtn").click();
    await page.locator('[data-act="new"]').click();
    const onboardDialog = page.getByRole("dialog", { name: "ร้านของคุณขนาดเท่าไร" });
    await expect(onboardDialog).toBeVisible();
    await onboardDialog.getByRole("button", { name: "ใช้ผังตัวอย่างแทน" }).click();
    await expect(onboardDialog).toBeHidden();

    // ตรวจสอบว่ามีวัตถุโต๊ะอยู่บนผัง
    const tables = page.locator('[data-type="table"]');
    await expect(tables.first()).toBeVisible();
    const tableCountBefore = await tables.count();
    expect(tableCountBefore).toBeGreaterThan(0);

    // 3. กด 'บันทึกออนไลน์' (Quick button บน header)
    const saveOnlineBtn = page.locator("#saveOnlineBtn");
    await expect(saveOnlineBtn).toBeVisible();
    await saveOnlineBtn.click();

    // 4. หน้าต่าง 'บันทึกผังออนไลน์' ปรากฏ ถามชื่อผัง
    const saveDialog = page.getByRole("dialog", { name: "บันทึกผังออนไลน์" });
    await expect(saveDialog).toBeVisible();

    // ตรวจสอบความถูกต้องของ Accessibility (WCAG 2.1 AA) บน SaveOnlineDialog
    const axeDialog = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(axeDialog.violations).toEqual([]);

    const nameInput = saveDialog.getByLabel("ชื่อผังร้าน");
    await expect(nameInput).toBeVisible();
    await nameInput.fill("คาเฟ่ริมน้ำนายสุข");

    // กดปุ่ม 'เข้าสู่ระบบเพื่อบันทึก'
    await saveDialog.getByRole("button", { name: "เข้าสู่ระบบเพื่อบันทึก" }).click();

    // 5. นำทางไปหน้า /login?next=...
    await page.waitForURL((url) => url.pathname === "/login", { timeout: 10000 });
    expect(page.url()).toContain("next");

    // กรอกอีเมล OTP
    const email = uniqueEmail("guest-migrated");
    await page.getByLabel("อีเมล").fill(email);
    await page.getByRole("button", { name: "ส่งรหัสเข้าสู่ระบบ" }).click();

    await expect(page.getByRole("heading", { name: "กรอกรหัส 6 หลัก" })).toBeVisible();
    await page.getByLabel("รหัสเข้าสู่ระบบ").fill("123456");
    await page.getByRole("button", { name: "ยืนยันรหัส" }).click();

    // 6. รอ sync และ redirect ไปยัง /playground/[id]
    await page.waitForURL((url) => url.pathname.startsWith("/playground/") && url.pathname !== "/playground", {
      timeout: 15000,
    });
    expect(page.url()).toMatch(/\/playground\/[a-zA-Z0-9_-]+/);

    // ตรวจสอบว่าชื่อผังที่ตั้งไว้แสดงถูกต้อง
    await expect(page.locator("#inlineLayoutNameBtn")).toContainText("คาเฟ่ริมน้ำนายสุข");

    // ตรวจสอบว่าวัตถุบนผังยังอยู่ครบถ้วน
    await expect(page.locator('[data-type="table"]')).toHaveCount(tableCountBefore);

    // 7. Refresh หน้าเว็บ แล้วยังอยู่ที่ผังเดิมและข้อมูลครบถ้วน
    await page.reload();
    await expect(page.locator("#rail")).toBeVisible();
    await expect(page.locator("#inlineLayoutNameBtn")).toContainText("คาเฟ่ริมน้ำนายสุข");
    await expect(page.locator('[data-type="table"]')).toHaveCount(tableCountBefore);

    // 8. ทดสอบ Inline Edit: แก้ไขชื่อผัง
    await page.locator("#inlineLayoutNameBtn").click();
    const editInput = page.locator("#inlineLayoutNameInput");
    await expect(editInput).toBeVisible();
    await editInput.fill("คาเฟ่ริมน้ำนายสุข (ปรับปรุงใหม่)");
    await editInput.press("Enter");
    await expect(page.locator("#inlineLayoutNameBtn")).toContainText("คาเฟ่ริมน้ำนายสุข (ปรับปรุงใหม่)");

    // 9. ไปที่หน้า 'ผังของฉัน' (/projects) ผ่านเมนูโปรเจกต์
    await page.getByRole("button", { name: "เมนูโปรเจกต์" }).click();
    await page.getByRole("menuitem", { name: /ผังของฉัน/ }).click();
    await page.waitForURL("**/projects", { timeout: 10000 });

    // ตรวจสอบว่าการ์ดใน /projects มีชื่อที่แก้ไขตรงกัน
    await expect(page.getByRole("heading", { name: "คาเฟ่ริมน้ำนายสุข (ปรับปรุงใหม่)" })).toBeVisible();
  });

  test("ยังไม่ล็อกอินเปิด /playground/[id] → ไปหน้าเข้าสู่ระบบ แล้ว next กลับมาที่ผังนี้", async ({ page }) => {
    await page.goto("/playground/lay_abc123");
    await page.waitForURL((url) => url.pathname === "/login");
    expect(new URL(page.url()).searchParams.get("next")).toBe("/playground/lay_abc123");
  });

  test("เปิด /playground/[id] ที่ไม่มีอยู่จริงหรือของคนอื่น → แสดงหน้า 404 ภาษาไทย + Axe Audit", async ({ page }) => {
    await credentialsSignIn(page.request, "guest");
    await page.goto("/playground/lay_does_not_exist_999");

    // แสดงข้อความ 404 ภาษาไทย
    await expect(page.getByRole("heading", { name: "ไม่พบผังร้านนี้" })).toBeVisible();
    await expect(page.getByText("ผังร้านนี้อาจถูกลบไปแล้ว หรือคุณไม่มีสิทธิ์เข้าถึงผังนี้")).toBeVisible();

    // มีปุ่มกลับหน้ารวมผังร้าน
    const backBtn = page.getByRole("link", { name: "ไปยังหน้ารวมผังร้าน" });
    await expect(backBtn).toBeVisible();

    // Axe audit บนหน้า 404
    const axe404 = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(axe404.violations).toEqual([]);
  });

  test("Inline edit ชื่อผัง: ใช้คีย์บอร์ดได้ (Esc ยกเลิก, ค่าว่างคืนชื่อเดิม) และมี aria-label ไทย", async ({
    page,
  }) => {
    await page.goto("/playground");
    await expect(page.locator("#rail")).toBeVisible();

    const nameBtn = page.locator("#inlineLayoutNameBtn");
    await expect(nameBtn).toBeVisible();
    // มี aria-label ภาษาไทย
    const ariaLabel = await nameBtn.getAttribute("aria-label");
    expect(ariaLabel).toContain("ชื่อผัง");

    // กด Enter หรือคลิกเพื่อแก้ไข
    await nameBtn.press("Enter");
    const editInput = page.locator("#inlineLayoutNameInput");
    await expect(editInput).toBeVisible();
    await expect(editInput).toBeFocused();

    // พิมพ์ชื่อใหม่แล้วกด Esc → ต้องไม่เปลี่ยน
    await editInput.fill("ชื่อที่อยากยกเลิก");
    await editInput.press("Escape");
    await expect(page.locator("#inlineLayoutNameInput")).toBeHidden();
    await expect(nameBtn).toContainText("ร้านกาแฟของฉัน");

    // พิมพ์ค่าว่างแล้ว blur → ต้องคืนชื่อเดิม
    await nameBtn.click();
    await page.locator("#inlineLayoutNameInput").fill("    ");
    await page.locator("#inlineLayoutNameInput").press("Tab");
    await expect(nameBtn).toContainText("ร้านกาแฟของฉัน");
  });

  test("ผัง Blocked ยังบันทึกร่างในเครื่องได้ตลอดเวลา แต่เริ่มจำลองไม่ได้", async ({ page }) => {
    await page.goto("/playground");
    await expect(page.locator("#rail")).toBeVisible();

    // เข้าแท็บจำลอง
    await page.locator('[data-tab="check"]').click();
    const simPanel = page.locator("#panel");
    await expect(simPanel).toBeVisible();

    // ตรวจสอบว่าปุ่มเริ่มจำลองมี aria-disabled="true" เมื่อผังยังติด Blocked
    const startSimBtn = page.getByTestId("start-simulation");
    await expect(startSimBtn).toBeVisible();
    await expect(startSimBtn).toHaveAttribute("aria-disabled", "true");

    // ตรวจสอบว่าร่างในเครื่องยังบันทึกอยู่ (DraftStatusText)
    const draftStatus = page.getByTestId("draft-status");
    await expect(draftStatus).toBeVisible();
  });

  test.describe("Responsive 6 Breakpoints บนหน้า 404 /playground/[id]", () => {
    for (const width of BREAKPOINTS) {
      test(`${width}px: ไม่มี horizontal scrollbar`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        await credentialsSignIn(page.request, "guest");
        await page.goto("/playground/lay_non_existent_check");

        await expect(page.getByRole("heading", { name: "ไม่พบผังร้านนี้" })).toBeVisible();

        const hasHorizontalScroll = await page.evaluate(() => {
          return document.documentElement.scrollWidth > document.documentElement.clientWidth;
        });
        expect(hasHorizontalScroll).toBe(false);
      });
    }
  });
});
