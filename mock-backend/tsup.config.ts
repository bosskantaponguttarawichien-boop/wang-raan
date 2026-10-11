import { defineConfig } from "tsup";

// รันจาก root ของ repo: `npm run mock:build` — รวมเป็นไฟล์เดียว (alias "@/..." ตาม tsconfig ของ root)
export default defineConfig([
  {
    entry: { server: "mock-backend/server.ts" },
    outDir: "mock-backend/dist",
    format: ["esm"],
    outExtension: () => ({ js: ".mjs" }),
    platform: "node",
    target: "node20",
    // ไม่ใช้ clean: tsup build 2 ชุดพร้อมกัน — clean ของชุดหนึ่งลบไฟล์ของอีกชุดได้
    noExternal: [/.*/],
    // server-only ไม่มีความหมายนอก Next.js (และโยน error ถ้าโหลดตรง ๆ)
    esbuildOptions(options) {
      options.alias = { ...options.alias, "server-only": "./src/test/empty-module.ts" };
    },
  },
  {
    // proxy สำหรับ E2E กับ Backend จริง — pg โหลดจาก node_modules (มี require แบบเลือกได้ที่ bundle ไม่ได้)
    entry: { "fault-proxy": "mock-backend/fault-proxy-server.ts" },
    outDir: "mock-backend/dist",
    format: ["esm"],
    outExtension: () => ({ js: ".mjs" }),
    platform: "node",
    target: "node20",
    external: ["pg"],
  },
]);
