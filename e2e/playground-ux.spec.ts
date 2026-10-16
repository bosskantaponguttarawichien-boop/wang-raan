import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * feat-060: QA — เทสต์และ Audit ของ Playground UX ใหม่
 *
 * Flow หลัก:
 * 1. ผังใหม่ → Onboarding Dialog
 * 2. วางโต๊ะ → แผงแก้ไขด้านซ้าย (จำนวนเก้าอี้, หมุน, Cascade Delete)
 * 3. แท็บ 'ร้าน' → ปรับขนาดร้านและทางเข้า
 * 4. แท็บ 'จำลอง' → ตรวจผัง (Humanizer message) → เริ่มจำลอง
 * 5. โหมดจำลอง → ล็อก Header/Rail/Controls
 * 6. จบรอบจำลอง → สรุปผลรอบล่าสุด + คำแนะนำ 1 ประโยค + Heatmap จาง
 * 7. กลับไปแก้ผัง → ผลจำลองรอบล่าสุดในการ์ดย่อ
 * 8. มุมมอง 3D → ViewSwitch, เลือกและขยับวัตถุด้วยคีย์บอร์ด
 * 9. Accessibility Audit (axe-core WCAG 2.1 AA)
 */

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function auditA11y(page: Page) {
  await page.addStyleTag({
    content: "*,*::before,*::after{animation:none!important;transition:none!important}",
  });
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    nodes: v.nodes.slice(0, 3).map((n) => n.target.join(" ")),
  }));
}

const stage = (page: Page) => page.getByTestId("artboard-stage");
const pieces = (page: Page, type: string) => stage(page).locator(`[data-type="${type}"]`);
const statusBar = (page: Page) => page.getByTestId("validation-status-bar");

async function createTableSet(page: Page, seats: 2 | 4) {
  await page.getByRole("button", { name: /^เพิ่ม\\s*โต๊ะ/ }).click();
  const panel = page.getByRole("region", { name: "ตั้งค่าโต๊ะ" });
  await expect(panel).toBeVisible();
  for (let count = 4; count > seats; count--) await panel.getByRole("button", { name: "ลดจำนวนเก้าอี้" }).click();
  await panel.getByRole("button", { name: `เพิ่มโต๊ะพร้อมเก้าอี้ ${seats} ตัว ลงผัง` }).click();
  await expect(page.getByRole("region", { name: "แก้ไขโต๊ะ" })).toBeVisible();
}

test.describe("Playground UX Revamp E2E Flow (feat-060)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/playground");
    await expect(page.locator("#rail")).toBeVisible();
  });

  test("1. Onboarding Dialog & เริ่มผังใหม่", async ({ page }) => {
    // เปิดเมนูโปรเจกต์
    await page.locator("#projBtn").click();
    await page.locator('[data-act="new"]').click();

    // Onboarding dialog ปรากฏ
    const dialog = page.getByRole("dialog", { name: "ร้านของคุณขนาดเท่าไร" });
    await expect(dialog).toBeVisible();

    // กรอกขนาดร้าน
    await dialog.getByLabel("กว้าง (ม.)").fill("10");
    await dialog.getByLabel("ลึก (ม.)").fill("7.5");

    // กดเริ่มจัดร้าน
    await dialog.getByRole("button", { name: "เริ่มจัดร้าน" }).click();
    await expect(dialog).toBeHidden();

    // ขนาดร้านใน Artboard อัปเดต
    await expect(stage(page)).toHaveAttribute("aria-label", "ผังร้านขนาด 10 × 7.5 เมตร");
  });

  test("2. แผง 'เพิ่ม' และแผงแก้ไขโต๊ะ", async ({ page }) => {
    await page.locator('[data-tab="add"]').click();

    // เพิ่มชุดโต๊ะ 4 ที่นั่ง
    await createTableSet(page, 4);
    await expect(pieces(page, "table")).toHaveCount(1);
    await expect(pieces(page, "chair")).toHaveCount(4);

    // คำสั่งของโต๊ะอยู่ในแผงซ้าย ไม่ลอยบนผัง
    const editPanel = page.getByRole("region", { name: "แก้ไขโต๊ะ" });
    await expect(editPanel).toBeVisible();
    await expect(page.getByTestId("selection-toolbar")).toBeHidden();

    // หมุน 90 องศา
    await editPanel.getByRole("button", { name: "หมุนโต๊ะ 90 องศา" }).click();
    await expect(pieces(page, "table").first()).toHaveAttribute("aria-label", /หมุน 90/);

    // ลดเป็น 2 ที่นั่ง
    await editPanel.getByRole("button", { name: "ลดจำนวนเก้าอี้" }).click();
    await editPanel.getByRole("button", { name: "ลดจำนวนเก้าอี้" }).click();
    await expect(pieces(page, "chair")).toHaveCount(2);

    // ลบชุดโต๊ะ (Cascade Delete)
    await editPanel.getByRole("button", { name: "ลบโต๊ะ" }).click();
    await expect(pieces(page, "table")).toHaveCount(0);
    await expect(pieces(page, "chair")).toHaveCount(0);
  });

  test("3. แผง 'ร้าน' ปรับขนาดและประตูทางเข้า", async ({ page }) => {
    await page.locator('[data-tab="shop"]').click();
    const form = page.getByTestId("room-settings-form");
    await expect(form).toBeVisible();

    await form.getByLabel("กว้าง (ม.)", { exact: true }).fill("12");
    await form.getByLabel("ลึก (ม.)", { exact: true }).fill("8");
    await form.getByLabel("ผนังทางเข้า").selectOption("north");

    await expect(stage(page)).toHaveAttribute("aria-label", "ผังร้านขนาด 12 × 8 เมตร");
    await expect(page.getByTestId("entrance-marker")).toHaveAttribute("aria-label", /ด้านบน/);
  });

  test("4. แผง 'จำลอง', โหมดจำลองล็อกผัง, สรุปผลจบรอบ และ Heatmap", async ({ page }) => {
    // ใช้ผังตัวอย่างคาเฟ่ที่ผ่านการตรวจทุกข้อ (Ready) ในแท็บเพิ่ม
    await page.locator('[data-tab="add"]').click();
    await page.getByRole("button", { name: /ใช้ผังตัวอย่าง/ }).click();
    await expect(statusBar(page)).toHaveAttribute("data-status", "ready");

    // สลับไปแท็บจำลอง
    await page.locator('[data-tab="check"]').click();
    const startBtn = page.getByTestId("start-simulation");
    await expect(startBtn).toHaveAttribute("aria-disabled", "false");

    // เริ่มจำลอง
    await startBtn.click();
    await expect(page.getByTestId("simulation-status")).toContainText("กำลังจำลอง");

    // ระหว่างจำลอง: Rail ถูกซ่อน, Header Undo ถูก disabled
    await expect(page.locator("#rail")).toBeHidden();
    await expect(page.locator("#undo")).toBeDisabled();

    // จบรอบจำลอง
    await page.getByTestId("stop-simulation").click();
    await expect(page.getByTestId("simulation-status")).not.toContainText("กำลังจำลอง");

    // การ์ดสรุปผลจบรอบล่าสุดปรากฏในแผงจำลอง
    const summary = page.getByTestId("latest-sim-summary");
    await expect(summary).toBeVisible();
    await expect(summary).toContainText("สรุปผลจำลองรอบล่าสุด");

    // สลับกลับไปแท็บเพิ่ม เห็นการ์ดย่อผลจำลอง
    await page.locator('[data-tab="add"]').click();
    await expect(page.getByText("ผลจำลองรอบล่าสุด")).toBeVisible();
  });

  test("5. มุมมอง 3D: สลับด้วย ViewSwitch, เลือกและขยับวัตถุ", async ({ page }) => {
    await page.locator('[data-tab="add"]').click();
    await createTableSet(page, 2);
    await expect(pieces(page, "table")).toHaveCount(1);

    // สลับไป 3D
    await page.getByRole("button", { name: "ดูตัวอย่าง 3D" }).click();
    // มุมมอง 3D ใช้ Three.js canvas โดยมี SVG fallback เฉพาะเมื่อ WebGL ใช้ไม่ได้
    await expect(page.getByTestId("three-view")).toBeVisible();
    await expect(page.getByTestId("three-canvas")).toBeVisible();

    // โฟกัสและขยับโต๊ะด้วยลูกศร
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("r"); // หมุนใน 3D

    // สลับกลับไป 2D โต๊ะยังอยู่และตำแหน่งเปลี่ยน
    await page.getByRole("button", { name: "จัดผัง 2D" }).click();
    await expect(stage(page)).toBeVisible();
    await expect(pieces(page, "table")).toHaveCount(1);
    await expect(pieces(page, "table").first()).toHaveAttribute("aria-label", /หมุน 90/);
  });

  test("6. Axe Accessibility Audit (WCAG 2.1 AA) บน Playground UX ใหม่", async ({ page }) => {
    // 6.1 ตรวจหน้า Playground ผังเปล่า
    expect(await auditA11y(page)).toEqual([]);

    // 6.2 ตรวจเมื่อมีโต๊ะและแผงแก้ไข
    await page.locator('[data-tab="add"]').click();
    await createTableSet(page, 2);
    expect(await auditA11y(page)).toEqual([]);

    // 6.3 ตรวจแท็บร้าน
    await page.locator('[data-tab="shop"]').click();
    expect(await auditA11y(page)).toEqual([]);

    // 6.4 ตรวจแท็บจำลอง
    await page.locator('[data-tab="check"]').click();
    expect(await auditA11y(page)).toEqual([]);
  });
});
