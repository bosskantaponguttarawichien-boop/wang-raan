# Progress Log — วางร้าน (Wang-Raan)

> **archive**: เก็บ entry เดือนปัจจุบันเท่านั้น — รายการก่อนหน้าจะถูกย้ายไปเก็บที่
> `harness/archive/progress-YYYY-MM.md`

## [2026-10-14] Planning — บัญชีผู้ใช้และหน้ารวมโปรเจกต์ (feat-061–064)

- ข้อสรุปกับผู้ใช้ (บันทึกใน PRD §9 ข้อ 16–19): ไม่บังคับล็อกอินก่อนใช้ playground, เข้าสู่ระบบด้วย Google + อีเมล OTP 6 หลัก (ไม่มี register / รหัสผ่าน, ยกเลิก LINE), `/projects` V1 = รายการ + สร้างใหม่ + ลบ, ผังมี URL `/playground/[id]`
- เพิ่ม feature: feat-061 (OTP สัญญา + BFF + mock), feat-062 (`/login`), feat-063 (`/projects`), feat-064 (`/playground/[id]` + บันทึกออนไลน์จาก Guest) — sprint 4
- ปรับ feat-041 เป็น Google อย่างเดียว (ตัด LINE)
- Prototype: `design-html/account-ux/login.html` (อีเมล → รหัส → สำเร็จ, รหัสใน mock = 123456) และ `design-html/account-ux/projects.html` (มีผัง / ว่าง / โหลด / error / เต็มโควตา + dialog ยืนยันลบ)
- Verify: ทั้งสองหน้าไม่มี horizontal scroll ที่ 320px, dialog ลบโฟกัสปุ่มยกเลิกก่อนและ Esc ปิดได้; `make status` ผ่าน (65 งาน)

- อัปเดต: การ์ด /projects เป็นแบบการ์ดไฟล์ใน Figma (ภาพผังย่อ + ชื่อ/ขนาด/เวลาแก้ไข + เมนู ⋯) และ dialog ตั้งชื่อตอนสร้างผังใหม่ · ข้อสรุปชื่อผัง (PRD §9 ข้อ 20): ถามชื่อตอนสร้าง/บันทึกออนไลน์ครั้งแรก + แก้ชื่อในที่บน playground · ต้องเพิ่ม `name` และ `layout` ใน LayoutSummary ของสัญญา (อยู่ใน feat-063)

## [2026-10-14] feat-060 QA — เทสต์และ Audit ของ Playground UX ใหม่

- สร้าง Integration QA Test Suite ใหม่: `src/components/editor/playground-ux-flow.test.tsx` ผ่าน 9/9 tests ครอบคลุม:
  1. ผังใหม่ → Onboarding Dialog → เลือกขนาดร้านและสร้างผังใหม่พร้อม Entrance
  2. แท็บ 'เพิ่ม' → เพิ่มชุดโต๊ะ 4 ที่นั่งและ 2 ที่นั่ง → Table Set Lifecycle สมบูรณ์
  3. Floating Selection Toolbar: สลับที่นั่ง 4↔2, หมุน 90°, ปรับพิกัด, และ Cascade Delete
  4. สลับแท็บ 'ร้าน' และ 'จำลอง' บน PlaygroundRail + แสดง Badge ปัญหา
  5. แท็บ 'จำลอง': ผัง Blocked ปุ่มเริ่มจำลองมี `aria-disabled="true"` ไม่เริ่มจำลอง; ผัง Ready กดเริ่มจำลองได้
  6. โหมดจำลอง: ล็อกตัวควบคุม (Header undo/redo disabled, Rail ซ่อน, แผงแสดงปุ่มหยุดชั่วคราวและ ■ จบรอบ)
  7. สรุปผลจบรอบจำลอง: แสดงสรุปผลรอบล่าสุดพร้อมคำแนะนำ 1 ประโยค (PRD §9 ข้อ 11) และการ์ดย่อในแท็บเพิ่ม
  8. มุมมอง 3D: คลิกเลือกและขยับวัตถุด้วยคีย์บอร์ด (ลูกศร, R, Esc) ซิงก์กับ Store
  9. Status Bar: แสดงจำนวนปัญหาและปุ่ม 'พาไปดู' โฟกัสปัญหาแรกและสลับไปแท็บจำลอง
- อัปเดต E2E Helpers (`e2e/helpers.ts`) ให้รองรับทั้งโครงสร้าง PlaygroundRail ใหม่ และ Accordion เดิม
- ปรับปรุง `e2e/responsive.spec.ts` ให้ตรวจแถบเครื่องมือทั้ง PlaygroundRail (add/shop/check) และ 6 breakpoints
- สร้าง E2E Playwright Suite ใหม่ `e2e/playground-ux.spec.ts` (6/6 passed):
  - Onboarding dialog และสร้างผังใหม่
  - แผงเพิ่มและ Floating Selection Toolbar
  - แผงร้านปรับขนาดและประตู
  - แผงจำลอง โหมดจำลองล็อกผัง สรุปผลจบรอบ และ Heatmap
  - มุมมอง 3D สลับด้วย ViewSwitch เลือกและขยับวัตถุ
  - Axe Accessibility Audit (WCAG 2.1 AA) ตรวจทุกสถานะผ่าน 100% ไม่มี violation
- แก้ไขปัญหา Color Contrast ตามมาตรฐาน WCAG 2.1 AA (≥ 4.5:1):
  - ปรับสี DraftStatusText ใน Header เป็น `text-secondary`
  - ปรับสีแท็บที่เลือกใน PlaygroundRail เป็น `text-[#183cbd]`
  - ปรับสีปุ่มเลือกทิศทางประตูใน RoomSettingsForm และปุ่มความเร็วใน SimulationPanel เป็น `text-[#41536b]`
  - ปรับสีคำแนะนำคีย์ลัดเป็น `text-secondary`
  - ลบ container opacity-60 ใน SimulationPanel เพื่อให้อ่านข้อความชัดเจน
- Verify: `make lint` 100% ผ่าน (Pure TS boundaries OK), `make test` 100% ผ่าน 48/48 test files (704 tests passed), `npx playwright test e2e/playground-ux.spec.ts` 100% ผ่าน 6/6 tests

## [2026-10-14] feat-059 Playground มือถือ — Bottom Tab Bar + Bottom Sheet

- ออกแบบและปรับปรุง UX สำหรับอุปกรณ์มือถือและหน้าจอเล็ก (< 768px และ < 480px):
  - บนหน้าจอต่ำกว่า 768px:
    - `PlaygroundRail` วางเป็น Bottom Tab Bar แนวนอนล่างสุด (ไอคอน เพิ่ม / ร้าน / จำลอง)
    - `PlaygroundPanel` กลายเป็น Bottom Sheet พร้อม Grip Handle ลาก/กดพับ-กาง
    - เมื่อกดแท็บเดิมใน Rail จะทำการสลับพับ/กาง Sheet (toggle sheetOpen)
    - เมื่อกดแท็บใหม่ขณะที่ Sheet พับอยู่ จะสลับแท็บและกาง Sheet ขึ้นมาอัตโนมัติ
    - เมื่อกดเพิ่มชุดโต๊ะ/ครัว/เคาน์เตอร์บนมือถือ จะพับ Sheet ลงอัตโนมัติเพื่อให้ผู้ใช้เห็นและลากจัดร้านบน Canvas ได้ทันที
    - แคตตาล็อกในแท็บเพิ่มเลื่อนแบบแนวนอน (Horizontal Scroll / Swipe) พร้อม `PaletteItem shrink-0` ไม่กินพื้นที่แนวตั้ง
    - ซ่อนปุ่มซูมมุมซ้ายล่างอัตโนมัติ
  - บนหน้าจอต่ำกว่า 480px:
    - `ViewSwitch` ใน Header ย่อป้ายชื่อเป็น "2D" และ "3D" อัตโนมัติ (ผ่าน `shortLabel`)
    - เมนูและชื่อร้านย่อขนาดพอดี ไม่ล้นขอบจอ
  - รองรับทั้ง 6 breakpoints หลัก (320px, 375px, 480px, 768px, 1024px, 1440px) โดยไม่มี Horizontal Scrollbar
- เขียน Unit Tests ใน `src/components/editor/playground-mobile.test.tsx` (6/6 passed)
- Verify: `make lint` 100% ผ่าน, `make test` 100% ผ่าน (47 files, 695 tests passed)

## [2026-10-14] feat-058 มุมมอง 3D — เลือกและขยับวัตถุ (Pure SVG)

- ปรับปรุง `IsometricView` (`src/components/preview-3d/isometric-view.tsx`) ด้วย Pure SVG 100% ไม่ใช้ Three.js/WebGL:
  - รองรับการคลิกเลือกวัตถุใน 3D (โต๊ะ, เก้าอี้, เคาน์เตอร์, ครัว) ซิงก์กับ `selectedObjectId` ใน store ทันที
  - แสดงเส้นขอบไฮไลต์สีน้ำเงิน (`#3b62f4`) บนวัตถุที่เลือกใน 3D
  - แสดง `SelectionToolbar` ลอยตัวเหนือวัตถุที่เลือกใน 3D ยึดตำแหน่งตาม Isometric Projection Math
  - รองรับคีย์บอร์ดใน 3D: ปุ่มลูกศรเลื่อนพิกัดบนกริด 0.25 ม. (Shift = 1 ม.), R หมุน 90°, Delete/Backspace ลบวัตถุ (cascade delete โต๊ะพร้อมเก้าอี้ลูก), Esc ยกเลิกการเลือก
  - แสดง Toast แนะนำ `"ใน 3D เลือกแล้วขยับด้วยปุ่มลูกศร · ลากได้ในมุมมอง 2D"` เมื่อคลิกเลือกวัตถุครั้งแรก
  - คลิกพื้นหลังฉาก 3D เพื่อยกเลิกการเลือก
  - ล็อกการแก้ไขทั้งหมดใน 3D เมื่อเข้าสู่โหมดจำลอง (`isSim`)
- เพิ่มฟังก์ชัน `getIsoAnchor` ใน `src/core/preview/isometric.ts` (Pure TypeScript)
- เขียน Unit Tests ใน `isometric-interaction.test.tsx` (4/4 passed) และยืนยัน Core Tests ใน `isometric.test.ts` (12/12 passed)
- Verify: `make lint` 100% ผ่าน, `make test` 100% ผ่าน (46 files, 689 tests passed)

## [2026-10-14] feat-057 สรุปผลจบรอบ + ใช้ผลรอบล่าสุดตอนแก้ผัง

- เพิ่ม `showHeatmap` (default: true) และ `setShowHeatmap` ใน `useSimulationStore` (`src/store/use-simulation-store.ts`)
- ปรับปรุง `SimulationOverlay` (`src/components/simulation/simulation-overlay.tsx`):
  - นำผล Heatmap รอบล่าสุดมาแสดงจาง ๆ บนผัง (`globalAlpha = 0.35`) เมื่ออยู่ในโหมดจัดผัง (Edit/Idle) เพื่อช่วยแนะแนวทางการจัดวางโต๊ะ
  - ควบคุมการแสดงผลผ่าน `showHeatmap` เปิด/ปิดได้ทันที
- ปรับปรุงแผงซ้าย `SimulationPanel` (`src/components/simulation/simulation-panel.tsx`):
  - เพิ่มการ์ดสรุปผลจำลองรอบล่าสุด (`latest-sim-summary`) แสดงผลชัดเจน (ลูกค้าเข้ามา, รับบริการแล้ว, นั่งทาน X/Y ที่, ไม่มีที่นั่ง X คน)
  - เพิ่มกล่องคำแนะนำ 1 ประโยค (PRD §9 ข้อ 11): แจ้งเตือนจุดคนเดินหนาแน่นบริเวณสีแดง และแนะนำเพิ่มโต๊ะหากมีลูกค้าเดินกลับ
  - เช็กบ็อกซ์ "แสดงจุดหนาแน่นบนผัง (จาง)" สลับเปิด/ปิดได้
  - ปุ่มเริ่มจำลองปรับข้อความเป็น "เริ่มจำลองรอบใหม่"
- อัปเดตรายงานพิมพ์/PDF (`src/components/editor/print-report.tsx`):
  - เพิ่มส่วน "ผลจำลองลูกค้า (รอบล่าสุด)" รวมเวลาจำลอง สถิติล่าสุด และจำนวนที่นั่งลงในเอกสาร
- เพิ่ม Unit Tests ใน `sim-summary.test.tsx` (3/3 passed) และอัปเดต `print-report.test.tsx` (2/2 passed)
- Verify: `make lint` 100% ผ่าน, `make test` 100% ผ่าน (45 files, 685 tests passed)

## [2026-10-14] feat-056 โหมดจำลอง — ล็อกผังและตัวควบคุมระหว่างรัน

- ซ่อน `PlaygroundRail` ระหว่างจำลอง (`simActive`: running หรือ paused)
- ปรับปรุงแผงซ้าย `SimulationPanel` ในโหมดจำลอง:
  - เพิ่มตัวควบคุมความเร็วจำลอง 1× / 2× / 4× ให้ปรับได้แบบเรียลไทม์ระหว่างรัน
  - เช็กบ็อกซ์เปิด/ปิด Heatmap ความหนาแน่นทางเดิน
  - ปุ่มหยุดชั่วคราว / เล่นต่อ และปุ่ม "■ จบรอบ"
  - ตารางสรุปตัวเลขสด: เวลาจำลอง, ลูกค้าในร้าน, นั่งทาน (X/Y ที่), ทานเสร็จแล้ว, ไม่มีที่นั่ง (เดินกลับ), เวลาเฉลี่ยในร้าน
  - กล่องเตือน "ผังถูกล็อกระหว่างจำลอง ถ้าจะแก้ให้กด 'จบรอบ' หรือ 'กลับไปแก้ผัง'"
- แสดง Chip Badge "ผังล็อกระหว่างจำลอง" (`data-testid="chip-lock"`) บน Stage ทั้งในมุมมอง 2D (`Artboard`) และมุมมอง 3D (`IsometricView`)
- ล็อกการแก้ไขผังทั้ง 2D และ 3D อย่างเข้มงวด:
  - เมื่อคลิกหรือลากวัตถุหรือทางเข้า จะขึ้น Toast แจ้งเตือน `ผังล็อกระหว่างจำลอง — กด "จบรอบ" ก่อนแก้ไข` และไม่เริ่ม drag หรือ select ใด ๆ
  - ซ่อน `SelectionToolbar` และ Resize Handle ระหว่างจำลอง
  - ปิดการทำงานของคีย์ลัดแก้ไข (ลูกศร, R, Delete, Backspace, Ctrl+Z, Ctrl+Y)
- ในแถบสถานะ `PlaygroundStatusBar` แสดงสถานะจำลองสด และมีปุ่ม "กลับไปแก้ผัง" กดแล้วจะหยุดจำลองและปลดล็อกผังกลับสู่โหมดแก้ไข
- สร้างเทสต์ชุดใหม่ใน `src/components/simulation/sim-mode-locking.test.tsx` (6/6 passed)
- Verify: `make lint` 100% ผ่าน, `make test` 100% ผ่าน (44 files, 681 tests passed)

## [2026-10-14] feat-055 แท็บ 'จำลอง' — ตรวจผัง + ตั้งค่าจำลองในที่เดียว

- ปรับปรุง `SimulationPanel` (`src/components/simulation/simulation-panel.tsx`) เป็น 2 ขั้นตอนในแท็บเดียวตาม UX mockup:
  - **ขั้นที่ 1 ตรวจผัง**:
    - ผังผ่าน: แสดงกล่องเขียวสั้นพร้อมติ๊กถูก "ผังผ่านการตรวจ"
    - ผังติด: แสดงหัวข้อสีแดง "ต้องแก้ก่อนจำลอง (N)" พร้อมรายการปัญหาภาษาคน กดแต่ละข้อแล้วจะเลือกวัตถุบนผังและเลื่อนดูตำแหน่งนั้น
    - คำแนะนำ (Warning): พับซ่อนไว้ใน `<details>` ภายใต้ชื่อ "คำแนะนำ — ไม่แก้ก็จำลองได้ (N)"
  - **ขั้นที่ 2 ตั้งค่าการจำลอง**:
    - สไลเดอร์ลูกค้าต่อชั่วโมง (10–80 คน/ชม.)
    - ปุ่มเลือกความเร็วจำลอง 1× / 2× / 4×
    - เช็กบ็อกซ์เปิด/ปิด Heatmap ความหนาแน่นทางเดิน
    - **ปุ่มเริ่มจำลองตาม PRD §9 ข้อ 9**: ตอน Blocked ใช้ `aria-disabled="true"` (ไม่ใช้ HTML disabled เพื่อไม่ให้เงียบ) ข้อความ "แก้อีก N ข้อก่อนเริ่ม" เมื่อคลิกจะขึ้น Toast เตือนและพาไปเลือกข้อแรกที่ต้องแก้โดยอัตโนมัติ
- เชื่อมต่อ `PlaygroundPanel` และ `PlaygroundEditor` ให้ส่ง `onFocusIssue` และ `onToast` ไปยัง `SimulationPanel`
- ปรับปรุงแถบสถานะ `PlaygroundStatusBar` ซ่อน CTA "ไปตั้งค่าจำลอง" เมื่อเปิดแท็บ 'check' อยู่แล้ว และมีปุ่ม "พาไปดู / ข้อถัดไป" ไล่ focus issue
- ปรับปรุงเทสต์ใน `src/components/simulation/simulation-gate.test.tsx` ให้ตรวจ `aria-disabled="true"` แทน disabled และจำลองการคลิกตอน Blocked เพื่อยืนยันว่าไม่เริ่มจำลองและมี Toast เตือน (13/13 passed)
- Verify: `make lint` 100% ผ่าน (Boundary Pure TS OK, 0 errors, 0 warnings), `make test` 100% ผ่าน (43 files, 675 tests passed)

## [2026-10-14] feat-054 ข้อความปัญหาผังเป็นภาษาคน

- สร้างโมดูล Issue Humanizer & Formatter (`src/core/validation/formatter.ts`) ใน Pure TypeScript:
  - `getTableNumbers()` ให้หมายเลขโต๊ะ 1, 2, 3... ตามลำดับโต๊ะในผัง
  - `getObjectName()` แปลงวัตถุหรือ ID เป็นชื่อเรียกเข้าใจง่าย เช่น "โต๊ะ 1", "เก้าอี้โต๊ะ 1", "เคาน์เตอร์", "ครัว", "ทางเข้าร้าน"
  - `formatIssueHuman()` แปลงทุก issue code เป็นหัวข้อสั้น (title) และคำแนะนำ (hint) ภาษาไทยที่ระบุชิ้นงานคู่กรณีและตัวเลขระยะ ซม. รูปธรรม
- ปรับปรุง `artboard.tsx` ให้แสดงป้ายชื่อ "โต๊ะ N" บนโต๊ะ แทนชื่อขนาด ให้ตรงกับข้อความปัญหา
- ขยาย `LiveValidation` ใน `src/components/validation/use-live-validation.ts` ให้แนบ `humanIssues` พร้อมหัวข้อและคำแนะนำภาษาคน
- เขียน Unit Tests ใน `formatter.test.ts` (6 tests passed) ครอบคลุม completeness, collision, clearance และ accessibility
- Verify: `make lint` 100% ผ่าน (Boundary Pure TS OK, 0 errors, 0 warnings), `make test` 100% ผ่าน (43 files, 675 tests passed)

## [2026-10-14] feat-053 Floating Selection Toolbar รุ่นใหม่

- สร้างและปรับปรุง `SelectionToolbar` (`src/components/editor-2d/selection-toolbar.tsx`) ตาม mockup `design-html/playground-ux/index.html`:
  - ลอยติดวัตถุที่เลือก (วางด้านบน แต่สลับไปด้านล่างเมื่อชิดขอบบน)
  - ปุ่มหมุน 90°
  - ปุ่มทำซ้ำ (Duplicate) วางลงจุดว่างที่ใกล้ที่สุดด้วย `findAvailableSpot()` พร้อมเลือกวัตถุใหม่และแจ้ง toast
  - ปุ่มสลับที่นั่ง 2 ↔ 4 ที่นั่ง (เฉพาะชุดโต๊ะ) เรียก `toggleTablePreset` เก้าอี้ตามทั้งชุด ไม่เกิด orphan chair 100%
  - ปุ่ม '⋯' Popover ปรับตำแหน่ง X/Y ละเอียด (snap 0.25 ม.)
  - ปุ่มลบ พร้อม Cascade delete เก้าอี้ลูกเมื่อลบโต๊ะ และแจ้ง toast บอกจำนวนพร้อมแนะนำ Ctrl+Z เพื่อย้อนกลับ
  - รองรับคีย์ลัด: ลูกศร (0.25 ม.), Shift+ลูกศร (1 ม.), R (หมุน), Delete/Backspace (ลบพร้อม toast), Esc (ยกเลิกการเลือก)
- เพิ่มฟังก์ชัน `toggleTablePreset` ใน `src/core/layout/table-set.ts` (Pure TypeScript)
- เพิ่ม action `toggleTableSeats` และ `duplicateObject` ใน `src/store/use-layout-store.ts`
- เพิ่ม Unit Tests ใน `selection-toolbar.test.tsx` (7 tests passed) และ `table-set.test.ts` (4 tests passed)
- Verify: `make lint` 100% ผ่าน (0 errors, 0 warnings), `make test` 100% ผ่าน (42 files, 668 tests passed)

## [2026-10-14] feat-052 แท็บ 'ร้าน' + Onboarding Dialog ผังใหม่

- สร้างคอมโพเนนต์ `OnboardingModal` (`src/components/editor/onboarding-modal.tsx`) บน Accessible Radix Dialog:
  - ถามขนาด กว้าง × ลึก (snap 0.25 ม., clamp 2–30 ม.)
  - เครื่องมือเลือกผนังทางเข้า (บน / ล่าง / ซ้าย / ขวา) พร้อมจำลองภาพร้านย่อแบบ interactive
  - ปุ่ม "ใช้ผังตัวอย่างแทน" โหลดผังตัวอย่าง Ready คาเฟ่ 8×6 ม.
  - ปุ่ม "เริ่มจัดร้าน" สร้างผังตามขนาดและวางทางเข้ากลางผนัง
  - รองรับ Esc และ Focus Trap ตามมาตรฐาน a11y
- เชื่อมต่อ `OnboardingModal` ใน `PlaygroundHeader` ผ่านเมนูโปรเจกต์ "เริ่มผังใหม่"
- ปรับปรุง `RoomSettingsForm` ในแท็บ 'ร้าน':
  - เพิ่ม Segmented Buttons 4 ด้านสลับผนังทางเข้าสะดวกสบาย
  - เพิ่มคำแนะนำ "ทางลัด: กดที่ป้าย 'เข้า' บนผังเพื่อมาหน้านี้"
- ปรับปรุง `artboard.tsx` ให้การคลิกหรือกด Enter/Space บนป้าย 'เข้า' (EntranceMarker) สลับมาที่แท็บ 'ร้าน' อัตโนมัติ
- เขียน unit tests ใน `onboarding-modal.test.tsx` (3/3 passed) และปรับปรุง `forms.test.tsx` (24/24 passed)
- Verify: `make lint` 100% ผ่าน, `make test` 100% ผ่าน (41 files, 657 tests passed)

## [2026-10-14] feat-051 แท็บ 'เพิ่ม' — แคตตาล็อก วางอัตโนมัติ ผังตัวอย่าง และ Empty State

- สร้างฟังก์ชันหาจุดว่างอัตโนมัติ `findAvailableSpot()` ใน `src/core/layout/spot-finder.ts` (Pure TypeScript):
  - ค้นหาพิกัดบนกริด 0.25 ม. โดยคำนวณ Bounding Box ของวัตถุรวมเก้าอี้
  - ป้องกันไม่ให้วัตถุล้นขอบร้าน และไม่ทับ Door Clearance Zone (1.2 ม. หน้าประตูทุกผนัง)
  - ป้องกันการชนกับวัตถุเดิม โดยพยายามเว้น Clearance 0.9 ม. (ทางเดินรอง) -> 0.6 ม. (ทางเข้าเก้าอี้) -> ไม่ชน (0.05 ม.)
  - อัปเดต `use-layout-store.ts` ให้เรียกใช้ `findAvailableSpot()` อัตโนมัติเมื่อกดเพิ่มวัตถุทั้ง 4 ชนิด และเลือกวัตถุนั้นทันที
- สร้างผังตัวอย่าง "คาเฟ่ 8 × 6 ม." (`createSampleCafeLayout`) ผ่านการตรวจสอบได้สถานะ **Ready** 100% จาก Validation Engine จริง
  - เพิ่ม action `loadSampleLayout` ใน store ให้วางทับผังเดิมแบบบันทึกประวัติ (Undoable) ตาม PRD §9 ข้อ 13
- เพิ่ม Empty State กลาง Artboard เมื่อ `layout.objects.length === 0` แสดงการ์ดแนะนำพร้อมปุ่ม "หรือใช้ผังตัวอย่าง"
- เพิ่มการ์ดสรุปผลจำลองรอบล่าสุดในแท็บ 'เพิ่ม' (เมื่อมีผลจำลองใน simulation store)
- เพิ่ม Unit Tests ใน `spot-finder.test.ts` (4/4 passed) และอัปเดต `use-layout-store.test.ts` (27/27 passed)
- Verify: `make lint` 100% ผ่าน (0 errors, 0 warnings), `make test` 100% ผ่าน (40 files, 654 tests passed)

## [2026-10-14] feat-050 Playground App Shell ใหม่ (Header + Rail + Panel + Status Bar)

- สร้างและรื้อโครงหน้า `/playground` ใหม่ทั้งหมดตาม mockup `design-html/playground-ux/index.html`:
  - `playground-header.tsx`: ยุบ actions เดิมเข้าเมนูโปรเจกต์ (ผังใหม่, เปิด JSON, บันทึก JSON, ขนาดร้าน, บัญชีออนไลน์/CloudModal), ปุ่มสลับ 2D|3D อยู่กลาง Header, Undo/Redo, ตัวบอกสถานะบันทึกร่างอัตโนมัติ, เมนูส่งออก (PNG, SVG, รายงานพิมพ์/PDF, สร้างลิงก์แชร์)
  - `playground-rail.tsx`: Rail ซ้าย 3 แท็บ (เพิ่ม, ร้าน, จำลอง) พร้อม Badge ตัวนับปัญหาอัตโนมัติ
  - `playground-panel.tsx`: แผงซ้ายสลับคอนเทนต์ตามแท็บที่เลือกแทน Accordion เดิม
  - `playground-status-bar.tsx`: แถบล่างของ Stage แสดง Zoom controls + สถานะผัง (Ready/Warning/Blocked) + รายละเอียดปัญหา + ปุ่ม CTA นำทาง
  - `cloud-modal.tsx`: Accessible Dialog สำหรับจัดการคลาวด์ผังร้าน
  - อัปเดต `playground-editor.tsx` และ `app/globals.css` สำหรับ layout grid `.playground-shell` รองรับ responsive desktop-first ไม่เกิด horizontal scroll
- ติดตั้ง `pg` / `@types/pg` devDependencies แก้ typecheck ของ mock-backend, ทำความสะอาด unused imports
- Verify: `make lint` 100% ผ่าน, `make test` 100% ผ่าน (39 files, 647 tests passed)

## [2026-10-14] feat-049 ปิดการตัดสินใจ Playground UX Revamp

- ผู้ใช้ตอบ: ปุ่มเริ่มจำลองตอน Blocked กดได้ตาม mockup (aria-disabled, ไม่เริ่ม, พาไปข้อที่ต้องแก้) · สรุปจบรอบเป็นการ์ด · ทำผังตัวอย่างรอบนี้ · เมนูโปรเจกต์/ส่งออกตาม mockup
- บันทึกใน `PRD.md` §9 ข้อ 9–15; แก้หลักการ P2 Gate ใน `AGENTS.md` และ `SKILL.md` ให้ตรงกัน (กฎ "Blocked เริ่มจำลองไม่ได้" ยังเหมือนเดิม เปลี่ยนเฉพาะวิธีแสดงปุ่ม)
- เติมรายละเอียดที่ตกลงแล้วลง feat-051 (ผังตัวอย่างต้อง Ready) และ feat-055 (พฤติกรรมปุ่ม + ต้องแก้ `simulation-gate.test.tsx`)
- Verify: `make status` ผ่าน · เปลี่ยนเฉพาะเอกสาร ไม่ได้แตะโค้ด จึงไม่ได้รัน `make test`

## [2026-10-14] วางแผน Playground UX Revamp → แตกงาน Sprint 3 (feat-049 → feat-060)

- Brainstorm UX กับผู้ใช้: ผู้ใช้หลักคือเจ้าของร้านที่ไม่เคยใช้เครื่องมือออกแบบ, ห้ามแก้ผังระหว่างจำลอง (ต้องจบรอบก่อน), 3D เลือก/ขยับได้เมื่อยังไม่จำลอง
- Mockup HTML ที่ใช้งานได้: `design-html/playground-ux/index.html` (7 สถานะ, responsive) — ผู้ใช้ขอปรับ 2 รอบ: รวม "ตรวจผัง" กับ "ตั้งค่าจำลอง" เป็นแท็บเดียว, เอา stepper ออกแล้วย้ายปุ่ม 2D|3D ขึ้น header
- เพิ่ม feat-049 → feat-060 (sprint 3, ทุกงานมีฟิลด์ `ux_ref` ชี้ mockup) — feat-049 เป็นงานปิดคำถามที่ค้าง ต้องทำก่อน
- Verify: `make status` ผ่าน 61 งาน ไม่มี dependency เสีย/วน · ยังไม่แตะโค้ดแอป

## [2026-10-12 20:00] ปรับ Landing Page สำหรับมือถือ (ตามที่ผู้ใช้ขอ)

- เพิ่มบล็อก `@media(max-width:600px)` และ `(max-width:360px)` ใน `design-html/index.html` แล้วสร้าง `app/(marketing)/landing.css` ใหม่ด้วย `scripts/scope_landing_css.py`
- เมนูบนหัวเว็บเป็นแถวเดียว (เดิม 2×2), ปุ่ม CTA หลัก/ส่งข้อความเต็มความกว้าง, ขั้นตอน "วิธีใช้งาน" เป็นภาพเล็กซ้าย-ข้อความขวา, ซ่อนภาพสเก็ตช์ในกล่องติดต่อ, ลดช่องว่าง → หน้าสั้นลง ~800px ที่ 375px
- Verify: `npx playwright test e2e/responsive.spec.ts e2e/a11y.spec.ts` ผ่าน 26/26, `vitest` ผ่าน 642/642

## [2026-10-12 12:40] ต่อ FE กับ `/v1/me` (บางส่วนของ feat-041 / feat-042 ตามที่ผู้ใช้ขอ)

- BFF: `src/server/account-repository.ts` (GET/PUT/DELETE `/v1/me`, `/v1/me/export`, `/v1/me/merge-guest`), route ใหม่ `GET|DELETE /api/me`, `GET /api/me/export`
- ล็อกอิน (jwt callback, `trigger === "signIn"`): `syncSignIn()` ใน `src/server/account-sync.ts` → `PUT /v1/me` ทุกครั้ง (ล้มเหลวแค่ log) และถ้า cookie เดิมเป็น Guest แล้วล็อกอิน GitHub → `POST /v1/me/merge-guest` (ล้มเหลว = ล็อกอินไม่สำเร็จ ผัง Guest ไม่หาย)
- `GET /api/me` ยังไม่มีโปรไฟล์ใน Backend → สร้างจาก session ให้ทันที (session เก่าก่อนมีการซิงก์)
- UI: `src/components/editor/account-panel.tsx` (บัญชีของฉัน: ประเภท/ชื่อ/อีเมล, ดาวน์โหลดข้อมูล JSON, ลบบัญชีแล้วออกจากระบบ, ปุ่มเชื่อม GitHub สำหรับ Guest); ปุ่ม "เข้าสู่ระบบด้วย GitHub" เมื่อ server เปิด provider
- QA: unit 642/642 (+13 ใน `account-handlers.test.ts` ผ่านตัวตรวจสัญญา), make lint ผ่าน, E2E (account-share-contact, editor-flow, a11y, responsive, keyboard) 50/50, ทดสอบบนเบราว์เซอร์จริง: Guest → เห็นโปรไฟล์ → ดาวน์โหลดไฟล์ → ลบบัญชี → ออกจากระบบ
- ยังไม่ได้ทดสอบ Guest → GitHub แบบ end-to-end (ต้องมี GitHub OAuth app) — มี unit test ของ merge แทน
- ที่ยังขาดของ feat-041/042: Google/LINE, หน้านโยบายความเป็นส่วนตัว, ยืนยันลบสองชั้น, E2E ของ flow บัญชี

## [2026-10-10 20:30] Refactor รวมโค้ดซ้ำ (ไม่เปลี่ยนพฤติกรรม)

- BFF: helper HTTP (`json`, `problem`, `readJson`, `withBackendErrors`, `tooManyRequests`, `zodDetails`, `retryMinutes`) ย้ายจาก `layout-handlers.ts` ไป `src/server/http.ts`; เพิ่ม `withUser()` (401 + แปลง error Backend) ใช้แทนโค้ดตรวจ Session ที่ซ้ำใน layout/share handlers
- `src/lib/format.ts`: `formatDateTime`, `formatNumber`, `DAY_MS` (แทน `toLocaleString("th-TH")` ที่กระจาย 6 จุด และ `DAY_MS` 2 จุด)
- `apiErrorText()` ใน `api-client.ts`, `useCopyToClipboard()` ใน `src/lib/use-copy-to-clipboard.ts`
- UI ใหม่ใน `src/components/ui`: `ErrorText`, `LoadError`, `StatusDot`, `SummaryTable` (หน้าแชร์ + รายงานพิมพ์ใช้ร่วม); playground ใช้ `PanelSection` แทน hr+section ซ้ำ 5 ชุด
- store: `layoutActions()` ใช้แทน `const actions = () => layoutStore.getState()` ใน 3 component
- core: `EPSILON` อยู่ `src/core/layout/epsilon.ts` (ภายใน ไม่ export ผ่าน index → API ของแพ็กเกจ core ไม่เปลี่ยน)
- ไม่แตะ `mock-backend/` (ตั้งใจให้แยกจาก BFF เพื่อเป็นตัวแทน Backend อิสระ)
- QA: make test 623/623 (+1 = เคส boundary ของไฟล์ core ใหม่), make lint ผ่าน, build ผ่าน, core:smoke ผ่าน, E2E Node 47/50 แบบขนาน → 3 เคสที่ล้มอยู่ใน account-share-contact และล้มแบบสุ่ม (โค้ดก่อน refactor ล้ม 6/8 ในไฟล์เดียวกัน); รันไฟล์นั้นแบบ `--workers=1` ผ่าน 8/8

## [2026-10-10 19:30] แก้ตาม Code Review ก่อน commit (8 จาก 9 ข้อ)

- กล่องลิงก์ที่เพิ่งสร้าง: แสดงเฉพาะของผังที่เปิดอยู่และยังใช้งานได้ (ยกเลิก/หมดอายุ/เปลี่ยนผัง → ซ่อน)
- ปุ่ม "ตั้งอายุใหม่": ต้องเลือกอายุก่อน (เดิมค่าเริ่มต้น "ไม่หมดอายุ" ทำให้ลิงก์ที่ตั้งเวลาไว้กลายเป็นถาวรได้ในคลิกเดียว)
- BFF log สถานะ/code/path/สาเหตุ เมื่อ Backend ขัดข้องแบบที่ผู้ใช้ไม่เห็นรายละเอียด (BackendError มี path)
- หน้า /share ตอน Backend ล่ม → หน้าแจ้ง "เปิดผังไม่ได้ชั่วคราว" (เดิมเป็นหน้า error ของ Next.js)
- แผงลิงก์แชร์ไม่ยุบระหว่างบันทึก (แยก visible / fetchEnabled) — แก้ที่ต้นเหตุของการคลิกพลาดใน E2E
- GET ไม่ลองซ้ำเมื่อหมดเวลา (ลองซ้ำเฉพาะเครือข่ายล้ม / 502–504)
- โควตา 200 / 20 / 365 อยู่ที่ `src/server/limits.ts` ที่เดียว + contract test ตรวจว่าตรงสัญญา
- production สร้าง URL ของ OG image จาก `SITE_URL` เท่านั้น (ไม่เชื่อ Host header)
- ไม่แก้: หน้าลิงก์ที่ยกเลิกตอบ 200 — App Router ตั้งสถานะ 410 ให้หน้าไม่ได้ ต้องใช้ middleware ที่เรียก Backend ซ้ำทุกครั้ง (API ตอบ 410 ถูกต้องแล้ว, หน้าเป็น noindex)
- E2E โหมด Cloudflare จำกัด 2 workers: wrangler dev (workerd ตัวเดียว) รับคำขอขนานจาก 4 workers × 2 เบราว์เซอร์ไม่ไหวจนล้มแบบสุ่ม
- mock: outage เฉพาะ path (`{ path }`) สำหรับ E2E หน้าแชร์ตอน Backend ล่ม
- QA: make test 622/622, make lint ผ่าน, core:smoke ผ่าน, E2E Node 100/100 และ Cloudflare 100/100 (Chromium + WebKit)

## [2026-10-10 18:00] feat-035 Cloudflare spike เสร็จ + feat-043 CI (รอรันบน GitHub)

- ผู้ใช้สั่งพัก feat-041 → feat-048 จนกว่า Backend จริงจะขึ้น (ยกเว้น feat-043 ที่ปลดพักให้ทำ)
- feat-035: @opennextjs/cloudflare + wrangler — E2E ทั้งชุดผ่านบน workerd (`make e2e-cf`) 98/98; bundle 7.4 MB / gzip 1.8 MB; แก้ metadataBase ของหน้าแชร์ (Workers เดา origin ไม่ได้); ผล + สิ่งที่ต้องทดสอบบนบัญชีจริงอยู่ใน harness/sprint-2.md
- feat-043: `.github/workflows/ci.yml` 3 job (checks / e2e Node / e2e Cloudflare) — ทุกคำสั่งผ่านในเครื่อง, npm ci จาก lockfile ผ่าน; รอ push + branch protection
- devDeps ใหม่: @opennextjs/cloudflare, wrangler; ignore .open-next / .wrangler / .dev.vars
- QA: make test 619/619, make lint ผ่าน, make e2e 49/49 (Chromium), E2E_WEBKIT=1 make e2e-cf 98/98

## [2026-10-10 16:30] feat-038 → feat-040: Backend จำลอง, BFF ต่อ Backend ตามสัญญา, จัดการลิงก์แชร์

- feat-038: `mock-backend/` (fetch handler + HTTP server port 4010) ทำงานตามสัญญาครบ; `contracts/contract-checker.ts` ห่อ fetch ตรวจทั้ง request/response
- สัญญา 1.1.0: เพิ่ม `5XX` ทุก operation — เจอตอนเทสต์ฟอร์มติดต่อกับ Backend ล่ม (สัญญาเดิมไม่ได้บอกว่า Backend ตอบ 503 ได้)
- feat-039: ลบ memory repository/delivery/limiter ฝั่ง BFF ทั้งหมด — dev/test ใช้ Backend จำลองในตัว, production ไม่มี env → 503; timeout + GET retry; ส่งต่อ error code ที่ผู้ใช้ควรเห็นเป็นภาษาไทย
- feat-040: ตั้งอายุ/ต่ออายุ/ยกเลิกลิงก์ใน UI + หน้า /share แจ้งยกเลิก/หมดอายุ
- บั๊กที่เจอ: แผงลิงก์แชร์โหลดก่อน Backend สร้างผังเสร็จ (เพราะรายการผัง optimistic) → 404 ค้าง; แก้แล้ว + E2E ครอบ
- เทสต์ BFF เปลี่ยนจาก memory repo เป็น `src/test/backend.ts` (mock + contract checker) ทุกไฟล์ตรวจ violations ว่างตอนจบ
- Playwright เปิด mock server อัตโนมัติ (webServer 2 ตัว) และตั้ง WANGRAAN_BACKEND_URL ให้ next start
- QA: make test 619/619, make lint (รวม contract) ผ่าน, `E2E_WEBKIT=1 make e2e` 98/98, รันซ้ำ spec ที่เกี่ยวข้อง 2 รอบ 84/84, core:smoke ผ่าน

## [2026-10-10 14:30] feat-036 ปิด (ผู้ใช้อนุมัติ) + feat-037 แยก core เป็น package

- feat-036: ผู้ใช้ review สัญญาแล้ว → done
- feat-037: `packages/core` = `@bosskantaponguttarawichien-boop/wang-raan-core@1.0.0` — re-export จาก `src/core` (layout + validation) และ `ContactSchema`; หน้าเว็บยัง import `@/core/...` ตามเดิม
- ชื่อ package: GitHub Packages บังคับ scope = เจ้าของ repo → ผู้ใช้เลือกใช้ scope บัญชีตัวเอง (แทน `@wang-raan/core` ที่วางแผนไว้)
- build ด้วย tsup (ESM + CJS + d.ts) และ tsconfig ของ package ไม่มี lib "dom" — โค้ด core ที่แตะ DOM จะ build package ไม่ผ่าน (ประกาศ `crypto` ไว้ใน `packages/core/src/globals.d.ts`)
- `npm run core:smoke`: build → pack → ติดตั้งในโปรเจกต์เปล่า (นอก repo) → ESM/CJS/type ต้องได้ผลตรง `packages/core/test/fixtures/expected.json`
- `.github/workflows/publish-core.yml`: publish เมื่อ push tag `core-v<version>` — ยังไม่ได้ publish จริง
- devDeps ใหม่: tsup; vitest include `packages/*/test/**/*.test.ts`; ignore `packages/*/dist`
- QA: make test 571/571, make lint ผ่าน, core:smoke ผ่าน (และ fail เมื่อ fixture เพี้ยน)

## [2026-10-10 13:50] feat-036 สัญญา API (OpenAPI) — รอผู้ใช้ review

- `contracts/openapi.yaml`: layouts CRUD, shares (สร้าง/รายการ/เปลี่ยนวันหมดอายุ/ยกเลิก/เปิดสาธารณะ), contact-messages, me (โปรไฟล์/ส่งออก/ลบ/merge-guest), /health
- ตัดสินใจในสัญญา: path มี `/v1` ในตัว (เลี่ยง `new URL("/x", base)` ทิ้ง base path), body บันทึกผังเป็น `{ layout }` อย่างเดียว (Backend คำนวณผลตรวจเอง), `sub=anonymous` สำหรับคำขอไม่มีผู้ใช้, ของคนอื่นตอบ 404, ยกเลิก/หมดอายุลิงก์ตอบ 410, ลบผัง = ยกเลิกลิงก์ของผังนั้น, โควตา 200 ผัง/ผู้ใช้ และ 20 ลิงก์/ผัง
- `contracts/openapi.test.ts`: เทียบ JSON Schema กับ Zod จริงด้วย ajv 2020 (51 เคส); vitest include `contracts/**/*.test.ts`
- `make contract` (Redocly recommended-strict) + เรียกจาก `make lint`; devDeps ใหม่: @redocly/cli, yaml, ajv, ajv-formats
- QA: make test 568/568, make lint ผ่าน

## [2026-10-10 13:10] Sprint 2 ด่าน 0 — feat-024 + feat-034 เสร็จ

- feat-034 (คำตัดสินจากผู้ใช้): Inspector ลบตามชิ้นที่เลือกจริง — เลือกเก้าอี้ = "× ลบเก้าอี้ตัวนี้" (ตรงกับ Delete บน Artboard), เลือกโต๊ะ = ลบทั้งชุด; นิยามเส้นทางและค่าลูกค้าจำลองยืนยันตามเดิม (คอมเมนต์ในโค้ด + PRD §9 ข้อ 6–8); design-system.md: `--muted` ห้ามใช้กับข้อความ, เพิ่ม `--secondary-strong`
- feat-024: ติดตั้ง WebKit (ผู้ใช้อนุญาต) → E2E ผ่านทั้ง Chromium และ WebKit; ปรับเทสต์ตามพฤติกรรม Safari (Option+Tab, page.pdf เฉพาะ Chromium)
- พบ: `.next` cache ค้างทำให้ CSS ของ playground ไม่มีคลาส Tailwind บางตัว (print:hidden) → เคสพิมพ์ fail; `rm -rf .next` แล้วหาย
- QA: make test 517/517, make lint ผ่าน, `E2E_WEBKIT=1 make e2e` 94/94

## [2026-10-10 07:00] วางแผน Sprint 2 — หน้าเว็บพร้อมขึ้น Production (FE เท่านั้น)

- เปลี่ยนการเรียกจาก phase เป็น sprint: เพิ่มฟิลด์ `"sprint"` ใน feature_list; งาน Sprint 1 ที่เสร็จ (33 งาน) ย้ายรายละเอียดเต็มไป `feature_list.archive.json` และเก็บแบบย่อในไฟล์หลัก (`harness_state.load_features()` merge กลับให้)
- feat-024 ยกมา Sprint 2 (`carried_over_from: 1`) — ยังรอ WebKit
- เพิ่ม feat-034 → feat-048 (feat-048 = stretch) — ขอบเขต FE + BFF เท่านั้น; Backend/DB ผู้ใช้สร้างใน repo แยก (TypeScript) แล้วต่อตาม `contracts/openapi.yaml`
- ตกลงสแตก: Cloudflare Workers (FE ผ่าน OpenNext, Workers Paid) + Railway Singapore (BE Docker + Postgres) + backup ทุกคืนไป R2 + กฎตรวจผังร่วมผ่าน private package `@wang-raan/core` (GitHub Packages)
- เป้าหมาย, สแตก, ค่าใช้จ่ายประมาณการ (~550–750 บาท/เดือนเมื่อมี staging) และ Production Gate ฝั่ง FE/BE อยู่ที่ `harness/sprint-2.md`
- QA: `python3 scripts/validate_harness.py` ผ่าน 49 งาน ไม่มี dependency ขาด/วน

## [2026-10-10 06:00] แก้ตาม Code Review 10 ข้อ (feat-024 → feat-033)

- Remote repository: สถานะที่ไม่คาดไว้ = `BackendError` → Route Handler ตอบ 502 (เดิม error body ถูกนับเป็นผังที่บันทึก)
- Auth: `subjectFor()` ใช้ `<provider>-<providerAccountId>` เป็นเจ้าของผังสำหรับ OAuth (Auth.js ไม่มี adapter สุ่ม user.id ใหม่ทุกครั้งที่ล็อกอิน)
- Memory repository แยก Map ตามเจ้าของ → id ซ้ำข้ามผู้ใช้ได้ ไม่เปิดเผยด้วย 409; นำเข้าไฟล์ได้ id ผังใหม่เสมอ
- Rate limit: `clientIp` ใช้ค่าที่ proxy ต่อท้ายใน X-Forwarded-For (`TRUSTED_PROXY_HOPS`) + เพดานรวม 50 ครั้ง/10 นาที กันการปลอม IP
- นำเข้าไฟล์: snap พิกัด 0.25 ม. (เก้าอี้ขยับตามโต๊ะ), ขนาดครัว/เคาน์เตอร์ทีละ 0.05 ม.
- Inspector: ค่าเริ่มต้นลงกริด + ปรับขนาดเฉพาะเมื่อแก้ช่องขนาด; ฟอร์มขนาดร้านแตะทางเข้าเฉพาะเมื่อแก้ช่องทางเข้า
- `readJson` ใช้ร่วมกันทุก endpoint: เช็ก Content-Length + อ่าน stream แบบหยุดเมื่อเกิน; `/api/share` จำกัด 1 KB
- PrintReport สร้างเนื้อหาเฉพาะตอนพิมพ์ (beforeprint / media print)
- ลบ `scripts/__pycache__` ออกจาก git + `.gitignore`
- QA: unit 515/515, coverage core 99.6%, `make lint`, `make e2e` 47/47 (Chromium)

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
