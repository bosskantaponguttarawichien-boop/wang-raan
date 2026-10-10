# @bosskantaponguttarawichien-boop/wang-raan-core

กฎผังร้านของ **วางร้าน** ชุดเดียวกับที่หน้าเว็บใช้ — สำหรับ Backend (TypeScript) ตรวจผังซ้ำก่อนบันทึก
Pure TypeScript ไม่พึ่ง React / DOM รันได้บน Node ≥ 20, Cloudflare Workers และ Web Worker

## ติดตั้ง (ฝั่ง Backend)

package อยู่บน GitHub Packages แบบส่วนตัว ต้องมี token ที่อ่าน package ได้

1. สร้าง token: GitHub → Settings → Developer settings → Personal access tokens (classic) → เลือกสิทธิ์ `read:packages`
2. ใน repo Backend สร้างไฟล์ `.npmrc` (commit ได้ เพราะไม่มี token อยู่ในไฟล์):

   ```
   @bosskantaponguttarawichien-boop:registry=https://npm.pkg.github.com
   //npm.pkg.github.com/:_authToken=${GITHUB_PACKAGES_TOKEN}
   ```

3. ตั้ง env แล้วติดตั้ง (`zod` เป็น peer dependency ต้องติดตั้งเอง):

   ```bash
   export GITHUB_PACKAGES_TOKEN=ghp_xxx
   npm install @bosskantaponguttarawichien-boop/wang-raan-core zod@^3.25
   ```

**CI / Railway ของ Backend:** ตั้ง `GITHUB_PACKAGES_TOKEN` เป็น secret
ถ้า build ด้วย GitHub Actions ใน repo Backend ให้เพิ่ม repo นั้นที่หน้า package → Package settings → Manage Actions access แล้วใช้ `GITHUB_TOKEN` แทนได้

## ใช้งาน

```ts
import { SaveLayoutRequestSchema, validateLayout } from "@bosskantaponguttarawichien-boop/wang-raan-core";

const parsed = SaveLayoutRequestSchema.safeParse(body);       // ตรวจโครงสร้าง (รวมกฎ id ซ้ำที่ JSON Schema ตรวจไม่ได้)
if (!parsed.success) return problem(400, "INVALID_LAYOUT_SCHEMA", parsed.error.issues);

const validation = validateLayout(parsed.data.layout);          // ผลตรวจ 4 ด้าน: Completeness, Collision, Clearance, Accessibility
if (validation.status === "blocked") return problem(422, "LAYOUT_BLOCKED", { validation });

await db.saveLayout(ownerId, parsed.data.layout, validation);
```

สิ่งที่ export (ดู type ทั้งหมดใน `dist/index.d.ts`):

| กลุ่ม | ตัวอย่าง |
|---|---|
| Zod schemas | `StoreLayoutSchema`, `SaveLayoutRequestSchema`, `ValidationResultSchema`, `P1LayoutContractSchema`, `ContactSchema` |
| Validation | `validateLayout`, `canStartSimulation`, `computeLayoutRevision`, `issueCode` |
| Types | `StoreLayout`, `LayoutObject`, `ValidationResult`, `ValidationIssue`, `Entrance` |
| ค่าคงที่ | `GRID_STEP` (0.25), `ROOM_MIN`/`ROOM_MAX` (2–30), `CLEARANCE` (1.20 / 0.90 / 0.60 / 0.10) |
| Geometry / Table set | `footprint`, `snapToGrid`, `addTableSet`, `deleteObject`, `checkTableSetIntegrity` |

สัญญา API ระหว่าง BFF กับ Backend: `contracts/README.md` ใน repo หน้าเว็บ

## สำหรับคนดูแล package (repo หน้าเว็บ)

- โค้ดจริงอยู่ที่ `src/core/` — package แค่ re-export (`packages/core/src/index.ts`) ไม่มีโค้ดซ้ำ
- `npm run core:build` — build ไป `packages/core/dist`
- `npm run core:smoke` — build + `npm pack` + ติดตั้งในโปรเจกต์เปล่า แล้วเทียบผลกับ `test/fixtures/expected.json` (ESM, CJS และ type)
- กฎเปลี่ยนแล้ว fixture ไม่ตรง → ตรวจว่าตั้งใจ แล้ว `UPDATE_CORE_FIXTURES=1 npx vitest run packages/core`
- ปล่อยเวอร์ชันใหม่: แก้ `version` + `CHANGELOG.md` → merge → push tag `core-v<version>` (workflow `.github/workflows/publish-core.yml` เผยแพร่ให้)

### เลขเวอร์ชัน

| เปลี่ยนอะไร | เลขที่ขยับ |
|---|---|
| แก้บั๊กที่ไม่เปลี่ยนผลตรวจของผังที่ถูกต้อง | patch (1.0.**1**) |
| เพิ่ม export / ฟิลด์ที่ไม่บังคับ | minor (1.**1**.0) |
| กฎตรวจเปลี่ยนจนผังเดิมได้ผลต่างจากเดิม, schema เข้มขึ้น, ลบ/เปลี่ยน export | major (**2**.0.0) — แจ้งฝั่ง Backend ก่อน |
