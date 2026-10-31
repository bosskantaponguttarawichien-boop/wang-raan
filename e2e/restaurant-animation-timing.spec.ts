import { appendFileSync, mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { openTab } from "./helpers";

/**
 * feat-123 · ตรวจเวลาเดินของการจำลอง
 *
 * วัดจาก "เวลาในร้าน" ที่แถบสถานะแสดงจริง เทียบกับเวลาจริงของเครื่อง (`performance.now`)
 * ที่ 1× เวลาจำลองต้องเดินเท่าเวลาจริง (`REAL_SECONDS_TO_SIMULATION_SECONDS_AT_1X = 1`)
 * และการหยุดชั่วคราวต้องไม่สะสมเวลาไว้ไล่คืนตอนเล่นต่อ (สัญญา v1 §2 "ไม่มี catch-up")
 */

function record(measurement: Record<string, unknown>) {
  // ไม่เขียนลง e2e/.results เพราะ Playwright ล้าง outputDir ทุกครั้งที่เริ่มรัน
  mkdirSync("harness/evidence/feat-123", { recursive: true });
  appendFileSync("harness/evidence/feat-123/measurements.jsonl", `${JSON.stringify(measurement)}
`, "utf8");
}

const statusBar = (page: Page) => page.getByTestId("validation-status-bar");

async function openReadyCafe(page: Page) {
  await page.goto("/playground");
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

async function setSpeed(page: Page, label: "1×" | "2×" | "5×" | "10×" | "30×") {
  await page.getByTestId("simulation-panel").getByRole("button", { name: label, exact: true }).last().click();
}

/**
 * เวลาในร้านเป็นวินาทีจำลอง จาก data-sim-seconds ของแถบสถานะ
 * (นาฬิกาบนจอโชว์แค่ HH:MM ตั้งแต่ feat-156 จึงละเอียดไม่พอสำหรับวัดอัตรา)
 */
async function storeSeconds(page: Page): Promise<number> {
  const value = await page.getByTestId("simulation-status").getAttribute("data-sim-seconds");
  if (value === null || !Number.isFinite(Number(value))) throw new Error(`อ่านเวลาในร้านไม่ได้: ${value}`);
  return Number(value);
}

/** คู่ (เวลาในร้าน, เวลาจริง) ที่อ่านพร้อมกัน */
async function sample(page: Page) {
  const store = await storeSeconds(page);
  const real = await page.evaluate(() => performance.now() / 1000);
  return { store, real };
}

/** รอจนเวลาในร้านเดินจริงแล้ว (ข้ามช่วง warm-up ของ worker/interpolation) */
async function waitUntilTicking(page: Page) {
  const first = await storeSeconds(page);
  await expect.poll(() => storeSeconds(page), { timeout: 30_000 }).toBeGreaterThan(first);
}

test.describe("feat-123: เวลาเดินของการจำลอง", () => {
  test.slow();

  test("ที่ 1× เวลาในร้านเดินเท่าเวลาจริง ±5%", async ({ page }) => {
    await openReadyCafe(page);
    await startSimulation(page);
    await setSpeed(page, "1×");
    await waitUntilTicking(page);

    const from = await sample(page);
    await page.waitForTimeout(15_000);
    const to = await sample(page);

    const storeElapsed = to.store - from.store;
    const realElapsed = to.real - from.real;
    // ความละเอียดของนาฬิกาที่แสดงคือ 1 วินาที จึงเผื่อ ±1 วิ บวกกับเกณฑ์ ±5%
    record({ check: "clock-1x", storeElapsed, realElapsed, ratio: storeElapsed / realElapsed });
    const tolerance = realElapsed * 0.05 + 1;
    expect(
      Math.abs(storeElapsed - realElapsed),
      `เวลาในร้านเดิน ${storeElapsed.toFixed(1)} วิ ขณะที่เวลาจริงผ่านไป ${realElapsed.toFixed(1)} วิ`,
    ).toBeLessThanOrEqual(tolerance);
  });

  test("เร่ง 10× แล้วเวลาในร้านเดินเร็วขึ้นราวสิบเท่า และไม่เร็วเกินที่สั่ง", async ({ page }) => {
    await openReadyCafe(page);
    await startSimulation(page);
    await setSpeed(page, "10×");
    await waitUntilTicking(page);

    const from = await sample(page);
    await page.waitForTimeout(8000);
    const to = await sample(page);
    const ratio = (to.store - from.store) / (to.real - from.real);
    record({ check: "clock-10x", ratio });
    expect(ratio, `อัตราเวลาที่วัดได้ ${ratio.toFixed(2)}×`).toBeGreaterThan(7);
    expect(ratio, `อัตราเวลาที่วัดได้ ${ratio.toFixed(2)}×`).toBeLessThan(13);
  });

  test("หยุดชั่วคราว: เวลาในร้านหยุด และเล่นต่อแล้วไม่ไล่เวลาที่พักคืน", async ({ page }) => {
    await openReadyCafe(page);
    await startSimulation(page);
    await setSpeed(page, "1×");
    await waitUntilTicking(page);

    await page.getByRole("button", { name: /หยุดชั่วคราว/ }).click();
    await expect(page.getByTestId("simulation-status")).toContainText("หยุดชั่วคราว");
    await page.waitForTimeout(500);
    const paused = await storeSeconds(page);
    await page.waitForTimeout(6000);
    expect(await storeSeconds(page), "เวลาในร้านต้องไม่เดินขณะหยุดชั่วคราว").toBe(paused);

    await page.getByRole("button", { name: /เล่นต่อ/ }).click();
    await expect(page.getByTestId("simulation-status")).toContainText("กำลังจำลอง");
    const resumed = await sample(page);
    await page.waitForTimeout(6000);
    const after = await sample(page);
    const ratio = (after.store - resumed.store) / (after.real - resumed.real);
    record({ check: "resume-no-catchup", ratio });
    // ถ้ามีการไล่เวลาที่พักคืน อัตราช่วงแรกหลัง resume จะพุ่งเกิน 1× อย่างชัดเจน
    expect(ratio, `อัตราหลังเล่นต่อ ${ratio.toFixed(2)}×`).toBeLessThan(1.5);
  });

  test("แท็บถูกซ่อน: เวลาไม่สะสมไว้ไล่คืนตอนกลับมา", async ({ page }) => {
    await page.addInitScript(() => {
      let hidden = false;
      Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (hidden ? "hidden" : "visible") });
      (window as unknown as { __setHidden: (value: boolean) => void }).__setHidden = (value: boolean) => {
        hidden = value;
        document.dispatchEvent(new Event("visibilitychange"));
      };
    });
    await openReadyCafe(page);
    await startSimulation(page);
    await setSpeed(page, "1×");
    await waitUntilTicking(page);

    await page.evaluate(() => (window as unknown as { __setHidden: (value: boolean) => void }).__setHidden(true));
    await page.waitForTimeout(500);
    const hiddenAt = await storeSeconds(page);
    await page.waitForTimeout(6000);
    expect(await storeSeconds(page), "แท็บซ่อนอยู่ เวลาในร้านต้องไม่เดินต่อ").toBeLessThanOrEqual(hiddenAt + 1);

    await page.evaluate(() => (window as unknown as { __setHidden: (value: boolean) => void }).__setHidden(false));
    const back = await sample(page);
    await page.waitForTimeout(6000);
    const after = await sample(page);
    const ratio = (after.store - back.store) / (after.real - back.real);
    record({ check: "visibility-no-catchup", ratio });
    expect(ratio, `อัตราหลังกลับมาที่แท็บ ${ratio.toFixed(2)}×`).toBeLessThan(1.5);
  });
});
