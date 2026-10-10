import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { buildReadyCafe } from "./helpers";

/**
 * feat-024: เส้นทางการใช้งานจริง — จัดร้าน → ตรวจ → จำลอง, Cascade Delete, P2 Gate,
 * Inspector (feat-027), Auto-save (feat-028), JSON (feat-029), ส่งออกภาพ (feat-025) และพิมพ์ (feat-026)
 */
const stage = (page: Page) => page.getByTestId("artboard-stage");
const pieces = (page: Page, type: string) => stage(page).locator(`[data-type="${type}"]`);
const statusBar = (page: Page) => page.getByTestId("validation-status-bar");

test.beforeEach(async ({ page }) => {
  await page.goto("/playground");
  await expect(stage(page)).toBeVisible();
});

test.describe("จัดร้าน → ตรวจผัง → จำลอง", () => {
  test("ผังเปล่า Blocked → จัดครบ Ready → เริ่ม/หยุดจำลอง → วางทับกัน Blocked อีกครั้ง", async ({ page }) => {
    const start = page.getByTestId("start-simulation");
    await expect(statusBar(page)).toHaveAttribute("data-status", "blocked");
    await expect(start).toBeDisabled();

    await buildReadyCafe(page);
    await expect(statusBar(page)).toHaveAttribute("data-status", "ready");
    await expect(start).toBeEnabled();
    await start.click();
    await expect(page.getByTestId("simulation-status")).toContainText("กำลังจำลอง");
    await page.getByRole("button", { name: "■ หยุดจำลอง" }).click();
    await expect(page.getByTestId("simulation-status")).not.toContainText("กำลังจำลอง");

    // Non-blocking placement: ลากโต๊ะไปทับครัวได้ แต่ผังกลายเป็น Blocked และปุ่มจำลองถูกปิดทันที
    const table = pieces(page, "table").first();
    const kitchen = pieces(page, "kitchen").first();
    const from = (await table.boundingBox())!;
    const to = (await kitchen.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect(statusBar(page)).toHaveAttribute("data-status", "blocked");
    await expect(start).toBeDisabled();
    await expect(table).toHaveAttribute("data-issue", "blocked");

    // Undo หนึ่งครั้ง = ย้อนการลากทั้งครั้ง
    await page.getByRole("button", { name: "↶ ย้อนกลับ" }).click();
    await expect(statusBar(page)).toHaveAttribute("data-status", "ready");
  });
});

test.describe("Table Set Lifecycle", () => {
  test("เพิ่มชุดโต๊ะสร้างเก้าอี้ตาม preset และลบโต๊ะ = Cascade Delete เก้าอี้ลูกทั้งหมด", async ({ page }) => {
    await page.getByRole("button", { name: /^เพิ่ม\s*ชุดโต๊ะ 4 ที่นั่ง/ }).click();
    await page.getByRole("button", { name: /^เพิ่ม\s*ชุดโต๊ะ 2 ที่นั่ง/ }).click();
    await expect(pieces(page, "table")).toHaveCount(2);
    await expect(pieces(page, "chair")).toHaveCount(6);

    // ลบด้วยปุ่มใน Inspector (ชุด 2 ที่นั่งที่เพิ่งเพิ่มถูกเลือกอยู่)
    await page.getByRole("button", { name: "× ลบทั้งชุดโต๊ะ" }).click();
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
    await page.getByRole("button", { name: /^เพิ่ม\s*ชุดโต๊ะ 2 ที่นั่ง/ }).click();
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
    const form = page.getByTestId("room-settings-form");
    await form.getByLabel("กว้าง (ม.)", { exact: true }).fill("10");
    await form.getByLabel("ลึก (ม.)", { exact: true }).fill("7.5");
    await form.getByLabel("ผนังทางเข้า").selectOption("west");
    await form.getByLabel("ระยะจากมุม (ม.)").fill("2");
    // ระหว่างพิมพ์ ผังยังไม่เปลี่ยน
    await expect(stage(page)).toHaveAttribute("aria-label", "ผังร้านขนาด 8 × 6 เมตร");
    await form.getByRole("button", { name: "นำไปใช้" }).click();
    await expect(stage(page)).toHaveAttribute("aria-label", "ผังร้านขนาด 10 × 7.5 เมตร");
    await expect(page.getByTestId("entrance-marker")).toHaveAttribute("aria-label", /ทิศตะวันตก.*ตำแหน่ง 2\.00 ม\./);

    await form.getByLabel("กว้าง (ม.)", { exact: true }).fill("31");
    await form.getByRole("button", { name: "นำไปใช้" }).click();
    await expect(form.getByRole("alert")).toHaveText("ความกว้างร้านไม่เกิน 30 ม.");
    await expect(stage(page)).toHaveAttribute("aria-label", "ผังร้านขนาด 10 × 7.5 เมตร");
  });

  test("แก้ตำแหน่งและขนาดครัวด้วย Inspector", async ({ page }) => {
    await page.getByRole("button", { name: /^เพิ่ม\s*ครัว/ }).click();
    const inspector = page.getByTestId("object-inspector");
    await inspector.getByLabel("ตำแหน่ง x (ม.)").fill("0.5");
    await inspector.getByLabel("ตำแหน่ง y (ม.)").fill("0.5");
    await inspector.getByLabel("กว้าง (ม.)", { exact: true }).fill("3");
    await inspector.getByRole("button", { name: "นำไปใช้" }).click();
    await expect(pieces(page, "kitchen").first()).toHaveAttribute("aria-label", /ครัว ตำแหน่ง x 0\.50 ม\. y 0\.50 ม\./);
    await expect(inspector).toContainText("พื้นที่บนผัง 3.00 × 1.50 ม.");
  });
});

test.describe("Auto-save Draft (feat-028)", () => {
  test("รีเฟรชแล้วผังเดิมและประวัติ Undo/Redo กลับมาครบ", async ({ page }) => {
    await buildReadyCafe(page);
    await expect(statusBar(page)).toHaveAttribute("data-status", "ready");
    await expect(page.getByTestId("draft-status")).toHaveAttribute("data-status", "saved");

    await page.reload();
    await expect(stage(page)).toBeVisible();
    await expect(page.getByTestId("draft-notice")).toContainText("กู้คืนผังที่บันทึกไว้");
    await expect(pieces(page, "kitchen")).toHaveCount(1);
    await expect(pieces(page, "counter")).toHaveCount(1);
    await expect(pieces(page, "chair")).toHaveCount(4);
    await expect(statusBar(page)).toHaveAttribute("data-status", "ready");

    // ประวัติกลับมาด้วย: ย้อนจนผังว่างได้ และทำซ้ำกลับได้
    const undo = page.getByRole("button", { name: "↶ ย้อนกลับ" });
    await expect(undo).toBeEnabled();
    while (await undo.isEnabled()) await undo.click();
    await expect(pieces(page, "table")).toHaveCount(0);
    await page.getByRole("button", { name: "↷ ทำซ้ำ" }).click();
    await expect(pieces(page, "kitchen")).toHaveCount(1);

    // เริ่มผังใหม่ (ยืนยัน) → ล้างร่าง และรีเฟรชแล้วยังว่าง
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "เริ่มผังใหม่" }).click();
    await expect(pieces(page, "kitchen")).toHaveCount(0);
    await page.reload();
    await expect(stage(page)).toBeVisible();
    await expect(pieces(page, "kitchen")).toHaveCount(0);
    await expect(page.getByTestId("draft-notice")).toHaveCount(0);
  });

  test("ร่างเสียใน localStorage ไม่ทำให้ Editor พัง", async ({ page }) => {
    await page.evaluate(() => localStorage.setItem("wang-raan:draft:v1", "{broken"));
    await page.reload();
    await expect(stage(page)).toBeVisible();
    await expect(page.getByTestId("draft-notice")).toHaveCount(0);
  });
});

test.describe("ไฟล์ JSON (feat-029) และส่งออกภาพ (feat-025)", () => {
  test("ส่งออก JSON → นำเข้ากลับได้ผังเดิม; ไฟล์ตัวอย่าง PRD สร้าง hierarchy และตัดเก้าอี้กำพร้า", async ({ page }) => {
    await buildReadyCafe(page);
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "ส่งออก JSON" }).click()]);
    expect(download.suggestedFilename()).toMatch(/^wang-raan-8x6m-\d{8}-\d{4}\.json$/);
    const file = JSON.parse(await readFile((await download.path())!, "utf8"));
    expect(file).toMatchObject({ contractVersion: "p1-layout-v1", validation: { status: "ready" } });
    expect(file.layout.objects).toHaveLength(7);

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
    const message = page.getByTestId("file-message");
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
    await page.getByRole("button", { name: "↶ ย้อนกลับ" }).click();
    await expect(pieces(page, "chair")).toHaveCount(1);
  });

  test("ส่งออก SVG และ PNG ตามสัดส่วนผังจริง", async ({ page }) => {
    await buildReadyCafe(page);
    const [svgDownload] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "ภาพ SVG" }).click()]);
    expect(svgDownload.suggestedFilename()).toMatch(/\.svg$/);
    const svg = await readFile((await svgDownload.path())!, "utf8");
    expect(svg).toContain('width="552" height="432"'); // 8 × 6 ม. × 60 px + ขอบ 36 px
    expect(svg.match(/data-type="chair"/g)).toHaveLength(4);

    const [pngDownload] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "ภาพ PNG" }).click()]);
    expect(pngDownload.suggestedFilename()).toMatch(/\.png$/);
    const png = await readFile((await pngDownload.path())!);
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    // ความกว้าง/สูงใน IHDR = 2× ของ SVG
    expect(png.readUInt32BE(16)).toBe(1104);
    expect(png.readUInt32BE(20)).toBe(864);
  });
});

test.describe("พิมพ์ / PDF (feat-026)", () => {
  test("@media print ซ่อนเครื่องมือ แสดงรายงานผังพร้อมสรุปที่นั่ง", async ({ page }) => {
    await buildReadyCafe(page);
    const report = page.getByTestId("print-report");
    await expect(report).toBeHidden();

    await page.emulateMedia({ media: "print" });
    await expect(report).toBeVisible();
    await expect(page.getByRole("banner")).toBeHidden();
    await expect(page.getByRole("complementary", { name: "เครื่องมือจัดร้าน" })).toBeHidden();
    await expect(stage(page)).toBeHidden();
    await expect(report.locator("svg")).toBeVisible();
    await expect(report).toContainText("ที่นั่งทั้งหมด4 ที่นั่ง");
    await expect(page.getByTestId("print-status")).toHaveText("พร้อมจำลอง");
    const noScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(noScroll).toBe(true);

    const pdf = await page.pdf({ path: "e2e/.results/screens/print-report.pdf", format: "A4", landscape: true, printBackground: true });
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    // ผัง + สรุปจบใน A4 แนวนอนหน้าเดียว
    expect(pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g)).toHaveLength(1);
    await page.screenshot({ path: "e2e/.results/screens/print-report.png", fullPage: true });
  });
});
