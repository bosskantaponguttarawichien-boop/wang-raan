import { defineConfig, devices } from "@playwright/test";

/**
 * E2E / Responsive / Accessibility (architecture.md §8.2)
 * ใช้ Google Chrome ที่ติดตั้งในเครื่อง (channel: "chrome") จึงไม่ต้องดาวน์โหลดเบราว์เซอร์
 * ทดสอบกับ production build (next start) เพื่อให้ตรงกับของจริง
 */
const PORT = 3210;

export default defineConfig({
  testDir: "e2e",
  outputDir: "e2e/.results",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { outputFolder: "e2e/.report", open: "never" }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: "chrome",
    locale: "th-TH",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chrome", use: { ...devices["Desktop Chrome"], channel: "chrome" } }],
  webServer: {
    command: `npm run build && npm run start -- -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
