# Session Handoff — วางร้าน (Wang-Raan)

> **archive**: เก็บ 5 entry ล่าสุดเท่านั้น — รายการก่อนหน้าจะถูกย้ายไปเก็บที่
> `harness/archive/session-handoff-archive.md`

## 2026-10-20 ICT — ปั้นตัวละครใหม่ตามภาพอ้างอิง

- **ผลลัพธ์**: ลูกค้า/พนักงานเป็นผู้ชายใส่เสื้อยืด ยีนส์ รองเท้าผ้าใบ มีนิ้วมือ จมูก ผม (พนักงานเสื้อ+หมวกเขียว) — รูปร่างเดียวกัน ต่างกันที่สีเสื้อและหมวก
- **การตรวจ**: `make test` 908, `make lint` ผ่าน; Chromium Character Lab + จำลองผังตัวอย่าง
- **ข้อควรรู้**: ไฟล์ลูกค้าใหญ่ขึ้น (252→377 KB) เพราะมีนิ้ว/เสื้อผ้า/สี; ลูกค้าทุกคนยังใส่เสื้อสีเดียวกัน (สุ่มสีต่อคนต้องทำใน three-view); ไม่มีตา/ปาก (หน้าเรียบแบบภาพอ้างอิงด้านหน้า)

## 2026-10-20 ICT — ลดภาระโหลดโมเดลพนักงาน

- **ผลลัพธ์**: ไฟล์พนักงานรวม 545 → 407 KB (สี 8 บิต + หมวกติดกระดูก Head แบบไม่ skin); โหลดเฉพาะเมื่อผังมีจุดให้พนักงานยืน
- **การตรวจ**: `make test` 908, `make lint` ผ่าน; Chromium ตรวจ network request + ภาพพนักงาน

## 2026-10-20 ICT — สัดส่วนคนจริง 1.70 ม. ที่ขนาด 1:1

- **ผลลัพธ์**: mannequin สัดส่วนผู้ใหญ่จริง สูง 1.70 ม. แสดงที่ scale 1; เบาะเก้าอี้ 3D ผิวบน 0.45 ม.; ท่านั่งเท้าแตะพื้น มือบนต้นขา
- **การตรวจ**: `make test` 908, `make lint` ผ่าน; Chromium Character Lab + จำลองผังตัวอย่าง
- **ข้อควรรู้**: แก้รูปร่าง → แก้ `blockout-cafe-customer.py` แล้วรัน `build-cafe-customer-mesh.py` (pip install bpy==5.2.2, Python 3.13) ต่อด้วย mjs 4 แบบ; ข้อต่อใน build py กับกระดูกใน mjs ต้องตรงกัน; SVG isometric fallback ยังวาดเก้าอี้ตามขนาดเดิม (ไม่มีตัวละคร 3D)

## 2026-10-20 ICT — ขยายตัวละครให้สมส่วนกับเฟอร์นิเจอร์

- **ผลลัพธ์**: ตัวละครทุกตัวแสดงที่ `CHARACTER_SCALE` 1.6 (~1.67 ม.); ท่านั่งคำนวณใหม่ให้ลงเบาะพอดี; จุดยืนพนักงานปรับตามขนาดตัว
- **การตรวจ**: `make test` 908, `make lint` ผ่าน; Chromium ตรวจ Character Lab + จำลองผังตัวอย่างใน 3D
- **ข้อควรรู้**: เปลี่ยนขนาดต้องแก้ทั้ง `CHARACTER_SCALE` และ `DISPLAY_SCALE` ใน `scripts/create-cafe-customer-model.mjs` แล้วสร้าง GLB ใหม่ (test ใน customer-walk ตรวจว่าตรงกัน); ตัวใหญ่ขึ้น ลูกค้าที่ต่อคิวชิดกันอาจดูซ้อนกันเพราะ simulation ไม่ได้คิดขนาดตัว

## 2026-10-20 ICT — พนักงานยืนหลังเคาน์เตอร์ในฉากร้าน 3D

- **ผลลัพธ์**: ฉาก Three.js วางพนักงาน (โมเดล staff) ท่ายืนหลังเคาน์เตอร์ทุกตัวที่มีที่ว่างด้านหลัง — คำนวณใน `src/core/preview/staff-spots.ts`
- **การตรวจ**: `make test` 908, `make lint` ผ่าน; Chromium ตรวจ 3D มุมปกติ + หมุน 180°
- **ข้อควรรู้**: เคาน์เตอร์ที่เพิ่มใหม่ชิดผนังเหนือ (ฝั่งพนักงานติดผนัง) จะไม่มีพนักงานจนกว่าจะเว้นที่ด้านหลัง ≥ 0.4 ม.; SVG isometric fallback ยังไม่มีพนักงาน; Simulation ยังไม่รู้จักพนักงาน (ลูกค้าอาจเดินผ่านจุดยืน)

## 2026-10-20 ICT — โมเดลตัวละครแยก ลูกค้า / พนักงาน

- **ผลลัพธ์**: เพิ่ม `cafe-staff(-lite).glb` (เสื้อกั๊กเขียว + หมวกแก๊ป, โครงกระดูก/คลิป Idle·Walk·Sit เดียวกับลูกค้า) และ `character-models.ts` เป็นที่เดียวที่เก็บ path โมเดลตามบทบาท; Character Lab สลับ ลูกค้า/พนักงาน ได้
- **การตรวจ**: `make test` 900, `make lint` ผ่าน; Chromium Character Lab ตรวจภาพแล้ว
- **ค้าง**: ฉากร้าน 3D ยังแสดงแค่ลูกค้า — ถ้าจะให้พนักงานยืนหลังเคาน์เตอร์/เดินเสิร์ฟ ต้องเพิ่ม agent พนักงานใน Simulation ก่อน

## 2026-10-19 ICT — mannequin: ผิวใหม่จาก Blender (box modeling) + ทรงป้อม

- **ผลลัพธ์**: ผิวสร้างด้วย `scripts/blender/build-cafe-customer-mesh.py` (Skin modifier + Subdivision, ปั้นแขนท่ากาง 25° แล้วพับลง, อุดรู Skin modifier) → `create-cafe-customer-model.mjs` จับคู่กระดูกตามชื่อแล้วใส่ animation; ทรงป้อมขาสั้น (HIPS_Y .405), หัวเล็กลง คอสั้น หูระดับตา นิ้วโป้ง ไหล่ลาดมน; ลุกจากเก้าอี้ = Sit ย้อนกลับ
- **การตรวจ**: `npm test` 896, `make lint` ผ่าน; Chromium Character Lab ตรวจ 4 ทิศ + ยืน/นั่ง/เดิน
- **ข้อควรรู้**: รัน Blender ซ้ำได้ GLB ไม่เหมือนเดิมทุกไบต์ (น้ำหนักผิว heat ต่างกันระดับทศนิยม) — commit ไฟล์โมเดลใหม่เฉพาะเมื่อแก้รูปร่างจริง; ยังไม่ได้ดูท่าลุกในฉากจำลองร้านบนเบราว์เซอร์

## 2026-10-19 ICT — mannequin: จังหวะเดิน, นั่ง/ลุก, ขนาดหัว

- **ผลลัพธ์**: เดินจังหวะกลาง ๆ (Walk 0.84 วิ/รอบ, จำกัดจังหวะขา 1.6× ตอนจำลองเร็ว); นั่งลงนุ่มขึ้นและลุกขึ้นด้วยท่านั่งย้อนกลับในฉากร้าน + Character Lab; หัวเล็กลง ~10%
- **การตรวจ**: `npm test` 896 tests, typecheck, ESLint ผ่าน; Chromium Character Lab ตรวจภาพแล้ว
- **ค้าง**: ยังไม่ได้ดูท่าลุกในฉากจำลองร้านจริงบนเบราว์เซอร์ (ตรวจเฉพาะ Character Lab)

## 2026-10-18 ICT — feat-091 หมุนมุมมองผัง 2D/3D (เสร็จ)

- **ผลลัพธ์**: ปุ่มหมุนซ้าย/ขวา (การ์ดซูมมุมล่างซ้าย) หมุนมุมมองทีละ 90° ทั้ง 2D และ 3D; ใน 3D ผนังที่วาดเป็น 2 ด้านที่ไกลกล้องเสมอ จึงเห็นภายในร้านทุกมุม
- **การตรวจ**: `make test` 67 files / 896 tests, `make lint` ผ่าน; เบราว์เซอร์ตรวจ 2D (หมุน 90°, ลาก) และ Three.js ครบ 4 มุม
- **เพิ่มเติม**: 3D แยกสีทางเข้า (น้ำเงิน) กับประตูครัว (เทาอมฟ้า + บานเข้ม) พร้อมพรมสีประจำประตูบนพื้น — เห็นได้แม้อยู่บนผนังด้านใกล้กล้อง
- **ค้าง/ข้อสังเกต**: การ์ดซูม+หมุนยังซ่อนบนจอ < 768px (เดิมซ่อนอยู่แล้ว); SVG fallback ตรวจด้วย unit test ไม่ได้ตรวจในเบราว์เซอร์; feat-080 ยังเป็น in-progress ตามเดิม

## 2026-10-18 ICT — ปรับท่านั่งเก้าอี้ของ mannequin

- **ผลลัพธ์**: ปรับคลิป Sit ใน `public/assets/models/cafe-customer.glb` ให้สะโพกอยู่ระดับเบาะ พับต้นขาไปทางด้านหน้าเก้าอี้ และวางแขนบนตัก; Three.js runtime หันลูกค้าตามด้านหน้าเก้าอี้ที่ใกล้ที่สุดเมื่อสถานะเป็น seated
- **การตรวจ**: asset tests 5/5, `make test` 66 files / 886 tests, `npx tsc --noEmit`, `make lint` (boundary, ESLint, TypeScript, API contract) ผ่าน; Character Lab เปิดและโหลด GLB ได้
- **ค้าง**: ยังไม่เห็นท่านั่งจริงใน browser simulation; Playground ที่เปิดอยู่แสดง Blocked 2 ข้อ จึงคง feat-080 เป็น in-progress จนตรวจ seated state ในฉากจำลองได้



## 2026-10-18 ICT — feat-080 เก็บท่านั่งให้เข้ากับภาพอ้างอิง

- ท่า Sit ยกเข่าให้อยู่เหนือเบาะและเลยขอบหน้า, งอแขนพักใกล้ตัก; Character Lab ขยับตัวไปข้างหน้า 0.08 ม. และจัดกล้องให้เห็นด้านหน้า; ThreeView ใช้ offset หน้าของเก้าอี้ตาม rotation
- ตรวจ Chrome `localhost:3001/character-lab` เห็นหุ่นนั่งบนเก้าอี้; `make test` 67 files / 893 tests, typecheck, `make lint`, `make status` ผ่าน
- feat-080 ยังคง `done`; ยังไม่แตะ Core/Worker/BFF
## 2026-10-18 ICT — feat-080 เพิ่มท่านั่งใน Character Lab (เสร็จสมบูรณ์)

- Character Lab มีปุ่มนั่งบนเก้าอี้/ยืนขึ้น พร้อมเก้าอี้ตัวอย่าง; คลิป Sit เล่นจนจบแล้วค้างท่า, จากนั้นลุกกลับ Idle หรือคลิกพื้นเพื่อเริ่ม Walk ได้
- ตรวจ Chrome ที่ `localhost:3001/character-lab`: เห็นตัวละครนั่งบนเบาะ, ลุกยืน และเดินต่อ; `make test` 886 tests, typecheck, `make lint` (boundary/API contract/ESLint) และ `make status` ผ่าน
- feat-080 เปลี่ยนเป็น `done`; ยังไม่แตะ Core/Worker/BFF
## 2026-10-18 ICT — feat-081–feat-090 ประตูครัว (เสร็จสมบูรณ์ 100%)

- **ความสำเร็จหลัก**: ยกระดับระบบผังร้านทั้งหมดจากโมเดล "กล่องครัวบนพื้น (`type: kitchen`)" สู่ "ประตูครัวบนผนัง (`kitchenDoor: { id, wall, position, width } | null`)"
- **Core Domain & Boundaries**: `src/core/` เป็น Pure TypeScript 100% ไม่มี DOM/React/Three.js; Helper functions จัดการตำแหน่งบนผนัง (`freeWallPosition`, `wallDoorOverlap`, `createKitchenDoor`, `defaultKitchenDoorInit`) รองรับ snap grid 0.25 ม. และ clamp ไม่ให้เลยผนัง
- **Migration & Persistence**: `src/core/layout/migrate.ts` แปลงผังเก่าอัตโนมัติทุกช่องทาง (Local Draft, JSON import, BFF/Cloud, Share links)
- **Validation Engine**: ตรวจ 5 กฎ Blocked ครบถ้วน (`missing-kitchen`, `kitchen-door-overlaps-entrance`, `kitchen-door-off-wall`, `unreachable-kitchen`, `secondary-aisle` < 0.90 ม.)
- **Store & UI**: Zustand Store รองรับ Undo/Redo 40 ขั้นสำหรับ `addKitchenDoor`, `setKitchenDoor`, `removeKitchenDoor`; แผงด้านซ้าย (แท็บเพิ่ม + แท็บร้าน) ปรับแต่งได้ 4 ด้าน; ผัง 2D รองรับ drag/keyboard/delete/issue-ring; 3D Three.js และ SVG isometric แสดงประตูครัวพร้อมวงกบ/ธรณีประตู
- **Test Suite**: ผ่านครบ 66 test files, 885 tests (100% passed, 0 failures) — ไม่มีการล้มของ createKitchen อีกต่อไป
- **Contracts & Linting**: `make contract` และ `make lint` ผ่าน 100% ทั้งใน `wang-raan` และ `wang-raan-service`
- **QA Browser**: ตรวจสอบบน `localhost:3000/playground` ด้วย Browser subagent ยืนยัน Ready/Blocked status, 2D interaction, 3D render, P2 simulation และ responsive 6 breakpoints

## 2026-10-18 ICT — ลดปุ่มข้อต่อและหุบแขน

- ย่อมือและปรับรอยต่อข้อมือให้เท่าปลายแขน; ขยับศอก x=.190 → .175 และข้อมือ .225 → .195 พร้อมปรับ ForeArm/Hand pivots ให้ตรงกัน แขนจึงกางน้อยลง
- ลดปุ่มเข่าและข้อเท้าด้วยรัศมีปลายกระดูกที่ต่อเนื่องและปรับ smooth union; คงพื้นรองเท้าไม่จมระหว่าง Walk
- GLB 8330 vertices /16660 triangles; `customer-walk.test.ts` 4/4 ผ่าน (Idle/Walk/Sit และ planted feet), ESLint generator, boundary check, make status และ diff check ผ่าน; Browser Character Lab ตรวจท่ายืน/เดิน/กลับ Idle
- `make test` ใน startup ยังล้ม 32/65 files (176 tests) ด้วยความล้มเหลวจาก createKitchen/layout validation ที่เกิดพร้อมการแก้ core/layout ใน workspace; ไม่แตะงานนั้น, feat-080 คง in-progress จน full suite ผ่าน

## 2026-10-18 ICT — ปรับแขนขาให้ต่อเนื่องสมส่วน

- เกลี่ยข้อศอกด้วย smooth union .008 → .018 และเพิ่มเนื้อเล็กน้อยด้านหน้าแขน; ปรับ Arm/ForeArm pivots ให้รับกับต้นแขนที่ขยับเข้าด้านใน
- ปรับความต่อเนื่องหัวเข่าและข้อเท้า: เพิ่มรัศมีปลายต้นขา/หน้าแข้งและ smooth union เข่า .008 → .018; ยกผิวรองเท้า 1 มม. ให้ไม่จมพื้นใน Walk
- GLB 8400 vertices /16800 triangles; asset tests Idle/Walk/Sit + planted feet ผ่าน 4/4; ESLint generator และ git diff --check ผ่าน; Browser Character Lab โหลดและแสดงท่ายืนได้
- make test รวมยังล้มจากงาน schema ครัวที่แก้ขนานกัน (32 files failed / 176 tests; error createKitchen), รายละเอียดใน entry ก่อนหน้า; คง feat-080 in-progress จนตรวจรวมผ่าน

## 2026-10-18 ICT — ปรับหัวไหล่ชิดลำตัวเพิ่มเล็กน้อย

- เลื่อนปลายบ่าเข้าด้านใน x=.135 → .128 และจุดเริ่มต้นต้นแขน x=.155 → .148; คงระดับหัวไหล่และเส้นโค้งเดิม
- สร้าง GLB ใหม่ 8235 vertices /16470 triangles; Character Lab localhost:3001 แสดงผลและโหลดได้
- asset tests 4/4 ผ่าน; ESLint generator, diff check ผ่าน; make test/lint รวมยังล้มจากการเปลี่ยน createKitchen ในงานคู่ขนาน (อ้างอิง entry ก่อนหน้า)

## 2026-10-18 ICT — feat-080 หัวไหล่ลาดต่อเนื่อง (รอ QA รวม)

- ลดโคนต้นแขน y=.68 → .65 และเลื่อนปลาย shoulder bridge เข้า x=.135; ปรับ Arm pivot ตามและชดเชย ForeArm offset ให้ศอก/มืออยู่เดิม จึงตัดก้อนนูนที่สูงกว่าแนวบ่าโดยไม่เพิ่ม blend จนรักแร้ติด
- GLB 8246 vertices /16492 triangles; raycast แนวบ่าที่ x=.07–.17 ทั้งสองข้างลดระดับต่อเนื่อง ไม่มี local hump
- ผ่าน asset tests 4/4 (Idle/Walk/Sit 121 poses, floor/finite และ planted-foot/loop), ESLint generator, git diff --check; startup boundary ผ่าน; browser 3001 โหลดใหม่ ตรวจรูปทรงและเริ่มเดินได้
- Verification gate ยังไม่ผ่าน: make test 43 files failed (createKitchen is not a function), make lint TypeScript ล้มเพราะ kitchen type/createKitchen กำลังถูกเปลี่ยนในงานอื่นระหว่างเทิร์น; ไม่แก้ทับงานครัว คง feat-080 in-progress เพื่อรัน QA รวมซ้ำเมื่อ workspace นิ่ง

## 2026-10-18 ICT — feat-080 เก็บคอ/หัวไหล่และเดินกระชับ

- ยกหัวและหู .03 ม. พร้อม Head pivot; ลดระดับอกบน ลดรัศมี shoulder bridge .030 → .025 และผูกช่วงบ่ากับ Spine เพื่อไม่ให้แขนดึงผิวถึงคอ; เกลี่ยรอยต่อคอ/ต้นแขน
- Walk: ระยะต่อรอบ .44 → .36 ม., เวลา .90 → .72 วินาที, ยกเท้า .045 → .028 ม., แกว่งแขน .20 → .12 rad และลด bob/twist/sway ครึ่งหนึ่ง; metadata ทำให้ runtime อ่านความเร็วใหม่อัตโนมัติ
- GLB 8296 vertices /16592 triangles; ปรับข้อความความสูงใน Character Lab เป็น 1.08 ม.
- QA: ขยาย floor/finite skin test ครบ Idle/Walk/Sit 121 poses ต่อคลิป; make test 65 files/867 tests ผ่าน; make lint และ git diff --check ผ่าน; browser 3001 ตรวจคอด้านหน้า/ข้างและเดินกลับ Idle แล้ว
- ยังไม่ได้ตรวจ Sit ในฉากร้านด้วย browser รอบนี้; ไม่แตะงานอื่นที่ค้างใน workspace

## 2026-10-18 ICT — feat-080 ปรับทรงตามภาพสเก็ตช์ใหม่

- ขยายหัวเป็น 0.44 × 0.42 ม., เพิ่มหูสองข้างผูก Head, ลดลำตัว/สะโพก และขยายเท้าโดยคง rig กับ IK เดิม; GLB 8262 vertices /16520 triangles
- QA: make test 65 files/865 tests ผ่าน; make lint (ESLint, TypeScript, boundary, OpenAPI) ผ่าน; sample Idle/Walk/Sit 33 poses ต่อคลิป finite และไม่จมพื้น; Walk minY .000197 ม.
- Browser localhost:3001/character-lab โหลดโมเดลใหม่ ตรวจยืน/หัน/คลิกเดินและกลับ Idle แล้ว; localhost:3000 ตอบ 404 สำหรับ Character Lab จึงใช้ dev server 3001 ที่มีอยู่
- ไม่ได้ตรวจท่านั่งในฉากร้านด้วย browser รอบนี้; คงการเปลี่ยนแปลงงานอื่นใน workspace

## 2026-10-18 ICT — ปรับความยาว/ความลึกเคาน์เตอร์

- แผงแก้ไขเคาน์เตอร์มีช่อง "ยาว (ม.)" / "ลึก (ม.)" (CounterSizeFields ใน counter-style-controls.tsx) ใช้ store.resizeObject เดิม — Core clamp ≥ 0.30 ม. ทีละ 0.05; นำไปใช้เมื่อ Enter/blur = Undo หนึ่งขั้น และแสดงค่าจริงหลัง clamp
- เพิ่มเทสต์ใน forms.test.tsx (ปรับยาว 3.2, ลึก 0.1 → clamp 0.30, undo)
- QA: make test 65 files/865 tests, make lint (ESLint+TS+boundary+OpenAPI) ผ่าน; Browser localhost:3001 เพิ่มเคาน์เตอร์ → ยาว 4 ม. ผังเปลี่ยนทันที

## 2026-10-17 ICT — feat-080 จังหวะเดินและการวางเท้า

- สร้าง Walk ใหม่ 0.9 วินาที /60 intervals ด้วย two-bone IK จากเป้าข้อเท้า: stance ครึ่งรอบวางเท้ารับน้ำหนัก, swing ครึ่งรอบยก .045 ม.; ข้อเท้าหักล้างมุมขาให้พื้นรองเท้าขนานพื้น
- ฝัง walkCycleDistance=.44 ใน GLB; แกว่งแขนสลับขา, ศอกผ่อนคลาย, ลำตัวบิด/เอียงเล็กน้อยพร้อมหัวชดเชย
- Character Lab อ่านความเร็วจากระยะก้าว/ระยะเวลาคลิป (scale .9 ได้ .44 ม./วินาที), เร่ง–ผ่อนความเร็วและชะลอตอนหัน, ปรับ Walk timeScale ตามความเร็ว, ลดระยะ snap ถึงจุดหมายเหลือ .004 ม.
- Three.js ร้าน: เลื่อนเวลา Walk ตามระยะเคลื่อนที่จริงและหมุนหาทิศใหม่อย่างนุ่มนวล จึงสัมพันธ์กับ simulation speed; คงการเปลี่ยน Sit เดิม
- เพิ่ม customer-walk.test.ts ตรวจ loop ไม่กระโดด, เท้ารับน้ำหนักอยู่ระดับเดิม/ตำแหน่งโลกคลาด <.001 ม. และ sample skin 121 poses ไม่จมพื้น (minY .000104 ม.)
- QA: make test 65 files/864 tests, typecheck, ESLint ไฟล์งาน, startup boundaries ผ่าน; Browser Character Lab เดิน/เปลี่ยนจุดหมาย/กลับ Idle และ console error 0. ยังไม่ได้ตรวจ simulation ในร้านด้วย browser รอบนี้
- ตรวจ React checklist: animation state อยู่ใน effect, ไม่มี setState ทุกเฟรม, คง reduced-motion guard และ cleanup เดิม

## 2026-10-17 ICT — feat-080 เก็บคอและหัวไหล่

- ลดรัศมีคอ .036 → .030, ยกศีรษะและ pivot .02 ม. และลด blend ใต้หัวเพื่อให้เห็นคอสั้นชัดขึ้น
- ลดส่วนบน torso .01 ม., ลดระดับหัวไหล่ .015 ม. พร้อม bone pivot, ลดรัศมีต้นแขนบน .037 → .033 และเกลี่ย shoulder/upper arm .018; elbow/wrist คงตำแหน่งเดิม
- GLB 7353 vertices /14702 triangles; ช่องแขนที่ y=.60 >.015 ม. ทั้งสองฝั่ง; Idle/Walk/Sit 33 poses ต่อคลิป finite และ minY >.00185
- QA: browser localhost:3123 ตรวจหน้า/ข้าง/เดิน; make test 862/862, typecheck, ESLint generator, startup boundaries ผ่าน

## 2026-10-17 ICT — feat-080 แขนลาดต่อเนื่องตามภาพอ้างอิง

- แก้ข้อผิดพลาดรอบก่อนที่หุบเฉพาะปลายแขนจนศอกหักออกด้านข้าง: shoulder/elbow/wrist อยู่บนแนวลาดเดียวกันราว 13°; x=.155/.190/.225 และ y=.695/.540/.385 พร้อม bone pivots ตรงกัน
- เปลี่ยนหัวไหล่ก้อนกลมเป็น capsule ลาดจากด้านคอออกไปต้นแขน และลดรัศมีต้นแขนไล่สู่ปลายแขน เพื่อให้ silhouette ต่อเนื่อง
- GLB 7302 vertices /14600 triangles /16 bones; raycast ที่ y=.60/.50/.42 พบช่องแขนสองข้าง (อย่างน้อย .015 ม. ที่ .60); Idle/Walk/Sit 33 poses ต่อคลิป finite และ minY >.00185
- QA: Browser localhost:3123 ตรวจหน้า/ข้างและเดิน; make test 862/862, typecheck, ESLint generator, startup boundaries ผ่าน. Typecheck รอบแรกติด Counter ในงานอื่น แต่รอบตรวจสุดท้ายผ่านแล้ว

## 2026-10-17 ICT — feat-080 หุบแขนลงข้างตัว

- เปลี่ยนแนวปลายแขนจากกางเฉียงออกเป็นเกือบแนวดิ่ง: wrist x=±0.22 y=.394 และมือ x=±.222 y=.369; ปรับ hand bones และนิ้วโป้งให้ตรงกัน คงหัวไหล่และช่องรักแร้เดิม
- มือหุบเข้าข้างละ .08 ม. โดยความยาวปลายแขนใกล้เดิม; GLB 7334 vertices /14664 triangles
- QA: raycast ที่ y=.60/.50/.42 ยังแยกแขนจากลำตัวทั้งสองข้าง; Idle/Walk/Sit 33 poses ต่อคลิป finite, minY >.00185; Browser localhost:3123 ตรวจยืนและเดิน; make test 859/859, typecheck, ESLint generator และ startup boundaries ผ่าน

## 2026-10-17 ICT — feat-080 เก็บผิวหัวไหล่ เข่า และข้อพับ

- ลด shoulder cap และรัศมีต้นแขน; รวม SDF ของแต่ละแขนกับลำตัวครั้งเดียวด้วย blend ที่จำกัดตามระดับความสูง แทน hard minimum ระหว่างกิ่ง geometry ที่ซ้อนกัน
- ลด knee blend 0.04 → 0.008 และเกลี่ยข้อศอก/ข้อมือ/ข้อเท้าอย่างจำกัด เพื่อลดก้อนนูน; ขยับศอกและมือออก 0.01 ม. พร้อม bones เพื่อรักษาช่องรักแร้หลังสร้าง mesh
- ยกเลิก whitelist กระดูกที่สลับทันทีตาม primitive ใกล้สุด; ใช้น้ำหนักระยะที่ลดลงต่อเนื่องเพื่อไม่เกิดรอยหยักขณะงอ
- GLB: 7376 vertices, 14748 triangles, 16 bones; น้ำหนักรวม 1, ช่องแขน–ลำตัวที่ y=.60 ทั้งสองฝั่ง 0.01131 ม.; Idle/Walk/Sit 33 poses ต่อคลิป finite และ minY >0.00185 ม.
- QA: browser ยืน/เดินบน localhost:3123, make test 859/859, typecheck, ESLint และ startup boundaries ผ่าน
- พอร์ต 3000 เจอ ENOENT อีกครั้ง โดยมี server 3123 ทำงานร่วม .next; รอบนี้ตรวจผ่าน 3123 และไม่ได้หยุด server ของงานอื่น

## 2026-10-17 ICT — feat-080 ข้อต่ออ้างอิงสัดส่วน 3 หัว

- ปรับ head diameter เป็น 0.375 ม. ต่อความสูงรวม 1.125 ม.; ย่อขาและวาง shoulder/elbow/wrist ที่ y=0.705/0.55/0.415, hip/knee/ankle ที่ 0.43/0.23/0.055 ตามภาพผู้ใช้
- เพิ่ม LeftHand/RightHand เป็นกระดูกข้อมือจริง (รวม 16 bones), geometry มือ/นิ้วโป้งผูกกับมือ, ลด weight blend reach เป็น 0.045 เพื่อจำกัดการดึงผิวข้ามข้อต่อ
- ปรับช่วงสะโพกของ Walk ให้ไม่ต่ำกว่าท่ายืน; ปรับฐาน Hips.position และระดับ Sit ให้ตรงสัดส่วนใหม่
- QA: Idle/Walk/Sit 33 poses ต่อคลิปทุกพิกัด finite และพื้นต่ำสุด >0.00135 ม.; skin weights รวม 1; browser ตรวจหน้า/ข้างและคลิกเดิน, make test 64 files/859 tests, typecheck, ESLint generator, startup boundaries ผ่าน

## 2026-10-17 ICT — กู้ Character Lab จาก Next.js ENOENT

- พบ Next.js สอง process ใน repo เดียวกันที่พอร์ต 3000/3123 และ `/character-lab` ตอบ 500; ใช้ `.next` ร่วมกันซึ่งเสี่ยงเขียนทับ build artifacts
- หยุดทั้งสอง process, ย้าย `.next` เดิมไป `/tmp/wangraan-next-recovery-*`, เปิด dev ใหม่เพียงตัวเดียวพอร์ต 3000
- Browser เปิด Character Lab ได้อีกครั้ง; startup harness ตรวจ boundaries และ npm test ผ่าน 859 tests
- เมื่อรัน dev/build เพิ่ม ให้แยก output directory หรือหยุด dev เดิมก่อน เพื่อไม่เขียน `.next` ทับกัน

## 2026-10-17 ICT — เคาน์เตอร์ 4 แบบ + เลือกสี (เสร็จแล้ว, ยังไม่ commit)

- `Counter.style?: CounterStyle { variant: fluted|panel|bar|display, color: FurnitureColor }` ใน core types/zod/openapi; ไม่ระบุ = ระแนง/ส้ม (หน้าตาเดิม); `counterStyleOf`, `setCounterStyle` (ไม่เปลี่ยน = ไม่เพิ่ม history), ทำซ้ำคงสไตล์
- UI: เลือกเคาน์เตอร์บนผัง → แผง "แก้ไขเคาน์เตอร์" (`counter-style-controls.tsx`) หมุน/ทำซ้ำ/ลบ + แบบ 4 ตัวเลือก + สี 6 สี (หมายเหตุ: `ObjectInspector` ไม่ได้ mount ที่ไหน)
- 3D: ระแนงโค้ง / ตู้บานเรียบ+มือจับฝั่งพนักงาน / บาร์ขอบยก+ราวพักเท้าฝั่งลูกค้า (+z) / ตู้กระจกโชว์ขนม; SVG iso ใช้สีที่เลือก + กล่องกระจกสำหรับแบบตู้โชว์
- QA: `make lint` (boundary/eslint/tsc/openapi) ผ่าน, `npm test` 64 files / 862 tests ผ่าน; Browser ตรวจครบ 4 แบบ + สี, reload แล้วสไตล์คงอยู่, ไม่มี console error

## 2026-10-17 ICT — เคาน์เตอร์ 3D ลงรายละเอียด (เสร็จแล้ว, ยังไม่ commit)

- `createCounter` ใน `three-view.tsx`: ฐานเตะเท้าสีเข้ม, ตู้ส้มหน้าระแนงโค้ง (fluted) สองด้านยาว, ท็อปหินครีมยื่นเลยตู้, เครื่องเอสเปรสโซ + แก้ว (เมื่อยาว ≥ 1.3 ม.) และจอ POS; หมุนตามแกนยาวอัตโนมัติ
- QA: tsc, eslint, `npm test` 64 files / 859 tests ผ่าน; Browser 3D ตรวจภาพแล้ว ไม่มี console error

## 2026-10-17 ICT — พนักพิงเก้าอี้กลมทรงเปลือกหอย (เสร็จแล้ว, ยังไม่ commit)

- `curvedBackrest` ใน `three-view.tsx` เปลี่ยนจากแผ่นโค้งขอบบนตรง เป็น shell โอบเบาะ 200°: กลางสูง 42 ซม. ไล่โค้งมนลงจรดเบาะด้านข้าง, ขอบบนมน, เอนหลัง 5 ซม., ห่อขอบเบาะ 5 ซม.
- QA: tsc, eslint, `npm test` 64 files / 859 tests ผ่าน; Browser 3D ตรวจภาพชุดโต๊ะกลม + เก้าอี้กลมมีพนักพิงแล้ว ไม่มี console error

## 2026-10-17 ICT — feat-080 แก้แขนติดลำตัว

- ขยับแนวแขนและกระดูกศอกออกด้านข้าง; จำกัด smooth union กับลำตัวเฉพาะหัวไหล่ จึงไม่สร้างผิวพังผืดลงมาที่สีข้าง
- สร้าง `public/assets/models/cafe-customer.glb` ใหม่จาก generator; รูปร่างส่วนอื่นและ clips เดิมคงไว้
- QA: raycast ที่ y=0.60 พบช่องซ้าย/ขวา 0.01587/0.01597 ม.; Idle/Walk/Sit 25 poses ต่อคลิปไม่มีพิกัดผิดปกติ; Chrome Character Lab ตรวจยืนและคลิกเดินกลับ Idle แล้ว
- `make test`: 64 files / 859 tests ผ่าน; ESLint generator, typecheck และ startup boundary checks ผ่าน

## 2026-10-17 ICT — เกลี่ยรอยต่อศอกและหัวเข่า chibi (เสร็จแล้ว, ยังไม่ commit)

- เพิ่มความโค้งคอด้วย capsule, ฝังต้นแขนเข้าไหล่ และขยายน่องให้ซ้อนทับต้นขา; รอยคอ ศอก และหัวเข่าจึงกลืนเป็นผิวเดียว โดย rig เดิมยังใช้ได้
- Browser: Character Lab แสดง silhouette ที่ต่อเนื่องขึ้นหลังสร้าง GLB ใหม่. ตรวจ asset: 12 meshes, material สี `#9da4af` เดียว, ไม่มี position track; clearance native Idle 0.010 ม., Walk 0.000 ม., Sit 0.010 ม.
- QA: typecheck, ESLint เฉพาะไฟล์งาน, `make test` 64 files / 859 tests, Harness validation และ `git diff --check` ผ่าน

## 2026-10-17 ICT — เก็บรอยข้อต่อ chibi ให้เนียน (เสร็จแล้ว, ยังไม่ commit)

- ทรงลำตัวเปลี่ยนเป็น capsule ผิวต่อเนื่อง; สะโพกและคอถูกฝังในลำตัว, หัวไหล่ฝังลึกขึ้น, ต้นขาทับน่อง เพื่อซ่อนรอยวงที่คอ เอว ไหล่ และหัวเข่าโดยคง joints สำหรับ animation
- Browser: Character Lab เห็น silhouette ต่อเนื่องขึ้น. GLB ใช้สี `#9da4af` เดียว, ไม่มี position track, clearance native Idle 0.025 ม., Walk 0.020 ม., Sit 0.060 ม.

## 2026-10-17 ICT — chibi mannequin ตามภาพอ้างอิง (เสร็จแล้ว, ยังไม่ commit)

- เปลี่ยน asset เป็น silhouette chibi ตาม reference: หัวกลมใหญ่มีหู, คอสั้น, ลำตัวอวบ, แขนป้อม และขาเรียบสองข้าง โดยไม่มีหน้า เครื่องแบบ รองเท้า หรือข้อปล้องที่เห็นชัด
- คงสีเดียว `#9da4af` และ joints/animation clips `Idle`/`Walk`/`Sit`; ทุก track เป็น quaternion-only เพื่อไม่ให้ pose กระตุก
- Browser: Character Lab แสดงหุ่น chibi ในฉากจริง. ตรวจ GLB: hierarchy ต่อกันครบ, clearance native Idle 0.005 ม., Walk 0.000 ม., Sit 0.040 ม. QA: typecheck, ESLint เฉพาะไฟล์งาน, `make test` 64 files / 859 tests และ harness ผ่าน

## 2026-10-17 ICT — แก้ dev server พัง (ENOENT .next/server/vendor-chunks)

- สาเหตุ: มี `next dev` 3 ตัวในโฟลเดอร์เดียวกัน (3000 จาก terminal ของ IDE, 3001 จาก Codex, 3123 จาก Claude preview) ใช้ `.next` ร่วมกัน + Claude ลบ `.next` ระหว่างที่ตัวอื่นยังรัน
- แก้: หยุดทุกตัว ลบ `.next` แล้วรัน dev ตัวเดียวที่ 3000 (เพิ่ม config `wang-raan-3000` ใน `.claude/launch.json`)
- กฎ: รัน `next dev` ได้ทีละตัวต่อโฟลเดอร์ ห้ามลบ `.next` ขณะมี server อื่นรันอยู่

## 2026-10-17 ICT — ปรับ mannequin เป็น silhouette ร่างคน (เสร็จแล้ว, ยังไม่ commit)

- ตาม feedback ว่าหุ่นยังไม่สมประกอบ: เปลี่ยนลำตัวทรงกล่องเป็น torso ไหล่กว้างไล่เอว, ใช้สะโพกมน, ลดศีรษะและต่อคอสั้นให้รับกัน
- แขนเป็นสองท่อนพร้อมข้อศอกและมือ, ขาต่อเป็นต้นขา–หัวเข่า–น่อง–เท้า; ทุกชิ้นสีเทาเดียวและซ้อนจุดเชื่อมเพื่อให้อ่านเป็นร่างคนทั้งตัว
- `cafe-customer.glb` ยังคง clips `Idle`/`Walk`/`Sit`, ใช้ quaternion-only ไม่มี position track. ตรวจ bounding box ทุก pose: Idle 0.005 ม., Walk 0.001 ม., Sit 0.049 ม. เหนือพื้น native
- Browser: Character Lab แสดง silhouette คนสีเทาครบส่วน. QA: typecheck, ESLint เฉพาะไฟล์งาน, `make test` 64 files / 859 tests และ harness ผ่าน

## 2026-10-17 ICT — ทรงเก้าอี้ สี่เหลี่ยม/กลม (เสร็จแล้ว, ยังไม่ commit)

- Core: `ChairStyle.shape?: "square" | "round"` + `resolveChairStyle()`; ไม่ระบุ = ตามแบบ (สตูลกลม, มีพนักพิงเหลี่ยม) ผังเก่าจึงหน้าตาเดิมใน 3D; `setTableSetStyle` เก็บเฉพาะค่าที่ผู้ใช้ตั้ง (สลับเป็นสตูลแล้วยังกลมอัตโนมัติ)
- Schema Zod + `contracts/openapi.yaml` รับ `shape` (optional) · footprint เท่าเดิมทุกทรง → validation ไม่เปลี่ยน
- UI: radio "ทรงเก้าอี้" ใน `table-set-style-controls.tsx`; render ครบใน preview, artboard 2D (เหลี่ยม = `rounded-[22%]` — เดิม 2D วาดเก้าอี้กลมทุกตัว), SVG iso, Three.js (เบาะกลม + พนักพิงโค้ง 140° ตามขอบเบาะ `curvedBackrest` เป็น ExtrudeGeometry), plan-svg export
- เทสต์: เพิ่มกรณีทรงเก้าอี้ใน table-set/schema/forms; เทสต์เดิมที่ query radio "กลม" ต้อง scope ด้วย radiogroup "ทรงโต๊ะ" แล้ว
- QA: tsc, eslint (src), boundary, contract ผ่าน; vitest 859/859; Browser ตรวจหน้าตั้งค่าโต๊ะ + 3D
- ระวัง: `make lint` ตอนนี้แดงเพราะ ESLint สแกน `.claude/worktrees/` ของเซสชันย่อย (ไม่ใช่โค้ดเรา); `.next` cache พังระหว่างทำ → ลบ `.next` แล้วรัน dev ใหม่ (มี node อื่นฟังพอร์ต 3000/3001 อยู่)

## 2026-10-17 ICT — mannequin สีเทาร่างเดียว (เสร็จแล้ว, ยังไม่ commit)

- ผู้ใช้ขอให้ตัดรายละเอียดทั้งหมดและใช้สีเทาเดียว; `create-cafe-customer-model.mjs` สร้าง `cafe-customer.glb` ใหม่ด้วย material เดียว `#9da4af` ไม่มีหมวก เสื้อผ้า วิทยุ หรือใบหน้า
- Geometry ต่อกันเป็น silhouette คน: ลำตัวซ้อนสะโพก, คอ–หัว, ไหล่–แขน, สะโพก–ต้นขา–ขาส่วนล่าง–เท้า โดยคง hierarchy ของ joints และ clips `Idle`/`Walk`/`Sit` ที่เป็น quaternion-only
- Browser: Character Lab เห็นตัวสีเทาแบบยืนและเดินโดยชิ้นส่วนไม่หลุด; ป้ายสถานะหน้า Lab เปลี่ยนเป็น “Mannequin สีเทา”. QA: typecheck, ESLint เฉพาะไฟล์งาน, `make test` 64 files / 859 tests และ harness ผ่าน

## 2026-10-17 ICT — fix regression ขามาสคอตหลุด (เสร็จแล้ว, ยังไม่ commit)

- สาเหตุจากภาพผู้ใช้: `LeftLeg`/`RightLeg` เป็น bone เปล่า ไม่มี geometry ต้นขา แต่ `LowerLeg` มี geometry จึงดูเป็นท่อนขาหลุด; มี `position` tracks ใน Idle/Walk ที่เสี่ยงเขียนทับ bind pose ระหว่างสลับ clip
- `create-cafe-customer-model.mjs`: เพิ่มต้นขาใต้สะโพก, ย้าย lower leg/รองเท้าให้ซ้อนต่อเนื่อง, เอา position tracks ออกทั้งหมด และใช้ quaternion-only สำหรับ Idle/Walk/Sit
- ตรวจ loader ผ่านทุก sample: floor clearance native Idle 0.032, Walk 0.002–0.032, Sit 0.032–0.068 ม.; parent chain Legs→Hips, LowerLegs→Legs ถูกต้อง
- Browser: Character Lab คลิกเดินและกลับ Idle ขาไม่หลุด; Playground 3D จำลองจนเต็ม 6/6 ที่ เห็นมาสคอตนั่งโดยขาต่อกับลำตัว. QA: typecheck, ESLint เฉพาะไฟล์, Vitest 858/858, harness ผ่าน

## 2026-10-17 ICT — feat-080 มาสคอต low-poly ใน Three.js (เสร็จแล้ว, ยังไม่ commit)

- เปลี่ยน `public/assets/models/cafe-customer.glb` จากตัวละคร chibi เดิมเป็นมาสคอต low-poly แบบชิ้นส่วน geometric: หมวกน้ำเงิน เสื้อครีม กางเกงน้ำเงิน วิทยุเล็ก และใบหน้าแบบมินิมอล; generator อยู่ที่ `scripts/create-cafe-customer-model.mjs`
- GLB มี bone `Hips/Spine/Head/LeftArm/RightArm/LeftLeg/RightLeg/LeftLowerLeg/RightLowerLeg` และ clips `Idle`, `Walk`, `Sit`; runtime ใช้ scale 0.9 (สูงประมาณ 1.02 ม.)
- `character-lab-scene.tsx` ใช้ clips ของ GLB จริงสำหรับ Idle/Walk, ไม่ทำ runtime proportion hack เก่าอีก; `three-view.tsx` สลับ agent state seated ไป `Sit` และ clamp pose เพื่อให้นั่งค้าง
- QA: typecheck, eslint ไฟล์ที่แก้, Vitest 64 files/858 tests, harness ผ่าน; Browser เห็นตัวใหม่ใน Character Lab และใน Playground 3D ทั้งเดิน/นั่ง. `make lint` ทั้ง repo fail เพราะ `.claude/worktrees/.../.next` ที่อยู่นอกงาน; ไม่พบ error ในไฟล์ที่แก้

## 2026-10-17 ICT — refactor มุมมอง 3D `three-view.tsx` (เสร็จแล้ว, ยังไม่ commit)

- บั๊กเดิม: effect ผูก `[isSim, layout]` → ทุกการแก้ผังสร้าง `WebGLRenderer` ใหม่ + โหลด GLB ซ้ำ + ไม่ dispose geometry/material (เสี่ยง context lost เมื่อแก้เกิน ~16 ครั้ง)
- ตอนนี้: renderer/scene/loop/GLB สร้างครั้งเดียวต่อ mount (`Stage` ใน ref); ผังเปลี่ยนสร้างแค่ `content` group ใหม่และ dispose ชุดเดิมผ่าน `SceneAssets` (แชร์ geometry/material ขนาดเดียวกัน)
- render แบบ on-demand: ฉากนิ่งวาดเฟรมเดียว, loop ต่อเนื่องเฉพาะตอนจำลอง/มีลูกค้า; delta clamp 1/30 วิ; จบจำลองล้างลูกค้า + `uncacheRoot`
- QA: `make lint` HEALTHY, vitest 858/858; Browser: แก้ผัง 24 ครั้ง canvas เดิม 1 ตัว ctxLost 0, เปลี่ยนขนาดร้าน 14 ม. กล้อง/เงา refit, จำลองลูกค้าใน 3D และจบรอบแล้วลูกค้าหาย, ซูมทำงาน

## 2026-10-17 ICT — fix เงาขาดในมุมมอง 3D (เสร็จแล้ว, ยังไม่ commit)

- สาเหตุ: shadow camera ของ DirectionalLight ใช้ค่าเริ่มต้น ±5 ม. รอบ (0,0,0) = มุมร้าน → วัตถุที่ไกลมุม (เคาน์เตอร์, โต๊ะฝั่งตะวันออก/ใต้) เงาโดนตัดเป็นเส้นตรงหรือหายไป
- `three-view.tsx`: เล็ง `key.target` ไปกลางร้าน, frustum = ครึ่งเส้นทแยงร้าน + 1 ม., shadow map 2048, bias/normalBias กัน acne
- QA: lint ผ่าน, vitest 858/858; Browser ผังตัวอย่าง 8×6 เงาครบทุกชิ้น

## 2026-10-17 ICT — ประตูทางเข้าในมุมมอง 3D (Three.js) แบบมินิมอล (เสร็จแล้ว, ยังไม่ commit)

- เดิม `three-view.tsx` ไม่วาด `layout.entrance` เลย (มีแค่ใน SVG fallback) — เพิ่ม `createDoor`: ช่องเปิดโล่ง มีแค่วงกบบางสีเทาเข้ม + ธรณีบาง (ผู้ใช้ขอเอาบานประตูออก)
- ผนังเหนือ/ตะวันตกเจาะช่องจริง (ผนังซ้าย/ขวา + ทับหลังเหนือ 2.1 ม.) + วงกบ; ผนังใต้/ตะวันออกไม่ได้วาด จึงไม่มีวงกบ (ผู้ใช้ขอ) เหลือแค่ธรณีบนพื้น
- QA: tsc + lint ผ่าน, `vitest` 64 files / 858 tests ผ่าน; Browser ตรวจประตูบนผนังเหนือและใต้ (ผังตัวอย่าง) แล้ว

## 2026-10-17 ICT — feat-079 Character Lab: ปรับสัดส่วนและเครื่องแบบ (เสร็จแล้ว, ยังไม่ commit)

- `character-lab-scene.tsx`: หัว GLB ลดเหลือ 70–73% และยกขึ้น 0.08 ม.; เพิ่ม `CharacterHumanDetails` (คอ, แผงเสื้อ, ปกสองข้าง, ป้ายชื่อ) และคง `CharacterWaistJoin` เพื่อให้ silhouette เป็นผู้ใหญ่มากขึ้น
- โมเดล scale 0.72 พร้อมกล้อง 28° และพื้นทดลองเล็กลง; รัศมีจุดหมายถูกลดตามพื้นเพื่อเดินไม่หลุดขอบ
- Browser: หน้าตรง/ข้าง/หลังสมบูรณ์; click-to-walk แสดง Walk แล้วกลับ Idle; console error 0. QA: `make lint`, `make test` 64 files / 858 tests ผ่าน

## 2026-10-16 ICT — เก้าอี้จัดระยะใหม่ทีละฝั่งหลังลบ/ปรับขนาด (เสร็จแล้ว, ยังไม่ commit)

- Core: `arrangeTableSet(…, "keep-sides" | "redistribute")` ใน `table-set.ts` — ลบ/ปรับขนาด = คงฝั่ง, ปรับจำนวน = กระจายใหม่
- ยังไม่ได้ลองในเบราว์เซอร์ · ยังไม่ bump `packages/core` version / CHANGELOG

## 2026-10-16 ICT — UX หน้า "ตั้งค่าโต๊ะ" (เสร็จแล้ว, ยังไม่ commit)

- ไฟล์: `table-set-create-panel.tsx`, `table-set-style-controls.tsx`, ใหม่ `table-set-preview.tsx`
- มี dev server 3 ตัวใช้ `.next` ร่วมกัน ทำให้ CSS ไม่มี class ใหม่ — ถ้าหน้าตาเพี้ยนให้หยุด server อื่นแล้วลบ `.next` ก่อนรัน dev ใหม่

## 2026-10-16 ICT — polish Character Lab: เชื่อมช่วงเอว (เสร็จแล้ว)

- GLB เดิมไม่มี mesh สะโพกกลาง จึงยังเห็นเสื้อกับขาสองข้างเป็นชิ้นแยกแม้เลื่อนตำแหน่งแล้ว
- `character-lab-scene.tsx` เพิ่ม `CharacterWaistJoin` เป็น `RoundedBoxGeometry` สีเดียวกับกางเกงและยึดใต้ `Hips` เพื่อให้เดิน/หมุนตามตัวละครทั้งหมด; เปลี่ยนจาก Sphere ที่โป่งเป็นทรงกางเกงเหลี่ยมมน
- QA: typecheck + diff check ผ่าน, Chrome clean dev rebuild ตรวจหน้าและข้างแล้ว. `npm test` ล่าสุดมี failure ที่ mock-backend quota test (ไฟล์นอกงาน) จึงไม่ได้แก้ข้าม scope

## 2026-10-16 ICT — fix Character Lab: Walk กระตุก (เสร็จแล้ว)

- สาเหตุสุดท้าย: ทั้ง Walk (`Hips.position`) และ Idle (`Spine.position` มีข้อมูลไม่ครบ 3 แกน) ของ GLB เขียน pose ขณะ render ได้ จึงทำให้ตัวละครสะบัดแม้ตัด Walk แล้ว
- `character-lab-scene.tsx` ไม่รัน `AnimationMixer` หรือ clip ของ GLB แล้ว; ใช้ `characterRoot` เพียงโหนดเดียวพาทั้งตัวเดิน/หมุน, แกว่งแขนขาแบบ sine จาก rest pose และ clamp delta สูงสุด 1/30 วินาที
- ลำตัวของ asset สูงกว่าขา 0.11 ม.; offset Spine, ยกขาทั้งสอง 0.045 ม. ให้ชายเสื้อกับกางเกงซ้อนกัน และยกโมเดล 0.01 ม. เพื่อให้รองเท้าติดพื้น; scale 1.18 → 0.60 ทำให้ร่างกายต่อกันและอยู่ในฉากพอดี
- QA: `npm run typecheck`, `make lint`, `make status`, `npm test` 64 files / 858 tests ผ่าน; Chrome ตรวจหน้า/ข้าง/หลังและคลิกพื้นระหว่างเดิน

## 2026-10-16 ICT — fix ผัง 2D หด (เสร็จแล้ว, ยังไม่ commit)

- สาเหตุหลักคือ `.next/cache` เก่าทำให้ CSS ขาด class arbitrary ของ Stage/Artboard; ถ้าเจออีกให้ลบ `.next` แล้วรัน dev ใหม่
- กันซ้ำ: inline `containerType: "size"` ใน `playground-editor.tsx` และ fallback `var(--artboard-chrome, 96px)` ใน `artboard.tsx`
- ยังไม่ได้ตรวจ production (Cloudflare) ว่าเจออาการเดียวกันหรือไม่

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

## 2026-10-16 ICT — เกณฑ์เบราว์เซอร์ขั้นต่ำ + fix แท็บจำลองบนมือถือ (เสร็จแล้ว)

- รองรับขั้นต่ำ Chrome/Edge 111, Safari 16.4, Firefox 128 (baseline Tailwind v4); เบราว์เซอร์เก่ากว่าเห็นแถบ `BrowserSupportNotice` ให้อัปเดต — ไม่มี CSS fallback สำหรับรุ่นเก่า
- แท็บจำลองบนมือถือ: ใส่ `relative` ให้ `#panel` และ wrapper `/playground` เพื่อไม่ให้ `sr-only` ดันหน้าสูงเกินจอ; E2E ใน `e2e/responsive.spec.ts`
- QA: `npm test` 852 tests, lint, typecheck ผ่าน · Workers Builds ใน PR ล้มก่อน build (0 วินาที, เป็นมาตั้งแต่ PR #12) ต้องดู log ใน Cloudflare dashboard

## 2026-10-16 ICT — feat-075 แก้ไขชุดโต๊ะที่เลือกในแผงซ้าย (เสร็จแล้ว)

- เลือกโต๊ะหรือเก้าอี้ลูกแล้ว แผงซ้ายจะเป็นหน้า “แก้ไขโต๊ะ” ของชุดโต๊ะแม่ทันที; กดกลับเพื่อเลิกเลือกและคืนหน้าเพิ่มลงผัง
- คำสั่งของชุดโต๊ะย้ายมาไว้ในแผงซ้าย: ปรับจำนวนเก้าอี้ตาม capacity, ขนาด/สไตล์, พิกัด, หมุน, ทำซ้ำ และลบ; toolbar ลอยถูกซ่อนสำหรับ Table/Chair ทั้ง 2D/3D SVG
- `setTableSetChairCount` ใน Pure Core คง id โต๊ะและเก้าอี้เดิมเท่าที่ทำได้, ไม่มี orphan และการทำซ้ำคงจำนวนเก้าอี้จริง
- QA: `make test` 62 files / 843 tests, `make lint`, `make status` ผ่าน; Chrome ตรวจเลือกโต๊ะและเพิ่ม 2 → 3 ตัวในแผงซ้าย · ตามคำขอผู้ใช้ **ไม่ได้เขียนหรือรัน E2E**

## 2026-10-18 ICT — แก้แขนผิดรูปในท่านั่ง

- ปรับ Sit animation ใน `scripts/create-cafe-customer-model.mjs` ให้ต้นแขนและปลายแขนหมุนเข้าด้านในแบบสมมาตร มือขยับจากข้างตัวเข้ามาใกล้ตัก; สร้าง `public/assets/models/cafe-customer.glb` ใหม่
- เพิ่มการตรวจตำแหน่ง LeftHand/RightHand ใน `src/components/preview-3d/customer-walk.test.ts`; asset tests 5/5, `make test` 67 files / 896 tests, `make lint`, `npx tsc --noEmit` และ `make status` ผ่าน
- Browser QA ยังทำไม่ได้: localhost:3001 แสดง “ไม่พบหน้านี้”; การเปิดเซิร์ฟเวอร์ dev สำรองถูกปฏิเสธด้วย EPERM ระหว่าง bind port

## 2026-10-18 ICT — แก้หน้า Character Lab ที่เปิดไม่ได้

- Runtime error เกิดจาก `.next` มี manifest ของ Character Lab แต่ขาด `page.js`; dev server เดิมหยุดตอบ localhost:3001
- ล้างเฉพาะ cache `.next` ที่สร้างใหม่ได้และเริ่ม `npm run dev -- --hostname 127.0.0.1 --port 3001` ใหม่ (session ปัจจุบัน id 69546); route `/character-lab` โหลดได้
- ตรวจ Chrome: Character Lab แสดง mannequin, เปิดท่านั่งแล้วภาพและ accessibility state ขึ้น `นั่ง (Sit)`; console error 0. ภาพหลักฐานอยู่ที่ `/private/tmp/wang-raan-character-lab-sitting.png`
- `./harness/init.sh` ผ่าน (67 files / 896 tests), `make status` ผ่าน; งานนี้ไม่แก้ source code
