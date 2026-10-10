import { defineConfig } from "tsup";

// รันจาก root ของ repo: `npm run core:build`
export default defineConfig({
  entry: { index: "packages/core/src/index.ts" },
  outDir: "packages/core/dist",
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  target: "node20",
  platform: "neutral",
  external: ["zod"],
  sourcemap: true,
  tsconfig: "packages/core/tsconfig.json",
});
