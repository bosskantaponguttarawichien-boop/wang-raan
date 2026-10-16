# Progress Log — วางร้าน (Wang-Raan)

> **archive**: เก็บ entry เดือนปัจจุบันเท่านั้น — รายการก่อนหน้าจะถูกย้ายไปเก็บที่
> `harness/archive/progress-YYYY-MM.md`

## [2026-10-16] feat-078 — Character Lab V1.2: เดินไปยังจุดหมาย

- คลิกหรือแตะพื้นใน Character Lab เพื่อกำหนดจุดหมาย; raycast พิกัดหน้าจอเข้าระนาบพื้นและรับเฉพาะจุดในวงพื้นทดลอง
- แสดงวงเป้าหมาย, ตัวละครหันไปทิศทางการเดิน, เดินด้วยความเร็ว 1.15 ม./วินาที และสลับ `Idle → Walk → Idle` เมื่อเริ่ม/ถึงจุดหมาย
- ไม่เชื่อมกับ Simulation Worker หรือผังร้าน จึงใช้ทดสอบการเคลื่อนที่ของ asset ได้แยกส่วน
- **QA**: `make test` 64 files / 850 tests, typecheck, lint, production build และ harness status ผ่าน

## [2026-10-16] feat-077 — Character Lab V1.1: หันตัวละคร

- เพิ่มปุ่ม หันหน้า / ขวา / หลัง / ซ้าย ใน Character Lab พร้อมสถานะ `aria-pressed` เพื่อใช้ตรวจโมเดลทั้งสี่ด้าน
- โมเดลคงตำแหน่งและใช้ Idle เหมือนเดิม; scene หมุนผ่าน shortest angle และค่อย ๆ เข้าองศาเป้าหมาย จึงไม่หมุนอ้อมเกินจำเป็น
- **QA**: `npm run typecheck`, `npm run lint`, `make status` ผ่าน

## [2026-10-16] feat-076 — Character Lab V1: ตัวละครยืน

- เพิ่ม route `/character-lab` เป็นพื้นที่ทดลองแยกจาก Playground และ Simulation Engine เพื่อเช็ก asset ก่อนเริ่มทำ pathfinding หรือพฤติกรรม
- ฉาก Three.js โหลดแบบ dynamic เฉพาะเมื่อเข้าหน้านี้ มีพื้น, grid, แสง, เงา และ GLB `cafe-customer`; ใช้เฉพาะ animation `Idle` จึงยังไม่มีการเดินหรือ state จาก Worker
- รองรับกรณีลดการเคลื่อนไหว, WebGL ใช้ไม่ได้ และโหลดโมเดลล้มเหลวด้วยข้อความสถานะในหน้าเดียวกัน
- **QA**: `npm test` 64 files / 850 tests, `npm run typecheck`, `npm run lint`, `npm run build` ผ่าน · build พบ route `/character-lab` เป็น static page ขนาด 2.45 kB (First Load 109 kB)

## [2026-10-16] fix — ผัง 2D หาย / UI มือถือเพี้ยนบนเบราว์เซอร์รุ่นเก่า

- อาการ: บนมือถือบางเครื่อง ผังหดเหลือจุดเล็กใต้ป้าย “8 เมตร”, คำแนะนำคีย์บอร์ดโผล่, แผงล่างไม่มีที่จับและการ์ดเรียงแนวตั้ง
- สาเหตุ: Tailwind v4 สร้าง breakpoint แบบ range (`@media (width < 767px)`) และผังใช้หน่วย `cqw/cqh` — Chromium < 104/105 ไม่รู้จักทั้งสองอย่าง จึงทิ้งกฎ `max-[767px]:*` ทั้งหมด และทิ้ง width ของผัง (เหลือ 0)
- แก้: เพิ่ม `@csstools/postcss-media-minmax` ต่อจาก Tailwind ใน `postcss.config.mjs` (แปลงเป็น `max-width/min-width`); hook `src/lib/use-container-units.ts` วัดขนาด `[data-size-container]` เป็น px เมื่อ `CSS.supports("width","1cqw")` เป็นเท็จ ใช้ทั้ง Artboard 2D และ Isometric
- **QA**: `npm test` 64 files / 850 tests, `npm run lint`, typecheck, `npm run build` ผ่าน · CSS production ไม่มี range media query เหลือ · Playwright จำลองเบราว์เซอร์ไม่รองรับ cq/range MQ ที่ 412px → ผังแสดงเต็มเหมือนเบราว์เซอร์ใหม่

## [2026-10-16] feat-075 — แก้ไขชุดโต๊ะที่เลือกในแผงซ้าย

- เลือกโต๊ะหรือเก้าอี้ลูกแล้ว แผงซ้ายเปลี่ยนเป็น “แก้ไขโต๊ะ” ของชุดโต๊ะแม่ทันที; ปุ่มกลับยกเลิกการเลือกและคืนหน้ารายการเพิ่ม
- รวมคำสั่งหมุน ทำซ้ำ ลบ, จำนวนเก้าอี้, ขนาด/ทรง/ขา/สีโต๊ะและเก้าอี้ รวมถึงพิกัด X/Y ไว้ที่เดียว; toolbar ลอยไม่แสดงกับ Table/Chair ทั้ง 2D และ SVG isometric
- Core `setTableSetChairCount` รักษาโต๊ะเดิม, เก็บ id เก้าอี้เดิมเท่าที่จำนวนยังพอ, สร้าง/ลบลูกอย่างครบชุด และปฏิเสธจำนวนที่เกินความจุ; การทำซ้ำยังคงจำนวนเก้าอี้จริงของต้นฉบับ
- **QA**: `make test` 62 files / 843 tests, `make lint`, `make status` ผ่าน · ตรวจ Chrome: เลือกโต๊ะแล้วแผงแก้ไขแสดงครบ และเพิ่ม 2 → 3 ตัวสำเร็จ · ไม่ได้เขียนหรือรัน E2E ตามคำขอผู้ใช้

## [2026-10-16] feat-074 — กำหนดจำนวนเก้าอี้ตามความจุของโต๊ะ

- หน้าตั้งค่าโต๊ะเปลี่ยนจากตัวเลือก 2/4 ที่นั่งเป็นปุ่ม `− / +` สำหรับจำนวนเก้าอี้ และปุ่มยืนยันบอกจำนวนที่จะสร้างจริง
- Core คำนวณความจุรอบขอบโต๊ะจากความกว้างเก้าอี้ 0.50 ม. และระยะห่าง 0.10 ม.; โต๊ะ 1.2 × 1.2 ม. รองรับสูงสุด 8 ตัว และปุ่ม `+` ปิดเมื่อถึงขีดจำกัด
- การสร้างตรวจความจุซ้ำใน Pure TypeScript; สร้างเกินความจุถูกปฏิเสธ, การย่อโต๊ะจนไม่พอสำหรับเก้าอี้เดิมไม่เปลี่ยนผัง, และเก้าอี้ลูกยังผูก `tableId`/`chairIds` ครบ
- **QA**: `make test` 62 files / 839 tests, `make lint`, `make status` ผ่าน · ตรวจใน Chrome ว่าเพิ่มถึง 8 แล้วปุ่ม `+` ถูกปิด · ไม่ได้เขียนหรือรัน E2E ตามคำขอผู้ใช้

## [2026-10-16] feat-073 — รวมการเพิ่มโต๊ะเป็นหน้าตั้งค่าในแผงซ้าย

- แท็บเพิ่มเหลือการ์ด “โต๊ะ” เพียงรายการเดียว; กดแล้วแผงซ้ายเปลี่ยนเป็นหน้าตั้งค่า แทนหน้าต่างลอย
- หน้าตั้งค่าเลือก 2/4 ที่นั่ง ขนาด และรูปแบบโต๊ะ/เก้าอี้ได้ตามเดิม; ปุ่ม “กลับ” ด้านบนพากลับสู่รายการเพิ่มโดยไม่สร้างหรือแก้ผัง
- กด “เพิ่มโต๊ะ … ลงผัง” จึงสร้าง Table พร้อม Chair ลูกผ่าน lifecycle เดิมและยังรวมเป็น Undo ขั้นเดียว
- **QA**: `make test` 62 files / 838 tests, `make lint`, `make status` ผ่าน · ตามคำขอผู้ใช้ **ไม่ได้เขียนหรือรัน E2E** ในรอบนี้

## [2026-10-16] feat-072 — ตั้งค่าชุดโต๊ะก่อนวางลงผัง

- กด “ชุดโต๊ะ 2/4 ที่นั่ง” จากแท็บเพิ่มแล้วเปิดหน้าต่างตั้งค่าก่อนเสมอ: จำนวนที่นั่ง, ขนาด, ทรง/ขา/สีโต๊ะ และแบบ/ขา/สีเก้าอี้
- ใช้ `TableSetStyleControls` ชุดเดิมในโหมด controlled เพื่อให้ตัวเลือกตอนสร้างและตอนแก้ไขใช้กติกาเดียวกัน; กด “ยกเลิก” ไม่แก้ผัง
- Core `addTableSet` รับ `TableSetCreationOptions` และปรับขนาด/สไตล์ก่อน commit เดียว ทำให้ Table–Chair lifecycle, snap และเก้าอี้ลูกยังครบชุด
- อัปเดต unit/integration และ Playwright helpers ให้ยืนยัน dialog ก่อนใช้โต๊ะ: **QA** `make test` 62 files / 838 tests, `make lint` ผ่าน, E2E Playground UX + keyboard 12/12 และ editor-flow 10/10 ผ่าน

## [2026-10-16] feat-071 — รูปลักษณ์และขนาดชุดโต๊ะ

- เพิ่ม `style` (optional, enum) ให้ Table/Chair: ทรงโต๊ะ สี่เหลี่ยม/กลม, ขาสี่ขา/ขาเดี่ยว, 6 สี; เก้าอี้มีพนักพิง/สตูล — Zod + OpenAPI strict ไม่รับ hex อิสระ
- Core `resizeTableSet` จัดเก้าอี้ใหม่รอบโต๊ะ (คง id, ฝั่ง, ระยะสอด 0.10 ม., มุมหมุน) · `setTableSetStyle` ใช้สไตล์เก้าอี้กับทั้งชุด; เปลี่ยนเป็นโต๊ะกลมย่อเป็นจัตุรัสตามด้านสั้นเพื่อไม่ให้ footprint ขยาย
- UI: ปุ่ม "แบบ" ในแถบเครื่องมือของชุดโต๊ะ → แผงขนาด/ทรง/ขา/สี (radio ป้ายไทย, Escape คืนโฟกัส); สะท้อนใน 2D, SVG isometric และ Three.js
- **QA**: `make test` 838/838, `make lint` ผ่าน; ตรวจในเบราว์เซอร์ 2D/3D แล้ว · ยังไม่ได้รัน `make e2e`

## [2026-10-16] feat-070 — ซ่อน Person ก่อนเริ่มจำลอง

- ถอดตัวละคร GLB แบบ Idle ที่วางเป็นค่าเริ่มต้นใน `three-view.tsx` ออกแล้ว ดังนั้นมุมมอง 3D ขณะจัดผังจะแสดงเฉพาะห้องและเฟอร์นิเจอร์
- ตัวละคร GLB ยังคงถูกสร้างตาม output ของ Simulation Controller เฉพาะหลังเริ่มจำลอง เพื่อรักษาฟังก์ชันเดินตามผล P2 ไว้
- **QA**: `npm test` 62 files / 822 tests, `npm run typecheck`, `npm run lint` ผ่าน; เปิด `/playground` ในเบราว์เซอร์จริงและยืนยันว่าไม่มี Person ก่อนเริ่มจำลอง
- **มุมกล้อง isometric**: เปลี่ยนกล้อง Orthographic ให้เยื้องจากจุดกลางเท่ากันบนแกน X/Y/Z (azimuth 45° + elevation 35.264°) แทนมุมแบบ top-down เดิม; ดูในเบราว์เซอร์แล้วแนวแกนพื้นซ้าย/ขวาสมมาตรและฉากไม่ถูกตัดขอบ. QA ซ้ำ: `npm test` 822/822, typecheck และ lint ผ่าน

## [2026-10-15] feat-070 — Three.js Runtime: ตัวละคร GLB เดินได้

- เพิ่มโมเดล 3D local `public/assets/models/cafe-customer.glb` (458 KB): คาแรกเตอร์ chibi ตามภาพอ้างอิง—หมวกน้ำเงิน, ผมหยิก, ฮู้ดครีม, กระเป๋าคาดอก, กางเกงน้ำเงิน, รองเท้าขาว—พร้อม rig และท่า `Idle`/`Walk`
- `three-view.tsx` สร้างห้อง/เฟอร์นิเจอร์ WebGL และ clone GLB ตาม output ของ Simulation Controller; สลับท่ายืน/เดินจาก state และทำให้ตัวละครเคลื่อนตามตำแหน่ง simulation จริง
- `isometric-view.tsx` lazy-load Three.js เมื่อเลือก 3D เท่านั้น; คง SVG isometric สำหรับ WebGL ใช้ไม่ได้/JSDOM/reduced motion และคงควบคุมวัตถุด้วย Arrow/R/Delete/Escape ใน WebGL
- อัปเดต E2E ให้ยืนยัน Three canvas แทน SVG role เดิม; ตรวจในเบราว์เซอร์จริงแล้วว่าเริ่มจำลองและเห็น chibi GLB หลายตัวเดินในฉาก
- **QA**: `npm test` 62 files / 822 tests, `npm run typecheck`, `npm run lint`, Playground UX 6/6 และ backend/login แบบลำดับเดียว 19/19 ผ่าน; `make e2e` แบบ 4 workers ผ่าน 88/91—ที่เหลือเป็น timeout shared mock backend และ Google navigation เดิม, รันแยก workers=1 ผ่านครบ

## [2026-10-15] feat-069 — โมเดลโต๊ะ/เก้าอี้ 3D เรียวขึ้น

- เดิมขาโต๊ะ 0.13 ม. และพนักพิงเป็นก้อนทึบ → ท็อปขาว 3px ยื่นคลุมขาไม้เรียว 0.05 ม.; เก้าอี้ขาโลหะ 0.035 ม., เบาะ 3px, พนักพิงแผ่นบางบนเสา 2 ต้น
- ระดับท็อปโต๊ะ z = 34 และระดับนั่ง z = 18 คงเดิม (ตัวคนนั่งที่อีกเซสชันกำลังทำอิงค่านี้)
- ขาไม่บางกว่า 1–1.2px บนจอในร้านใหญ่ (เดิม cap ตามขนาดโต๊ะทำให้เหลือ < 1px)
- ไม่ได้แตะ `iso-person.ts` / `iso-simulation-overlay.tsx` (อีกเซสชันดูเรื่องตัวคน)
- **QA**: `make test` 822/822 · `make lint` ผ่าน · (รอบแรกมี validation-ui fail 1 ข้อเพราะรันพร้อมอีกเซสชัน — รันซ้ำผ่าน)

## [2026-10-15] feat-068 — จำลองลูกค้าในมุมมอง 3D

- ผู้ใช้แจ้ง: จำลองแล้ว 3D ไม่เคลื่อนไหว — สาเหตุ `SimulationOverlay` อยู่แค่ใน Artboard 2D
- `iso-simulation-overlay.tsx`: ลูกค้าเป็นตัวคน (เงา/ลำตัว/หัว, สีตามสถานะ, นั่ง = ยกขึ้นระดับเบาะ) บน canvas ทับ SVG, interpolate เหมือน 2D · Heatmap เป็น `<image>` ใน SVG ด้วย matrix isometric ใต้เฟอร์นิเจอร์
- ตัวคนแบบ chibi ตามภาพอ้างอิง (`iso-person.ts`, วาด canvas ล้วน): หน้าตาคงที่ต่อ id, ผม/หมวก 6 แบบ, หัน 4 ทิศ, แขนขาแกว่งตามระยะเดิน, นั่งหันเข้าโต๊ะ, วงสีสถานะใต้เท้าแทนสีตัว
- บั๊ก: "final argument passed to useEffect changed size" ตอน HMR (deps เพิ่ม layout) → อ่านผังผ่าน ref, deps คงที่ `[scene, active]` · ถ้าหน้าเดิมยังค้าง error ให้รีเฟรชหน้า
- เทสต์ "3D ไม่มี canvas" แคบลง: canvas ได้เฉพาะชั้นจำลอง (ตัวโมเดลยัง SVG ล้วน)
- ข้อจำกัด: คนวาดทับเฟอร์นิเจอร์เสมอ (ไม่มี occlusion) — คนหลังเคาน์เตอร์จะเห็นทะลุ
- **QA**: `make test` 812/812 · `make lint` ผ่าน · เบราว์เซอร์จำลองใน 3D เห็นคนเคลื่อนที่ + heatmap, console สะอาด · ยังไม่ได้รัน `make e2e`
- **Mock ท่าทาง (รอบ 3)**: เปลี่ยนตัวคนจากแค่สีสถานะเป็นภาษากายที่อ่านได้ทันที: เดิน, รอคิวดูโทรศัพท์, ยกเมนูสั่ง, นั่งทานกับแก้ว, เดินออกพร้อมกระเป๋า (`behaviorFromState` ใน `iso-person.ts`) · ทดสอบ mapping state → behavior เพิ่ม 1 เคส
- **Visual refresh (รอบ 4)**: ตาม feedback ผู้ใช้ ปรับรูปลักษณ์ตัวคนโดยตรงเป็น soft-toy chibi: หัวรูปไข่พร้อมไฮไลต์/หน้า, ทรงผม/หมวกใหญ่ขึ้น, ลำตัวและแขนขาเป็นทรง rounded มีแสงเงา, สัดส่วนตอนนั่งชัดขึ้น และสุ่ม accessory แบบคงที่ตาม id (แว่น/ต่างหู/คอเสื้อ) · **QA ล่าสุด**: `make test` 62 files / 820 tests ผ่าน, `make lint` ผ่าน, เปิด Playground ตัวอย่างและตรวจ 3D ระหว่างจำลองแล้ว
- **HTML visual mock (รอบ 5)**: เพิ่ม [person-mock](../design-html/person-mock/index.html) แบบ standalone สำหรับใช้ review ทิศทางก่อนลงของจริง: ฉากร้าน cutaway SVG 2.5D พร้อมตัวละคร soft-toy 5 ตัวและ action ที่อ่านได้จาก silhouette/prop (นั่งทาน+แก้ว, สั่ง+เมนู, ต่อคิว+มือถือ, เดินออก+กระเป๋า) · ปุ่มสลับช่วงเที่ยง/คิว/ช่วงเงียบใช้งานได้, console error 0, หน้าจอ 320px ไม่มี horizontal overflow · **QA ล่าสุด**: `make test` 62 files / 822 tests ผ่าน, `make lint` ผ่าน
- **Master SVG character (รอบ 6)**: เพิ่ม `#character-mali` ลงใน `<defs>` แล้ววางผ่าน `<use>` ในฉากจริงของ mock เพื่อพิสูจน์การ reuse · Mali มีผมด้านหน้า/หลังและมวย, หน้า gradient + ไฮไลต์, คิ้ว/ตา/จมูก/แก้ม/ยิ้ม, ต่างหู, เสื้อ cardigan/เสื้อชั้นใน, แขนวางโต๊ะ/ยกแก้ว, กางเกงและรองเท้า—ล้วนเป็น SVG primitives, gradients และ drop shadow ไม่มีไฟล์ภาพ · **QA**: browser render + สลับ scene ผ่าน, console error 0, `make test` 822/822, `make lint` ผ่าน
- **2.5D asset proof (รอบ 7)**: ตาม feedback ว่า SVG ยังเป็นไอคอนแบน สร้าง asset โปร่งใส `design-html/person-mock/assets/mali-seated-v1.png` ด้วย built-in image generation แล้ววางแทน Mali SVG ใน scene mock ผ่าน `<image>` · asset เป็นผู้หญิงนั่งถือกาแฟพร้อมวัสดุ/แสงเงา และ alpha จริง (`sips hasAlpha: yes`) · หมายเหตุ: ชุดตัวละครจริงต้องแทนคน vector ที่เหลือด้วย asset family เดียวกัน จึงจะได้คุณภาพสม่ำเสมอ · **QA**: mock render + console error 0, `make test` 822/822, `make lint` ผ่าน

## [2026-10-15] feat-067 — มุมมอง 3D แบบห้องตัด (cutaway) โทนขาว + ส้ม

- อ้างอิงภาพห้อง isometric ที่ผู้ใช้ส่งมา: ผนังหลังสูง `max(72, scale×2.6)` px หนา 0.20 ม. (ฝาบนตัว L + ปลายผนัง), ฐานพื้นหนา 10px, พื้น/ผนังไล่สี, เงาวัตถุ blur + AO ตามรอยต่อผนัง-พื้น
- จานสีใหม่: โต๊ะ/ครัว/ท็อปเคาน์เตอร์ขาว, เก้าอี้และตัวเคาน์เตอร์ส้ม, ขาโต๊ะไม้ส้ม, ขาเก้าอี้โลหะ, เตาเข้ม, จอ POS ฟ้า · selection ยังเป็น `--blue`
- โทเคน `--iso-*` ใน `app/globals.css` ซิงก์กับ §2.4 แล้ว (`design-tokens.test` บังคับ)
- เฟอร์นิเจอร์ พื้น ผนัง และฐาน ไม่มีเส้นขอบแล้ว (ผู้ใช้ขอ — ตามภาพอ้างอิง) — stroke = สีหน้า 0.5px ปิดรอยต่อ anti-alias, selection ยังเป็นเส้นน้ำเงิน
- การเลือกใน 3D (ผู้ใช้บอกไม่สวย — เดิมทาเส้นน้ำเงินหนาทุกหน้า/ทุกขา): เปลี่ยนเป็นเส้นรอบเงารวมทั้งชุดด้วย SVG filter (dilate→erode ปิดช่องระหว่างขา แล้วเหลือขอบนอก) + แผ่นพื้นเส้นประ `5 4` ใต้ชุด · เส้นรอบเงาหนา 1 หน่วย viewBox (ผู้ใช้บอก 2 หนาไป)
- ทางเข้า: ผนังใต้/ตะวันออก → พรมส้ม; ผนังเหนือ/ตะวันตก → ช่องประตูบนผนัง + พรม
- `<defs>` ใช้ id จาก `useId` (ตัด `:` ออก) กันชนเมื่อมีหลายฉาก · หน้าแชร์ใช้ `IsometricScene` ร่วมจึงได้ลุคใหม่ด้วย
- **QA**: `make test` 809/809 · `make lint` ผ่าน · เบราว์เซอร์ 1440/320 overflow 0, console สะอาด · ยังไม่ได้รัน `make e2e`

## [2026-10-15] feat-066 — รวมคำสั่งของ Playground ไว้ในเมนูเดียว

- แถบหัวไม่มีปุ่ม "ผังของฉัน" และ "ส่งออก ▾" แล้ว — ย้ายเข้าเมนูโปรเจกต์ แบ่งหมวด บัญชี / ไฟล์ / ส่งออกและแชร์ / ร้าน (Guest ยังมีปุ่มลัด "บันทึกออนไลน์")
- จอ < 768px เมนูเดิมล้นขอบขวา (ปุ่มอยู่กลางแถบหัว) → `fixed inset-x-2` + เลื่อนในเมนูได้ · hint ในเมนูเปลี่ยนจาก `text-muted` เป็น `text-secondary` (AA)
- PRD §9 ข้อ 14 อัปเดตตามที่อยู่ใหม่ของคำสั่ง
- **header สมดุล**: grid 3 คอลัมน์ (`1fr auto 1fr`) — ซ้าย โลโก้+ชื่อผัง · กลาง 2D|3D อยู่กลางจอจริง · ขวา สถานะ, ย้อนกลับ/ทำซ้ำ, (Guest) บันทึกออนไลน์, เมนู (ย้ายจากซ้าย, เปิดชิดขวา) · จอ < 768px ใช้ `1fr auto auto` ให้ชื่อผังหดแทน
- **QA**: `make test` 805/805 · `make lint` ผ่าน · `make e2e` 91/91 · เบราว์เซอร์ 6 breakpoints เมนูอยู่ในจอ, overflow 0
- ⚠️ dev server ไม่ generate คลาส Tailwind ใหม่จากการแก้ `.tsx` ด้วย (ไม่ใช่แค่ globals.css) — ต้อง `rm -rf .next` แล้วเปิดใหม่

## [2026-10-15] feat-065 — ปรับหน้า /login + ปุ่ม Google (Auth.js) บน Workers

- **โลโก้เสีย**: `app/login/page.tsx` ชี้ `logo-wangraan-minimal-flat.svg` ที่ไม่มีใน `public/` → ใช้ `logo-wangraan-clear-channel.svg` (ไฟล์ทางการ design-system §6.1)
- **Layout**: การ์ดฟอร์ม + แผงแบรนด์ (kicker, หัวข้อ, ข้อดี 3 ข้อ, ภาพ `store-planning-illustration.jpg`) — 2 คอลัมน์และกึ่งกลางแนวตั้งที่ ≥1024px, ซ้อนแนวตั้ง (การ์ดก่อน) บนจอเล็ก, ซ่อนภาพ <480px · header/footer จำกัด 1280px · ช่องกรอก 16px บนมือถือ (กัน iOS ซูม) · spinner เป็น `motion-safe`
- **Google**: ปุ่มแสดงเมื่อมี `AUTH_GOOGLE_ID` + `AUTH_GOOGLE_SECRET` (เหมือนเดิม) · มีสถานะ "กำลังไปที่ Google..." · `prompt=select_account` · Auth.js `pages.signIn/error = /login` → error OAuth แสดงข้อความไทยบนหน้า login (`oauthErrorMessage`) แทนหน้า error ภาษาอังกฤษ
- การผูกบัญชีไม่ได้เปลี่ยน: jwt callback → `oauthIdentity` → `POST /v1/auth/identities/resolve` (providerAccountId + email_verified ของ Google) → `sub` จาก Backend, แล้ว `syncSignIn` ย้ายผัง Guest
- **ยังไม่ได้ทดสอบกับ Google จริง**: ไม่มี OAuth client — `wrangler secret list` ของ worker `wang-raan` ว่าง
- **QA**: `make test` 804/804 · `make lint` ผ่าน · `make e2e` 91/91 · workerd (`E2E_TARGET=cloudflare`) login-otp + auth-identities 14/14 · เบราว์เซอร์ (dev + client ปลอม): overflow 0 ทั้ง 6 breakpoints, ปุ่ม Google ได้ URL `accounts.google.com/o/oauth2/v2/auth` พร้อม redirect_uri `/api/auth/callback/google`, callback error → `/login?error=` แสดงข้อความไทย

## [2026-10-15] Code review FE (feat-061–064) + BE (feat-013)

- **Security**: `safeRedirectPath` ปล่อย `/\t/evil.com` ผ่าน (เบราว์เซอร์ตัด tab → `//evil.com` = open redirect หลังล็อกอิน) → ปฏิเสธอักขระควบคุม/ช่องว่าง + ตรวจ origin ด้วย URL parser
- **ข้อมูลหาย**: ผังออนไลน์ที่ Blocked ไม่ถูกบันทึกที่ไหนเลย → เตือนก่อนปิดแท็บ; ออกจาก Editor/เปิดผังอื่นระหว่าง debounce → บันทึก snapshot ทันที (+ unit test 4 เคส)
- `/playground/[id]` ตอนยังไม่ล็อกอิน → ไป `/login?next=` แทน 404 · ตัดชื่อผังตาม code point (`src/lib/layout-name.ts`) · ลบ route ซ้ำ `/api/auth/otp`
- BE `002-identities`: `last_login_at` NOT NULL (backfill จาก `updated_at`) ให้ตรง `Identity.lastLoginAt`
- **QA**: FE `make test` 801, `make lint`, `make e2e` 90/90 · BE `make test` unit 58 + integration 61, `make lint`, format

## [2026-10-15] แก้ E2E ชุด UI เก่าให้ตรง Playground UX ใหม่ + บั๊กที่ E2E จับได้

- **E2E**: `e2e/helpers.ts` ใหม่ (`openTab`, `addItem`, `placeSelected` ผ่านป๊อปโอเวอร์ "ปรับละเอียด", `cloud()` เปิด dialog บัญชี, `closeDialogs`) · ปรับ editor-flow / keyboard / a11y / account-share-contact ให้ใช้ Rail, เมนูโปรเจกต์/ส่งออก, toast และ P2 gate แบบ `aria-disabled` (Tab ถึงได้ กดแล้วบอกข้อที่ต้องแก้ — PRD §9 ข้อ 9)
- **บั๊กจริงที่แก้**:
  - มือถือ ≤ 480px เลื่อนแนวนอนได้ ~650–970px — span `sr-only` ใน `PaletteItem` หลุดจาก carousel (ปุ่มไม่มี `relative`)
  - พิมพ์ / PDF ยังเห็น header/rail/panel — `.playground-shell` (นอก layer) ชนะ `print:hidden` → ซ่อนในบล็อก `@media print`
  - header ที่ 320–375px: ปุ่มส่งออก/undo ทับปุ่ม 3D (กดไม่ได้), ดินสอแก้ชื่อทับเมนู → ตัวสลับมุมมองไม่หด, ชื่อผังตัดแทน, ลดระยะห่างที่ < 360px
  - ป๊อปโอเวอร์พิกัดปิดเมื่อ Tab จาก X ไป Y → นำไปใช้เมื่อโฟกัสออกจากป๊อปโอเวอร์ทั้งก้อน (+ unit test)
  - นำเข้าไฟล์ JSON ไม่บอกสิ่งที่ระบบแก้ให้ (เช่น ตัดเก้าอี้กำพร้า) → ต่อท้าย toast
  - contrast ไม่ถึง AA ระหว่างจำลอง: `<dt>` ตัวเลขจำลอง (4.45:1) และกล่อง "ผังถูกล็อก" (4.39:1)
  - ปุ่ม 2D/3D ชื่อสำหรับ screen reader เปลี่ยนตามขนาดจอ ("3D" บนมือถือ) → `aria-label` คงที่
- **QA**: `make e2e` 89/89 สองรอบติด, `make test` 795/795, `make lint` ผ่าน
- **ข้อสังเกต**: `.next` cache ในเครื่องไม่ invalidate เมื่อแก้ `app/globals.css` (ทั้ง dev และ `npm run build`) — แก้ CSS แล้วต้อง `rm -rf .next` ก่อน build/E2E (CI เริ่มสะอาดจึงไม่โดน)

## [2026-10-15] feat-061 rework — Identities (สัญญา v1.3.0) + แก้บั๊ก login/projects

- **สัญญา** `contracts/openapi.yaml` 1.3.0 ตามข้อตกลงกับ BE (`harness/handoff-fe-accounts.md`): `resolveIdentity`, OTP คืน `{ user, created }`, `PUT /v1/me` อัปเดตอย่างเดียว, `AccountExport.identities`, `GET /v1/layouts` แบ่งหน้า — `contracts/README.md` อัปเดตตาม; contract checker ตรวจ query parameter แล้ว
- **mock-backend**: ตาราง identities + กติกาผูกบัญชี, Guest จาก resolve (จำกัดต่อ IP), pagination keyset, ลบบัญชีล้าง identities/OTP
- **BFF**: id ผู้ใช้มาจาก Backend ทุกทาง (`auth.ts`, `auth-config.oauthIdentity`, `account-repository.resolve/verifyOtp/update`) · `account-sync` เหลือแค่ merge-guest · `/api/me` ไม่สร้างบัญชีแล้ว (404) · `/api/layouts?limit&cursor`
- **UI**: `/projects` โหลดเพิ่มด้วย nextCursor + โควตาจาก 409 · `/login` แสดงข้อความตาม code (หมดอายุ/ผิดเกิน/ถี่เกิน) และซ่อนปุ่ม Google เมื่อไม่ได้ตั้ง `AUTH_GOOGLE_*`
- **บั๊กที่แก้**: redirect ซ้อนหลังล็อกอิน OTP ทำให้ `?sync=1` รันสองรอบได้ผังว่าง · `guest-sync` / ปุ่มผังใหม่เรียก `localStorage.clear()` ล้างทุกค่า · รูปโปรไฟล์ `javascript:` ผ่าน zod `.url()` · GitHub ที่ส่ง emailVerified ถูกผูกบัญชีด้วยอีเมล (mock)
- **QA**: `make test` 794/794, `make lint` ผ่าน, E2E ใหม่ `e2e/auth-identities.spec.ts` 3/3 (HTTP จริงทั้งเส้น), login-otp / projects / playground-id-online ผ่านครบ
- **ค้าง (มีมาก่อน ไม่ใช่จากงานนี้)**: E2E ชุด UI เก่า 28 เคส (editor-flow, a11y, responsive 320–480, keyboard, account-share-contact) ล้มเพราะ selector ของ playground ก่อน Sprint 3 — baseline commit 6338ab1 ล้ม 32 เคส ชุดเดียวกัน

## [2026-10-14] feat-064 /playground/[id] + บันทึกออนไลน์จาก Guest

- **State Management & Draft Storage**:
  - `src/store/use-layout-store.ts`: เพิ่ม `layoutName: string` (ค่าเริ่มต้น 'ร้านกาแฟของฉัน'), `layoutId: string | null`, `setLayoutName()`, `setLayoutId()`, อัปเดต `loadLayout(layout, name?, id?)`, `resetLayout()`, `restoreHistory()` (unit tests 27/27 ผ่าน)
  - `src/lib/draft-storage.ts`: เพิ่มฟิลด์ `name?: string` (1-80 chars) ใน `DraftSchema` และ `saveDraft` / `loadDraft` (unit tests 12/12 ผ่าน)
  - `src/lib/draft-autosave.ts`: ซิงก์ชื่อผังเข้ากับ draft และข้ามการบันทึกลง local storage เมื่อเป็นผังออนไลน์ (`layoutId !== null`)
- **UI Components & Modals**:
  - `src/components/editor/inline-layout-name.tsx`: คอมโพเนนต์แก้ไขชื่อผังแบบ Inline มุมซ้ายบน: คลิกเพื่อแก้ไข, Esc ยกเลิก, Enter หรือ blur เพื่อบันทึก, หากกรอกว่างจะคืนชื่อเดิม, รองรับ PUT `/api/layouts/[id]` เมื่อเป็นผังออนไลน์ (unit tests 5/5 ผ่าน)
  - `src/components/editor/save-online-dialog.tsx`: Radix Accessible Dialog สำหรับ Guest ถามชื่อผังก่อนนำทางไปล็อกอิน (ค่าเริ่มต้นจากชื่อปัจจุบัน, จำกัด 80 ตัวอักษร, โฟกัสอัตโนมัติที่ input) พร้อมบันทึก draft ลง storage และนำทางไป `/login?next=/playground?sync=1` (unit tests 1/1 ผ่าน)
  - `src/components/editor/playground-header.tsx`: ปรับปรุง Header ให้มี `InlineLayoutName`, ปุ่มเมนูโปรเจกต์ `#projBtn`, ปุ่มลิงก์ 'ผังของฉัน' (`/projects`) เมื่อเข้าสู่ระบบแล้ว, ปุ่ม 'บันทึกออนไลน์' (`#saveOnlineBtn`) มี Color Contrast ≥ 4.5:1 ตามเกณฑ์ WCAG 2.1 AA เมื่อเป็น Guest, และเพิ่ม `SaveOnlineDialog`
- **Online Autosave & Guest Sync**:
  - `src/lib/online-autosave.ts`: Hook `useOnlineAutosave` สำหรับ debounce 800ms บันทึกผังออนไลน์ผ่าน `api.updateLayout` เมื่อมีการแก้ไข พร้อมตรวจสอบ Inviolable Dual-Tier Validation (ถ้าผังติดสถานะ Blocked จะไม่ส่งขึ้น Backend) (unit tests 2/2 ผ่าน)
  - `src/lib/guest-sync.ts`: Hook `useGuestSync` ตรวจจับ `?sync=1` หลังผู้ใช้ล็อกอิน OTP สำเร็จ ดึงผังร่างและชื่อจาก local storage หรือ store แล้วสร้างผังใหม่บน Backend ด้วย ID เฉพาะของผู้ใช้ จากนั้นเคลียร์ร่างและนำทางไป `/playground/[newLayout.id]` (unit tests 4/4 ผ่าน)
- **Route /playground/[id] & 404 Handler**:
  - `app/(app)/playground/[id]/page.tsx` & `playground-with-id-client.tsx`: ตรวจสอบ session และสิทธิ์ความเป็นเจ้าของผัง หากไม่พบหรือไม่มีสิทธิ์ให้เรียก `notFound()`
  - `app/(app)/playground/[id]/not-found.tsx`: หน้า 404 ภาษาไทย 'ไม่พบผังร้านนี้' พร้อมคำอธิบายและปุ่มลิงก์กลับ 'ไปยังหน้ารวมผังร้าน' และ 'สร้างผังใหม่'
- **Verification & Quality Gate**:
  - Unit tests: `src/lib/guest-sync.test.ts` (4/4 passed), `src/lib/online-autosave.test.ts` (2/2 passed), `src/components/editor/inline-layout-name.test.tsx` (5/5 passed), `src/components/editor/save-online-dialog.test.tsx` (1/1 passed)
  - Playwright E2E: `e2e/playground-id-online.spec.ts` ผ่านครบ 10/10 tests (Guest จัดผัง → บันทึกออนไลน์ → ล็อกอิน OTP → /playground/[id] ผังครบทุกวัตถุ, refresh แล้วยังอยู่, inline name edit, 404 ภาษาไทยเมื่อไม่มีผัง/ไม่ใช่เจ้าของ, blocked gate, Axe 0 violations, responsive 6 breakpoints 320–1440px)
  - Full suite check: `make lint` ผ่าน 100% (Pure TS boundary OK, ESLint + TypeScript OK), `make contract` ผ่าน 100%, `npm test` ผ่านครบทั้ง 59 test files (760 tests passed)

## [2026-10-14] feat-063 หน้ารวมโปรเจกต์ /projects

- **OpenAPI Contract & Mock Backend**:
  - ปรับสัญญา `contracts/openapi.yaml` เพิ่มฟิลด์ `name` (string 1–80 chars) ใน `SaveLayoutRequest`, `StoredLayout`, `LayoutSummary` และเพิ่ม `layout: StoreLayout` ใน `LayoutSummary` สำหรับวาดภาพย่อ SVG
  - อัปเดต `mock-backend/handler.ts` ให้บันทึกและตอบกลับ `name` และ `layout` พร้อม fallback เป็น `ผังร้าน {width} × {depth} ม.` สำหรับผังเดิมที่ไม่มีชื่อ (unit tests 35/35 ผ่าน)
  - `make contract` ผ่านการตรวจสอบของ Redocly 100%
- **BFF & Client Data Layer**:
  - อัปเดต Schema ใน `src/core/validation/layout.schema.ts` (`SaveLayoutRequestSchema`, `StoredLayoutSchema`, `LayoutSummarySchema`)
  - อัปเดต `src/server/layout-repository.ts`, `src/server/layout-handlers.ts`, `src/lib/api-client.ts`, `src/lib/layout-queries.ts` ให้ส่งและรับ `name` และ `layout`
- **Starter Layout Generator (`createStarterLayout`)**:
  - เพิ่มฟังก์ชัน `createStarterLayout` ใน `src/core/layout/sample-layout.ts` สำหรับสร้างผังเริ่มต้นตามขนาดร้านและผนังทางเข้าที่เลือก
  - จัดวาง Kitchen, Counter และ Table 2 ที่นั่งในตำแหน่งที่มี clearance และ accessibility ผ่านเกณฑ์ เพื่อไม่ให้ผังติดสถานะ Blocked เมื่อสร้างใหม่ (ผ่าน Inviolable Dual-Tier Validation)
- **UI Components & Pages**:
  - `src/components/projects/delete-confirm-dialog.tsx`: Dialog ยืนยันลบผังด้วย Radix Dialog พร้อมตั้งโฟกัสเริ่มต้นที่ปุ่ม 'ยกเลิก' เพื่อความปลอดภัย (WCAG 2.1 AA)
  - `src/components/projects/create-project-dialog.tsx`: Dialog สร้างผังใหม่ ตรวจสอบชื่อ (1–80 ตัวอักษร), ขนาดร้าน (2–30 ม. snap 0.25), ผนังประตู 4 ด้าน (radio group) และปุ่ม 'ใช้ผังตัวอย่างแทน'
  - `src/components/projects/project-card-menu.tsx`: เมนูปุ่ม ⋯ (เปิดผัง / ลบผัง) รองรับ hover/focus และกด Esc เพื่อคืนโฟกัสที่ปุ่ม ⋯
  - `src/components/projects/project-card.tsx`: การ์ดผังร้านแบบ Figma วาดภาพย่อด้วย `renderPlanSvg` (grid:false บนพื้น `#eef2f7`), แสดงชื่อ ขนาด และเวลาแก้ไขภาษาไทย
  - `src/components/projects/projects-header.tsx`: Header สำหรับหน้ารวมโปรเจกต์ โลโก้, ข้อมูลบัญชีผู้ใช้ และเมนูออกจากระบบ
  - `src/components/projects/projects-list.tsx`: จัดการสถานะ empty, loading skeleton, error, โควตา 20 ผัง, dialogs และ toast แจ้งผลการดำเนินงาน
  - `app/(app)/projects/page.tsx`: Route สำหรับหน้ารวมโปรเจกต์
  - `app/(app)/playground/[id]/page.tsx` & `playground-with-id-client.tsx`: Route สำหรับเปิดผังตาม id
- **Verify & Quality Gate**:
  - Vitest Unit Tests: 55/55 test files ผ่าน 100% (748 tests)
  - Playwright E2E: `e2e/projects.spec.ts` ผ่านครบ 10/10 tests (CRUD flow, คีย์บอร์ดนำทาง Esc คืนโฟกัส, Axe WCAG 2.1 AA audit 0 violations, และ Responsive 6 breakpoints 320–1440px ไม่มี horizontal scrollbar)
  - `make lint`: 0 errors, 0 warnings (Pure TS boundary OK, ESLint + TypeScript OK, Redocly contract OK)

## [2026-10-14] feat-062 หน้าเข้าสู่ระบบ /login

- **Safe Redirect**: สร้าง `src/lib/safe-redirect.ts` (`getSafeNextPath`) ป้องกัน Open Redirect โดยอนุญาตเฉพาะ relative path ภายในที่ขึ้นต้นด้วย `/` (ไม่รวม `//` หรือ protocol scheme) พร้อม unit tests 3/3 ผ่าน
- **Login Component (`LoginForm`)**:
  - สร้าง `src/components/auth/login-form.tsx` รองรับ 2 ขั้นตอน: ขั้นตอนที่ 1 ป้อนอีเมล (มีปุ่ม Google sign-in ถ้าเปิด provider) → ขั้นตอนที่ 2 ป้อนรหัส OTP 6 หลัก
  - ช่องกรอกรหัสเดียว `inputMode="numeric"`, `autoComplete="one-time-code"`, รองรับการ paste รหัส 6 หลักอัตโนมัติ
  - รองรับนับเวลาถอยหลัง 60 วินาที พร้อมปุ่ม 'ส่งรหัสใหม่' และปุ่ม 'เปลี่ยนอีเมล' เพื่อกลับขั้นตอนแรก
  - ข้อความแจ้งเตือนภาษาไทยครบถ้วน ('ยังไม่มีบัญชี? ใช้อีเมลนี้ได้เลย ระบบจะสร้างให้', แจ้งรหัสผิด/หมดอายุ/ผิดเกินจำนวน)
  - ตรวจจับ Session ปัจจุบัน: ถ้าเป็นผู้ใช้ที่มีบัญชีจริงแล้ว redirect ไป `/projects` ทันที แต่ถ้าเป็น Guest ยังเปิดให้เข้าสู่ระบบเพื่อเชื่อมโยงบัญชีได้
- **Page & Routing**:
  - สร้าง `app/login/page.tsx` ห่อหุ้มด้วย `AppProviders` (SessionProvider) และ `Suspense`
  - เพิ่มลิงก์ 'เข้าสู่ระบบ' ใน Header ของ `app/(marketing)/page.tsx`
- **Design & Accessibility (WCAG 2.1 AA)**:
  - จัดการ Color Contrast ให้ผ่านเกณฑ์ WCAG 2.1 AA (≥ 4.5:1) สำหรับทุกองค์ประกอบ (ใช้ `#4e627c` บนพื้นขาว และ `#384b66` บนพื้น `#edf1ff`)
  - โฟกัสริงชัดเจน `outline: 3px solid #a4b6ff` พร้อม `aria-invalid` และ `aria-describedby`
- **Verify**:
  - Unit tests: `src/components/auth/login-form.test.tsx` (8/8 tests passed), `src/lib/safe-redirect.test.ts` (3/3 tests passed)
  - E2E Playwright: `e2e/login-otp.spec.ts` (10/10 tests passed รวม Axe WCAG 2.1 AA audit 0 violations, คีย์บอร์ดนำทาง, safe redirect, และ 6 breakpoints ไม่มี horizontal scrollbar)
  - Gate: `npm test` ผ่าน 51/51 test files (733 tests), `make lint` ผ่าน, `make contract` ผ่าน 100%

## [2026-10-14] feat-061 Email OTP — สัญญา API + BFF + Mock

- **สัญญา API**: เพิ่ม `POST /v1/auth/otp/request` และ `POST /v1/auth/otp/verify` ใน `contracts/openapi.yaml` (มี `x-allow-anonymous: true`, RequestId header, schemas: `RequestOtpRequest`, `RequestOtpResponse`, `VerifyOtpRequest`, `VerifyOtpResponse`) และเพิ่ม `email` ใน `AuthProvider`
- **Backend จำลอง (mock-backend)**: รองรับ OTP memory store, รหัส 6 หลักหมดอายุ 10 นาที (600 วินาที), cooldown ขอรหัสใหม่ 60 วินาที (ตอบ 429 RATE_LIMITED พร้อม Retry-After), กรอกรหัสผิดได้ 5 ครั้ง (400 OTP_INVALID พร้อม attemptsLeft, ผิดเกิน 400 OTP_ATTEMPTS_EXCEEDED), ตรวจถูกคืน User (สร้างใหม่อัตโนมัติด้วย provider: email เมื่อเป็นอีเมลใหม่)
- **BFF & Auth.js**:
  - `src/server/auth.ts`: เพิ่ม Credentials Provider `email-otp` ตรวจรหัสผ่าน Backend `/v1/auth/otp/verify`
  - `src/server/otp-handlers.ts`: Handler สำหรับ `POST /api/auth/otp/request` ตรวจ Zod schema และส่งต่อ Backend
  - `app/api/auth/otp/request/route.ts` และ `app/api/auth/otp/route.ts`: BFF Route Handler
  - `src/server/account-repository.ts` & `src/server/account-sync.ts`: รองรับ provider `email` และย้ายผัง Guest เข้าบัญชี email สำเร็จ
- **Verify**: `make contract` ผ่าน, `npm run lint` ผ่าน (0 errors, 0 warnings), `make test` ผ่าน 49/49 files (722 tests passed) รวม unit tests ใน `contracts/openapi.test.ts`, `mock-backend/handler.test.ts`, `src/server/otp-handlers.test.ts`, `src/server/account-handlers.test.ts`

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
