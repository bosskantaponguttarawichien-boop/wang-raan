# Session Handoff — วางร้าน (Wang-Raan)

> **archive**: เก็บ 5 entry ล่าสุดเท่านั้น — รายการก่อนหน้าจะถูกย้ายไปเก็บที่
> `harness/archive/session-handoff-archive.md`

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
