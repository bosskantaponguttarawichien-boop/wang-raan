import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// Reusable before/after evidence capture. Uses a fresh browser profile, not the user's session.
const output = resolve(process.argv[2] ?? "harness/evidence/feat-101/browser-before");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [], warnings = [], assets = [];
page.on("pageerror", error => errors.push(error.message));
page.on("console", message => {
  if (message.type() === "error") errors.push(message.text());
  if (message.type() === "warning") warnings.push(message.text());
});
page.on("response", response => {
  if (response.url().includes("/assets/models/")) assets.push({ url: response.url(), status: response.status() });
});
try {
  await page.goto("http://localhost:3000/playground");
  await page.locator("#rail").waitFor();
  await page.getByRole("button", { name: "ใช้ผังตัวอย่าง (คาเฟ่ 8×6 ม.)" }).click();
  await page.getByRole("button", { name: "ดูตัวอย่าง 3D" }).click();
  await page.getByTestId("three-canvas").waitFor();
  await page.waitForFunction(() => document.querySelector('[data-testid="three-canvas"]')?.width > 0);
  await page.screenshot({ path: resolve(output, "playground.png") });
  const canvas = page.getByTestId("three-canvas");
  await canvas.screenshot({ path: resolve(output, "playground-canvas.png") });
  const renderer = await canvas.evaluate(element => {
    const gl = element.getContext("webgl2");
    const extension = gl?.getExtension("WEBGL_debug_renderer_info");
    return { vendor: extension && gl.getParameter(extension.UNMASKED_VENDOR_WEBGL), renderer: extension && gl.getParameter(extension.UNMASKED_RENDERER_WEBGL), width: element.width, height: element.height };
  });
  await page.goto("http://localhost:3000/character-lab");
  await page.locator("canvas").waitFor();
  await page.getByRole("button", { name: "นั่งบนเก้าอี้", exact: true }).waitFor();
  // Wait for the actual customer asset and a painted frame, not just the canvas shell.
  await page.waitForFunction(() => document.querySelector("canvas")?.width > 0);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: resolve(output, "character-lab.png") });
  await page.getByRole("button", { name: "พนักงาน", exact: true }).click();
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "นั่งบนเก้าอี้", exact: true }).click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: resolve(output, "staff-seated.png") });
  await writeFile(resolve(output, "report.json"), JSON.stringify({ browser: browser.version(), renderer, errors, warnings: [...new Set(warnings)], assets }, null, 2));
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(JSON.stringify({ output, browser: browser.version(), renderer, errors: errors.length, modelResponses: assets.length }));
} finally {
  await browser.close();
}
