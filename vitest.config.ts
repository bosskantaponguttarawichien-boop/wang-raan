import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // server-only โยน error นอก React Server environment — ในเทสต์ให้เป็นโมดูลว่าง
      "server-only": fileURLToPath(new URL("./src/test/empty-module.ts", import.meta.url)),
    },
  },
  test: {
    // src/core รันใน node (ยืนยันว่าไม่พึ่ง DOM) ส่วน component ใช้ jsdom
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}", "app/**/*.test.{ts,tsx}", "contracts/**/*.test.ts", "packages/*/test/**/*.test.ts", "mock-backend/**/*.test.ts"],
    setupFiles: ["./src/test/setup.ts"],
    coverage: {
      provider: "v8",
      // feat-010: Core domain + Validation ต้องครอบคลุม > 95%
      include: ["src/core/**/*.ts"],
      exclude: ["src/core/**/*.test.ts", "src/core/**/index.ts", "src/core/**/types.ts"],
      reporter: ["text", "html", "json-summary"],
      thresholds: { statements: 95, branches: 95, functions: 95, lines: 95 },
    },
  },
});
