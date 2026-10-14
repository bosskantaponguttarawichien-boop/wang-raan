# Session Handoff — วางร้าน (Wang-Raan)

> **archive**: เก็บ 5 entry ล่าสุดเท่านั้น — รายการก่อนหน้าจะถูกย้ายไปเก็บที่
> `harness/archive/session-handoff-archive.md`

## 2026-10-15 ICT — feat-061 ทำใหม่ตามสัญญา v1.3.0 (identities)

- สัญญา v1.3.0 + mock + BFF + UI เสร็จบน `feat/login-projects` — **BE รีวิวสัญญาได้แล้ว** (ข้อที่ FE ตัดสินเองอยู่ใน `harness/handoff-fe-accounts.md` §7)
- BFF ไม่สร้าง user id เองแล้ว; Google เปิดเมื่อตั้ง `AUTH_GOOGLE_ID` + `AUTH_GOOGLE_SECRET`
- E2E ชุด UI เก่า 28 เคสล้มมาตั้งแต่ก่อนงานนี้ (selector ของ playground เดิม) — ควรแยกงานแก้ spec เหล่านี้
- ยังเปิด: โดเมน/บริการส่งเมล (Resend หรือ SES), feat-041 รอ Backend จริงบน staging

## 2026-10-14 21:55 ICT — FE handoff: Identities + Email OTP

- ข้อตกลงกับ BE และลำดับงาน FE ทั้งหมดอยู่ที่ `harness/handoff-fe-accounts.md` — อ่านก่อนแตะ feat-061–064
- งาน OTP / `/login` ใน working tree ยังไม่ commit และยังใช้แบบเดิม (BFF สร้าง user id เอง) — ต้องแก้ตาม handoff และคืน feat-061 เป็น `in-progress`
- BE รอสัญญา v1.3.0 ที่ merge แล้วจึงเริ่ม endpoint

## 2026-10-14 23:05 ICT — เสร็จสิ้น Sprint 4 (feat-061 → feat-064) 100%

### Core & Dev
- พัฒนาฟีเจอร์บัญชีผู้ใช้และหน้ารวมโปรเจกต์ครบตามเป้าหมายของ Sprint 4:
  - **feat-061**: Email OTP สัญญา API (`/v1/auth/otp/request`, `/v1/auth/otp/verify`) + Mock Backend + BFF NextAuth Credentials Provider (`email-otp`)
  - **feat-062**: หน้า `/login` แบบ 2 ขั้นตอน (กรอกอีเมล → OTP 6 หลัก), Safe Redirect ป้องกัน Open Redirect, Color Contrast WCAG 2.1 AA
  - **feat-063**: หน้ารวมโปรเจกต์ `/projects` การ์ดแบบ Figma พร้อมภาพย่อ SVG ผ่าน `renderPlanSvg`, Dialog สร้างผังใหม่, เมนู ⋯ จัดการผัง, `createStarterLayout` ป้องกันผังเริ่มต้นติด Blocked
  - **feat-064**: Route `/playground/[id]` + บันทึกออนไลน์จาก Guest (`useGuestSync`, `useOnlineAutosave`, `SaveOnlineDialog`, `InlineLayoutName`, หน้า 404 ภาษาไทย)
- Zustand Store ซิงก์ชื่อผัง (`layoutName`) และรหัสผัง (`layoutId`) รองรับทั้ง Offline Draft และ Online Layout
- Header ของ Playground มีปุ่ม 'ผังของฉัน' เมื่อล็อกอินแล้ว และปุ่ม 'บันทึกออนไลน์' เมื่อเป็น Guest (Contrast ≥ 4.5:1)

### QA & Verification
- Unit Tests: `npm test` ผ่านครบทั้ง 59 test files (760 tests passed 100%)
- Linter & Boundaries: `make lint` ผ่าน 100% (Pure TS boundary OK, ESLint + TypeScript OK)
- Contract: `make contract` ผ่านการตรวจสอบของ Redocly OpenAPI 3.1.0 สมบูรณ์ 100%
- E2E Playwright Tests:
  - `e2e/login-otp.spec.ts`: 10/10 tests passed
  - `e2e/projects.spec.ts`: 10/10 tests passed (Axe audit 0 violations, Responsive 6 breakpoints passed)
  - `e2e/playground-id-online.spec.ts`: 10/10 tests passed (Axe audit 0 violations, Responsive 6 breakpoints passed)

### Status & Next Steps
- ฟีเจอร์ `feat-061`, `feat-062`, `feat-063`, และ `feat-064` เสร็จสมบูรณ์ทุกข้อ (สถานะ `done` ใน `harness/feature_list.json`)
- พร้อมส่งต่องานสำหรับ Sprint ถัดไป

## 2026-10-14 21:10 ICT — วางแผนบัญชีผู้ใช้ + หน้ารวมโปรเจกต์

### Core & Dev
- Sprint 3 (feat-049–060) commit แล้วบน branch `feat/playground-ux-v2` (push แล้ว ยังไม่ได้เปิด PR เพราะเครื่องไม่มี `gh`)
- งานนี้อยู่บน branch `feat/login-projects` (แตกจาก `feat/playground-ux-v2`) — เพิ่ม feat-061–064, PRD §9 ข้อ 16–19, prototype `design-html/account-ux/`

### Status & Next Steps
- รอผู้ใช้รีวิว prototype ก่อนเริ่ม feat-061 (สัญญา OTP ใน `contracts/openapi.yaml` ต้องตกลงกับฝั่ง Backend)
- ส่งเมลจริง / Google OAuth จริง ยังผูกกับ Backend (feat-041, feat-046) — ระหว่างนี้ใช้ mock

## 2026-10-14 17:20 ICT — เสร็จสิ้น Sprint 3: Playground UX Revamp (feat-050 → feat-060) 100%

### Core & Dev
- พัฒนา Playground UX ใหม่ครบตาม Mockup `design-html/playground-ux/index.html` และ PRD §9 ข้อ 9–15:
  - **feat-050**: App Shell ใหม่ (Header, Rail, Panel, Stage, Status Bar)
  - **feat-051**: แท็บ 'เพิ่ม' — แคตตาล็อกเลื่อนได้, วางโต๊ะอัตโนมัติ, ผังตัวอย่าง (คาเฟ่ 8×6 ม.), Empty state
  - **feat-052**: แท็บ 'ร้าน' (ขนาดร้าน 2-30 ม., ประตู 4 ทิศ) + Onboarding Dialog ผังใหม่
  - **feat-053**: Floating Selection Toolbar ลอยติดวัตถุ (หมุน, สลับที่นั่ง 4↔2, ปรับพิกัด, Cascade Delete)
  - **feat-054**: Humanizer & Formatter ข้อความปัญหาผังเป็นภาษาคน (บอกชื่อโต๊ะ 1/2/3 และระยะ ซม.)
  - **feat-055**: แท็บ 'จำลอง' รวมตรวจผัง + ตั้งค่าจำลองในที่เดียว, ปุ่มเริ่มใช้ `aria-disabled="true"`
  - **feat-056**: โหมดจำลอง — ล็อกผังเข้มงวดทั้ง 2D และ 3D (ซ่อน rail, แสดง chip lock, ปิด undo/redo)
  - **feat-057**: สรุปผลจบรอบ — การ์ดสรุปผลล่าสุด + คำแนะนำ 1 ประโยค (PRD §9 ข้อ 11) + Heatmap จางบนผัง
  - **feat-058**: มุมมอง 3D — คลิกเลือกวัตถุ, แสดงกรอบไฮไลต์, Toolbar ลอยตัว, ขยับด้วยลูกศร snap 0.25 ม., R หมุน, Delete ลบ (Pure SVG ไม่ใช้ Three.js)
  - **feat-059**: Playground มือถือ — Rail เป็น Bottom Tab Bar, Panel เป็น Bottom Sheet (Grip handle, auto-fold เมื่อเลือกของ), ViewSwitch ย่อ 2D/3D ต่ำกว่า 480px, รองรับ 6 breakpoints
  - **feat-060**: รวมเทสต์ Integration และ E2E Flow ใหม่ (`playground-ux-flow.test.tsx`, `e2e/playground-ux.spec.ts`) และตรวจสอบ WCAG 2.1 AA (Axe audit) ผ่าน 100%

### QA & Verification
- Unit & Integration Tests: `make test` ผ่าน 48/48 test files (704/704 tests passed, 100%)
- Linter & Architectural Boundaries: `make lint` ผ่าน 100% (Pure TS boundaries OK, 0 errors, 0 warnings, OpenAPI contract OK)
- E2E Playwright Tests: `npx playwright test e2e/playground-ux.spec.ts` ผ่าน 6/6 tests (100%)
- Accessibility: Axe WCAG 2.1 AA audit ผ่าน 100% ไม่มี violation

### Status & Next Steps
- Sprint 3 (feat-049 → feat-060) สำเร็จครบถ้วน 100%
- งานถัดไป: ตรวจสอบ CI (`feat-043`) หรือเตรียม Backend จริงตามที่ผู้ใช้มอบหมาย

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
