import { appendFileSync, mkdirSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { openTab } from "./helpers";

/**
 * feat-123 · ตรวจแสงตามเวลาจริงในมุมมอง 3D
 *
 * ฉากอ่านเวลาจากอุปกรณ์ (feat-120/121) การทดสอบจึงตรึงเวลาเครื่องด้วย `page.clock.setFixedTime`
 * ซึ่งเปลี่ยนเฉพาะ `Date` ไม่แตะ timer หรือ requestAnimationFrame ฉากจึงยังวาดตามปกติ
 *
 * ค่าที่วัดคือความสว่างเฉลี่ยของภาพที่ canvas วาดจริง ไม่ใช่ค่าภายในของ feature
 */

const BANGKOK = "+07:00";
/** 4 ช่วงเวลาตามแผน §8: เช้า เที่ยง เย็น กลางคืน (วันเดียวกันเพื่อไม่ให้ฤดูกาลเป็นตัวแปร) */
const TIMES = [
  { label: "morning", iso: `2026-06-21T07:30:00${BANGKOK}`, thai: "เช้า 07:30" },
  { label: "noon", iso: `2026-06-21T12:00:00${BANGKOK}`, thai: "เที่ยง 12:00" },
  { label: "evening", iso: `2026-06-21T17:45:00${BANGKOK}`, thai: "เย็น 17:45" },
  { label: "night", iso: `2026-06-21T21:30:00${BANGKOK}`, thai: "กลางคืน 21:30" },
] as const;

function record(measurement: Record<string, unknown>) {
  // ไม่เขียนลง e2e/.results เพราะ Playwright ล้าง outputDir ทุกครั้งที่เริ่มรัน
  mkdirSync("harness/evidence/feat-123", { recursive: true });
  appendFileSync("harness/evidence/feat-123/measurements.jsonl", `${JSON.stringify(measurement)}
`, "utf8");
}

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));
  return errors;
}

const statusBar = (page: Page) => page.getByTestId("validation-status-bar");

async function openReadyCafe(page: Page) {
  await page.goto("/playground");
  await openTab(page, "add");
  await page.getByRole("button", { name: /ใช้ผังตัวอย่าง/ }).click();
  await expect(statusBar(page)).toHaveAttribute("data-status", "ready");
}

async function show3D(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "ดูตัวอย่าง 3D" }).click();
  const canvas = page.getByTestId("three-canvas");
  await expect(canvas).toBeVisible();
  // รอให้โหลดโมเดล/วาดเฟรมแรกเสร็จก่อนวัดความสว่าง
  await page.waitForTimeout(2500);
  return canvas;
}

async function meanLuminance(page: Page, png: Buffer): Promise<number> {
  return page.evaluate(async (base64) => {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("decode failed"));
      image.src = `data:image/png;base64,${base64}`;
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.min(240, image.width));
    canvas.height = Math.max(1, Math.min(240, image.height));
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let total = 0;
    for (let index = 0; index < data.length; index += 4) {
      total += (0.2126 * data[index]! + 0.7152 * data[index + 1]! + 0.0722 * data[index + 2]!) / 255;
    }
    return total / (data.length / 4);
  }, png.toString("base64"));
}

test.describe("feat-123: แสงตามเวลาจริง", () => {
  for (const time of TIMES) {
    test(`${time.thai}: ฉากวาดได้ อ่านผังออก และไม่มี console error`, async ({ page }) => {
      const errors = watchErrors(page);
      await page.clock.setFixedTime(new Date(time.iso));
      await openReadyCafe(page);
      const canvas = await show3D(page);
      const shot = await canvas.screenshot();
      const luminance = await meanLuminance(page, shot);
      await page.screenshot({ path: `e2e/.results/screens/lighting-${time.label}.png` });
      record({ check: "lighting-time", time: time.label, iso: time.iso, meanLuminance: luminance });
      // กลางคืนต้องยังมีไฟในร้านพอให้เห็นผัง (ไม่ดำสนิท) และกลางวันต้องไม่ขาวโพลนจนไม่เห็นรูปทรง
      expect(luminance, `ความสว่างเฉลี่ย ${luminance.toFixed(3)}`).toBeGreaterThan(0.08);
      expect(luminance, `ความสว่างเฉลี่ย ${luminance.toFixed(3)}`).toBeLessThan(0.99);
      expect(errors).toEqual([]);
    });
  }

  test("เที่ยงสว่างกว่ากลางคืนอย่างเห็นได้ชัด และภาพทั้งสองไม่เหมือนกัน", async ({ page }) => {
    await page.clock.setFixedTime(new Date(TIMES[1].iso));
    await openReadyCafe(page);
    const noonShot = await (await show3D(page)).screenshot();
    const noon = await meanLuminance(page, noonShot);

    await page.clock.setFixedTime(new Date(TIMES[3].iso));
    await page.reload();
    await openTab(page, "add");
    await page.getByRole("button", { name: /ใช้ผังตัวอย่าง/ }).click();
    const nightShot = await (await show3D(page)).screenshot();
    const night = await meanLuminance(page, nightShot);

    record({ check: "noon-vs-night", noon, night });
    expect(noonShot.equals(nightShot), "ภาพเที่ยงกับกลางคืนต้องไม่เหมือนกัน").toBe(false);
    expect(noon, `เที่ยง ${noon.toFixed(3)} · กลางคืน ${night.toFixed(3)}`).toBeGreaterThan(night);
  });

  test("หมุนมุมกล้องครบ 4 ด้านแล้วแดดไม่หมุนตามกล้อง", async ({ page }) => {
    test.setTimeout(90_000);
    const errors = watchErrors(page);
    await page.clock.setFixedTime(new Date(TIMES[0].iso));
    await openReadyCafe(page);
    const canvas = await show3D(page);
    const levels: number[] = [await meanLuminance(page, await canvas.screenshot())];
    for (let turn = 0; turn < 4; turn += 1) {
      await page.getByRole("button", { name: /หมุนมุมมองตามเข็ม/ }).click();
      await page.waitForTimeout(1500);
      levels.push(await meanLuminance(page, await canvas.screenshot()));
      await page.screenshot({ path: `e2e/.results/screens/lighting-rotation-${turn}.png` });
    }
    // แดดยึดกับโลกของร้าน ไม่ใช่กล้อง: หมุนครบ 4 ครั้งกลับมุมเดิม ความสว่างจึงต้องกลับมาเท่าเดิม
    // (เทียบความสว่างแทนไบต์ เพราะฉากยังมีท่าทำงานของพนักงานเล่นอยู่ตลอด)
    record({ check: "rotation-luminance", levels });
    expect(Math.abs(levels.at(-1)! - levels[0]!), `เริ่ม ${levels[0]!.toFixed(4)} · ครบรอบ ${levels.at(-1)!.toFixed(4)}`)
      .toBeLessThan(0.02);
    // ระหว่างทางต้องมีอย่างน้อยหนึ่งมุมที่สว่างต่างจากมุมเริ่ม (ผนังคนละด้านรับแดดไม่เท่ากัน)
    expect(levels.slice(1, 4).some((value) => Math.abs(value - levels[0]!) > 0.004)).toBe(true);
    expect(errors).toEqual([]);
  });

  test("prefers-reduced-motion: ใช้ฉาก SVG นิ่ง ไม่มี canvas WebGL", async ({ page }) => {
    const errors = watchErrors(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.clock.setFixedTime(new Date(TIMES[1].iso));
    await openReadyCafe(page);
    await page.getByRole("button", { name: "ดูตัวอย่าง 3D" }).click();
    await expect(page.getByTestId("iso-svg")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("three-canvas")).toHaveCount(0);
    await page.screenshot({ path: "e2e/.results/screens/lighting-reduced-motion.png" });
    expect(errors).toEqual([]);
  });

  test("สั่งพิมพ์: ฉากยังอยู่ครบและไม่มี error", async ({ page }) => {
    test.setTimeout(90_000);
    const errors = watchErrors(page);
    await page.clock.setFixedTime(new Date(TIMES[2].iso));
    await openReadyCafe(page);
    await show3D(page);
    await page.emulateMedia({ media: "print" });
    await page.waitForTimeout(2000);
    // หมายเหตุ: Chromium ถ่ายภาพ element ขณะ emulate print ไม่ได้เสถียร การวัด pixel จึงอยู่ใน
    // unit test ของนาฬิกาแสง (`lighting/clock.test.ts`) ที่ยืนยันว่า interval หยุดเมื่อ media print
    // ที่นี่ตรวจว่าฉากยังอยู่ครบและไม่มีข้อผิดพลาดตอนสลับไปโหมดพิมพ์
    await expect(page.getByTestId("three-canvas")).toHaveCount(1);
    await page.emulateMedia({ media: null });
    await expect(page.getByTestId("three-canvas")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test.describe("ขนาดร้าน 2 ม. ถึง 30 ม.", () => {
    for (const size of [2, 30] as const) {
      test(`ร้าน ${size} × ${size} ม.: เงาครอบทั้งร้านและไม่มี error`, async ({ page }) => {
        test.setTimeout(90_000);
        const errors = watchErrors(page);
        await page.clock.setFixedTime(new Date(TIMES[0].iso));
        await openReadyCafe(page);
        await openTab(page, "shop");
        const panel = page.locator("#panel");
        const width = panel.getByLabel("กว้าง (ม.)", { exact: true });
        const depth = panel.getByLabel("ลึก (ม.)", { exact: true });
        await width.fill(String(size));
        await width.press("Enter");
        await depth.fill(String(size));
        await depth.press("Enter");
        const canvas = await show3D(page);
        const luminance = await meanLuminance(page, await canvas.screenshot());
        record({ check: "room-size", meters: size, meanLuminance: luminance });
        expect(luminance).toBeGreaterThan(0.05);
        await page.screenshot({ path: `e2e/.results/screens/lighting-room-${size}m.png` });
        expect(errors).toEqual([]);
      });
    }
  });
});
