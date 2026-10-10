# Progress Log — วางร้าน (Wang-Raan)

> **archive**: เก็บ entry เดือนปัจจุบันเท่านั้น — รายการก่อนหน้าจะถูกย้ายไปเก็บที่
> `harness/archive/progress-YYYY-MM.md`

## [2026-10-10 05:00] Auth, React Query, Public Share และ Contact (feat-030 → feat-033)

### BFF / Auth
- feat-031 `src/server/auth.ts` (Auth.js v5): Guest provider สร้าง id สุ่มฝั่ง server (สวมรอยไม่ได้), GitHub เปิดเมื่อมี env; Session แบบ JWT ใน Cookie HttpOnly
  - `src/server/session.ts` อ่าน session จาก Request ด้วย `getToken` → ทดสอบ Route Handler ได้ด้วย cookie จริง (`src/test/session.ts`)
  - `/api/layouts` ทุก endpoint ต้องมี session (401) และ repository แยกตาม ownerId (ผังคนอื่น = 404)
  - `src/server/token-relay.ts`: internal JWT HS256 (sub/aud/iss/exp 5 นาที) แนบ `Authorization: Bearer` + `x-request-id`, ตัด cookie; `createRemoteLayoutRepository` ใช้เมื่อตั้ง `WANGRAAN_BACKEND_URL` + `INTERNAL_TOKEN_SECRET`
  - `.env.example` ใหม่; production ต้องตั้ง `AUTH_SECRET` (dev ใช้ค่าคงที่ให้อัตโนมัติ)
- feat-030 `/api/share` + `/api/share/[shareKey]` + หน้า `app/(app)/share/[shareKey]` (RSC) + `opengraph-image.tsx`
  - share = snapshot ณ เวลาที่แชร์ (แก้ผังภายหลังไม่กระทบลิงก์เดิม); key 256 บิต; ไม่คืน ownerId; หน้าแชร์ noindex
  - OG image เขียนอังกฤษ/ตัวเลข เพราะฟอนต์ในตัวของ next/og ไม่มีอักษรไทย
  - `IsometricView` แยกเป็น `IsometricScene({ layout })` ใช้ซ้ำ; เพิ่ม `severityByObject` ใน core/export (ฝั่ง server เรียกฟังก์ชันในไฟล์ "use client" ไม่ได้)
- feat-032 `/api/contact`: rate limit fixed window (IP จาก x-forwarded-for + ผู้ใช้), honeypot, Webhook หรือ memory; ฟอร์มบน Landing ใช้ schema เดียวกัน (`src/lib/contact-schema.ts`)
  - เพิ่ม CSS สถานะฟอร์มใน `design-html/index.html` แล้ว regenerate `landing.css`

### Client
- feat-033 `src/lib/api-client.ts` + `layout-queries.ts` + `AppProviders` (SessionProvider + QueryClientProvider ใน playground layout) + `cloud-panel.tsx`
  - บั๊กที่เจอ: onMutate ใส่รายการ optimistic ก่อน mutationFn ทำให้ตัดสินว่า "มีอยู่แล้ว" ผิด → จำค่าไว้ใน WeakMap ก่อนแก้แคช

### QA
- `make test` 492/492 (+ coverage core 99.7%), `make lint`, `init.sh` ผ่าน; `make e2e` 47/47 (Chromium) รวม axe ของแผงบัญชี/หน้าแชร์/ฟอร์มติดต่อ
- แก้ contrast: ข้อความ `--secondary-strong` บน `--blue-soft` = 4.4:1 (ไม่ผ่าน) → ใช้ `text-ink` (กระทบ draft notice / ข้อความไฟล์จาก feat-028/029 ด้วย)

### Next steps
- ปิด feat-024 ด้วย WebKit
- ย้าย Layout/Share/Rate-limit storage ไปที่เก็บถาวร (ตอนนี้อยู่ในหน่วยความจำ หายเมื่อรีสตาร์ต)

## [2026-10-10 04:00] Inspector, Auto-save, JSON, ส่งออกภาพ/พิมพ์ และ E2E (feat-024 → feat-029)

### Editor
- feat-027 `src/components/editor/forms/` — React Hook Form + `@hookform/resolvers/zod` (ติดตั้งใหม่)
  - Room & Entrance Settings (กว้าง/ลึก 2–30 ม. ลงกริด 0.25, ผนัง/ระยะ/ความกว้างประตู) แทน select ทางเข้าเดิม
  - Object Inspector: ตำแหน่ง x/y, หมุน, กว้าง/ลึก (เฉพาะครัว/เคาน์เตอร์); เลือกเก้าอี้ → แก้ที่โต๊ะแม่ (พิกัดเก้าอี้ไม่ลงกริด)
  - ช่องกรอก uncontrolled → พิมพ์ไม่แตะ store; กด "นำไปใช้" ครั้งเดียว = Undo 1 ขั้น (begin/endInteraction)
  - แก้บั๊กเดิม: ปุ่ม "ลบทั้งชุดโต๊ะ" ตอนเลือกเก้าอี้ เคยลบแค่เก้าอี้ตัวนั้น
- feat-028 `src/lib/draft-storage.ts` + `draft-autosave.ts`: บันทึกผัง + ประวัติลง localStorage (`wang-raan:draft:v1`), debounce 400 ms, flush ตอน pagehide/ซ่อนแท็บ, Zod ตรวจตอนโหลด (เสีย → ทิ้ง), Quota → ตัดประวัติเก่า; กู้คืนก่อน render แรก (`restoreDraftOnce` ใน dynamic import); ปุ่ม "เริ่มผังใหม่" + ข้อความ "กู้คืนผังที่บันทึกไว้เมื่อ…" + สถานะบันทึกที่แถบล่าง
  - Store: เพิ่ม `replaceLayout` (Undo ได้), `restoreHistory`, `resetLayout`

### Core (Pure TS)
- feat-029 `src/core/io/layout-file.ts`: ส่งออก `{contractVersion: "p1-layout-v1", layout, validation}` (ตรวจใหม่ทุกครั้ง); นำเข้า contract / StoreLayout / ตัวอย่าง PRD §4.4 → สร้าง `chairIds` ใหม่จาก `tableId`, ผูกเก้าอี้ที่ไม่มี `tableId` จาก `chairIds`, ตัดเก้าอี้กำพร้า, id ซ้ำ = ปฏิเสธ, ผลตรวจในไฟล์ไม่ถูกเชื่อถือ
- feat-025 `src/core/export/plan-svg.ts` (SVG เวกเตอร์ 60 px/ม., กริด, ทางเข้า+วงสวิง, Issue Rings) + `summary.ts` (ที่นั่งที่ใช้งานได้, ตร.ม./ที่นั่ง, issue ตามหมวด); PNG = SVG → canvas 2× (`src/lib/export-client.ts`)
- feat-026 `print-report.tsx` + `@page A4 landscape` — Editor/Header `print:hidden`; รายงานจบหน้าเดียว (ผังซ้าย สรุปขวา)

### QA
- feat-024 `e2e/editor-flow.spec.ts` 10 เคส + a11y เพิ่มเคส Inspector/error/ข้อความนำเข้า; `make e2e` 37/37 ผ่าน (Chromium)
  - `playwright.config.ts`: ใช้ Chromium ในเครื่อง (`CHROMIUM_PATH` หรือ `/opt/pw-browsers/chromium`) ถ้าไม่มีใช้ Chrome; WebKit เปิดด้วย `E2E_WEBKIT=1`
  - **ยังไม่ผ่าน gate WebKit** — เครื่องนี้ไม่มี WebKit (feat-024 คงเป็น in-progress)
  - เจอ: `next build` ใช้ CSS เก่าจาก `.next` cache — ต้อง `rm -rf .next` เมื่อแก้ `globals.css` แล้วผลไม่เปลี่ยน
- `make test` 452/452, coverage core 99.7% / 98.3% / 100% / 99.9%, `make lint`, `init.sh` ผ่าน

### Next steps
- รัน `E2E_WEBKIT=1 make e2e` บนเครื่องที่มี WebKit เพื่อปิด feat-024
- feat-030 Public Share, feat-031 Auth, feat-032 Contact, feat-033 TanStack Query

## [2026-10-10 03:00] P2 Simulation, Landing Page และ Audit Responsive/A11y (feat-018 → feat-023)

### P2 Simulation
- feat-018 `src/core/simulation/flow-field.ts` (Dijkstra, 8 ทิศ, ห้ามตัดมุม) + `engine.ts` (ลูกค้า: ประตู → เคาน์เตอร์/คิว → เก้าอี้ → ออก, seed ได้, heatmap ทางเดิน) + Worker protocol ใหม่ (`SimulationWorkerRuntime`: START/PAUSE/RESUME/STOP/SET_SPEED + TICK 20 Hz)
  - บั๊กที่เจอ: เก็บระยะใน Float32Array ทำให้ priority (float64) ดูเหมือน "เก่า" แล้วข้ามเส้นทางทแยงทั้งหมด → ใช้ Float64Array
- feat-019 `SimulationOverlay` — Canvas DPR-aware, interpolate เป็น 60 FPS (วัดจริง 60.1), heatmap ฟ้า→แดงอมส้ม
- feat-020 `SimulationController` (singleton เจ้าของ Worker) + `SimulationPanel` + `use-simulation-store.ts`; ลบ `use-simulation-readiness.ts` (แทนด้วย flow START)

### Landing
- feat-021 RSC port จาก `design-html/index.html`: CSS สร้างอัตโนมัติด้วย `scripts/scope_landing_css.py` (ครอบ `.landing` กันรั่วไป Playground; prototype มี `<style>` 2 บล็อก — รวมครบแล้ว); motion layer เป็น client island เดียว
  - เทียบกับ prototype ด้วยสคริปต์วัด 24 องค์ประกอบ: ตรงกันทุก breakpoint
  - ปรับตาม V1: Shelf → Kitchen ในข้อความ/ผังตัวอย่าง/สเก็ตช์; ฟอร์มติดต่อยัง disabled (feat-032)

### QA / A11y
- feat-022 / feat-023: Playwright (`channel: "chrome"`, production build) — `make e2e` 26/26 ผ่าน
- axe พบ color-contrast จากสีเทาของ prototype/POC → ปรับแบบน้อยที่สุดโดยคงเฉดสี (`scripts/a11y_colors.py`):
  - Landing: ปรับอัตโนมัติในสคริปต์ CSS ตามพื้นหลังจริงของแต่ละส่วน (เช่น #6d7b8f → #697689)
  - Playground: ข้อความรองใช้ `--secondary`; บนพื้นสี (#f3f6fa–#f8faff) ใช้โทเคนใหม่ `--secondary-strong` (#627084); danger #c75049 → #c64c45; ลิงก์ฟ้าบนพื้นฟ้าอ่อนใช้ --blue-hover
  - Palette item: ชื่อที่อ่านได้มาจากข้อความที่มองเห็น (WCAG 2.5.3) แทน aria-label
- Lighthouse 12: Accessibility / Best Practices / SEO = 100 ทั้ง `/` และ `/playground`
- `make test` 385/385, coverage core 99.5% / 98.1% / 100% / 99.9%, `make lint`, build, `init.sh` ผ่าน

### Next steps
- feat-024 Playwright E2E Integration (ต่อยอดจาก `e2e/` ที่มีแล้ว)
- feat-027 Control Panels, feat-028 Auto-save

## [2026-10-10 02:00] Editor 2D/3D, Live Validation, BFF + Zod และ Simulation Worker (feat-012 → feat-017)

### Frontend
- feat-012 Playground ใช้งานได้จริง: `app/(app)/playground` → `PlaygroundClient` (client-only, ไม่ SSR เพื่อเลี่ยง hydration mismatch) → `PlaygroundEditor` 3 แผง (เครื่องมือ | Artboard | ชิ้นงานที่เลือก) ตาม POC + breakpoints desktop-first
  - Artboard: `<button>` วางเป็น %, กริด SVG `vector-effect: non-scaling-stroke`, ลาก (Pointer Events), คีย์บอร์ด, resize handle (Kitchen/Counter), ลากทางเข้าข้ามผนัง, กรอบเน้นทั้งชุดโต๊ะ, Ctrl/Cmd+Z / Shift+Z
  - Store: เพิ่ม `beginInteraction/endInteraction` (ลากหนึ่งครั้ง = Undo ขั้นเดียว) และ `resizeObject` (Core: Kitchen/Counter เท่านั้น snap 0.05 ม. ≥ 0.30 ม.)
- feat-013 `src/core/preview/isometric.ts` (Pure) + `IsometricView` — แก้บั๊กจาก POC: เงาเคยถูกวาดทับตัวครัว/เคาน์เตอร์ (depth คำนวณจาก rect ที่ inset) และผนังเคยอยู่ฝั่งใกล้ซึ่งถูกพื้นบัง → ย้ายเป็นผนังหลัง
- feat-014 `useLiveValidation` (synchronous) + `ValidationStatusBar` (Floating Pill) + Drawer (Radix Dialog) + Issue Rings บน Artboard

### BFF / Schema
- feat-016 `layout.schema.ts` — type ตรงกับ Core 100% (expectTypeOf); ตั้งใจต่างจาก architecture.md: พิกัดติดลบได้ (non-blocking), `chairIds` ว่างได้, `entrance` null ได้ → ให้ Validation Engine รายงานแทน
- feat-015 `/api/layouts` + `/api/layouts/[id]` — 415/413/400 (JSON/schema) → re-validate ฝั่ง server → 422 `LAYOUT_BLOCKED` พร้อม `issues` → บันทึก; ไม่รับผลตรวจจาก client; repository in-memory (`src/server/layout-repository.ts`)

### P2
- feat-017 Worker `src/workers/simulation.worker.ts` + `SimulationClient` (Promise/requestId/timeout) + Occupancy Grid 0.25 ม.; Worker ตรวจผังซ้ำเอง (STALE_VALIDATION / BLOCKED); UI sync ผังที่ไม่ Blocked แบบ debounce 250 ms แล้วแสดงขนาดกริดที่ footer

### QA / Verification
- `make test` 352/352; coverage src/core 99.86% / 98.44% / 100% / 100%; `make lint`, `npm run build`, `./harness/init.sh` ผ่าน
- เบราว์เซอร์: เพิ่ม/ลากจริงจน Ready, 3D ถูกต้อง, Worker ตอบกลับ, ไม่มี horizontal scroll ที่ 320/375/480/768/1024/1440, console ไม่มี error
- curl: POST ผ่าน 201, Blocked 422, schema ผิด 400, DELETE 204

### Next steps
- feat-018 Flow-field Pathfinding (ต่อจาก Occupancy Grid)
- feat-027 Control Panels (ฟอร์มขนาดร้าน/Inspector) — ตอนนี้ยังปรับขนาดร้านผ่าน UI ไม่ได้
- feat-028 Auto-save Draft (ตอนนี้รีโหลดแล้วผังหาย)

## [2026-10-10 01:40] Validation Engine 4 ด้าน, Coverage และ Zustand Store (feat-006 → feat-011)

### Core / Validation (`src/core/validation/`, Pure TS)
- feat-006 `completeness.ts`: ขาด Entrance/Kitchen/Counter/Table/Chair ที่ใช้งานได้ → Blocked; เก้าอี้นอก hierarchy → Blocked; โต๊ะไม่มีเก้าอี้ → **Warning** (PRD ต้องการเก้าอี้ ≥ 1 "ในระดับผัง")
- feat-007 `collision.ts`: AABB บน `footprint()` (แม่นยำทุกมุม 90°) — วัตถุทุกคู่ที่ทับกัน Blocked ยกเว้นเก้าอี้กับโต๊ะของตัวเองที่สอด ≤ 0.10 ม. จากด้านหน้า; ตกขอบร้าน Blocked
- feat-008 `walk-grid.ts` + `routes.ts` + `clearance.ts`:
  - lattice 0.05 ม. → Euclidean Distance Transform (Felzenszwalb) → BFS ของ "วงกลมกว้าง w" จากช่องประตู
  - นิยามเส้นทางที่จำเป็น (เสนอ — PRD §9 ยังไม่ล็อก): ทางหลัก 1.20 = Entrance → Counter, ทางรอง 0.90 = Entrance → Table / Kitchen, เก้าอี้ 0.60 = แถบด้านหลังหรือด้านข้างว่างอย่างน้อย 1 แถบ
  - เดินถึงได้ที่ 0.60 แต่แคบกว่าที่ต้องการ → Clearance; เดินไม่ถึงเลย → Accessibility (ไม่รายงานซ้ำ)
  - จุดเริ่ม = วงกลมแตะช่องประตู (ประตูแคบกว่า 1.20 ไม่ทำให้ทางหลักล้มเหลวเอง)
- feat-009 `service-points.ts` + `accessibility.ts`: จุดบริการ = จุดที่คนกว้าง 0.60 เดินถึงและแตะ bounding box; ตรวจ entrance-off-wall, entrance-disconnected, unreachable-{chair,table,kitchen,counter}
- feat-010 `engine.ts` (`validateLayout`, `summarizeStatus`, `isValidationFresh`, `canStartSimulation`) + `revision.ts` (FNV-1a 64-bit, ไม่ขึ้นกับลำดับ objects); coverage-v8 threshold 95%

### Client State
- feat-011 `src/store/use-layout-store.ts`: vanilla `createLayoutStore()` (ทดสอบได้ไม่ต้องใช้ React) + singleton `layoutStore` + hook `useLayoutStore(selector)`; history แบบ `history[] + historyIndex` ยาวสุด 41 snapshot; selectors `selectCanUndo/Redo`, `selectCanStartSimulation`

### QA / Verification
- `make test`: 255/255 ผ่าน; `npm run test:coverage`: src/core 100% ทุกมิติ
- `make lint`: boundary OK + ESLint + tsc ผ่าน; `npm run build` ผ่าน; `./harness/init.sh` HEALTHY & READY
- ประสิทธิภาพ: ผังคาเฟ่ 8×6 ตรวจ ~7 ms, 30×30 ม. 60 ชุดโต๊ะ < 1 s

### Next steps
- feat-012 2D Canvas Artboard (ใช้ `useLayoutStore`)
- feat-015 BFF Layout API (ใช้ `validateLayout` ซ้ำฝั่ง server)
- feat-017 Web Worker (ใช้ `buildWalkGrid` / `computeServicePoints` เป็นฐาน occupancy grid)

## [2026-10-10 01:15] Scaffolding, Design Tokens, UI Primitives, Core Types & Table Set Lifecycle (feat-001 → feat-005)

### Frontend / Design
- feat-001: วาง Next.js 15.5 App Router + React 19 + TypeScript strict (`noUncheckedIndexedAccess`) + ESLint 9 flat config + Tailwind v4 (PostCSS) + Vitest 5 (+ RTL/jsdom)
  - route: `app/(marketing)/page.tsx` (placeholder จนถึง feat-021), `app/(app)/playground/` (placeholder จนถึง feat-012), alias `@/*` → `src/*`
  - ฟอนต์ Noto Sans Thai ผ่าน `next/font/google` (variable font รองรับน้ำหนัก 650)
- feat-002: `app/globals.css` รวมโทเคนทั้งหมดจาก design-system.md + `@theme` ตาม §11 + alias สั้น (`text-ink`, `bg-blue`, `outline-focus`, type scale `text-h1-hero` ฯลฯ) + reduced-motion/print
  - `--line` / `--focus` มี 2 เฉด (Landing/Playground) — ใช้ `data-surface="playground"` เพื่อสลับ
- feat-003: `src/components/ui/` — Button (primary/secondary/danger/ghost, asChild ผ่าน Radix Slot), IconButton (บังคับ aria-label), ViewSwitch (`aria-pressed` ตาม §10), PaletteItem, StatusBadge (`role=status`, ข้อความไทย)
  - ไม่ใช้ Radix ToggleGroup เพราะใช้ `role="radio"` ขัดกับสเปก `aria-pressed`

### Core (Pure TS)
- feat-004: `src/core/layout/` (ตามโครงของ architecture.md §7) — `types.ts`, `constants.ts` (GRID_STEP 0.25, ROOM 2–30, CLEARANCE, presets), `geometry.ts` (snap, footprint, rotatePoint, rect overlap), `entities.ts` (factory + `createSequentialIds` สำหรับเทสต์)
  - ธรรมเนียมพิกัด: `(x, y)` = มุมซ้ายบนของ footprint หลังหมุน (ตาม POC), Chair `rotation` = ทิศด้านหน้า (0 = เหนือ, ตามเข็มนาฬิกา)
  - Zod schema ยังไม่ทำ — อยู่ใน feat-016
- feat-005: `src/core/layout/table-set.ts` — `createTableSet`, `addTableSet`, `moveObject`, `rotateObject`, `deleteObject`, `checkTableSetIntegrity`, `chairTuck`
  - Snap 0.25 ม. ใช้กับจุดยึดของโต๊ะ/ครัว/เคาน์เตอร์ — เก้าอี้ใช้ offset สัมพัทธ์ (สอด 0.10 ม. จึงไม่ลงกริด)
  - ย้าย/หมุนเก้าอี้ = ย้าย/หมุนทั้งชุด; ลบเก้าอี้เดี่ยวจะถอด id ออกจาก `chairIds`

### Harness
- ขยาย boundary check ใน `harness/init.sh` และ `make lint` จาก `src/core/validation/` เป็น `src/core/` ทั้งหมด + `make lint` รัน ESLint และ `tsc --noEmit` ด้วย

### QA / Verification
- `make test`: 99/99 ผ่าน (4 ไฟล์)
- `make lint`: boundary OK, ESLint + TypeScript ผ่าน; negative test (ใส่ `import "react"` ใน src/core) → ทั้ง `make lint` และ `init.sh` fail ตามคาด
- `npm run build`: ผ่าน; dev server: `/` และ `/playground` ตอบ 200; เบราว์เซอร์: focus ring `solid 3px #a4b6ff`, ไม่มี horizontal scroll, console สะอาด
- `./harness/init.sh`: HEALTHY & READY

### Next steps
- feat-006 Completeness Gate (ใช้ `checkTableSetIntegrity` นิยาม "เก้าอี้ที่ใช้งานได้")
- feat-007 Collision (ใช้ `footprint`, `rectsIntersect`, `chairTuck`)
- feat-011 Zustand Store (ห่อ `addTableSet`/`moveObject`/`rotateObject`/`deleteObject`)

## [2026-10-10 00:55] Feature List Expansion & Comprehensive PRD/Architecture Mapping (feat-000)

### Core / Harness
- ตรวจสอบเปรียบเทียบ `harness/feature_list.json` กับ `PRD.md`, `architecture.md` และ `design-system.md`
- ขยายและเพิ่มเติม 7 ฟีเจอร์สำคัญที่ระบุไว้ในสถาปัตยกรรมแต่ยังไม่ได้แยก Task ให้ครบถ้วน 100%:
  - `feat-027`: Editor Control Panels & Object Inspector (React Hook Form + Zod)
  - `feat-028`: Auto-Save Draft & Local Storage Persistence (PRD 3.1)
  - `feat-029`: P1-P2 JSON Contract File Import & Export (`StoreLayoutPayloadSchema`)
  - `feat-030`: Public Share System & Read-Only Preview (`/api/share`, `/share/[layoutId]`, Dynamic OG Image)
  - `feat-031`: NextAuth.js (Auth.js v5) Session Management & Auth BFF Relay
  - `feat-032`: Contact Inquiry Form & Rate-Limited API (`/api/contact`)
  - `feat-033`: TanStack Query (React Query v5) BFF Client Integration
- อัปเดตรายการงานรวมเป็น 34 รายการ ครอบคลุมทั้ง Core Domain, 2D/3D Editor, BFF Handlers, P2 Simulation, Public Share, Auth, E2E และ Responsive ครบทุกมิติ

### QA / Verification
- รัน `python3 scripts/validate_harness.py`: ผ่าน 34 งาน ไม่มี circular dependency
- รัน `./harness/init.sh`: ตรวจสอบผ่านฉลุย สถานะ HEALTHY & READY

### Next steps
- feat-001: Next.js 15 App Router & Project Scaffolding
- feat-004: Core Entities & Geometry Types (Pure TypeScript)
