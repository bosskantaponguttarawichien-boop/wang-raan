import { existsSync } from "node:fs";
import { defineConfig, devices, type Project } from "@playwright/test";

/**
 * E2E / Responsive / Accessibility (architecture.md §8.2)
 * ไม่ดาวน์โหลดเบราว์เซอร์เอง: ใช้ Chromium ที่ติดตั้งไว้ (CHROMIUM_PATH หรือ /opt/pw-browsers/chromium)
 * ถ้าไม่มีจึงใช้ Google Chrome ในเครื่อง (channel: "chrome")
 * WebKit: เปิดด้วย E2E_WEBKIT=1 (ต้องติดตั้งด้วย `npx playwright install webkit` ก่อน)
 * ทดสอบกับ production build (next start) เพื่อให้ตรงกับของจริง
 */
const PORT = 3210;
const chromiumPath = process.env.CHROMIUM_PATH ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const chromium = chromiumPath ? { launchOptions: { executablePath: chromiumPath } } : { channel: "chrome" };

const projects: Project[] = [{ name: "chromium", use: { ...devices["Desktop Chrome"], ...chromium } }];
if (process.env.E2E_WEBKIT) projects.push({ name: "webkit", use: { ...devices["Desktop Safari"] } });

export default defineConfig({
  testDir: "e2e",
  outputDir: "e2e/.results",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { outputFolder: "e2e/.report", open: "never" }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "th-TH",
    trace: "retain-on-failure",
  },
  projects,
  webServer: {
    command: `npm run build && npm run start -- -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    // Auth.js ต้องมี secret ใน production build — ค่านี้ใช้เฉพาะการทดสอบ
    env: { AUTH_SECRET: process.env.AUTH_SECRET ?? "e2e-only-secret-not-for-production-0123456789", AUTH_TRUST_HOST: "true" },
    timeout: 240_000,
  },
});
