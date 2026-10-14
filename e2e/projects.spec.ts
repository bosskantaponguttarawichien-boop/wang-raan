import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { BREAKPOINTS } from "./helpers";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function loginAsUser(page: Page, email = "owner-proj@example.com") {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "เข้าสู่ระบบ" })).toBeVisible();
  await page.getByLabel("อีเมล").fill(email);
  await page.getByRole("button", { name: "ส่งรหัสเข้าสู่ระบบ" }).click();
  await expect(page.getByRole("heading", { name: "กรอกรหัส 6 หลัก" })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();
  await page.getByLabel("รหัสเข้าสู่ระบบ").fill("123456");
  await page.getByRole("button", { name: "ยืนยันรหัส" }).click();
  await page.waitForURL("**/projects", { timeout: 10000 });
}

test.describe("หน้ารวมโปรเจกต์ /projects (feat-063)", () => {
  test("ยังไม่ล็อกอินเข้า /projects → ถูก redirect ไป /login?next=/projects", async ({ page }) => {
    await page.goto("/projects");
    await page.waitForURL((url) => url.pathname === "/login" && url.search.includes("projects"), { timeout: 10000 });
    expect(page.url()).toContain("/login");
    expect(page.url()).toContain("next");
  });

  test("โฟลว์ครบวงจร: ว่างเปล่า → สร้างผังใหม่ → เห็นการ์ดพร้อมภาพย่อ → เปิดได้ → ลบผัง", async ({ page }) => {
    await loginAsUser(page, "flow-user@example.com");

    // 1. ตรวจสอบ Empty state
    await expect(page.getByRole("heading", { name: "ผังของฉัน" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "ยังไม่มีผังร้าน" })).toBeVisible();
    const createFirstBtn = page.getByRole("button", { name: "สร้างผังแรก" });
    await expect(createFirstBtn).toBeVisible();

    // 2. เปิด Dialog สร้างผังใหม่
    await createFirstBtn.click();
    await expect(page.getByRole("heading", { name: "สร้างผังใหม่" })).toBeVisible();

    // 3. ทดสอบการตรวจสอบข้อผิดพลาด (Validation) ใน Dialog
    const nameInput = page.getByLabel("ชื่อผัง");
    await nameInput.fill("   ");
    await page.getByRole("button", { name: "สร้างผัง", exact: true }).click();
    await expect(page.getByText("กรุณาระบุชื่อผังร้าน")).toBeVisible();
    expect(await nameInput.getAttribute("aria-invalid")).toBe("true");

    // ชื่อยาวเกิน 80
    await nameInput.fill("a".repeat(81));
    await page.getByRole("button", { name: "สร้างผัง", exact: true }).click();
    await expect(page.getByText("ชื่อผังต้องไม่เกิน 80 ตัวอักษร")).toBeVisible();

    // ขนาดร้านนอกช่วง 2-30 ม.
    await nameInput.fill("ร้านกาแฟสยามสุข");
    const widthInput = page.getByLabel("ความกว้าง (เมตร)");
    await widthInput.fill("1.5");
    await page.getByRole("button", { name: "สร้างผัง", exact: true }).click();
    await expect(page.getByText("ความกว้างต้องอยู่ระหว่าง 2 ถึง 30 เมตร")).toBeVisible();

    // 4. กรอกข้อมูลถูกต้อง: กว้าง 10 ลึก 7 ประตูขวา
    await widthInput.fill("10");
    const depthInput = page.getByLabel("ความลึก (เมตร)");
    await depthInput.fill("7");
    await page.getByRole("radio", { name: "ขวา" }).click();

    // กดสร้างผัง
    await page.getByRole("button", { name: "สร้างผัง", exact: true }).click();

    // ต้อง navigate ไปที่ /playground/[id]
    await page.waitForURL("**/playground/**", { timeout: 10000 });
    const playgroundUrl = page.url();
    expect(playgroundUrl).toContain("/playground/layout-");

    // ต้องไม่ขึ้น Onboarding Modal ซ้ำใน Playground
    await expect(page.getByTestId("onboarding-dialog")).toHaveCount(0);

    // 5. กลับมาที่หน้า /projects เพื่อตรวจการ์ด
    await page.goto("/projects");
    await expect(page.getByText("1 ผัง")).toBeVisible();

    // ต้องเห็นการ์ด "ร้านกาแฟสยามสุข" พร้อมขนาด 10 × 7 ม. และภาพย่อ SVG
    const card = page.getByRole("listitem").filter({ hasText: "ร้านกาแฟสยามสุข" });
    await expect(card).toBeVisible();
    await expect(card.getByText(/10 × 7 ม\./)).toBeVisible();
    await expect(card.locator("svg").first()).toBeVisible();

    // 6. ทดสอบการลบผังผ่านเมนู ⋯
    const moreBtn = card.getByLabel(/เมนูจัดการผัง ร้านกาแฟสยามสุข/);
    await moreBtn.click();

    const deleteMenuItem = page.getByRole("menuitem", { name: "ลบผัง" });
    await expect(deleteMenuItem).toBeVisible();
    await deleteMenuItem.click();

    // Dialog ยืนยันลบต้องปรากฏขึ้น
    const alertDialog = page.getByRole("alertdialog");
    await expect(alertDialog).toBeVisible();
    await expect(alertDialog.getByText(/ลบผัง “ร้านกาแฟสยามสุข”\?/)).toBeVisible();

    // ปุ่มลบผัง
    const confirmDeleteBtn = alertDialog.getByRole("button", { name: "ลบผัง" });
    await confirmDeleteBtn.click();

    // ตรวจสอบ Toast และการ์ดหายไป
    await expect(page.getByText(/ลบผัง “ร้านกาแฟสยามสุข” แล้ว/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "ร้านกาแฟสยามสุข" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "ยังไม่มีผังร้าน" })).toBeVisible();
  });

  test("เมนู ⋯ รองรับการใช้งานด้วยคีย์บอร์ด (Esc คืนโฟกัสที่ปุ่ม)", async ({ page }) => {
    await loginAsUser(page, "keyboard-menu@example.com");

    // สร้างผัง 1 ใบเพื่อทดสอบเมนู
    await page.getByRole("button", { name: "สร้างผังแรก" }).click();
    await page.getByLabel("ชื่อผัง").fill("ผังคีย์บอร์ด");
    await page.getByRole("button", { name: "สร้างผัง", exact: true }).click();
    await page.waitForURL("**/playground/**", { timeout: 10000 });

    await page.goto("/projects");
    await expect(page.getByRole("heading", { name: "ผังคีย์บอร์ด" })).toBeVisible();

    const moreBtn = page.getByLabel(/เมนูจัดการผัง ผังคีย์บอร์ด/);
    await moreBtn.focus();
    await page.keyboard.press("Enter");

    // เมนูปรากฏขึ้น
    await expect(page.getByRole("menuitem", { name: "เปิดผัง" })).toBeVisible();

    // กด Esc เมนูปิด และโฟกัสกลับไปที่ปุ่ม ⋯
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menuitem", { name: "เปิดผัง" })).toHaveCount(0);
    await expect(moreBtn).toBeFocused();
  });

  test("Axe Accessibility Audit (WCAG 2.1 AA) บนหน้า /projects", async ({ page }) => {
    await loginAsUser(page, "a11y-user@example.com");
    await expect(page.getByRole("heading", { name: "ผังของฉัน" })).toBeVisible();

    // 1. Audit บนหน้า Empty state
    const resEmpty = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(resEmpty.violations).toEqual([]);

    // 2. Audit บน Dialog สร้างผังใหม่
    await page.getByRole("button", { name: "สร้างผังแรก" }).click();
    await expect(page.getByRole("heading", { name: "สร้างผังใหม่" })).toBeVisible();
    const resDialog = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(resDialog.violations).toEqual([]);

    // สร้างผัง 1 ผังเพื่อตรวจสอบหน้ารายการที่มีการ์ด
    await page.getByRole("button", { name: "สร้างผัง", exact: true }).click();
    await page.waitForURL("**/playground/**", { timeout: 10000 });

    // 3. Audit บนหน้ารายการผังที่มีการ์ด
    await page.goto("/projects");
    await expect(page.getByRole("list", { name: "รายการผัง" })).toBeVisible();
    const resList = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(resList.violations).toEqual([]);
  });

  test.describe("Responsive 6 Breakpoints บนหน้า /projects", () => {
    for (const width of BREAKPOINTS) {
      test(`${width}px: ไม่มี horizontal scrollbar`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        await loginAsUser(page, `resp-${width}@example.com`);

        await expect(page.getByRole("heading", { name: "ผังของฉัน" })).toBeVisible();

        const hasHorizontalScroll = await page.evaluate(() => {
          return document.documentElement.scrollWidth > document.documentElement.clientWidth;
        });
        expect(hasHorizontalScroll).toBe(false);
      });
    }
  });
});
