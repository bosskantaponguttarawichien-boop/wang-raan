import { appendFileSync, mkdirSync } from "node:fs";
import { expect, test, type Locator, type Page, type Request } from "@playwright/test";
import { BREAKPOINTS, openTab } from "./helpers";

/**
 * feat-123 · ตรวจรับภาพวงจรบริการในมุมมอง 3D
 *
 * ทุกข้อวัดจากของจริงบนหน้าเว็บ: ภาพที่ canvas วาดจริง, ไฟล์โมเดลที่ถูกโหลดจริง และ console ของเบราว์เซอร์
 * ไม่ใช้ hook ภายในแอปและไม่ถือว่า "GLB โหลด 200" เท่ากับ "เห็นภาพถูกต้อง"
 */

/** สะสม console error / uncaught error ตลอดเทสต์ — ต้องเป็น 0 ทุกข้อ */
function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));
  return errors;
}

/** URL ของโมเดลที่หน้าเว็บขอจริง (ตัวละคร/อาหาร) */
function watchModelRequests(page: Page) {
  const urls: string[] = [];
  page.on("request", (request: Request) => {
    const url = request.url();
    if (url.includes("/assets/models/")) urls.push(url);
  });
  return urls;
}

const statusBar = (page: Page) => page.getByTestId("validation-status-bar");

/** เปิด Playground ด้วยผังคาเฟ่ตัวอย่างที่ผ่านการตรวจแล้ว */
async function openReadyCafe(page: Page) {
  await page.goto("/playground");
  // จอแคบ: แผงเป็น bottom sheet ที่อาจพับอยู่ — openTab เปิดให้ก่อนหาปุ่มในแผง
  await openTab(page, "add");
  await page.getByRole("button", { name: /ใช้ผังตัวอย่าง/ }).click();
  await expect(statusBar(page)).toHaveAttribute("data-status", "ready");
}

async function startSimulation(page: Page) {
  await openTab(page, "check");
  const start = page.getByTestId("start-simulation");
  await expect(start).toHaveAttribute("aria-disabled", "false");
  await start.click();
  await expect(page.getByTestId("simulation-status")).toContainText("กำลังจำลอง");
}

async function show3D(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "ดูตัวอย่าง 3D" }).click();
  const canvas = page.getByTestId("three-canvas");
  await expect(canvas).toBeVisible();
  return canvas;
}

/** แผงจำลองมีแถบความเร็วสองชุด (ก่อนเริ่ม / ระหว่างเล่น) — ระหว่างจำลองใช้ชุดที่มองเห็นอยู่ */
async function setSpeed(page: Page, label: "1×" | "2×" | "5×" | "10×" | "30×") {
  const button = page.getByTestId("simulation-panel").getByRole("button", { name: label, exact: true });
  await button.last().click();
}

/** ความสว่างเฉลี่ย 0–1 ของภาพ PNG — ถอดรหัสในเบราว์เซอร์ จึงอ่านภาพ WebGL ที่ composite แล้วได้ */
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

/** บันทึกค่าที่วัดได้ลงไฟล์เดียวกัน เพื่อให้หลักฐานของ feat-123 มีตัวเลขจริงไม่ใช่แค่ผ่าน/ไม่ผ่าน */
function record(measurement: Record<string, unknown>) {
  // ไม่เขียนลง e2e/.results เพราะ Playwright ล้าง outputDir ทุกครั้งที่เริ่มรัน
  mkdirSync("harness/evidence/feat-123", { recursive: true });
  appendFileSync("harness/evidence/feat-123/measurements.jsonl", `${JSON.stringify(measurement)}
`, "utf8");
}

/** สัดส่วนพิกเซลที่ต่างกันเกิน threshold ระหว่างภาพ PNG สองภาพ (ถอดรหัสในเบราว์เซอร์) */
async function pixelDiffRatio(page: Page, a: Buffer, b: Buffer, threshold = 8): Promise<number> {
  return page.evaluate(async ({ first, second, limit }) => {
    const decode = async (base64: string) => {
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("decode failed"));
        image.src = `data:image/png;base64,${base64}`;
      });
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      canvas.getContext("2d")!.drawImage(image, 0, 0);
      return canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    };
    const left = await decode(first);
    const right = await decode(second);
    if (left.length !== right.length) return 1;
    let differing = 0;
    for (let index = 0; index < left.length; index += 4) {
      const delta = Math.max(
        Math.abs(left[index]! - right[index]!),
        Math.abs(left[index + 1]! - right[index + 1]!),
        Math.abs(left[index + 2]! - right[index + 2]!),
      );
      if (delta > limit) differing += 1;
    }
    return differing / (left.length / 4);
  }, { first: a.toString("base64"), second: b.toString("base64"), limit: threshold });
}

test.describe("feat-123: วงจรบริการในมุมมอง 3D", () => {
  test("อาหารขึ้นโต๊ะจริงระหว่างจำลอง และไม่มี console error ตลอดรอบ", async ({ page }) => {
    // รอบบริการจริงกินเวลาหลายนาทีจำลอง แม้เร่ง 10× ก็ยังนานกว่า timeout มาตรฐาน
    test.setTimeout(240_000);
    const errors = watchErrors(page);
    const models = watchModelRequests(page);
    await openReadyCafe(page);
    await startSimulation(page);
    const canvas = await show3D(page);
    await setSpeed(page, "10×");

    // โมเดลตัวละครต้องถูกโหลดก่อน แล้วจานอาหารจึงขึ้นโต๊ะเมื่อถึงคิวเสิร์ฟจริง
    await expect
      .poll(() => models.some((url) => url.includes("cafe-customer")), { timeout: 30_000 })
      .toBe(true);
    await expect
      .poll(() => models.some((url) => url.includes("/assets/models/food/")), {
        timeout: 120_000,
        message: "ไม่มีจานอาหารถูกโหลดเลยระหว่างจำลอง — วงจรเสิร์ฟไม่ถึงโต๊ะ",
      })
      .toBe(true);

    const served = await canvas.screenshot();
    await page.screenshot({ path: "e2e/.results/screens/animation-service-cycle.png" });
    // ภาพต้องไม่ใช่เฟรมว่าง (ฉากจริงมีผนัง เฟอร์นิเจอร์ และเงา)
    const luminance = await meanLuminance(page, served);
    record({ check: "service-cycle", meanLuminance: luminance, models: models.filter((url) => url.includes("/food/")) });
    expect(luminance).toBeGreaterThan(0.05);
    expect(luminance).toBeLessThan(0.99);
    expect(errors).toEqual([]);
  });

  test("pause หยุดภาพจริง resume เล่นต่อ และ stop คืนฉากเป็นผังนิ่ง", async ({ page }) => {
    test.setTimeout(150_000);
    const errors = watchErrors(page);
    await openReadyCafe(page);
    await startSimulation(page);
    const canvas = await show3D(page);
    await setSpeed(page, "10×");
    // รอให้มีลูกค้าอยู่ในฉากก่อน ภาพจึงมีอะไรให้ขยับ
    await expect.poll(async () => {
      const before = await canvas.screenshot();
      await page.waitForTimeout(600);
      const after = await canvas.screenshot();
      return before.equals(after) ? "still" : "moving";
    }, { timeout: 60_000 }).toBe("moving");

    await page.getByRole("button", { name: /หยุดชั่วคราว/ }).click();
    // asset ที่โหลดเสร็จระหว่างนั้น (ผิวรุ่นละเอียด/โมเดลอาหาร) เปลี่ยนภาพได้ครั้งเดียว
    // จึงรอให้เข้าฉากครบก่อน แล้วค่อยวัดว่าภาพนิ่งจริง
    await page.waitForTimeout(3000);
    const paused = await canvas.screenshot();
    await page.waitForTimeout(2500);
    const still = await canvas.screenshot();
    const drift = await pixelDiffRatio(page, paused, still);
    record({ check: "paused-frame-drift", ratio: drift, windowSeconds: 2.5 });
    // หยุดจริงต้องไม่มีการเคลื่อนไหวต่อเนื่อง — เผื่อ noise ของการ composite ไว้เพียง 0.1% ของเฟรม
    expect(drift, `พิกเซลที่เปลี่ยนระหว่างหยุดชั่วคราว ${(drift * 100).toFixed(3)}%`).toBeLessThan(0.001);

    await page.getByRole("button", { name: /เล่นต่อ|หยุดชั่วคราว/ }).click();
    await page.getByTestId("stop-simulation").click();
    await expect(page.getByTestId("simulation-status")).not.toContainText("กำลังจำลอง");
    // ออกจากโหมดจำลองแล้วฉากยังวาดได้ และนิ่งสนิท (ไม่มีลูกค้า/เก้าอี้ค้างกลางทาง)
    await page.waitForTimeout(2500);
    const stopped = await canvas.screenshot();
    await page.waitForTimeout(2000);
    const stoppedDrift = await pixelDiffRatio(page, stopped, await canvas.screenshot());
    record({ check: "stopped-frame-drift", ratio: stoppedDrift, windowSeconds: 2.0 });
    expect(stoppedDrift, `พิกเซลที่เปลี่ยนหลังจบรอบ ${(stoppedDrift * 100).toFixed(3)}%`).toBeLessThan(0.001);
    await page.screenshot({ path: "e2e/.results/screens/animation-after-stop.png" });
    expect(errors).toEqual([]);
  });

  test("สลับ 2D ↔ 3D ระหว่างจำลองและกลับมาเล่นต่อได้โดยไม่มี error", async ({ page }) => {
    const errors = watchErrors(page);
    await openReadyCafe(page);
    await startSimulation(page);
    await show3D(page);
    await page.getByRole("button", { name: "จัดผัง 2D" }).click();
    await expect(page.getByTestId("three-canvas")).toHaveCount(0);
    const canvas = await show3D(page);
    await expect(canvas).toBeVisible();
    // เข้า 3D กลางรอบแล้วต้องสร้างฉากใหม่ได้ และมี canvas เดียวเท่านั้น
    expect(await page.locator("canvas[data-testid='three-canvas']").count()).toBe(1);
    expect(errors).toEqual([]);
  });

  test("WebGL ใช้ไม่ได้ → ฉาก SVG isometric แทน และยังจำลองต่อได้", async ({ page }) => {
    const errors = watchErrors(page);
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      // คืน null เฉพาะ context ของ WebGL — canvas 2D ของ overlay ยังต้องใช้ได้
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        if (typeof type === "string" && type.includes("webgl")) return null;
        return (original as (...args: unknown[]) => unknown).call(this, type, ...rest);
      } as typeof HTMLCanvasElement.prototype.getContext;
    });
    await openReadyCafe(page);
    await startSimulation(page);
    await page.getByRole("button", { name: "ดูตัวอย่าง 3D" }).click();
    // ไม่มี WebGL → ต้องเห็นฉาก isometric แบบ SVG ไม่ใช่หน้าว่างหรือ error
    await expect(page.getByTestId("iso-svg")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("three-canvas")).toHaveCount(0);
    await page.screenshot({ path: "e2e/.results/screens/animation-svg-fallback.png" });
    // three.js แจ้งว่าสร้าง WebGL context ไม่ได้ ซึ่งเป็นเหตุผลของการถอยไป SVG — ไม่ใช่ข้อผิดพลาดของแอป
    expect(errors.filter((text) => !text.includes("Error creating WebGL context"))).toEqual([]);
  });

  test("เมนูที่ขึ้นโต๊ะอยู่ในห้าเมนูที่ล็อกไว้เท่านั้น", async ({ page }) => {
    test.setTimeout(300_000);
    const errors = watchErrors(page);
    const models = watchModelRequests(page);
    await openReadyCafe(page);
    await startSimulation(page);
    await show3D(page);
    await setSpeed(page, "30×");
    // ปล่อยให้ร้านเสิร์ฟหลายรอบ แล้วดูว่ามีเมนูใดขึ้นโต๊ะบ้าง
    await page.waitForTimeout(120_000);
    const MENUS = ["fried-rice", "noodles", "steak", "salad", "cake"] as const;
    const loaded = [...new Set(
      models
        .filter((url) => url.includes("/assets/models/food/"))
        .map((url) => url.split("/assets/models/food/")[1]!.split("/")[0]!),
    )].sort();
    record({ check: "menus-observed", loaded, expected: MENUS });
    expect(loaded.length, "ไม่มีเมนูใดขึ้นโต๊ะเลย").toBeGreaterThan(0);
    // เมนูถูกล็อกไว้ห้าแบบ — ห้ามมีชื่ออื่นหลุดมาเป็นคำขอโมเดล
    expect(loaded.filter((menu) => !MENUS.includes(menu as typeof MENUS[number]))).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("performance บนเครื่องอ้างอิง: วัด frame time จริงขณะจำลองในมุมมอง 3D", async ({ page }) => {
    test.setTimeout(240_000);
    const errors = watchErrors(page);
    await openReadyCafe(page);
    await startSimulation(page);
    await show3D(page);
    await setSpeed(page, "1×");
    // ปล่อยให้ร้านมีคนก่อนค่อยวัด — วัดฉากว่างไม่ได้บอกอะไร
    await page.waitForTimeout(20_000);

    const sample = await page.evaluate(async () => {
      const intervals: number[] = [];
      await new Promise<void>((resolve) => {
        let previous = performance.now();
        const started = previous;
        const step = (now: number) => {
          intervals.push(now - previous);
          previous = now;
          if (now - started >= 10_000) resolve();
          else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
      intervals.sort((a, b) => a - b);
      const at = (ratio: number) => intervals[Math.min(intervals.length - 1, Math.floor(intervals.length * ratio))]!;
      const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
      const canvas = document.querySelector<HTMLCanvasElement>("canvas[data-testid='three-canvas']");
      const gl = canvas?.getContext("webgl2") ?? canvas?.getContext("webgl");
      const info = gl?.getExtension("WEBGL_debug_renderer_info");
      return {
        frames: intervals.length,
        medianMs: at(0.5),
        p95Ms: at(0.95),
        usedJSHeapMB: memory ? Number((memory.usedJSHeapSize / 1024 / 1024).toFixed(1)) : null,
        canvasPixels: canvas ? [canvas.width, canvas.height] : null,
        devicePixelRatio: window.devicePixelRatio,
        renderer: info && gl ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : null,
        vendor: info && gl ? String(gl.getParameter(info.UNMASKED_VENDOR_WEBGL)) : null,
      };
    });
    const inStore = await page.getByTestId("simulation-metrics").innerText().catch(() => "");
    record({
      check: "performance",
      ...sample,
      medianFps: Number((1000 / sample.medianMs).toFixed(1)),
      p95Fps: Number((1000 / sample.p95Ms).toFixed(1)),
      storeMetrics: inStore.replace(/\s+/g, " ").slice(0, 240),
      note: "ผังตัวอย่างคาเฟ่ 8×6 ม. มี 6 ที่นั่ง จึงไม่สามารถสร้างฉาก 80 ลูกค้าพร้อมกันได้",
    });
    expect(sample.frames, "วัดเฟรมไม่ได้เลย").toBeGreaterThan(60);
    expect(1000 / sample.medianMs, `median ${(1000 / sample.medianMs).toFixed(1)} fps`).toBeGreaterThanOrEqual(30);
    expect(errors).toEqual([]);
  });

  test("เริ่ม–จบรอบ 10 ครั้ง: canvas ไม่งอกและไม่มี error สะสม", async ({ page }) => {
    test.setTimeout(240_000);
    const errors = watchErrors(page);
    await openReadyCafe(page);
    await show3D(page);
    const heapBefore = await page.evaluate(() => (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null);
    for (let round = 0; round < 10; round += 1) {
      // กดเริ่มจำลองพากลับไปมุมมอง 2D เสมอ จึงต้องเข้า 3D ใหม่ทุกรอบ = mount/unmount จริง 10 ครั้ง
      await startSimulation(page);
      await show3D(page);
      await page.waitForTimeout(500);
      await page.getByTestId("stop-simulation").click();
      await expect(page.getByTestId("simulation-status")).not.toContainText("กำลังจำลอง");
      // WebGL context มีจำกัดต่อหน้า — ห้ามมี canvas ค้างสะสมจากรอบก่อน
      expect(await page.locator("canvas[data-testid='three-canvas']").count(), `รอบที่ ${round + 1}`).toBeLessThanOrEqual(1);
    }
    await show3D(page);
    expect(await page.locator("canvas[data-testid='three-canvas']").count()).toBe(1);
    const heapAfter = await page.evaluate(() => (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null);
    record({
      check: "start-stop-10-rounds",
      canvases: await page.locator("canvas[data-testid='three-canvas']").count(),
      heapBeforeMB: heapBefore === null ? null : Number((heapBefore / 1024 / 1024).toFixed(1)),
      heapAfterMB: heapAfter === null ? null : Number((heapAfter / 1024 / 1024).toFixed(1)),
    });
    expect(errors).toEqual([]);
  });

  for (const width of BREAKPOINTS) {
    test(`มุมมอง 3D ที่ ${width}px: ไม่มี horizontal scroll และ canvas อยู่ในจอ`, async ({ page }) => {
      const errors = watchErrors(page);
      await page.setViewportSize({ width, height: width < 768 ? 812 : 900 });
      await openReadyCafe(page);
      const canvas = await show3D(page);
      const box = (await canvas.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: `e2e/.results/screens/animation-3d-${width}.png` });
      expect(errors).toEqual([]);
    });
  }
});
