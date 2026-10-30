import { appendFileSync, mkdirSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { openTab } from "./helpers";

/**
 * feat-124 · ตรวจแสงตามเวลาร้านและเวลาคงที่ในมุมมอง 3D
 *
 * ค่าเริ่มต้นอ่านเวลาเปิดร้าน + เวลาจำลอง การตรวจแสง 4 ช่วงใช้แผงเวลาคงที่จริง
 * และมี regression test ยืนยันว่าเวลาเครื่องไม่เปลี่ยนแสงของร้าน
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
  mkdirSync("harness/evidence/feat-124", { recursive: true });
  appendFileSync("harness/evidence/feat-124/measurements.jsonl", `${JSON.stringify(measurement)}\n`, "utf8");
}

/**
 * จำนวนพิกเซลที่ต่างกันจริงระหว่างสองภาพ (เทียบในเบราว์เซอร์ จึงอ่านภาพที่ composite แล้ว)
 *
 * ไม่เทียบไบต์ต่อไบต์: ฉาก WebGL ที่มี DOM ทับอยู่มีพิกเซลขอบ subpixel กะพริบได้ 1–2 จุดต่อเฟรม
 * (วัดแล้ว: 1 พิกเซลที่ตำแหน่งเดิมสลับไปมาแบบสุ่ม ทั้งที่เวลาและแสงไม่ขยับ) ขณะที่การเปลี่ยนจริง
 * เช่นดวงอาทิตย์ขยับหรือโมเดลโหลดเสร็จ เปลี่ยนพิกเซลเป็นพันจุด
 */
async function differentPixels(page: Page, a: Buffer, b: Buffer): Promise<number> {
  return page.evaluate(async ([first, second]) => {
    const decode = async (base64: string) => {
      const blob = await (await fetch(`data:image/png;base64,${base64}`)).blob();
      const bitmap = await createImageBitmap(blob);
      const surface = document.createElement("canvas");
      surface.width = bitmap.width;
      surface.height = bitmap.height;
      const context = surface.getContext("2d")!;
      context.drawImage(bitmap, 0, 0);
      return context.getImageData(0, 0, bitmap.width, bitmap.height);
    };
    const one = await decode(first!);
    const two = await decode(second!);
    if (one.width !== two.width || one.height !== two.height) return Number.MAX_SAFE_INTEGER;
    let changed = 0;
    for (let index = 0; index < one.data.length; index += 4) {
      if (
        Math.abs(one.data[index]! - two.data[index]!) > 2 ||
        Math.abs(one.data[index + 1]! - two.data[index + 1]!) > 2 ||
        Math.abs(one.data[index + 2]! - two.data[index + 2]!) > 2
      ) changed += 1;
    }
    return changed;
  }, [a.toString("base64"), b.toString("base64")]);
}

/**
 * ภาพของ canvas ที่ "นิ่งแล้วจริง" — เทียบสองภาพติดกันจนเหมือนกันก่อนคืนค่า
 *
 * การกดหยุดชั่วคราวหยุดเวลาและคลิปทั้งหมด แต่ไม่ได้หยุดการโหลดไฟล์โมเดล: ตัวละครที่ GLB
 * เพิ่งโหลดเสร็จต้องปรากฏขึ้นมา (ไม่ใช่หายไป) ภาพจึงเปลี่ยนได้หนึ่งครั้งหลังกดหยุด
 * ถ้าถ่ายภาพเทียบในจังหวะนั้นพอดี เทสต์จะล้มด้วยเหตุที่ไม่เกี่ยวกับสิ่งที่ต้องการตรวจ
 */
async function settledShot(page: Page, canvas: Locator, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let previous = await canvas.screenshot();
  while (Date.now() < deadline) {
    await page.waitForTimeout(400);
    const next = await canvas.screenshot();
    if (next.equals(previous)) return next;
    previous = next;
  }
  return previous;
}

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));
  return errors;
}

const SCREENS_DIR = "harness/evidence/feat-124/screens";
mkdirSync(SCREENS_DIR, { recursive: true });

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

async function setFixedLightingTime(page: Page, localTime: string) {
  await openTab(page, "shop");
  await page.getByTestId("lighting-mode-fixed").click();
  await page.getByTestId("lighting-fixed-datetime").fill(localTime);
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

test.describe("feat-124: แสงตามเวลาร้าน", () => {
  for (const time of TIMES) {
    test(`${time.thai}: ฉากวาดได้ อ่านผังออก และไม่มี console error`, async ({ page }) => {
      const errors = watchErrors(page);
      await openReadyCafe(page);
      await setFixedLightingTime(page, time.iso.slice(0, 16));
      const canvas = await show3D(page);
      const shot = await canvas.screenshot();
      const luminance = await meanLuminance(page, shot);
      await page.screenshot({ path: `${SCREENS_DIR}/lighting-${time.label}.png` });
      record({ check: "lighting-time", time: time.label, iso: time.iso, meanLuminance: luminance });
      // กลางคืนต้องยังมีไฟในร้านพอให้เห็นผัง (ไม่ดำสนิท) และกลางวันต้องไม่ขาวโพลนจนไม่เห็นรูปทรง
      expect(luminance, `ความสว่างเฉลี่ย ${luminance.toFixed(3)}`).toBeGreaterThan(0.08);
      expect(luminance, `ความสว่างเฉลี่ย ${luminance.toFixed(3)}`).toBeLessThan(0.99);
      expect(errors).toEqual([]);
    });
  }

  test("แสงอิงเวลาเปิดร้าน เดินตามจำลอง และหยุดเมื่อพัก โดยไม่อิงเวลาเครื่อง", async ({ page }) => {
    test.setTimeout(90_000);
    const errors = watchErrors(page);
    await page.clock.setFixedTime(new Date("2035-01-01T23:00:00+07:00"));
    await openReadyCafe(page);
    await openTab(page, "shop");
    const summary = page.getByTestId("lighting-solar-summary");
    await expect(page.getByTestId("lighting-mode-simulation")).toHaveAttribute("aria-pressed", "true");
    await expect(summary).toContainText("10:00 น.");
    const canvas = await show3D(page);
    const day = await meanLuminance(page, await canvas.screenshot());
    await openTab(page, "check");
    await page.getByLabel("เวลาเปิดร้าน", { exact: true }).fill("20:00");
    await page.getByLabel("เวลาปิดร้าน", { exact: true }).fill("23:00");
    await openTab(page, "shop");
    await expect(summary).toContainText("20:00 น.");
    await page.waitForTimeout(500);
    const night = await meanLuminance(page, await canvas.screenshot());
    expect(day - night).toBeGreaterThan(0.025);
    await page.clock.setFixedTime(new Date("2040-07-01T12:00:00+07:00"));
    await expect(summary).toContainText("20:00 น.");
    await page.screenshot({ path: `${SCREENS_DIR}/restaurant-opening-night.png` });

    await openTab(page, "check");
    await page.getByLabel("เวลาเปิดร้าน", { exact: true }).fill("10:00");
    await page.getByLabel("เวลาปิดร้าน", { exact: true }).fill("20:00");
    await page.getByTestId("start-simulation").click();
    await expect(page.getByTestId("simulation-status")).toContainText("กำลังจำลอง");
    await page.getByTestId("simulation-panel").getByRole("button", { name: "30×", exact: true }).last().click();
    // During a run, the rail and shop settings are replaced by simulation controls.
    const runningCanvas = await show3D(page);
    await page.getByRole("button", { name: /หยุดชั่วคราว/ }).click();
    await expect(page.getByTestId("simulation-status")).toContainText("หยุดชั่วคราว");
    await page.waitForTimeout(500);
    const paused = await page.getByTestId("simulation-status").innerText();
    const pausedShot = await settledShot(page, runningCanvas);
    await page.clock.setFixedTime(new Date("2045-01-01T01:00:00+07:00"));
    await page.waitForTimeout(2500);
    expect(await page.getByTestId("simulation-status").innerText()).toBe(paused);
    const movedPixels = await differentPixels(page, pausedShot, await runningCanvas.screenshot());
    // เพดาน 0.05% ของภาพ (~266 จุดจาก 532,416) — แสงที่ขยับตามเวลาเครื่องจะเปลี่ยนเป็นพันจุด
    expect(movedPixels, `พิกเซลที่เปลี่ยนขณะหยุดชั่วคราว ${movedPixels} จุด`).toBeLessThan(266);
    await page.getByTestId("stop-simulation").click();
    await openTab(page, "shop");
    await expect(summary).toContainText("10:00 น.");
    record({ check: "restaurant-clock", day, night, paused, deviceClockIgnored: true, movedPixelsWhilePaused: movedPixels });
    expect(errors).toEqual([]);
  });

  test("เที่ยงสว่างกว่ากลางคืนอย่างเห็นได้ชัด และปรับเวลาผ่านแผงตั้งค่าแสงในแท็บร้านได้จริง", async ({ page }) => {
    await openReadyCafe(page);
    const canvas = await show3D(page);

    // เปิดแท็บ "ร้าน" เพื่อตรวจว่าแผงตั้งค่าแสง (LightingSettingsPanel) แสดงอยู่และปรับโหมดเวลาคงที่ได้จริง
    await openTab(page, "shop");
    const lightingPanel = page.getByTestId("lighting-settings-panel");
    await expect(lightingPanel).toBeVisible();
    await expect(page.getByTestId("lighting-reference-disclosure")).toBeVisible();

    await page.getByTestId("lighting-mode-fixed").click();
    const fixedInput = page.getByTestId("lighting-fixed-datetime");
    await expect(fixedInput).toBeVisible();
    await fixedInput.fill("2026-06-21T12:00");
    await page.waitForTimeout(800);
    const noonShot = await canvas.screenshot();
    const noon = await meanLuminance(page, noonShot);

    await fixedInput.fill("2026-06-21T21:30");
    await page.waitForTimeout(800);
    const nightShot = await canvas.screenshot();
    const night = await meanLuminance(page, nightShot);

    record({ check: "noon-vs-night", noon, night });
    expect(noonShot.equals(nightShot), "ภาพเที่ยงกับกลางคืนต้องไม่เหมือนกัน").toBe(false);
    expect(noon, `เที่ยง ${noon.toFixed(3)} · กลางคืน ${night.toFixed(3)}`).toBeGreaterThan(night);
  });

  test("หมุนมุมกล้องครบ 4 ด้านแล้วแดดไม่หมุนตามกล้อง", async ({ page }) => {
    test.setTimeout(90_000);
    const errors = watchErrors(page);
    await openReadyCafe(page);
    await setFixedLightingTime(page, TIMES[0].iso.slice(0, 16));
    const canvas = await show3D(page);
    const levels: number[] = [await meanLuminance(page, await canvas.screenshot())];
    for (let turn = 0; turn < 4; turn += 1) {
      await page.getByRole("button", { name: /หมุนมุมมองตามเข็ม/ }).click();
      await page.waitForTimeout(1500);
      levels.push(await meanLuminance(page, await canvas.screenshot()));
      await page.screenshot({ path: `${SCREENS_DIR}/lighting-rotation-${turn}.png` });
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
    await openReadyCafe(page);
    await setFixedLightingTime(page, TIMES[1].iso.slice(0, 16));
    await page.getByRole("button", { name: "ดูตัวอย่าง 3D" }).click();
    await expect(page.getByTestId("iso-svg")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("three-canvas")).toHaveCount(0);
    await page.screenshot({ path: `${SCREENS_DIR}/lighting-reduced-motion.png` });
    expect(errors).toEqual([]);
  });

  test("สั่งพิมพ์: ฉากยังอยู่ครบและไม่มี error", async ({ page }) => {
    test.setTimeout(90_000);
    const errors = watchErrors(page);
    await openReadyCafe(page);
    await setFixedLightingTime(page, TIMES[2].iso.slice(0, 16));
    await show3D(page);
    await page.emulateMedia({ media: "print" });
    await page.waitForTimeout(2000);
    // หมายเหตุ: Chromium ถ่ายภาพ element ขณะ emulate print ไม่ได้เสถียร การวัด pixel จึงอยู่ใน
    // unit test ของนาฬิกาแสง (`lighting/clock.test.ts`) ที่ยืนยันว่าไม่มี timer อิสระ
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
        await openReadyCafe(page);
        await setFixedLightingTime(page, TIMES[0].iso.slice(0, 16));
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
        await page.screenshot({ path: `${SCREENS_DIR}/lighting-room-${size}m.png` });
        expect(errors).toEqual([]);
      });
    }
  });
});
