# Session Handoff — วางร้าน (Wang-Raan)

> **archive**: เก็บ 5 entry ล่าสุดเท่านั้น — รายการก่อนหน้าจะถูกย้ายไปเก็บที่
> `harness/archive/session-handoff-archive.md`

## 2026-10-12 12:40 ICT — ต่อ FE กับ `/v1/me`

### Core & Dev
- บัญชีผู้ใช้: BFF `/api/me` + `/api/me/export` → Backend `/v1/me*`; ซิงก์โปรไฟล์และย้ายผัง Guest ตอนล็อกอินอยู่ใน `src/server/account-sync.ts` (เรียกจาก jwt callback ใน `auth.ts`)
- UI ส่วน "บัญชีของฉัน" อยู่ท้าย cloud panel (`account-panel.tsx`)

### QA
- unit 642, lint ผ่าน, E2E 50/50 (5 ไฟล์ที่เกี่ยวข้อง)

### Active Blockers / Open Questions
- feat-041/042 ยัง blocked ตามสถานะเดิม — งานนี้ทำเฉพาะส่วนที่ผู้ใช้ขอ (ดู progress.md สำหรับสิ่งที่ยังขาด)

## 2026-10-10 20:30 ICT — Refactor รวมโค้ดซ้ำ (ยังไม่ commit)

### Core & Dev
- helper HTTP ของ BFF อยู่ที่ `src/server/http.ts` (เดิมอยู่ใน layout-handlers) — endpoint ที่ต้องล็อกอินใช้ `withUser(resolveUser, (user, request, ...args) => …)`
- จัดรูปแบบวันที่/ตัวเลขไทยใช้ `src/lib/format.ts`; error ของ API ใช้ `apiErrorText()`; UI แจ้ง error ใช้ `ErrorText` / `LoadError` จาก `@/components/ui`
- เรียก action ของ store นอก render ใช้ `layoutActions()`

### QA
- unit 623, lint + contract + build + core:smoke ผ่าน; E2E ผ่านทั้งหมดยกเว้นเคส flaky ใน `e2e/account-share-contact.spec.ts` (เป็นมาก่อน refactor, ผ่าน 8/8 เมื่อ `--workers=1`)

### Active Blockers / Open Questions
- E2E `account-share-contact.spec.ts` ล้มแบบสุ่มเมื่อรันขนาน 4 workers ในเครื่องนี้ (โค้ดก่อน refactor ก็ล้ม) — ควรหาสาเหตุแยกต่างหาก

### Next Steps
1. ผู้ใช้รีวิว diff แล้วตัดสินใจ commit
2. ตามเดิม: CI รันจริง → ปิด feat-043; รอ Backend จริง → ปลดพัก feat-041 → feat-048

## 2026-10-10 18:00 ICT — feat-035 เสร็จ, feat-043 รอรันบน GitHub

### Core & Dev
- **feat-041 → feat-048 (ยกเว้น 043) = blocked** — ผู้ใช้สั่งพักจนกว่า Backend จริงจะขึ้น ห้ามเริ่มจนกว่าผู้ใช้บอก
- Cloudflare: `npm run cf:build` (OpenNext) → `npm run cf:preview` (wrangler dev env local); config อยู่ `wrangler.jsonc` + `open-next.config.ts`
- E2E บน runtime ของ Workers: `make e2e-cf` (Playwright ส่ง env ให้ worker ด้วย `--var`, baseURL 127.0.0.1:3210)
- หน้าแชร์ใช้ `SITE_URL` (ถ้ามี) สร้าง URL ของ OG image — ต้องตั้งตอน deploy
- CI: `.github/workflows/ci.yml` — แก้คำสั่งใน Makefile แล้ว CI ใช้ตามอัตโนมัติ
- (19:30 แก้ตาม review) โควตาอยู่ `src/server/limits.ts`; production ต้องตั้ง `SITE_URL`; E2E โหมด Cloudflare ใช้ 2 workers (wrangler dev รับขนานมากไม่ไหว)

### QA
- unit 619, lint ผ่าน, e2e 98/98 ทั้งโหมด Node และ Cloudflare (Chromium + WebKit)

### Active Blockers / Open Questions
- feat-043 ปิดได้เมื่อ: push ขึ้น GitHub ให้ CI รันจริง + ผู้ใช้ตั้ง branch protection (repo ส่วนตัวต้องมี GitHub Pro)
- ยังไม่ได้ commit งาน Sprint 2 ทั้งหมด และยังไม่ได้ publish package core
- สิ่งที่ต้องทดสอบบน Cloudflare จริงตอน feat-044: CPU time, CF-Connecting-IP, secret, R2 cache

### Next Steps
1. ผู้ใช้ตัดสินใจ commit/push → CI รันจริง → ปิด feat-043
2. รอ Backend จริงขึ้น staging → ปลดพัก feat-041 → feat-048

## 2026-10-10 16:30 ICT — feat-038 → feat-040 เสร็จ

### Core & Dev
- BFF ไม่เก็บข้อมูลเองแล้ว: ทุกอย่างไป Backend ตาม `contracts/openapi.yaml` (1.1.0)
  - dev (`npm run dev`) ไม่ตั้ง env = Backend จำลองในตัว (ข้อมูลหายเมื่อรีสตาร์ต dev server)
  - production ไม่ตั้ง `WANGRAAN_BACKEND_URL` + `INTERNAL_TOKEN_SECRET` = API ตอบ 503 (ตั้งใจ)
- Backend จำลอง: `mock-backend/handler.ts` — แก้สัญญาแล้วต้องแก้ mock ให้ตรง (เทสต์ `mock-backend/handler.test.ts` ฟ้อง)
- เทสต์ฝั่ง BFF: ใช้ `testBackend()` จาก `src/test/backend.ts` และ `afterEach(() => expect(backend.violations).toEqual([]))`
- E2E: Playwright เปิด mock ที่ port 4010 เอง; สั่ง mock ได้ด้วย `mockControl()` ใน `e2e/helpers.ts` — ห้ามสั่ง outage แบบทั้งระบบใน E2E (รันขนาน) ใช้ `{ subject }`
- ลิงก์แชร์: UI อยู่ `src/components/editor/share-links.tsx`; หน้า `/share/[key]` แสดงหน้าแจ้งเมื่อยกเลิก/หมดอายุ

### QA
- unit 619, E2E 98/98 (Chromium + WebKit), lint + contract ผ่าน

### Active Blockers / Open Questions
- `clientIp()` ยังอ่าน X-Forwarded-For + `TRUSTED_PROXY_HOPS` — บน Cloudflare ควรใช้ `CF-Connecting-IP` (ทำใน feat-044)
- ยังไม่ได้ publish package core (`core-v1.0.0`) และยังไม่ได้ commit งาน Sprint 2
- ยังไม่ตัดสินใจ: คง Guest ไว้ไหม (feat-041), ชื่อโดเมน (feat-044), ช่องทางแจ้งเตือน (feat-045)

### Next Steps
- feat-041 → feat-048 = `blocked` (ผู้ใช้สั่งพักจนกว่า Backend จริงจะขึ้น) — ห้ามเริ่มจนกว่าผู้ใช้บอก
1. feat-035 ลองรันบน Cloudflare
2. feat-043 CI

## 2026-10-10 14:30 ICT — feat-036 ปิด, feat-037 เสร็จ

### Core & Dev
- package กฎผังสำหรับ Backend: `@bosskantaponguttarawichien-boop/wang-raan-core` อยู่ที่ `packages/core` (คู่มือติดตั้ง: `packages/core/README.md`)
- โค้ดจริงยังอยู่ `src/core` — แก้ที่นั่นที่เดียว แล้ว `npm run core:smoke` ต้องผ่าน
- ห้ามใช้ DOM API ใน `src/core` — นอกจาก boundary check แล้ว build package จะ fail ด้วย (lib ไม่มี dom)
- แก้กฎจนผลตรวจเปลี่ยน → `packages/core/test/fixtures.test.ts` fail → ตรวจว่าตั้งใจ แล้ว `UPDATE_CORE_FIXTURES=1 npx vitest run packages/core` + ขยับเวอร์ชัน major + CHANGELOG
- ปล่อยเวอร์ชัน: push tag `core-v<version>` (ต้องตรงกับ version ใน `packages/core/package.json`)

### QA
- unit 571, lint + contract ผ่าน, core:smoke ผ่าน

### Active Blockers / Open Questions
- ยังไม่ได้ publish package จริง — ต้อง commit + push แล้ว push tag `core-v1.0.0` (ผู้ใช้สั่ง)
- Backend ต้องมี token `read:packages` (หรือเพิ่ม repo Backend ใน Manage Actions access ของ package)
- ยังไม่ตัดสินใจ: คง Guest ไว้ไหม (feat-041), ชื่อโดเมน (feat-044), ช่องทางแจ้งเตือน (feat-045)

### Next Steps
1. feat-038 Backend จำลองตามสัญญา
2. feat-035 ลองรันบน Cloudflare
3. feat-039 ต่อ BFF กับ Backend ตามสัญญา

