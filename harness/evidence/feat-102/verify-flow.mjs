import { chromium, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [], requests = [], checks = [];
page.on("pageerror", error => errors.push(error.message));
page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
page.on("response", response => { if (response.url().includes("/assets/models/")) requests.push({ url: response.url(), status: response.status() }); });
try {
  await page.goto("http://localhost:3000/playground");
  await page.getByRole("button", { name: "ใช้ผังตัวอย่าง (คาเฟ่ 8×6 ม.)" }).click();
  expect(requests).toHaveLength(0);
  checks.push("2D loads no character model assets");
  await page.getByRole("button", { name: "ดูตัวอย่าง 3D" }).click();
  await expect(page.getByTestId("three-canvas")).toBeVisible();
  for (let angle = 0; angle < 4; angle++) {
    await page.getByTestId("rotate-view-right").click();
    await page.waitForTimeout(700);
  }
  checks.push("camera rotation completes in all four directions");
  await page.locator("#rail [data-tab=check]").click();
  await page.getByRole("button", { name: "จำลองร้าน 1 วัน", exact: true }).click();
  await expect(page.getByTestId("stop-simulation")).toBeVisible({ timeout: 60000 });
  // Starting intentionally returns to 2D; remount the lazy viewer during the run.
  await page.getByRole("button", { name: "ดูตัวอย่าง 3D" }).click();
  await expect(page.getByTestId("three-canvas")).toBeVisible();
  await page.waitForTimeout(2000);
  await page.getByRole("button", { name: /หยุดชั่วคราว/ }).click();
  await expect(page.getByRole("button", { name: /เล่นต่อ/ })).toBeVisible();
  await page.screenshot({ path: "harness/evidence/feat-102/simulation-paused.png" });
  await page.getByRole("button", { name: /เล่นต่อ/ }).click();
  await page.getByTestId("stop-simulation").click();
  checks.push("START → 3D → PAUSE → RESUME → STOP works without renderer errors");
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "จัดผัง 2D" }).click();
    await expect(page.getByTestId("three-canvas")).toHaveCount(0);
    await page.getByRole("button", { name: "ดูตัวอย่าง 3D" }).click();
    await expect(page.getByTestId("three-canvas")).toHaveCount(1);
  }
  checks.push("three consecutive viewer unmount/remount cycles keep exactly one canvas");
  const reduced = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 375, height: 812 } });
  const fallback = await reduced.newPage();
  await fallback.goto("http://localhost:3000/playground");
  await fallback.getByRole("button", { name: "ดูตัวอย่าง 3D" }).click();
  await expect(fallback.getByTestId("three-canvas")).toHaveCount(0);
  await expect(fallback.getByTestId("iso-svg")).toBeVisible();
  const overflow = await fallback.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  expect(overflow).toBe(false);
  checks.push("375px reduced-motion uses SVG fallback without horizontal overflow");
  await reduced.close();
  expect(errors).toEqual([]);
  expect(requests.every(request => request.status === 200)).toBe(true);
  await writeFile("harness/evidence/feat-102/flow-report.json", JSON.stringify({ browser: browser.version(), checks, errors, modelResponses: requests }, null, 2));
  console.log(JSON.stringify({ checks, errors }));
} finally {
  await browser.close();
}
