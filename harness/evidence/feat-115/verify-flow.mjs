import { chromium, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [], checks = [];
page.on("pageerror", error => errors.push(error.message));
page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
await page.addInitScript(() => {
  window.__ticks = [];
  const NativeWorker = window.Worker;
  window.Worker = class extends NativeWorker {
    constructor(...args) {
      super(...args);
      this.addEventListener("message", ({ data }) => {
        if (data.type === "TICK") {
          window.__ticks.push({ at: performance.now(), time: data.metrics.time, sequence: data.sequence, runId: data.runId,
            customers: data.presentation?.customers.length, version: data.presentation?.version });
          if (window.__ticks.length > 1000) window.__ticks.shift();
        }
      });
    }
  };
  window.__hidden = false;
  Object.defineProperty(document, "hidden", { get: () => window.__hidden });
});
try {
  await page.goto("http://localhost:3000/playground");
  await page.getByRole("button", { name: "ใช้ผังตัวอย่าง (คาเฟ่ 8×6 ม.)" }).click();
  await page.locator("#rail [data-tab=check]").click();
  await page.getByRole("button", { name: "จำลองร้าน 1 วัน", exact: true }).click();
  await expect(page.getByTestId("stop-simulation")).toBeVisible({ timeout: 60000 });
  await page.waitForFunction(() => window.__ticks.length > 5);
  const first = await page.evaluate(() => window.__ticks.at(-1));
  await page.waitForTimeout(30_000);
  const last = await page.evaluate(() => window.__ticks.at(-1));
  const wallSeconds = (last.at - first.at) / 1000;
  const simulationSeconds = last.time - first.time;
  expect(Math.abs(simulationSeconds - wallSeconds)).toBeLessThan(0.75);
  expect(last.version).toBe(1);
  checks.push("real Worker 1× tracks 30 real seconds within 0.75s; metadata v1 reaches browser");
  await page.getByRole("button", { name: "ดูตัวอย่าง 3D" }).click();
  await expect(page.getByTestId("three-canvas")).toBeVisible();
  await page.waitForTimeout(1000);
  await page.evaluate(() => { window.__hidden = true; document.dispatchEvent(new Event("visibilitychange")); });
  await expect(page.getByRole("button", { name: /เล่นต่อ/ })).toBeVisible();
  const paused = await page.evaluate(() => window.__ticks.at(-1).time);
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.__ticks.at(-1).time)).toBe(paused);
  await page.evaluate(() => { window.__hidden = false; document.dispatchEvent(new Event("visibilitychange")); });
  await expect(page.getByRole("button", { name: /หยุดชั่วคราว/ })).toBeVisible();
  await page.waitForTimeout(1000);
  const resumed = await page.evaluate(() => window.__ticks.at(-1).time);
  expect(resumed - paused).toBeGreaterThan(0.5);
  expect(resumed - paused).toBeLessThan(1.5);
  checks.push("injected document visibility events pause/resume real Worker without accumulating hidden time");
  await page.getByRole("button", { name: /หยุดชั่วคราว/ }).click();
  await page.screenshot({ path: "harness/evidence/feat-115/simulation-paused.png" });
  await page.getByRole("button", { name: /เล่นต่อ/ }).click();
  await page.getByTestId("stop-simulation").click();
  checks.push("3D START/PAUSE/RESUME/STOP works");
  expect(errors).toEqual([]);
  await writeFile("harness/evidence/feat-115/browser-report.json", JSON.stringify({ browser: browser.version(), wallSeconds, simulationSeconds, pausedTime: paused, resumedTime: resumed, checks, errors }, null, 2) + "\n");
  console.log(JSON.stringify({ wallSeconds, simulationSeconds, checks, errors }));
} finally { await browser.close(); }
