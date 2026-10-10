import { existsSync } from "node:fs";
import { defineConfig, devices, type Project } from "@playwright/test";

/**
 * E2E / Responsive / Accessibility (architecture.md §8.2)
 * ไม่ดาวน์โหลดเบราว์เซอร์เอง: ใช้ Chromium ที่ติดตั้งไว้ (CHROMIUM_PATH หรือ /opt/pw-browsers/chromium)
 * ถ้าไม่มีจึงใช้ Google Chrome ในเครื่อง (channel: "chrome")
 * WebKit: เปิดด้วย E2E_WEBKIT=1 (ต้องติดตั้งด้วย `npx playwright install webkit` ก่อน)
 * ทดสอบกับ production build (next start) เพื่อให้ตรงกับของจริง
 * BFF ต่อ Backend จำลอง (mock-backend/server, port 4010) ผ่าน HTTP จริง — ตั้ง WANGRAAN_BACKEND_URL ให้แอป
 * E2E_TARGET=cloudflare: รันแอปบน workerd (runtime ของ Cloudflare Workers) ผ่าน `wrangler dev` แทน next start (feat-035)
 */
const PORT = 3210;
export const MOCK_BACKEND_PORT = 4010;
const INTERNAL_TOKEN_SECRET = process.env.INTERNAL_TOKEN_SECRET ?? "e2e-only-internal-secret-not-for-production";
const CLOUDFLARE = process.env.E2E_TARGET === "cloudflare";
const BASE_URL = CLOUDFLARE ? `http://127.0.0.1:${PORT}` : `http://localhost:${PORT}`;
const APP_ENV = {
  // Auth.js ต้องมี secret ใน production build — ค่านี้ใช้เฉพาะการทดสอบ
  AUTH_SECRET: process.env.AUTH_SECRET ?? "e2e-only-secret-not-for-production-0123456789",
  AUTH_TRUST_HOST: "true",
  WANGRAAN_BACKEND_URL: `http://127.0.0.1:${MOCK_BACKEND_PORT}`,
  INTERNAL_TOKEN_SECRET,
  // production build สร้าง URL ของ OG image จาก SITE_URL เท่านั้น (ไม่เชื่อ Host header)
  SITE_URL: BASE_URL,
};
const appServer = CLOUDFLARE
  ? {
      // env ของ worker ส่งด้วย --var (เทียบเท่า vars/secret ตอน deploy)
      command: `npm run cf:build && npx wrangler dev --env local --port ${PORT} --ip 127.0.0.1 ${Object.entries(APP_ENV)
        .map(([k, v]) => `--var ${k}:${v}`)
        .join(" ")}`,
      url: BASE_URL,
      env: { WRANGLER_SEND_METRICS: "false" },
    }
  : { command: `npm run build && npm run start -- -p ${PORT}`, url: BASE_URL, env: APP_ENV };
const chromiumPath = process.env.CHROMIUM_PATH ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const chromium = chromiumPath ? { launchOptions: { executablePath: chromiumPath } } : { channel: "chrome" };

const projects: Project[] = [{ name: "chromium", use: { ...devices["Desktop Chrome"], ...chromium } }];
if (process.env.E2E_WEBKIT) projects.push({ name: "webkit", use: { ...devices["Desktop Safari"] } });

export default defineConfig({
  testDir: "e2e",
  outputDir: "e2e/.results",
  fullyParallel: true,
  // wrangler dev = workerd ตัวเดียวในโหมด dev: worker ขนานมากเกินจะทำให้คำขอช้าจนเทสต์ล้มแบบสุ่ม (ไม่ใช่ข้อจำกัดของ Workers จริง)
  workers: CLOUDFLARE ? 2 : undefined,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { outputFolder: "e2e/.report", open: "never" }]],
  use: {
    baseURL: BASE_URL,
    locale: "th-TH",
    trace: "retain-on-failure",
  },
  projects,
  webServer: [
    {
      command: "npm run mock:build && npm run mock:start",
      url: `http://localhost:${MOCK_BACKEND_PORT}/health`,
      reuseExistingServer: !process.env.CI,
      env: { INTERNAL_TOKEN_SECRET, MOCK_BACKEND_PORT: String(MOCK_BACKEND_PORT) },
      timeout: 60_000,
    },
    { ...appServer, reuseExistingServer: !process.env.CI, timeout: 300_000 },
  ],
});
