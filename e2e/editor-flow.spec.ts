import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { addItem, buildReadyCafe, openAllSections, openTab, placeSelected } from "./helpers";

/**
 * feat-024: เส้นทางการใช้งานจริง — จัดร้าน → ตรวจ → จำลอง, Cascade Delete, P2 Gate,
 * Inspector (feat-027), Auto-save (feat-028), JSON (feat-029), ส่งออกภาพ (feat-025) และพิมพ์ (feat-026)
 */
const stage = (page: Page) => page.getByTestId("artboard-stage");
const pieces = (page: Page, type: string) => stage(page).locator(`[data-type="${type}"]`);
const kitchenDoor = (page: Page) => stage(page).getByTestId("kitchen-door-marker");
const statusBar = (page: Page) => page.getByTestId("validation-status-bar");
const toast = (page: Page) => page.getByTestId("toast");
const undoButton = (page: Page) => page.getByRole("button", { name: /^ย้อนกลับ/ });
const redoButton = (page: Page) => page.getByRole("button", { name: /^ทำซ้ำ \(/ });
/** ปุ่มเริ่มจำลองอยู่ในแท็บ "จำลอง" — Blocked ใช้ aria-disabled (กดแล้วพาไปข้อที่ต้องแก้) ไม่ใช่ disabled เงียบ ๆ */
async function startButton(page: Page) {
  await openTab(page, "check");
  return page.getByTestId("start-simulation");
}

test.beforeEach(async ({ page }) => {
  await page.goto("/playground");
  await expect(stage(page)).toBeVisible();
  await openAllSections(page);
});

test.describe("จัดร้าน → ตรวจผัง → จำลอง", () => {
  test("ผังเปล่า Blocked → จัดครบ Ready → เริ่ม/หยุดจำลอง → วางทับกัน Blocked อีกครั้ง", async ({ page }) => {
    await expect(statusBar(page)).toHaveAttribute("data-status", "blocked");
    const start = await startButton(page);
    await expect(start).toHaveAttribute("aria-disabled", "true");
    // กดตอน Blocked → ไม่เริ่ม และบอกว่าต้องแก้อีกกี่ข้อ (PRD §9 ข้อ 9) — Playwright ไม่คลิกปุ่ม aria-disabled จึงกดด้วย Enter
    await start.press("Enter");
    await expect(toast(page)).toContainText("ยังเริ่มจำลองไม่ได้");
    await expect(page.getByTestId("simulation-status")).not.toContainText("กำลังจำลอง");

    await buildReadyCafe(page);
    await expect(statusBar(page)).toHaveAttribute("data-status", "ready");
    await expect(await startButton(page)).toHaveAttribute("aria-disabled", "false");
    await start.click();
    await expect(page.getByTestId("simulation-status")).toContainText("กำลังจำลอง");
    await page.getByTestId("stop-simulation").click();
    await expect(page.getByTestId("simulation-status")).not.toContainText("กำลังจำลอง");

    // Non-blocking placement: ลากโต๊ะไปทับเคาน์เตอร์ได้ แต่ผังกลายเป็น Blocked และปุ่มจำลองถูกปิดทันที
    const table = pieces(page, "table").first();
    const counter = pieces(page, "counter").first();
    const from = (await table.boundingBox())!;
    const to = (await counter.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect(statusBar(page)).toHaveAttribute("data-status", "blocked");
    await expect(start).toHaveAttribute("aria-disabled", "true");
    await expect(table).toHaveAttribute("data-issue", "blocked");

    // Undo หนึ่งครั้ง = ย้อนการลากทั้งครั้ง
    await undoButton(page).click();
    await expect(statusBar(page)).toHaveAttribute("data-status", "ready");
  });
});

test.describe("Table Set Lifecycle", () => {
  test("เพิ่มชุดโต๊ะสร้างเก้าอี้ตามจำนวนที่เลือก และลบโต๊ะ = Cascade Delete เก้าอี้ลูกทั้งหมด", async ({ page }) => {
    await addItem(page, "โต๊ะ");
    await addItem(page, "โต๊ะ");
    await expect(pieces(page, "table")).toHaveCount(2);
    await expect(pieces(page, "chair")).toHaveCount(8);

    // ลบด้วยแผงแก้ไข (โต๊ะที่เพิ่งเพิ่มถูกเลือกอยู่) = ลบทั้งชุด
    await page.getByRole("region", { name: "แก้ไขโต๊ะ" }).getByRole("button", { name: "ลบโต๊ะ" }).click();
    await expect(pieces(page, "table")).toHaveCount(1);
    await expect(pieces(page, "chair")).toHaveCount(4);

    // Delete ที่เก้าอี้ = เอาเก้าอี้ตัวนั้นออกจากชุด (โต๊ะยังอยู่)
    await pieces(page, "chair").first().click();
    await page.keyboard.press("Delete");
    await expect(pieces(page, "table")).toHaveCount(1);
    await expect(pieces(page, "chair")).toHaveCount(3);

    // Delete ที่โต๊ะ → Cascade Delete เก้าอี้ลูกทั้งหมด (ไม่มีเก้าอี้กำพร้า)
    await pieces(page, "table").first().click();
    await page.keyboard.press("Delete");
    await expect(pieces(page, "table")).toHaveCount(0);
    await expect(pieces(page, "chair")).toHaveCount(0);
  });

  test("ย้าย/หมุนโต๊ะ เก้าอี้ไปทั้งชุด", async ({ page }) => {
    await addItem(page, "โต๊ะ");
    const editPanel = page.getByRole("region", { name: "แก้ไขโต๊ะ" });
    await editPanel.getByRole("button", { name: "ลดจำนวนเก้าอี้" }).click();
    await editPanel.getByRole("button", { name: "ลดจำนวนเก้าอี้" }).click();
    await expect(pieces(page, "chair")).toHaveCount(2);
    const chairBoxes = async () => Promise.all((await pieces(page, "chair").all()).map((c) => c.boundingBox()));
    const before = await chairBoxes();
    await pieces(page, "table").first().focus();
    await page.keyboard.press("Shift+ArrowRight");
    const after = await chairBoxes();
    for (let i = 0; i < before.length; i++) {
      expect(after[i]!.x).toBeGreaterThan(before[i]!.x + 10);
      expect(after[i]!.y).toBeCloseTo(before[i]!.y, 0);
    }
    await page.keyboard.press("r");
    const rotated = await chairBoxes();
    // ชุด 2 ที่นั่ง เหนือ-ใต้ → หมุน 90° เป็น ตะวันออก-ตะวันตก (y เท่ากัน)
    expect(Math.abs(rotated[0]!.y - rotated[1]!.y)).toBeLessThan(2);
  });
});

test.describe("Inspector & Room Settings (feat-027)", () => {
  test("ปรับขนาดร้านและทางเข้าผ่านฟอร์ม", async ({ page }) => {
    await openTab(page, "shop");
    const form = page.getByTestId("room-settings-form");
    await expect(form.getByRole("button", { name: "นำไปใช้" })).toHaveCount(0);
    await form.getByLabel("กว้าง (ม.)", { exact: true }).fill("10");
    await form.getByLabel("ลึก (ม.)", { exact: true }).fill("7.5");
    await form.getByLabel("ระยะจากมุม (ม.)").fill("2");
    // ระหว่างพิมพ์และย้ายช่องในฟอร์ม ผังยังไม่เปลี่ยน
    await expect(stage(page)).toHaveAttribute("aria-label", "ผังร้านขนาด 8 × 6 เมตร");
    // เปลี่ยนผนัง = นำทุกช่องที่แก้ไปใช้พร้อมกัน
    await form.getByRole("group", { name: "เลือกผนัง" }).getByRole("button", { name: /ด้านซ้าย/ }).click();
    await expect(stage(page)).toHaveAttribute("aria-label", "ผังร้านขนาด 10 × 7.5 เมตร");
    await expect(page.getByTestId("entrance-marker")).toHaveAttribute("aria-label", /ด้านซ้าย.*ตำแหน่ง 2\.00 ม\./);

    await form.getByLabel("กว้าง (ม.)", { exact: true }).fill("31");
    await form.getByLabel("กว้าง (ม.)", { exact: true }).press("Enter");
    await expect(form.getByRole("alert")).toHaveText("ความกว้างร้านไม่เกิน 30 ม.");
    await expect(stage(page)).toHaveAttribute("aria-label", "ผังร้านขนาด 10 × 7.5 เมตร");
  });

  test("ปรับตำแหน่งเคาน์เตอร์ละเอียดด้วยป๊อปโอเวอร์ X/Y ของ selection toolbar (snap 0.25 ม.)", async ({ page }) => {
    await addItem(page, "เคาน์เตอร์");
    await placeSelected(page, 0.5, 0.5);
    await expect(pieces(page, "counter").first()).toHaveAttribute("aria-label", /เคาน์เตอร์ ตำแหน่ง x 0\.50 ม\. y 0\.50 ม\./);
    // ค่าที่ไม่ลงกริด → snap 0.25 ม.
    await placeSelected(page, 1.1, 0.9);
    await expect(pieces(page, "counter").first()).toHaveAttribute("aria-label", /เคาน์เตอร์ ตำแหน่ง x 1\.00 ม\. y 1\.00 ม\./);
    // Undo หนึ่งครั้ง = ย้อนการปรับหนึ่งครั้ง
    await undoButton(page).click();
    await expect(pieces(page, "counter").first()).toHaveAttribute("aria-label", /เคาน์เตอร์ ตำแหน่ง x 0\.50 ม\. y 0\.50 ม\./);
  });
});

test.describe("Auto-save Draft (feat-028)", () => {
  test("รีเฟรชแล้วผังเดิมและประวัติ Undo/Redo กลับมาครบ", async ({ page }) => {
    await buildReadyCafe(page);
    await expect(statusBar(page)).toHaveAttribute("data-status", "ready");
    await expect(page.getByTestId("draft-status")).toHaveAttribute("data-status", "saved");

    await page.reload();
    await expect(stage(page)).toBeVisible();
    await expect(kitchenDoor(page)).toHaveCount(1);
    await expect(pieces(page, "counter")).toHaveCount(1);
    await expect(pieces(page, "chair")).toHaveCount(4);
    await expect(statusBar(page)).toHaveAttribute("data-status", "ready");

    // ประวัติกลับมาด้วย: ย้อนจนผังว่างได้ และทำซ้ำกลับได้
    const undo = undoButton(page);
    await expect(undo).toBeEnabled();
    while (await undo.isEnabled()) await undo.click();
    await expect(kitchenDoor(page)).toHaveCount(0);
    await redoButton(page).click();
    await expect(kitchenDoor(page)).toHaveCount(1);

    // ผังใหม่ (เมนูโปรเจกต์ → เลือกขนาด) → ล้างร่าง และรีเฟรชแล้วยังว่าง
    await page.getByRole("button", { name: "เมนูโปรเจกต์" }).click();
    await page.locator('[data-act="new"]').click();
    const onboarding = page.getByTestId("onboarding-dialog");
    await onboarding.getByRole("button", { name: "เริ่มจัดร้าน" }).click();
    await expect(onboarding).toBeHidden();
    await expect(kitchenDoor(page)).toHaveCount(0);
    await page.reload();
    await expect(stage(page)).toBeVisible();
    await expect(kitchenDoor(page)).toHaveCount(0);
  });

  test("ร่างเสียใน localStorage ไม่ทำให้ Editor พัง", async ({ page }) => {
    await page.evaluate(() => localStorage.setItem("wang-raan:draft:v1", "{broken"));
    await page.reload();
    await expect(stage(page)).toBeVisible();
    await expect(statusBar(page)).toBeVisible();
  });
});

test.describe("ไฟล์ JSON (feat-029) และส่งออกภาพ (feat-025)", () => {
  test("ส่งออก JSON → นำเข้ากลับได้ผังเดิม; ไฟล์ตัวอย่าง PRD สร้าง hierarchy และตัดเก้าอี้กำพร้า", async ({ page }) => {
    await buildReadyCafe(page);
    await page.getByRole("button", { name: "เมนูโปรเจกต์" }).click();
    const [download] = await Promise.all([page.waitForEvent("download"), page.locator('[data-act="save"]').click()]);
    expect(download.suggestedFilename()).toMatch(/^wang-raan-8x6m-\d{8}-\d{4}\.json$/);
    const file = JSON.parse(await readFile((await download.path())!, "utf8"));
    expect(file).toMatchObject({ contractVersion: "p1-layout-v1", validation: { status: "ready" } });
    expect(file.layout.objects).toHaveLength(6);
    expect(file.layout.kitchenDoor).toMatchObject({ wall: "north" });

    const sample = {
      contractVersion: "p1-layout-v1",
      layout: {
        id: "layout-001",
        units: "m",
        width: 8,
        depth: 6,
        entrance: { id: "entrance-01", wall: "south", position: 1.2 },
        objects: [
          { id: "kitchen-01", type: "kitchen", x: 0.5, y: 0.5, width: 2, depth: 1.5, rotation: 0 },
          { id: "table-01", type: "table", x: 3, y: 3, width: 1.2, depth: 1.2, rotation: 0, chairIds: ["chair-01"] },
          { id: "chair-01", type: "chair", tableId: "table-01", x: 3.35, y: 2.6, width: 0.5, depth: 0.5, rotation: 180 },
          { id: "chair-x", type: "chair", tableId: "ghost", x: 6, y: 4, width: 0.5, depth: 0.5, rotation: 0 },
        ],
      },
      validation: { layoutRevision: "x", status: "ready", issues: [] },
    };
    await page.getByTestId("import-input").setInputFiles({ name: "prd-sample.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(sample)) });
    const message = toast(page);
    await expect(message).toContainText("นำเข้า “prd-sample.json” แล้ว");
    await expect(message).toContainText("ตัดเก้าอี้ที่ไม่มีโต๊ะ 1 ตัว (chair-x)");
    await expect(pieces(page, "table")).toHaveCount(1);
    await expect(pieces(page, "chair")).toHaveCount(1);
    await expect(stage(page).locator('[data-id="chair-x"]')).toHaveCount(0);
    // ไม่มีเคาน์เตอร์ → ผลตรวจใหม่เป็น Blocked (ไม่เชื่อ status ในไฟล์)
    await expect(statusBar(page)).toHaveAttribute("data-status", "blocked");

    // นำเข้าไฟล์ที่ส่งออกไว้ → ผังเดิม Ready
    await page.getByTestId("import-input").setInputFiles((await download.path())!);
    await expect(pieces(page, "chair")).toHaveCount(4);
    await expect(statusBar(page)).toHaveAttribute("data-status", "ready");

    // ไฟล์เสีย → แจ้ง error และผังไม่เปลี่ยน
    await page.getByTestId("import-input").setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from("{oops") });
    await expect(message).toContainText("ไฟล์ไม่ใช่ JSON ที่ถูกต้อง");
    await expect(pieces(page, "chair")).toHaveCount(4);

    // Undo ย้อนการนำเข้าได้
    await undoButton(page).click();
    await expect(pieces(page, "chair")).toHaveCount(1);
  });

  test("ส่งออก SVG และ PNG ตามสัดส่วนผังจริง", async ({ page }) => {
    await buildReadyCafe(page);
    const exportItem = async (act: "svg" | "png") => {
      // ส่งออกรวมอยู่ในเมนูโปรเจกต์ (หมวด "ส่งออกและแชร์")
      await page.getByRole("button", { name: "เมนูโปรเจกต์" }).click();
      return page.locator(`[data-act="${act}"]`);
    };
    const [svgDownload] = await Promise.all([page.waitForEvent("download"), (await exportItem("svg")).click()]);
    expect(svgDownload.suggestedFilename()).toMatch(/\.svg$/);
    const svg = await readFile((await svgDownload.path())!, "utf8");
    expect(svg).toContain('width="552" height="432"'); // 8 × 6 ม. × 60 px + ขอบ 36 px
    expect(svg.match(/data-type="chair"/g)).toHaveLength(4);

    const [pngDownload] = await Promise.all([page.waitForEvent("download"), (await exportItem("png")).click()]);
    expect(pngDownload.suggestedFilename()).toMatch(/\.png$/);
    const png = await readFile((await pngDownload.path())!);
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    // ความกว้าง/สูงใน IHDR = 2× ของ SVG
    expect(png.readUInt32BE(16)).toBe(1104);
    expect(png.readUInt32BE(20)).toBe(864);
  });
});

test.describe("พิมพ์ / PDF (feat-026)", () => {
  test("@media print ซ่อนเครื่องมือ แสดงรายงานผังพร้อมสรุปที่นั่ง", async ({ page, browserName }) => {
    await buildReadyCafe(page);
    const report = page.getByTestId("print-report");
    await expect(report).toBeHidden();

    await page.emulateMedia({ media: "print" });
    await expect(report).toBeVisible();
    await expect(page.getByRole("banner")).toBeHidden();
    await expect(page.locator("#rail")).toBeHidden();
    await expect(page.locator("#panel")).toBeHidden();
    await expect(stage(page)).toBeHidden();
    await expect(report.locator("svg")).toBeVisible();
    await expect(report).toContainText("ที่นั่งทั้งหมด4 ที่นั่ง");
    await expect(page.getByTestId("print-status")).toHaveText("พร้อมจำลอง");
    const noScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(noScroll).toBe(true);
    await page.screenshot({ path: `e2e/.results/screens/print-report-${browserName}.png`, fullPage: true });

    // page.pdf() มีเฉพาะ Headless Chromium — เบราว์เซอร์อื่นตรวจถึงการแสดงผลตอนพิมพ์ด้านบน
    if (browserName !== "chromium") return;
    const pdf = await page.pdf({ path: "e2e/.results/screens/print-report.pdf", format: "A4", landscape: true, printBackground: true });
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    // ผัง + สรุปจบใน A4 แนวนอนหน้าเดียว
    expect(pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g)).toHaveLength(1);
  });
});
