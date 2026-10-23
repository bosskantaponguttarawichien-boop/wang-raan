import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  { ignores: [".next/**", ".claude/**", "node_modules/**", "design-html/**", "coverage/**", "next-env.d.ts", "packages/*/dist/**", "mock-backend/dist/**", ".open-next/**", ".wrangler/**", "e2e/.report/**", "playwright-report/**", "test-results/**"] },
  ...nextVitals,
  ...nextTypescript,
  {
    // Boundary: src/core ต้องเป็น Pure TypeScript (architecture.md §5, AGENTS.md)
    files: ["src/core/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["react", "react-dom", "react/*", "react-dom/*"], message: "src/core ห้าม import React" },
            { group: ["next", "next/*"], message: "src/core ห้าม import Next.js" },
            { group: ["zustand", "zustand/*"], message: "src/core ห้าม import Zustand" },
            { group: ["@radix-ui/*"], message: "src/core ห้าม import UI library" },
            { group: ["@/components/*", "@/store/*"], message: "src/core ห้ามพึ่ง UI/Store layer" },
          ],
        },
      ],
      "no-restricted-globals": ["error", "window", "document", "localStorage", "navigator"],
    },
  },
];

export default eslintConfig;
