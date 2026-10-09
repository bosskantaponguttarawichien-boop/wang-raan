# Session Handoff — วางร้าน (Wang-Raan)

> **archive**: เก็บ 5 entry ล่าสุดเท่านั้น — รายการก่อนหน้าจะถูกย้ายไปเก็บที่
> `harness/archive/session-handoff-archive.md`

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
