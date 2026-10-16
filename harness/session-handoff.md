# Session Handoff — วางร้าน (Wang-Raan)

> **archive**: เก็บ 5 entry ล่าสุดเท่านั้น — รายการก่อนหน้าจะถูกย้ายไปเก็บที่
> `harness/archive/session-handoff-archive.md`

## 2026-10-16 ICT — feat-078 Character Lab V1.2: เดินไปยังจุดหมาย (เสร็จแล้ว)

- คลิกพื้นใน `/character-lab` เพื่อสร้าง marker เป้าหมาย; GLB หันตามเวกเตอร์แล้วเดิน 1.15 ม./วินาที, ใช้ Walk ระหว่างเคลื่อนและ Idle เมื่อถึงจุด
- Raycast จำกัดเป้าหมายไว้ในวงพื้นทดลอง และไม่เชื่อม worker/ผังร้าน เพื่อให้การทดสอบการเดินยังแยกจาก Simulator หลัก
- QA: `make test` 64 files / 850 tests, typecheck, lint, production build และ harness status ผ่าน

## 2026-10-16 ICT — feat-077 Character Lab V1.1: หันตัวละคร (เสร็จแล้ว)

- `/character-lab` มีปุ่มหันหน้า/ขวา/หลัง/ซ้ายพร้อม aria-pressed; scene รับ facing และหมุน GLB ไปองศาเป้าหมายด้วย shortest angle โดยตัวละครยังยืนที่เดิมและใช้ Idle
- QA: typecheck, lint และ harness status ผ่าน; ยังต้องตรวจ browser จริงเพื่อยืนยันว่าแกนหน้า GLB ตรงกับคำปุ่มก่อนเพิ่มการเดิน

## 2026-10-16 ICT — feat-076 Character Lab V1: ตัวละครยืน (เสร็จแล้ว)

- เพิ่ม `/character-lab` แยกจาก Playground: โหลด `cafe-customer.glb` ในฉาก Three.js ที่มีพื้น, grid, แสง และเงา เพื่อเช็กโมเดลและสัดส่วนก่อนเริ่มทำการเดิน
- ใช้ animation `Idle` อย่างเดียวและไม่เชื่อม Simulation Worker/ผังร้าน; `CharacterLabScene` เป็น dynamic import จึงไม่เพิ่ม runtime 3D ให้ route อื่น
- มี fallback เมื่อ reduced motion, WebGL หรือ model load ใช้ไม่ได้
- QA: `npm test` 64 files / 850 tests, typecheck, lint และ production build ผ่าน; เปิด dev server บนเครื่องนี้ไม่ได้เพราะ Node 24 เรียก `uv_interface_addresses` แล้วระบบตอบ error จึงยังไม่ได้ตรวจ browser ในรอบนี้

## 2026-10-16 ICT — fix ผังหาย/UI มือถือเพี้ยนบนเบราว์เซอร์เก่า (เสร็จแล้ว)

- `postcss.config.mjs` เพิ่ม `@csstools/postcss-media-minmax` แปลง `@media (width < Npx)` ของ Tailwind v4 เป็น `max-width` ให้ Chromium < 104 อ่านได้
- `useContainerUnits` (`src/lib/use-container-units.ts`) เป็น fallback ของ `100cqw/100cqh` ใน Artboard และ IsometricView; container ต้องมี `data-size-container` (ใส่แล้วใน `playground-editor.tsx`)
- QA: `npm test` 850 tests, lint, typecheck, build ผ่าน; ยังไม่ได้ยืนยันกับเบราว์เซอร์จริงของผู้ใช้

## 2026-10-16 ICT — feat-075 แก้ไขชุดโต๊ะที่เลือกในแผงซ้าย (เสร็จแล้ว)

- เลือกโต๊ะหรือเก้าอี้ลูกแล้ว แผงซ้ายจะเป็นหน้า “แก้ไขโต๊ะ” ของชุดโต๊ะแม่ทันที; กดกลับเพื่อเลิกเลือกและคืนหน้าเพิ่มลงผัง
- คำสั่งของชุดโต๊ะย้ายมาไว้ในแผงซ้าย: ปรับจำนวนเก้าอี้ตาม capacity, ขนาด/สไตล์, พิกัด, หมุน, ทำซ้ำ และลบ; toolbar ลอยถูกซ่อนสำหรับ Table/Chair ทั้ง 2D/3D SVG
- `setTableSetChairCount` ใน Pure Core คง id โต๊ะและเก้าอี้เดิมเท่าที่ทำได้, ไม่มี orphan และการทำซ้ำคงจำนวนเก้าอี้จริง
- QA: `make test` 62 files / 843 tests, `make lint`, `make status` ผ่าน; Chrome ตรวจเลือกโต๊ะและเพิ่ม 2 → 3 ตัวในแผงซ้าย · ตามคำขอผู้ใช้ **ไม่ได้เขียนหรือรัน E2E**

## 2026-10-16 ICT — feat-074 กำหนดจำนวนเก้าอี้ตามความจุของโต๊ะ (เสร็จแล้ว)

- หน้าเพิ่มโต๊ะใช้ปุ่ม `− / +` เลือกจำนวนเก้าอี้ได้ แทน preset 2/4 ที่นั่ง และบอกความจุสูงสุดของขนาดโต๊ะปัจจุบัน
- Pure Core ตรวจ capacity ก่อนสร้างและจัดเก้าอี้รอบโต๊ะโดยไม่ทับกัน; สร้างเกินความจุถูกปฏิเสธ และการย่อโต๊ะจนรองรับเก้าอี้เดิมไม่พอจะไม่เปลี่ยนผัง
- QA: `make test` 62 files / 839 tests, `make lint`, `make status` ผ่าน; ตรวจ Chrome: โต๊ะ 1.2 × 1.2 ม. เพิ่มถึง 8 ตัวแล้วปุ่ม `+` ถูกปิด
- ตามคำขอผู้ใช้ รอบนี้ **ไม่ได้เขียนหรือรัน E2E**

## 2026-10-16 ICT — feat-073 รวมการเพิ่มโต๊ะเป็นหน้าตั้งค่าในแผงซ้าย (เสร็จแล้ว)

- แท็บเพิ่มเหลือการ์ด “โต๊ะ” รายการเดียว; คลิกแล้วแทนเนื้อหาแผงซ้ายด้วย `table-set-create-panel.tsx` ซึ่งเลือกจำนวนที่นั่ง ขนาด และสไตล์ได้
- ปุ่ม “กลับ” ด้านบนออกจากหน้าตั้งค่าโดยไม่แก้ผัง; ปุ่มยืนยันเท่านั้นที่เรียก `addTableSet` จึงคง Table–Chair lifecycle เดิม
- QA: `make test` 62 files / 838 tests, `make lint`, `make status` ผ่าน
- ตามคำขอผู้ใช้ รอบนี้ **ไม่ได้เขียนหรือรัน E2E**; selectors E2E ที่ยังอ้าง dialog เก่าควรปรับรวมในรอบ E2E ภายหลัง
- 2026-10-16: หน้า `/playground` เคยค้างที่ dynamic loading เพราะ dev server พอร์ต 3000 ถือ `.next` cache คนละรุ่นกับโค้ด; ล้าง cache generated และรีสตาร์ต server เดียวบนพอร์ต 3000 แล้วตรวจใน Chrome ว่า editor แสดงครบและ console สะอาด

## 2026-10-16 ICT — feat-072 ตั้งค่าชุดโต๊ะก่อนวาง (เสร็จแล้ว)

- Palette ชุดโต๊ะ 2/4 ที่นั่งเปิด `table-set-create-dialog.tsx` ก่อนเพิ่มจริง เลือกจำนวนที่นั่ง, ขนาด, ทรง/ขา/สีโต๊ะ และแบบ/ขา/สีเก้าอี้ได้ครบ; ยกเลิกแล้วไม่มีวัตถุใหม่บนผัง
- `addTableSet(..., options)` ใน Core จัดขนาดและสไตล์ด้วย lifecycle เดิมใน state commit เดียว: เก้าอี้ลูกทุกตัวยังสัมพันธ์กับโต๊ะแม่และไม่มี orphan
- QA ล่าสุด: `make test` 62 files / 838 tests, `make lint` ผ่าน, Playwright `playground-ux` + `keyboard` 12/12 และ `editor-flow` 10/10 ผ่าน
