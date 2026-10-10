#!/usr/bin/env bash
# =============================================================================
# Smoke test ของ package core (feat-037)
# build → npm pack → ติดตั้ง tarball ในโปรเจกต์ Node เปล่า (นอก repo) → ตรวจทั้ง import (ESM) และ require (CJS)
# ว่า validateLayout() ให้ status / layoutRevision / issue ตรงกับ packages/core/test/fixtures/expected.json
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PKG="$ROOT/packages/core"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "=== 1. build ==="
(cd "$ROOT" && npm run --silent core:build >/dev/null)

echo "=== 2. npm pack ==="
TARBALL="$(cd "$PKG" && npm pack --silent --pack-destination "$WORK")"
FILES="$(tar -tzf "$WORK/$TARBALL" | sed 's#^package/##' | sort)"
echo "$FILES" | sed 's/^/   /'
UNEXPECTED="$(echo "$FILES" | grep -vE '^(package\.json|README\.md|CHANGELOG\.md|dist/index\.(js|cjs|d\.ts|d\.cts)(\.map)?)$' || true)"
if [ -n "$UNEXPECTED" ]; then
  echo "❌ tarball มีไฟล์ที่ไม่ควรเผยแพร่:"; echo "$UNEXPECTED"; exit 1
fi

echo "=== 3. ติดตั้งในโปรเจกต์เปล่า ==="
ZOD_VERSION="$(node -p "require('$ROOT/node_modules/zod/package.json').version")"
mkdir -p "$WORK/app"
cp "$PKG/test/fixtures/layouts.json" "$PKG/test/fixtures/expected.json" "$WORK/app/"
cd "$WORK/app"
npm init -y >/dev/null
npm install --silent --no-audit --no-fund "$WORK/$TARBALL" "zod@$ZOD_VERSION"
NAME="$(node -p "require('$PKG/package.json').name")"

cat > check.js <<JS
module.exports = function check(core, label) {
  const layouts = require("./layouts.json");
  const expected = require("./expected.json");
  for (const [name, layout] of Object.entries(layouts)) {
    const parsed = core.StoreLayoutSchema.parse(layout);
    const v = core.validateLayout(parsed);
    const got = { status: v.status, layoutRevision: v.layoutRevision, issueIds: v.issues.map((i) => i.id) };
    if (JSON.stringify(got) !== JSON.stringify(expected[name])) {
      console.error("❌", label, name, "\n  ได้:", got, "\n  คาด:", expected[name]);
      process.exit(1);
    }
    if (!core.ValidationResultSchema.safeParse(v).success) throw new Error(label + " ValidationResultSchema");
  }
  if (core.StoreLayoutSchema.safeParse({ ...layouts.ready, units: "cm" }).success) throw new Error(label + " ต้องปฏิเสธ units cm");
  if (!core.ContactSchema.safeParse({ name: "a", email: "a@b.co", message: "1234567890" }).success) throw new Error(label + " ContactSchema");
  if (core.CLEARANCE.mainAisle !== 1.2) throw new Error(label + " CLEARANCE");
  console.log("✅", label, "ผ่าน", Object.keys(layouts).join(", "));
};
JS
printf 'const check = require("./check.js");\ncheck(require("%s"), "require (CJS)");\n' "$NAME" > check.cjs
printf 'import { createRequire } from "node:module";\nimport * as core from "%s";\ncreateRequire(import.meta.url)("./check.js")(core, "import (ESM)");\n' "$NAME" > check.mjs

echo "=== 4. ตรวจผล ==="
node check.cjs
node check.mjs

echo "=== 5. type ของ package (TypeScript ฝั่ง Backend แบบ NodeNext) ==="
cat > tsconfig.json <<JSON
{ "compilerOptions": { "strict": true, "module": "NodeNext", "moduleResolution": "NodeNext", "target": "ES2022", "noEmit": true, "skipLibCheck": false, "types": [] }, "files": ["typed.mts"] }
JSON
cat > typed.mts <<TS
import { validateLayout, StoreLayoutSchema, type StoreLayout, type ValidationResult } from "$NAME";
const layout: StoreLayout = StoreLayoutSchema.parse({});
const result: ValidationResult = validateLayout(layout);
const status: "ready" | "warning" | "blocked" = result.status;
// @ts-expect-error ผลตรวจไม่มีสถานะอื่น
const wrong: "ok" = result.status;
export { status, wrong };
TS
"$ROOT/node_modules/.bin/tsc" -p tsconfig.json
echo "✅ type ถูกต้อง (import แบบ ESM + NodeNext)"
echo "=== Smoke test ผ่าน: $NAME@$(node -p "require('$PKG/package.json').version") ==="
