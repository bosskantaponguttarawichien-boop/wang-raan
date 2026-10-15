# Session Handoff Archive — วางร้าน (Wang-Raan)

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

## 2026-10-10 13:50 ICT — feat-036 สัญญา API เสร็จ รอผู้ใช้ review

### Core & Dev
- สัญญา BFF ↔ Backend: `contracts/openapi.yaml` + คู่มือ `contracts/README.md` (ส่งให้คนทำ Backend อ่านไฟล์นี้ก่อน)
- แก้สัญญา → `make contract` + `make test` (contract test เทียบกับ Zod) ต้องผ่าน และแจ้งฝั่ง Backend
- โค้ด BFF (`src/server/layout-repository.ts` แบบ remote) **ยังไม่ตรงสัญญา** — path ยังไม่มี `/v1` และส่ง `validation` ไปด้วย; แก้ใน feat-039 (รายละเอียดใน description ของ feat-039)

### QA
- unit 568 (contract 51), lint + contract lint ผ่าน

### Active Blockers / Open Questions
- feat-036 gate: ผู้ใช้ต้อง review สัญญาก่อนเปลี่ยนเป็น done
- ยังไม่ตัดสินใจ: คง Guest ไว้ไหม (feat-041), ชื่อโดเมน (feat-044), ช่องทางแจ้งเตือน (feat-045)

### Next Steps
1. ผู้ใช้ review `contracts/` → ปิด feat-036
2. feat-037 แยก core เป็น package
3. feat-038 Backend จำลองตามสัญญา

## 2026-10-10 13:10 ICT — Sprint 2 ด่าน 0 เสร็จ (feat-024, feat-034)

### Core & Dev
- ลบเก้าอี้: เลือกเก้าอี้แล้วลบ (Artboard หรือ Inspector) = ลบเฉพาะตัวนั้น; ลบทั้งชุดต้องเลือกโต๊ะ
- นิยามเส้นทาง (`ROUTE_REQUIREMENTS`) และ `DEFAULT_SIMULATION_CONFIG` ยืนยันแล้ว — แก้ต้องถามเจ้าของผลิตภัณฑ์ (PRD §9 ข้อ 7–8)
- ข้อความรองใช้ `--secondary` / `--secondary-strong` เท่านั้น — `--muted` ใช้กับเส้น/ไอคอน
- WebKit ติดตั้งแล้วในเครื่องนี้: `E2E_WEBKIT=1 make e2e`
- เทสต์ที่กด Tab บน WebKit ต้องใช้ `Alt+Tab` (Safari ค่าเริ่มต้น Tab ข้ามลิงก์/ปุ่ม); `page.pdf()` ใช้ได้เฉพาะ Chromium

### QA
- unit 517, E2E 94/94 (Chromium + WebKit), lint ผ่าน

### Active Blockers / Open Questions
- E2E fail แปลก ๆ เรื่อง CSS (คลาส Tailwind หาย) → `rm -rf .next` ก่อน — CI (feat-043) ควร build จากศูนย์เสมอ
- ยังไม่ตัดสินใจ: คง Guest ไว้ไหม (feat-041), ชื่อโดเมน (feat-044), ช่องทางแจ้งเตือน (feat-045)

### Next Steps
1. feat-036 สัญญา API (OpenAPI)
2. feat-037 แยก core เป็น package
3. feat-035 ลองรันบน Cloudflare

## 2026-10-10 07:00 ICT — วางแผน Sprint 2 (FE เท่านั้น)

### Core & Dev
- ตอนนี้เรียกรอบงานว่า **sprint**: Sprint 1 เสร็จ 33 งาน (รายละเอียดอยู่ใน `feature_list.archive.json`), Sprint 2 = feat-024 (ยกมา) + feat-034 → feat-048
- **อ่าน `harness/sprint-2.md` ก่อนเริ่มงาน Sprint 2** — มีเป้าหมาย สแตก ลำดับงาน และ Production Gate
- ขอบเขต: repo นี้ทำ FE + BFF เท่านั้น — Backend (TypeScript, Railway) และ Postgres ผู้ใช้สร้างใน repo แยก
- ทำ feat-036 (สัญญา OpenAPI) และ feat-037 (`@wang-raan/core` package) ก่อน เพราะฝั่ง BE ต้องใช้เริ่มงาน
- feat-035 (ลองรันบน Cloudflare) ต้องผ่านก่อนงาน deploy / auth บน Workers — ถ้าไม่ผ่านให้เสนอทางถอยเป็น Vercel

### QA
- validate_harness ผ่าน 49 งาน; ยังไม่มีการแก้โค้ดใน sprint นี้

### Active Blockers / Open Questions
- feat-034 ต้องการคำตัดสินจากผู้ใช้ 4 เรื่อง (ลบเก้าอี้, นิยามทางเดิน, ค่าลูกค้าจำลอง, `--muted`)
- ยังไม่ตัดสินใจ: คง Guest ไว้ไหม (feat-041), ชื่อโดเมน (feat-044), ช่องทางแจ้งเตือน (feat-045)
- ต้องใช้บัญชี Cloudflare (Workers Paid) และ GitHub Packages ก่อน feat-035 / feat-037 จะปิดได้ครบ
- feat-046 รอ Backend จริงขึ้น staging

### Next Steps
1. feat-036 สัญญา API (OpenAPI)
2. feat-037 แยก core เป็น package
3. feat-035 ลองรันบน Cloudflare

## 2026-10-10 05:00 ICT — feat-030 → feat-033 เสร็จ

### Core & Dev
- Editor มีแผง "บัญชีและผังออนไลน์": เข้าสู่ระบบแบบผู้ใช้ทั่วไป → บันทึก/เปิด/ลบผัง (React Query) → "แชร์ลิงก์" ได้ URL `/share/<key>` ที่เปิดได้โดยไม่ต้องล็อกอิน
- Landing: ฟอร์มติดต่อส่งได้จริง (`POST /api/contact`)
- env: ดู `.env.example` — production ต้องมี `AUTH_SECRET`; E2E ตั้งให้อัตโนมัติใน `playwright.config.ts`
- เทสต์ Route Handler ที่ต้องมี session: `sessionCookie(userId)` จาก `src/test/session.ts`

### QA
- unit 492, e2e 47 (Chromium), axe 0 violations

### Active Blockers / Open Questions
- ผัง / ลิงก์แชร์ / ตัวนับ rate limit / ข้อความติดต่อ อยู่ในหน่วยความจำ — หายเมื่อรีสตาร์ต และใช้ได้แค่ server เครื่องเดียว (รอ Backend จริง: ตั้ง `WANGRAAN_BACKEND_URL` + `INTERNAL_TOKEN_SECRET`)
- ยังไม่มี Identity Provider จริง — ใช้ Guest (บัญชีผูกกับ cookie; ลบ cookie = เสียสิทธิ์ผังเดิม) หรือ GitHub ถ้าตั้ง env
- Rate limit: ตั้ง `TRUSTED_PROXY_HOPS` ตามจำนวน proxy หน้าเว็บ (Vercel/Nginx = 1) เพื่อแยก IP จริง; ถ้าไม่มี proxy ยังมีเพดานรวม 50 ครั้ง/10 นาที (ยิงจนเต็มแล้วผู้ใช้จริงต้องรอ)
- (แก้ตาม review 06:00) นำเข้าไฟล์ได้ id ผังใหม่เสมอ — บันทึกไฟล์ที่ export แล้ว import กลับจะเป็นผังใหม่ในบัญชี ไม่ทับผังเดิม
- ลิงก์แชร์ยังยกเลิกไม่ได้และไม่มีวันหมดอายุ
- OG image เป็นภาษาอังกฤษ (ฟอนต์ไทยต้องฝังไฟล์ฟอนต์เพิ่ม)
- feat-024 ยังรอรันบน WebKit

### Next Steps
1. ปิด feat-024 ด้วย WebKit
2. ที่เก็บข้อมูลถาวร / Backend Layout Service
3. ยกเลิกลิงก์แชร์ + วันหมดอายุ

## 2026-10-10 04:00 ICT — feat-025 → feat-029 เสร็จ, feat-024 รอ WebKit

### Core & Dev
- แผงขวาของ `/playground` มีฟอร์ม "ขนาดร้านและทางเข้า", Inspector ของชิ้นที่เลือก, "ไฟล์และการส่งออก" (JSON / PNG / SVG / พิมพ์-PDF) และปุ่ม "เริ่มผังใหม่"
- Draft บันทึกอัตโนมัติใน localStorage (`wang-raan:draft:v1`) — ล้างด้วยปุ่ม "เริ่มผังใหม่" หรือ `localStorage.removeItem` ระหว่าง debug
- นำเข้า/ส่งออก: `import { importLayoutFile, createLayoutFile } from "@/core/io"`; ภาพ: `import { renderPlanSvg, summarizeLayout } from "@/core/export"`
- E2E ใช้ Chromium ในเครื่องอัตโนมัติ; ถ้าแก้ CSS แล้ว build ไม่เปลี่ยน ให้ `rm -rf .next`

### QA
- unit 452, e2e 37 (Chromium), axe 0 violations, coverage core > 98%

### Active Blockers / Open Questions
- feat-024 gate ต้องการ WebKit — ยังไม่ได้รัน (ไม่มีในเครื่องนี้): `npx playwright install webkit && E2E_WEBKIT=1 make e2e`
- PNG วาดข้อความด้วยฟอนต์ของระบบ (SVG ที่แปลงผ่าน `<img>` โหลด web font ไม่ได้) — ถ้าต้องการ Noto Sans Thai ใน PNG ต้องฝังฟอนต์เป็น base64
- "PDF Summary" ใช้การพิมพ์ของเบราว์เซอร์ (บันทึกเป็น PDF) ไม่ได้สร้างไฟล์ PDF เอง — เลี่ยงการฝังฟอนต์ไทยใน PDF
- ชื่อเรียกชิ้นงาน (architecture.md §5.4 Inspector) ยังไม่มีใน data model จึงยังไม่ทำ
- Delete ที่เก้าอี้บน Artboard = ลบเก้าอี้ตัวนั้นออกจากชุด (ตาม Core feat-005) ส่วนปุ่มใน Inspector ตอนเลือกเก้าอี้ = ลบทั้งชุด — ควรยืนยันพฤติกรรมที่ต้องการ

### Next Steps
1. ปิด feat-024 ด้วย WebKit
2. feat-030 Public Share & Read-Only Preview
3. feat-033 TanStack Query BFF Integration

## 2026-10-10 03:00 ICT — feat-018 → feat-023 เสร็จสมบูรณ์

### Core & Dev
- จำลองลูกค้าได้จริงใน `/playground` (แผง "จำลองลูกค้า" ด้านขวา): ปุ่มเริ่มกดได้เฉพาะ Ready/Warning, heatmap + จุดลูกค้า 60 FPS
- หน้า Landing (`/`) port จาก prototype แล้ว — แก้ CSS ที่ `design-html/index.html` แล้วรัน `python3 scripts/scope_landing_css.py > "app/(marketing)/landing.css"` (ห้ามแก้ landing.css ตรง)
- `make e2e` = Playwright + axe ใช้ Google Chrome ในเครื่อง (ไม่ต้องดาวน์โหลดเบราว์เซอร์), build production ให้อัตโนมัติ
- `.claude/launch.json` มี `prototype` (python http.server 4173) สำหรับเทียบกับต้นแบบ

### QA
- unit 385, e2e 26, axe 0 violations, Lighthouse a11y 100 ทั้งสองหน้า

### Active Blockers / Open Questions
- design-system.md กำหนด `--muted` (#8492a5, 3.2:1) ให้ใช้กับข้อความ caption/hint ซึ่งไม่ผ่าน WCAG AA — โค้ดใช้ `--secondary` / `--secondary-strong` แทนสำหรับข้อความ; ควรอัปเดตเอกสารให้ตรงกัน
- หน้า Landing ต่างจาก prototype โดยตั้งใจ 2 จุด: Shelf → Kitchen (กฎ V1) และสีข้อความเทาเข้มขึ้นเล็กน้อย (WCAG)
- ค่าพฤติกรรมลูกค้า (เวลาสั่ง 30–90 วิ, ทาน 15–40 นาที, เดิน 1.0–1.4 ม./วิ, 2 คน/เคาน์เตอร์) เป็นค่าตั้งต้นที่ผมเลือก — ยังไม่ได้รับการยืนยัน

### Next Steps
1. feat-024 Playwright E2E Integration Test Suite
2. feat-027 Editor Control Panels & Inspector
3. feat-028 Auto-Save Draft

## 2026-10-10 02:00 ICT — feat-012 → feat-017 เสร็จสมบูรณ์

### Core & Dev
- เปิด `/playground` ได้จริง: เพิ่ม/ลาก/หมุน/ลบ/ปรับขนาด, สลับ 2D ↔ 3D, ซูม, แถบสถานะ + Drawer, Worker เตรียมกริด
- โครงไฟล์ใหม่: `src/components/{editor,editor-2d,preview-3d,validation,simulation}`, `src/core/{preview,simulation}`, `src/server`, `src/workers`, `src/lib/simulation-client.ts`
- Live validation (สถานะบน UI) แยกจาก `store.validation` (ผลตรวจทางการ) — feat-020 ต้องเรียก `runValidation()` ก่อนเริ่มจำลองเสมอ
- `.claude/launch.json` → dev server port 3123

### QA
- 352 tests, coverage core > 98%, lint/build/init ผ่าน, ตรวจในเบราว์เซอร์ทุก breakpoint

### Active Blockers / Open Questions
- BFF ยังไม่มี Auth (feat-031) และเก็บข้อมูลใน memory — หายเมื่อ restart server
- BFF ปฏิเสธผัง Blocked ทุกกรณีตาม gate (422) — Draft ระหว่างทำต้องเก็บ local (feat-028)
- ปรับขนาดได้เฉพาะ Kitchen/Counter; โต๊ะใช้ขนาด preset เพื่อรักษาระยะสอดใต้โต๊ะ 0.10 ม.
- ยังไม่มีฟอร์มปรับขนาดร้าน (feat-027) และ draft หายเมื่อรีโหลด (feat-028)

### Next Steps
1. feat-018 Flow-field Pathfinding
2. feat-027 Editor Control Panels & Inspector
3. feat-028 Auto-Save Draft

## 2026-10-10 01:40 ICT — feat-006 → feat-011 เสร็จสมบูรณ์

### Core & Dev
- Validation Engine 4 ด้านพร้อมใช้: `import { validateLayout, canStartSimulation } from "@/core/validation"`
- Issue id คงที่รูปแบบ `<category>/<code>/<objectIds>` — UI ใช้ `objectIds` ไฮไลต์ Issue Rings และ `issueCode()` เลือกข้อความ/ไอคอน
- Store: `useLayoutStore(selector)` สำหรับ Client Components; เทสต์ใช้ `createLayoutStore({ newId, now })`
- Fixtures เทสต์ร่วม: `src/test/fixtures/layouts.ts` (`cafeLayout()` = ผัง Ready, `corridor(gap, target)`)

### QA
- 255 tests ผ่าน, coverage src/core 100%, lint/build/init ผ่าน

### Active Blockers / Open Questions (ต้องการการยืนยันจากเจ้าของผลิตภัณฑ์)
- นิยาม "เส้นทางที่จำเป็น" ที่เลือกใช้: ทางหลัก 1.20 = Entrance → Counter, ทางรอง 0.90 = Entrance → Table/Kitchen — ปรับได้ที่ `ROUTE_REQUIREMENTS` ใน `src/core/validation/routes.ts`
- โต๊ะที่ไม่มีเก้าอี้เป็น Warning (ไม่ใช่ Blocked) ตราบใดที่ผังยังมีเก้าอี้ใช้งานได้ ≥ 1 ตัว
- ยังไม่มี Warning เชิงตัวเลขตาม P-03 (เกณฑ์ยังไม่อนุมัติ)
- Store singleton ระดับ module — ใช้เฉพาะใน Client Components; ถ้าต้องใช้ใน SSR ให้เปลี่ยนเป็น Provider ต่อ request
- การลากต่อเนื่อง (drag) จะสร้าง history ทุกครั้งที่ตำแหน่ง snap เปลี่ยน — feat-012 อาจต้องเพิ่ม begin/end interaction เพื่อรวมเป็นขั้นเดียว

### Next Steps
1. feat-012 2D Canvas Artboard Editor
2. feat-015 BFF Layout API Route Handlers
3. feat-017 P2 Web Worker Setup

## 2026-10-10 01:15 ICT — feat-001 → feat-005 เสร็จสมบูรณ์

### Core & Dev
- Next.js 15.5 + React 19 + Tailwind v4 + Vitest พร้อมใช้งาน (`npm run dev|build|lint|typecheck|test`)
- Design tokens ครบใน `app/globals.css` มีเทสต์เทียบ design-system.md อัตโนมัติ — ถ้าแก้เอกสารสี ต้องแก้ CSS ให้ตรง ไม่งั้นเทสต์ fail
- UI primitives ใน `src/components/ui/` (import จาก `@/components/ui`)
- Core domain ใน `src/core/layout/` (import จาก `@/core/layout`) — Table Set lifecycle เป็น pure/immutable คืน reference เดิมเมื่อไม่มีการเปลี่ยนแปลง (Store ใช้ตรวจ no-op ได้)

### QA
- `make test` 99/99, `make lint`, `npm run build`, `./harness/init.sh` ผ่านทั้งหมด

### Active Blockers / Open Questions
- โครงไฟล์ใน AGENTS.md (`src/core/types|geometry|entities`) ต่างจาก architecture.md (`src/core/layout/`) — เลือกตาม architecture.md; ควรอัปเดต AGENTS.md ให้ตรงกัน
- ขนาดเก้าอี้ใช้ 0.5 × 0.5 ม. (design-system ระบุ 0.45–0.50 ม.) — ปรับได้ที่ `DEFAULT_SIZES.chair`
- `.claude/launch.json` (dev server port 3123) สร้างไว้สำหรับ preview ในแอป

### Next Steps
1. feat-006 Completeness Gate
2. feat-007 Collision Detection (ต้องการ feat-005 ✅)
3. feat-011 Zustand Editor Store & History

## 2026-10-10 00:55 ICT — Complete Feature List Audit & Harmonization (feat-000)

### Core & Dev
- ตรวจสอบความสมบูรณ์ของ `harness/feature_list.json` เทียบกับ `PRD.md` และ `architecture.md`
- ขยายฟีเจอร์จาก 27 เป็น 34 รายการ ครอบคลุมจุดสำคัญที่เคยขาดไป:
  - Editor Control Panels & Object Inspector (`feat-027`)
  - Auto-Save Draft & Local Storage Recovery (`feat-028`)
  - P1-P2 JSON Contract File Import & Export (`feat-029`)
  - Public Share System & Read-Only Preview (`feat-030`)
  - NextAuth.js v5 Session Management (`feat-031`)
  - Contact Inquiry Form & API (`feat-032`)
  - TanStack Query BFF Integration (`feat-033`)

### QA
- รัน `./harness/init.sh` และ `python3 scripts/validate_harness.py`: ผ่านสมบูรณ์ทั้ง 34 Tasks ไม่มี Broken / Circular Dependency

### Active Blockers / Open Questions
- ไม่มีบล็อกเกอร์ สามารถเริ่มงาน `feat-001` (Next.js Setup) หรือ `feat-004` (Pure TS Core Types) ได้ทันที

### Next Steps
1. รัน `feat-001`: Setup Next.js 15 App Router พร้อม Tailwind CSS v4
2. รัน `feat-004`: นิยาม Core Geometry Types และ Layout Entity Interfaces ใน `src/core/`
