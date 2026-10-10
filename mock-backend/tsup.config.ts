import { defineConfig } from "tsup";

// รันจาก root ของ repo: `npm run mock:build` — รวมเป็นไฟล์เดียว (alias "@/..." ตาม tsconfig ของ root)
export default defineConfig({
  entry: { server: "mock-backend/server.ts" },
  outDir: "mock-backend/dist",
  format: ["esm"],
  outExtension: () => ({ js: ".mjs" }),
  platform: "node",
  target: "node20",
  clean: true,
  noExternal: [/.*/],
  // server-only ไม่มีความหมายนอก Next.js (และโยน error ถ้าโหลดตรง ๆ)
  esbuildOptions(options) {
    options.alias = { ...options.alias, "server-only": "./src/test/empty-module.ts" };
  },
});
