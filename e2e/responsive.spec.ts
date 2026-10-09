import { expect, test } from "@playwright/test";
import { BREAKPOINTS } from "./helpers";

/** feat-022: ทุกหน้า × 6 breakpoints ต้องไม่มี horizontal scroll และองค์ประกอบหลักอยู่ในจอ */
for (const width of BREAKPOINTS) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: width < 768 ? 812 : 900 } });

    test("Landing: ไม่มี horizontal scroll และไม่มีองค์ประกอบล้นจอ", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      // แสดงทุก section (ข้าม reveal animation) แล้ววัดทั้งหน้า
      await page.addStyleTag({ content: ".reveal{opacity:1!important;transform:none!important}" });
      const result = await page.evaluate(() => {
        const overflow = document.documentElement.scrollWidth - window.innerWidth;
        const offenders = [...document.querySelectorAll<HTMLElement>(".landing *")]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            if (r.width === 0 || getComputedStyle(el).position === "fixed") return false;
            // ป้ายตกแต่ง preview-detail ซ่อนที่ ≤ 1200px; วงกลมตกแต่งถูก overflow:hidden ตัด
            return r.right > window.innerWidth + 1 && !el.closest(".soft-section, .preview-detail");
          })
          .map((el) => el.className || el.tagName);
        return { overflow, offenders: offenders.slice(0, 5) };
      });
      expect(result.overflow).toBeLessThanOrEqual(0);
      expect(result.offenders).toEqual([]);
      await expect(page.locator(".editor")).toBeVisible(); // ผังตัวอย่างอยู่ใต้ Hero เสมอ (SKILL กฎข้อ 1)
      await page.screenshot({ path: `e2e/.results/screens/landing-${width}.png`, fullPage: true });
    });

    test("Playground: ไม่มี horizontal scroll, Artboard อยู่ในจอ, แผงควบคุมครบ", async ({ page }) => {
      await page.goto("/playground");
      const stage = page.getByRole("application");
      await expect(stage).toBeVisible();
      const box = (await stage.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
      for (const name of ["เครื่องมือจัดร้าน", "การจัดการชิ้นงาน"]) {
        await expect(page.getByRole("complementary", { name })).toBeAttached();
      }
      await expect(page.getByTestId("validation-status-bar")).toBeVisible();
      await page.screenshot({ path: `e2e/.results/screens/playground-${width}.png`, fullPage: true });
    });
  });
}
