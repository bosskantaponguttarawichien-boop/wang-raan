import { expect, test, type Page } from "@playwright/test";
import { buildReadyCafe, openTab } from "./helpers";

/** feat-023: ใช้งานด้วยคีย์บอร์ดล้วน + Focus Ring ชัดเจน + prefers-reduced-motion */

async function focusedOutline(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const cs = getComputedStyle(el);
    // ชื่อที่อ่านได้: aria-label → <label for> (ช่องกรอกในฟอร์ม) → ข้อความในปุ่ม
    const labelled = (el as HTMLInputElement).labels?.[0]?.textContent?.trim();
    return { tag: el.tagName, name: el.getAttribute("aria-label") ?? (labelled || el.textContent?.trim()), outline: `${cs.outlineStyle} ${cs.outlineWidth}` };
  });
}

/** กด Tab ไปจนโฟกัสถึง element ที่มี data-testid นี้ (ภายใน 60 ครั้ง) */
async function tabTo(page: Page, testId: string) {
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press("Tab");
    if ((await page.evaluate(() => (document.activeElement as HTMLElement).dataset.testid)) === testId) return true;
  }
  return false;
}

test.describe("Landing", () => {
  test("Tab ผ่านเมนูไปถึงปุ่มเริ่มจัดร้าน และทุกจุดมี focus ring 3px", async ({ page, browserName }) => {
    await page.goto("/");
    // Safari ค่าเริ่มต้น: Tab โฟกัสเฉพาะช่องกรอกฟอร์ม — ลิงก์/ปุ่มต้องใช้ Option+Tab (ผู้ใช้คีย์บอร์ดบน Safari ใช้แบบนี้)
    const tab = browserName === "webkit" ? "Alt+Tab" : "Tab";
    const seen: string[] = [];
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press(tab);
      const f = await focusedOutline(page);
      expect(f.outline).toMatch(/solid 3px/);
      seen.push(String(f.name));
    }
    expect(seen).toEqual(expect.arrayContaining(["วางร้าน หน้าแรก", "จุดเด่น", "วิธีใช้งาน", "คำถามที่พบบ่อย", "ติดต่อเรา", "เริ่มจัดร้าน"]));
  });

  test("FAQ เปิด/ปิดด้วย Enter", async ({ page }) => {
    await page.goto("/#faq");
    const summary = page.locator("summary").first();
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("details").first()).toHaveAttribute("open", "");
  });

  test("prefers-reduced-motion: ไม่มี animation และไม่ซ่อนเนื้อหารอเลื่อน", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.locator(".landing")).not.toHaveClass(/motion-ready/);
    expect(await page.locator(".reveal").count()).toBe(0);
    const anim = await page.evaluate(() => getComputedStyle(document.querySelector("h1")!).animationName);
    expect(anim).toBe("none");
    await context.close();
  });
});

test.describe("Playground", () => {
  test("จัดผังจนพร้อม → เริ่ม/หยุดการจำลอง ด้วยคีย์บอร์ดล้วน", async ({ page }) => {
    await page.goto("/playground");
    await buildReadyCafe(page); // เพิ่มด้วยปุ่ม + กรอกพิกัดในป๊อปโอเวอร์ (Enter)
    await expect(page.getByTestId("validation-status-bar")).toHaveAttribute("data-status", "ready");
    await openTab(page, "check");
    expect(await tabTo(page, "start-simulation")).toBe(true);
    expect((await focusedOutline(page)).outline).toMatch(/solid 3px/);
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("simulation-status")).toContainText("กำลังจำลอง");
    await page.getByTestId("stop-simulation").focus();
    await page.keyboard.press("Space");
    await expect(page.getByTestId("simulation-status")).not.toContainText("กำลังจำลอง");
  });

  test("ผัง Blocked: ปุ่มเริ่มจำลอง aria-disabled แต่ Tab ถึงได้ — กดแล้วไม่เริ่ม และบอกว่าต้องแก้อีกกี่ข้อ (P2 Gate, PRD §9 ข้อ 9)", async ({ page }) => {
    await page.goto("/playground");
    await openTab(page, "check");
    const start = page.getByTestId("start-simulation");
    await expect(start).toHaveAttribute("aria-disabled", "true");
    // ไม่ disabled เงียบ ๆ: ผู้ใช้คีย์บอร์ดยังโฟกัสได้ และอ่านเหตุผลได้จาก aria-describedby
    expect(await tabTo(page, "start-simulation")).toBe(true);
    expect((await focusedOutline(page)).outline).toMatch(/solid 3px/);
    await expect(start).toHaveAttribute("aria-describedby", /.+/);
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("toast")).toContainText("ยังเริ่มจำลองไม่ได้");
    await expect(page.getByTestId("simulation-status")).not.toContainText("กำลังจำลอง");
  });

  test("ทุกตัวควบคุมที่ Tab ถึงมี focus ring และชื่อที่อ่านได้", async ({ page }) => {
    await page.goto("/playground");
    await page.getByRole("button", { name: /^เพิ่ม\s*ชุดโต๊ะ 2 ที่นั่ง/ }).click();
    await page.locator("body").click({ position: { x: 1, y: 1 } });
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press("Tab");
      const f = await focusedOutline(page);
      if (f.tag === "BODY") break;
      expect(f.outline, `focus ring ของ ${f.name}`).toMatch(/solid 3px/);
      expect(f.name, `ชื่อของ ${f.tag}`).toBeTruthy();
    }
  });
});
