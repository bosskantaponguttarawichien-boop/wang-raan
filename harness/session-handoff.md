# Session Handoff — วางร้าน (Wang-Raan)

> **archive**: เก็บ 5 entry ล่าสุดเท่านั้น — รายการก่อนหน้าจะถูกย้ายไปเก็บที่
> `harness/archive/session-handoff-archive.md`

## 2026-10-30 ICT — feat-137 เสร็จ: การจำลองไม่หยุดเองอีกแล้ว (ต้นเหตุจริงของอาการ "กระตุก")

- **ต้นเหตุไม่ใช่ fps ต่ำ แต่เป็นการจำลองหยุดเองแล้วไม่กลับมา**: กดเริ่มจำลองแล้วเปิด 3D ขึ้น
  "หยุดชั่วคราว" ใน 0.4 วินาทีและค้างตลอด เวลาจำลองไม่เดินเลยทั้ง 6 ช่วงวัด — เกิดกับ **ผังตัวอย่าง
  6 ที่นั่งที่มีลูกค้าคนเดียว** ด้วย ไม่ใช่เฉพาะฉากหนาแน่น เพราะจังหวะโหลด GLB ครั้งแรกถูกตีความว่าเป็น
  ช่องว่างของเวลา (`PlaybackClock` คืน gap เมื่อ TICK ห่างเกิน 0.5 วิ) แล้ว controller หยุดภาพรอให้ผู้ใช้กดเอง
- **แก้ 2 จุด**: `simulation-controller.ts` แยกช่องว่าง ≤ 10 วินาทีจำลอง (หลังหารตัวคูณความเร็ว) ให้ตั้งต้น
  ภาพใหม่แล้วเล่นต่อเองด้วย delta 0 (ทิ้งเวลาที่ขาด ตาม `animation-contract-v1.md` §2) ส่วนที่ยาวกว่านั้น
  ยังหยุดเหมือนเดิมและบอกทางแก้เมื่ออยู่ที่ความเร็วสูง; คิว pacer ล้นไม่หยุดภาพแล้ว ·
  `adaptive-quality.ts` `ignoreAboveMs` 250 → 900 ms เพราะเครื่องที่วาดได้เฟรมละ 250–350 ms เดิมถูกตัด
  ทุกเฟรมด้วยเหตุ "แท็บถูกซ่อน" คุณภาพจึงไม่เคยลดทั้งที่ควรลดที่สุด
- **วัดแล้วว่าภาระต่อ TICK ไม่ใช่ต้นเหตุ จึงตั้งใจไม่รื้อ Zod**: บน snapshot ผังหนาแน่น 80 ที่นั่งจริง
  (134 ลูกค้า 68 KB/TICK) parse 1.203 ms + align 0.018 ms + clone 0.890 ms ≈ 4% ของ 1 คอร์ที่ 20 TICK/วินาที
- **เทสต์ใหม่ที่เป็นด่านจริง**: `e2e/restaurant-animation-stutter.spec.ts` ข้อผังตัวอย่างรันได้ทุกเครื่อง
  และพิสูจน์แล้วว่าจับอาการได้ (ย้อน controller เป็นพฤติกรรมเดิมแล้ว build ใหม่ → ล้มด้วย
  "เวลาจำลองไม่เดิน (ภาพค้าง)" Received 0) · อีก 2 ข้อเป็นฉากหนาแน่น `test.skip` เองบน software renderer ·
  unit tests เพิ่ม 3 ข้อ (simulation-gate 2, adaptive-quality 1) · แยก helper ร่วมไป `e2e/animation-harness.ts`
  แล้วให้ `restaurant-animation.spec.ts` import (ยกฟังก์ชันมาทั้งก้อน ไม่เปลี่ยนพฤติกรรม)
- **Verify**: `npm test -- --maxWorkers=2` ผ่าน 113 ไฟล์ 1,323 ข้อ · typecheck ผ่าน · lint 0 errors
  (warning เดิม 1 `_initial`) · `validate_harness.py` ผ่าน (129 done, 2 in-progress ที่รอกระบวนการภายนอก) ·
  core boundary ผ่าน · เบราว์เซอร์จริงหลังแก้: ทุกความเร็วเดินต่อเนื่อง 1×→1.0×, 5×→5.1×, 10×→~10×, 30×→29.7×
  controller ไม่หยุดภาพเอง 0 ครั้ง; รันต่อเนื่อง heap 16.9→17.3 MB, DOM คงที่ 243, geometries คงที่ 186
- **ข้อควรรู้สำหรับเซสชันถัดไป (สำคัญ)**:
  - container นี้ **ไม่มี GPU** (SwiftShader) ฉากหนาแน่นได้ 3–4 fps แม้มีลูกค้า 1 คน (draw calls 207)
    **ห้ามใช้ตัวเลข fps จากที่นี่อ้างแทนเครื่องอ้างอิง** และเติมคนให้ร้านแน่นไม่ขึ้น (peak 1–4 คน)
  - เมื่อฉากหนาแน่นจริงที่นี่ main thread แน่นถึงขั้น Playwright คลิกปุ่มไม่ได้ (รอ actionability ไม่จบ)
    จึงใส่เพดาน 30 วินาทีให้การกดปุ่มความเร็ว และลดเป้าความหนาแน่นเป็น 25 คน
  - **ยังค้าง**: รัน 2 ข้อที่ถูก skip + ชุด 28 ข้อของ feat-123 (`restaurant-animation*.spec.ts`)
    บนเครื่องที่มี GPU เพื่อยืนยันเกณฑ์ fps ฉากหนาแน่นหลังการแก้ครั้งนี้
  - ข้อสังเกตที่ยังไม่ได้ทำ (นอกขอบเขต): ฉากที่แทบไม่มีคนใช้ draw calls 207 เพราะโต๊ะ 20 ชุด/เก้าอี้ 80 ตัว
    เป็น mesh แยกกัน การรวม geometry ของฉากนิ่งน่าจะช่วยทุกเครื่อง แต่ยังไม่มีหลักฐานว่าผู้ใช้จริงต้องการ
  - `npm run lint` จะพบ error จำนวนมากถ้ายังมี `e2e/.report`/`e2e/.results` ค้างอยู่ (eslint ไล่เข้าไฟล์ bundle
    ที่ gitignore แล้ว) — ลบสองโฟลเดอร์นี้ก่อน lint
  - **ยังไม่ได้ push** ตอนเขียนบันทึกนี้ — ดู commit ล่าสุดบน `codex/animation-foundation`

## 2026-10-30 ICT — feat-134 ปรับแต่งก้อนความคิด (Thought Bubble Refinement)

- **ปรับเส้นขอบ, ขนาดไอคอน และการจัดกึ่งกลาง (Visual Polish)**:
  - **เส้นขอบอ่อนลง นุ่มนวลขึ้น**: เปลี่ยนสีเส้นขอบจาก `#261612` (ดำเข้ม) เป็น `#64748b` (slate-500) ในสถานะปกติ, `#f59e0b` (amber-500) ในสถานะ warning, และ `#f43f5e` (rose-500) ในสถานะ critical ปรับลดความหนาเส้นขอบเป็น 1.5px และวงกลมหางความคิดเป็น 1.3px
  - **ไอคอนข้างในเล็กลง**: ลดขนาดอิโมจิเป็น `text-[15px]` (~15px) และข้อความเวลารอเป็น `text-[11px] font-semibold text-slate-600` ไม่ให้แน่นอึดอัด มีระยะหายใจรอบด้านภายในก้อนเมฆ
  - **จัดวางกึ่งกลางใจก้อนเมฆ (Optical Centering)**: คำนวณพิกัดกึ่งกลางตามรูปทรงก้อนเมฆ (Center X ~39px, Y ~21px) วาง content ในคอนเทนเนอร์ `left: 0; top: 0; width: 78px; height: 42px;` พร้อม `flex items-center justify-center` จัดเนื้อหากึ่งกลางสวยงามลงตัวทั้งในมุมมอง 3D Three.js, React component, และ 2D Isometric Canvas
- **Verification**:
  - `thought-overlay.test.ts`, `character-thought-bubble.test.tsx`, `iso-simulation-overlay.test.tsx`, `presentation-snapshot.test.ts` ผ่าน 100% (23/23 tests)
  - `npm run typecheck` ผ่าน 0 errors
  - Boundary check: `src/core/` เป็น Pure TS 100%

## 2026-10-30 ICT — feat-136 ฝ่ามือแนบผ้าขณะเช็ด

- แก้ทิศฝ่ามือจากแกน Z ที่เดาผิดเป็นผิวจริงตามแกน X และติดผ้าตามผิวจริง; ผ้าพับหนา 0.03 ม. เพื่อรองนิ้วงอ; ช่วงกวาดไกลสุด 0.43 ม. อัปเดต footprint แล้ว; สร้าง staff GLB ทั้งสอง
- ตรวจภาพจำลอง 1× หลายจังหวะและตรวจมือคว่ำ/ผ้าแนบโต๊ะ/เท้าไม่ไถล; npm test -- --maxWorkers=2 ผ่าน 1320 ข้อ, boundary scan ผ่าน; init.sh Windows หา dirname ไม่พบ

## 2026-10-30 ICT — feat-135 ปรับท่าเช็ดโต๊ะ

- ผ้าและจานแนบผิวฝ่ามือ แก้ระนาบ mesh ให้ถูก; ผ้าใช้สีตัดโต๊ะ ลดมุมก้มและระยะย่อตัว; สร้าง staff GLB สองขนาด
- npm test -- --maxWorkers=2 ผ่าน 1,320; ตรวจภาพจำลองจริงขณะหยุดที่ช่วงเช็ด ภาพก่อนปรับสีผ้า; tests ตรวจการกวาดผ้าในคลิป; init บน Windows หา dirname ไม่พบ

## 2026-10-30 ICT — feat-134 เสร็จสมบูรณ์: ก้อนความคิดและอิโมจิบอกสถานะตัวละครในระบบจำลอง

- **ก้อนความคิดและอิโมจิ (Character Thought & Emote Bubbles)**:
  - ปรับทรงก้อนความคิดเป็นก้อนเมฆการ์ตูน (Comic Thought Cloud): เปลี่ยนทรงเป็นก้อนเมฆหยักป่องๆ (Fluffy Cloud SVG) มีวงกลมหางความคิด 2 วงชี้ลงหาตัวละครตรงตามภาพตัวอย่างของผู้ใช้ เส้นขอบหนาคมชัด ขนาด 84×68px อิโมจิ 24px ทั้ง 3D และ 2D fallback
  - เพิ่มการสะท้อนสถานะและอารมณ์ของลูกค้าใน Simulation:
    - รอคิวหน้าร้าน: ปกติ 0–5 นาที (📱), นาน 5–10 นาที (⏳ warning สีส้ม), วิกฤต >10 นาที (💢 critical สีแดง เสี่ยง walkout)
    - รอสั่งอาหาร: 🙋‍♂️ รอพนักงานมารับออร์เดอร์
    - รออาหาร: ปกติ (🍽️), นาน (⏳ warning), นานมาก (😤 critical สีแดง animate-bounce)
    - ทานอาหาร: 😋 กำลังทาน
    - เช็คบิล: 💳 พร้อมชำระเงิน
  - พนักงานมี emote ตามงาน: 📝 รับออร์เดอร์, 🍲 ถือเสิร์ฟ, 🧹 เช็ดโต๊ะ
- **Implementation & Boundaries**:
  - `src/core/simulation/presentation-contract.ts`: เพิ่ม `CustomerThought` / `StaffThought` (Pure TS)
  - `src/core/simulation/presentation-snapshot.ts`: ฟังก์ชัน `resolveCustomerThought` และ `resolveStaffThought`
  - `src/components/simulation/character-thought-bubble.tsx`: Accessible component + tooltip บอกเวลารอ
  - `src/components/preview-3d/thought-overlay.ts`: ตัวคำนวณ 3D world → 2D screen projection จัดการ overlay DOM เหนือ ThreeView
  - `src/components/simulation/iso-simulation-overlay.tsx`: ฟังก์ชัน `drawThoughtBubble` วาดฟองความคิดลง Canvas 2D fallback
  - `src/store/use-simulation-store.ts` & `simulation-panel.tsx`: เพิ่ม toggle `showThoughts` ("แสดงความคิด/ความรู้สึกตัวละคร (Emotes)")
  - `src/components/simulation/presentation-bridge.ts`: เพิ่ม schema parsing สำหรับ `thought`
- **Verification**:
  - Unit tests: `presentation-snapshot.test.ts` (7/7), `character-thought-bubble.test.tsx` (5/5), `thought-overlay.test.ts` (2/2), `iso-simulation-overlay.test.tsx` (9/9), `presentation-bridge.test.ts` (6/6) ผ่านทั้งหมด
  - Targeted simulation test suite: 20 files / 182 tests ผ่าน 100%
  - TypeScript typecheck: 0 errors
  - ESLint: 0 errors (1 warning เดิม `_initial`)
  - Boundary check: `src/core/` เป็น Pure TS 100% ไม่มี React/Zustand/DOM ปนเปื้อน
  - Harness validation: 126 done, 2 in-progress (Sprint 2 external auth), 6 blocked

## 2026-10-29 ICT — feat-124 เสร็จ: แสงตามเวลาร้าน ไม่ใช้เวลาเครื่อง

- ปรับตามคำขอล่าสุด: เลื่อนเฉพาะช้อน 0.025 ม. ทางนิ้วชี้จาก anchor โดยไม่เปลี่ยนท่าแขน; targeted 34 tests ผ่าน, Chrome จำลองเมนูช้อนผ่าน ภาพ harness/evidence/spoon-offset/screens/; npm test มี 6 ข้อไม่ผ่านระหว่างรันพร้อม build (รวม presentation-bridge ที่ล้มอยู่ก่อนและ timeout หลายข้อ), init.sh รันไม่ได้เพราะ bash ของ Windows ไม่พร้อม; ยังไม่ยืนยันว่าท่าจับนิ้วถูกต้อง

- งานจับช้อนยังไม่เสร็จ: ผู้ใช้ต้องการด้ามระหว่างนิ้วโป้งกับนิ้วชี้และนิ้วที่เหลือรองด้าม ทดลองย้าย anchor และแยกการงอนิ้ว แต่ภาพจำลองศอกยกสูงผิดธรรมชาติ จึงคืนท่าเดิมและสร้าง customer GLB ใหม่; โมเดลนิ้วไม่มีข้อต่อแยก ต้องออกแบบรูปมือและเส้นทางแขนใหม่พร้อมตรวจภาพหลายจังหวะ อย่าอ้างว่าจับถูกต้องจาก unit test เพียงอย่างเดียว; ภาพทดลองอยู่ harness/evidence/feat-134/screens/.

- feat-133: ผู้ใช้ชี้ว่าช้อนเหมือนติดมือ; ปรับ morph หุบนิ้วและนิ้วโป้งให้ใกล้ด้าม, ตรวจระยะและ Chrome เมนูช้อน seed ทดสอบ, npm test 1,310 ผ่าน; ภาพอยู่ harness/evidence/feat-133-last/screens/spoon-close.png; นิ้วยังไม่ใช่ข้อต่อแยก

- feat-132: ผู้ใช้แจ้งจับช้อนยังไม่ดี; ย้ายจุดยึดด้ามจากขอบฝ่ามือเข้าแนวกำมือและแก้ IK ให้ใช้จุดเดียวกัน; rebuild customer GLB, Chrome ตรวจส้อม 4 มุม, npm test 1,309 ผ่าน; ดู harness/evidence/feat-132/summary.md

- feat-131: ผู้ใช้ขอให้ช้อนส้อมตรงมือและการจับ; เปลี่ยน anchor ให้อยู่แนวมือคงที่ แก้ IK ไปถึงอาหาร/ปากโดยข้อมือไม่บิด เพิ่ม EatGrip morph หุบนิ้วเฉพาะตอนกินและคืนรูปตอนเลิก; rebuild customer GLB, Chrome สี่มุมและ npm test 1,308 ผ่าน ดู harness/evidence/feat-131/summary.md

- feat-130: ผู้ใช้แจ้งข้อมือยังบิดบางมุม; แก้โดยให้มือใช้กรอบปลายแขนโดยตรง ไม่หมุนรอบแกนโดยไม่จำเป็น อุปกรณ์ยังใช้ anchor; rebuild customer GLB, ตรวจ Chrome สี่มุมและ npm test 1,306 ผ่าน ดู harness/evidence/feat-130/summary.md

- feat-129: แก้ข้อมือหักตลอดท่ากินโดยเพิ่ม EatUtensilAnchor และสร้างคลิปให้มืออยู่แนวเดียวกับปลายแขน แยกทิศอุปกรณ์; rebuild customer GLB ทั้งสอง; Chrome 1× ภาพ 8 จังหวะและ npm test 1,306 ผ่าน; ดู harness/evidence/feat-129/summary.md

- feat-128: ผู้ใช้ระบุท่ามือ/แขนยังแปลก ปรับทิศศอกและด้ามอุปกรณ์ตามช่วงกิน ลดมุมหักข้อมือตอนตักและป้องกันศอกซ้อนลำตัว; rebuild customer GLB; Chrome 1× ภาพ 8 จังหวะและ npm test 1,304 ผ่าน; นิ้วยังไม่มีข้อต่อแยก ดู harness/evidence/feat-128-final/summary.md

- feat-127: ผู้ใช้ยืนยันท่ากินไม่กระตุกแล้วแต่ยังดูแปลก จึงปรับเส้นทางด้าม องศาข้อมือและทิศข้อศอก พร้อม rebuild customer GLB; ตรวจภาพ 6 เฟรมในร้านและ npm test 1,304 ผ่าน; รายละเอียด harness/evidence/feat-127-final/summary.md

- feat-126: ผู้ใช้แจ้งท่ากินกระตุกและแปลกที่ 1×; พบ feedback การเลื่อนตัวกับ IK ศอก/ข้อมือพลิก จึงแก้และ rebuild customer GLB สองรุ่น; Chrome วัด 201 เฟรมที่ 1× ตัวไม่สั่น, npm test 1,304 ผ่าน; ดู harness/evidence/feat-126/summary.md

- feat-125: แก้ท่ากินกระตุกด้วยการเกลี่ยเวลาระหว่าง ticks ใน customer-actions; npm test 1,302 ข้อ, lint, typecheck และ Chrome E2E วงจรบริการผ่าน; รายละเอียด harness/evidence/feat-125/summary.md

- ตรวจคำถามพนักงานอยู่กับลูกค้านาน: engine ตั้งเวลารับออร์เดอร์เริ่มต้น 60–120 วินาทีจำลองต่อกลุ่ม เพิ่ม 15 วินาทีต่อคนถัดไป; staff-visual ใช้เวลางานส่วนที่เหลือแสดงท่า Work วนที่โต๊ะ ยังไม่ได้ยืนยันเหตุการณ์จากภาพนิ่งหรือแก้โค้ด รอบนี้ init บน Windows ล้มเพราะ bash หา dirname ไม่พบ
- ตรวจความเร็วจำลอง: targeted tests 5 ไฟล์ 85 ข้อผ่าน รวม 1/2/5/10/30× และ motion clock; Chrome E2E timing 4 ข้อผ่าน วัด 1× = 0.996×, 10× = 9.844×, resume = 0.995×, หลังแท็บซ่อน = 0.995×; ยังไม่ได้วัด 2/5/30× ผ่าน UI; init ยังหา dirname ไม่พบ และ E2E ต้องรันนอก sandbox เพราะ esbuild เข้า parent directory ไม่ได้

- ค่าเริ่มต้น lighting เป็น `simulation`: ใช้ config.openTime + metrics.time ของ simulation store ทุกนาทีจำลอง; ไม่มี wall-clock timer, ไม่คูณ speed ซ้ำ, ไม่แก้ simulation RNG/layout/history
- ก่อนเริ่ม/starting/จบรอบ คืนเวลาเปิดร้าน; pause คงเวลา; เปิด 3D ใหม่กลางรอบยังคงเวลาปัจจุบัน; fixed preview ยังใช้ได้
- Source: lighting/clock.ts, settings.ts, scene-lighting.ts, settings-panel.tsx และ use-lighting-store.ts; เอกสาร architecture/design-system อัปเดตแล้ว
- Verify: npm test 111 files / 1,298 tests ผ่าน; targeted แสง 17 tests; typecheck ผ่าน; lint 0 errors (warning เดิม 1); init + Core/Worker/BFF boundaries + validate_harness ผ่าน
- E2E Chrome production: 11 กรณีผ่านรวมสองรอบ (10 ผ่านก่อน + regression เจาะจงผ่านหลังแก้การนำทางใน test); เปิด 10:00 สว่าง 0.941432 / เปิด 20:00 สว่าง 0.820340 แม้เปลี่ยนเวลาเครื่อง; pause ที่ 10:01:18 แล้วภาพตรงกันทุกไบต์; stop คืน 10:00
- หลักฐาน: harness/evidence/feat-124/summary.md, measurements.jsonl และ screens/; ยังไม่ได้ commit/push/deploy
- Windows init ต้องตั้ง PATH ให้ Git usr/bin + Node/Python แล้ว shim python3 → python และตั้ง PYTHONIOENCODING=utf-8; ไม่ได้แก้ init.sh
- ข้อควรรู้สำหรับ E2E: ระหว่าง running/paused UI ซ่อน rail และแผงร้าน ต้องใช้ปุ่มจำลองโดยตรง; ตรวจแสงระหว่างจำลองด้วย scene/store tests และภาพ canvas แทนการเปิด shop tab

## 2026-10-29 ICT — feat-123 เสร็จสมบูรณ์ (done) · ปิด Defect ครบทั้ง 3 ข้อ และยืนยันผลรัน `--workers=1` ครบ 28/28 ข้อ

### สิ่งที่ทำและยืนยันแล้วในรอบนี้

- **แก้ไข Defect คงค้าง 2 ข้อของสายอาหาร/โต๊ะและสายแสง**:
  1. เชื่อมต่อ `LightingSettingsPanel` (`src/components/preview-3d/lighting/settings-panel.tsx`) เข้ากับ `src/components/editor/playground-panel.tsx` ในแท็บ `"shop"` ("ร้าน") ถัดจาก `<RoomSettingsForm />` และยืนยันผ่าน E2E (`e2e/restaurant-animation-lighting.spec.ts`) ว่าสามารถสลับโหมด `Fixed Time` (`12:00` vs `21:30`) จากหน้า UI จริงแล้วความสว่างฉาก 3D เปลี่ยนตามทันที
  2. แก้ไข `computeTablePlatePlacement` ใน `src/components/preview-3d/food/catalog.ts` ให้วางจานห่างจากขอบโต๊ะด้วยระยะคงที่ `PLATE_EDGE_INSET = 0.18` ม. แทนสัดส่วน `halfD * 0.56` ทำให้โต๊ะขนาด 0.80 ม., 1.20 ม., และ 2.00 ม. มีระยะเอื้อมจากเก้าอี้ถึงจาน `0.33` ม. (`correction = -0.01` ม., `outOfReach = false`) และโต๊ะเล็ก 0.60 ม. จานไม่ชนกันและไม่ล้นขอบ พร้อมอัปเดต `src/components/preview-3d/food/catalog.test.ts` และ `harness/evidence/feat-118/plate-reach-probe.json`
- รันยืนยันด้วย `--workers=1` ครบทั้ง 3 ไฟล์ (`restaurant-animation-lighting.spec.ts` 10 ข้อ + `restaurant-animation.spec.ts` 14 ข้อ + `restaurant-animation-timing.spec.ts` 4 ข้อ) → **ผ่านครบ 28/28 ข้อ (0 ล้ม)** บน production build + Chrome + NVIDIA GeForce GTX 1050 Ti (hardware WebGL)
- เก็บผลลัพธ์จริงลง `harness/evidence/feat-123/e2e-run.log`, `measurements.jsonl` (ครบ 25 รายการวัดผล), `summary.md` และ `screens/` (ครบ 27 ภาพ รวมถึง `cycle-*.png` และ `performance-dense.png`)
- ตรวจสอบทั้ง workspace: `npm test` **110 files / 1,294 tests ผ่าน**, `npm run lint` 0 error, `npm run typecheck` ผ่าน, `python scripts/validate_harness.py` ผ่าน (Done: 115/123, Sprint 5 `feat-100..123` เสร็จครบ 100%)

### ผลที่วัดได้จริงจากรอบ `--workers=1` ล่าสุด

- **เวลาเดิน**: 1× อัตรา `0.999×` (15.00 วิจำลอง ใน 15.02 วิจริง), 10× อัตรา `9.97×`, resume `0.994×`, กลับจากแท็บซ่อน `0.996×` (ไม่ไล่เวลาสะสม)
- **วงจรบริการ (ผ่าน diagnostic hook จริง)**: ถือเสิร์ฟ `CarryIdle` ถาด 1 จาน → กิน `Eat` ด้วย `fork` เมนู `steak` (`seated = true`, **`plateOutOfReach = false`**) → คราบ 1 โต๊ะ 5 ก้อน → เช็ด `WipeTable` `wipeProgress 0.003 → 0.982` โดย **คราบยังอยู่ครบ 8 ก้อนระหว่างเช็ด** และหลังเช็ดเสร็จ `stainMeshes = 0` → ดึงเก้าอี้ `handOnBackrest = true` ขณะเก้าอี้เคลื่อน เห็นครบ `approach → pull → sit → push → seated` ระยะดึงสูงสุด **0.30 ม.** พอดี `CHAIR_PULL`
- **Performance ฉากหนาแน่น (ผัง 80 ที่นั่ง นำเข้าผ่านช่อง JSON จริงขึ้น Ready)**: **ลูกค้า 66 คน + พนักงาน 8 คน** (นั่ง 45/80 ที่ · รอหน้าร้าน 15 คน · `stalled = 0`) จานบนโต๊ะ 41 ใบ · median **50.0 fps** / p95 **49.8 fps** · **draw calls 693** · triangles 582,820 · geometries 298 / textures 81 / programs 8 · JS heap 53.3 MB · frame debt 0
- **เริ่ม–จบรอบ 10 ครั้ง**: ผ่านครบ, canvas คงเหลือ 1 ตัว, heap 18.5 → 21.3 MB

### สถานะงานคงค้างของโปรเจกต์ (นอก Sprint 5)

- Sprint 5 (`feat-100` ถึง `feat-123`) เสร็จสมบูรณ์ครบทุกข้อ (`done`)
- งานที่ยังเป็น `in-progress` ในโปรเจกต์เหลือเพียงงาน Sprint 2 เดิมที่รอกระบวนการภายนอก: `feat-041` (รอทดสอบ Google OAuth จริงบน Railway/Cloudflare) และ `feat-043` (รอ push ขึ้น GitHub เพื่อรัน Actions และตั้ง branch protection)

## 2026-10-29 ICT — feat-117→119, feat-122 เสร็จ · feat-123 ตรวจแล้วแต่ยังไม่ปิด

- ทำบนเครื่องนี้ (ไม่ได้ย้ายไป Cloud) บนสาขา `codex/animation-foundation` commit ล่าสุด `6bd11c7`; 117/118/119/122 = done, **123 = in-progress**
- ฐานตรวจ: `npm test` 109 files / 1,283 tests ผ่าน · lint 0 error (เหลือ warning เดิม `_initial`) · typecheck ผ่าน · `validate_harness.py` ผ่าน · boundary scan ผ่าน · e2e 3 spec ใหม่ 27 tests ผ่านบน production build + Chrome + GTX 1050 Ti (hardware WebGL)
- `./harness/init.sh` รันผ่านได้เฉพาะเมื่อ shim `python3` → `python` เพราะ Windows มี stub `python3` ของ Store ที่ exit 49; ไม่ได้แก้ init.sh ไว้ ต้อง shim ซ้ำในเซสชันถัดไปหรือแก้สคริปต์ให้ fallback เป็น `python`
- **ยังไม่ได้ส่ง defect ให้ agent ใด** — `ListAgents` ไม่มี session อื่นบนเครื่องนี้ และยังไม่ได้ push ขึ้น GitHub; defect อยู่ในรีโปอย่างเดียว ห้ามอ้างว่ามีเจ้าของสายรับไปแล้ว

### Defect ที่รอเจ้าของสายรับ (อยู่ในรีโป ยังไม่มีใครรับ)

1. **สาย lighting (Agent 2, feat-120)** — `src/components/preview-3d/lighting/settings-panel.tsx` ไม่ถูก mount ที่ไหนเลยในแอป ผู้ใช้เปลี่ยนเวลา/พิกัด/ทิศเหนือไม่ได้ และ QA ใช้ fixed-clock ของสายนั้นไม่ได้ (ต้องตรึงเวลาเครื่องด้วย `page.clock` แทน) · รายละเอียด `harness/evidence/feat-123/summary.md`
2. **สาย food/table (Agent 2, feat-103/116)** — `computeTablePlatePlacement` อิง `halfD × 0.56` ระยะจาน-ถึง-คนจึงโตตามโต๊ะ (0.326 ม. ที่โต๊ะ 0.80 ม. → 0.414 ม. ที่ 1.20 ม. → 0.590 ม. ที่ 2.00 ม.) เกินระยะที่คลิป Eat ล็อกไว้ 0.34 ม. · 122 ชดเชยให้ได้สูงสุด 0.10 ม. เคสโต๊ะ ≥ 2 ม. จึงยังเอื้อมไม่ถึง · ตัวเลขวัดจริง `harness/evidence/feat-118/plate-reach-probe.json`
3. **ไม่ใช่ defect แต่ต้องรู้** — คลิป PullChair ของ feat-112 ตรึงมือไว้ที่พนักพิงเฉพาะช่วงที่เก้าอี้เคลื่อน 0.16 ม. ขณะที่ฉากดึง 0.30 ม. · แก้แล้วที่ feat-119 โดยผูกระยะเก้าอี้กับ normalized time ของคลิป ไม่ต้องแก้คลิป

### สิ่งที่ feat-123 ยังปิดไม่ได้ และต้องการจาก integrator

- diagnostic hook อ่านอย่างเดียวบน `window` (เปิดเฉพาะ non-production/flag) คืน `staffActions`/`customerActions`/`seating` reports, `tableService.getStats()` และ `renderer.info` — เพื่อยืนยันคราบ/การเช็ด/ท่าถือเสิร์ฟเป็นภาพรายข้อ และวัด draw calls
- ผัง fixture ที่นั่ง ≥ 80 เพื่อวัด performance baseline ฉากหนาแน่น (ผังตัวอย่างมี 6 ที่นั่ง วัดได้แค่ฉากลูกค้า 1–2 คน: median 50.0 fps / p95 49.3 fps)

### ข้อควรระวังของเส้นทางใหม่

- `modern = simulating && presentation !== undefined` — worker รุ่นเก่ายังเดินเส้นทาง legacy ทั้งเส้น อย่าลบโค้ดเดิมทิ้ง
- host เป็นเจ้าของ rig และเป็นผู้เดิน `mixer.update()` เพียงที่เดียว · feature ตั้ง action เท่านั้น · คลิป one-shot ถูก `paused` แล้วเขียน `action.time` จากเวลาจำลอง
- pause ต้องส่ง delta 0 และ blend 0 ทั้งคู่ (เคยพลาดมาแล้ว คลิป loop เล่นต่อทั้งที่กดหยุด — แก้ที่ feat-123)

## 2026-10-29 ICT — รอผู้ใช้เปิด Cloud จาก codex/animation-foundation

- ผู้ใช้เลือก **รอเปิดงานใน Cloud** จึงยังไม่เริ่ม117/118/119/122/123บนเครื่องนี้ รายละเอียดส่งต่ออยู่ `harness/cloud-handoff.md`
- บันทึกเอกสารแล้วแต่pushGitHubไม่สำเร็จเพราะยังไม่ได้ยืนยันตัวตน (`could not read Username`);เอกสารcommitยังอยู่local ต้องpushหลังloginหรือคัดลอกคำสั่งไปCloudเอง ไม่อ้างว่าส่งCloudแล้ว
- ฐานimplementationล่าสุด6e0c527;109–116และ120–121done เงื่อนไข117/118/119พร้อมทั้งหมด;122รอสามงานนี้และ123รอ122 ตรวจworkspaceล่าสุด100files/1117testsและtypecheckผ่านแล้ว ข้อผิดพลาดคลิปที่115เคยรายงานแก้แล้ว
- งานCloud:ตรวจงานรับ/จุดเชื่อม →117→118→119ตามgate →122รวมฉาก →123QA;ส่งdefectเฉพาะส่วนกลับownerAgent2/3 ห้ามแก้ทับกัน;ระวังผิวโต๊ะ0.76/contract0.74,ถาดrootกับhandbone,PullChair0.16ม.และเท้าไถลเดิม
- โควตาตรวจเริ่มต้นused70%/เหลือ30%รอบ5ชั่วโมง;หยุดเมื่อเหลือ<=10%(used>=90),checkpointก่อนหยุด แล้วตั้งcontinuationครั้งถัดไป05:00Asia/Bangkokจากสิ่งที่เหลือ ไม่มีautomationถูกสร้างในแชตlocalนี้และยังไม่ได้ย้ายexecutionไปCloud
- Cloudต้องตรวจcapabilityGPU/browserก่อนปิด123;ต้องไม่ใช้softwareWebGLอ้างผ่านreferenceGPUperformance BashinitบนWindowsติดdirname/launcherจึงต้องรันinitซ้ำในCloud ห้ามอ้างว่าlocalinitผ่าน

## 2026-10-29 ICT — Agent 3: feat-109 → feat-112 เสร็จครบสายคลิปตัวละคร (ยังไม่ export GLB กลาง)

- **ส่งมอบ**: `scripts/character-clips/staff-carry.mjs` (CarryIdle/CarryWalk/PickUp/PutDown), `customer-eat.mjs` (Eat), `staff-clean.mjs` (WipeTable), `customer-seat.mjs` (PullChair/SitDown/PushChair/StandUp) — ชื่อคลิปและชื่อ marker ตรงตารางสัญญา v1 §3 ทุกตัว ไม่มีคลิป/marker ชื่ออื่นเพิ่ม
- **สิ่งที่ 117/118/119 ต้องอ่านต่อ** (export ชื่อจริงจาก provider แต่ละไฟล์): `STAFF_CARRY_PROFILE` (grip ถาด/ระดับรับถาด/จุดวางจาน), `CUSTOMER_EAT_PROFILE` + `EAT_UTENSILS` + `utensilGripOffset()` + `eatPhaseOffset()`, `STAFF_CLEAN_PROFILE` (`stainWindow`) + `WIPE_FOOTPRINT`, `SEAT_MOTION_PROFILE` (`gripWindow`/`gripTravel`/`rootMotion`/`fallback`) — ค่าสัมผัสทั้งหมดอยู่ใน `harness/evidence/feat-109..112/contact-metrics.json` และภาพโครงกระดูกใน `preview.svg`
- **ยังไม่ได้ export GLB กลาง** ตามกฎ ownership: ทุกการ build ลง OS temp แล้วลบ `public/assets/models/*.glb` ไม่เปลี่ยนแม้ไบต์เดียว (sha256 ตรงก่อน-หลัง) — 117 เป็นผู้ export staff สองรุ่น และ 118 เป็นผู้ export customer สองรุ่น โดยส่ง `--clips` ของ lane ที่เกี่ยวข้องพร้อมกัน (build ปัจจุบันทดสอบไฟล์ละ provider เดียว ควรทดสอบรวม staff-carry + staff-clean และ customer-eat + customer-seat ตอน export จริง)
- **ต้องแก้ที่ระดับทีม — ผิวโต๊ะ 0.76 ไม่ใช่ 0.74**: `three-view.tsx` วางกล่องโต๊ะหนา 0.04 ม. โดยให้จุดกลางอยู่ที่ 0.74 (`placeMesh` ตั้ง `mesh.position.y`) ผิวสัมผัสจริงจึงเป็น 0.76 ม. เท่ากับที่ feat-116 ใช้ ขณะที่สัญญา v1 §3 เขียน "tabletop 0.74" — คลิปสายนี้ปรับมาใช้ 0.76 แล้วทั้งหมด เสนอให้ 122 แก้ถ้อยคำในสัญญาให้ตรงของจริง
- **ข้อจำกัดที่ยกมาจากคลิปเดิม ไม่ได้เพิ่มใหม่**: SitDown/StandUp ใช้ท่อนล่างของ Sit เดิมทุกค่า ซึ่งตัวมันเองเลื่อนข้อเท้าไปหน้า 0.407 ม. ระหว่างพับขา (เท้าไถล) — คลิปใหม่ไม่ได้ทำให้แย่ลง แต่ถ้า 119/122 ต้องการเท้านิ่ง ต้องเขียนท่อนล่างของ Sit ใหม่ ซึ่งอยู่นอก write_scope ของ 112
- **จุดเชื่อมที่ต้องระวัง**: ถาดของฉากติด root ของโมเดล คลิป carry จึงตรึงฝ่ามือไว้ที่พิกัดคงที่ให้ถาดอยู่กับที่ — ถ้า 117 เปลี่ยนไปผูกถาดกับกระดูกมือ ต้องถอดการตรึงนี้ออกพร้อมกัน; `PullChair` ปล่อยมือหลังเก้าอี้เคลื่อน 0.16 ม. ดังนั้น 119 ต้องตั้งจังหวะเลื่อนเก้าอี้ให้เคลื่อนเท่านี้พอดีภายใน `gripWindow`
- **แก้สองข้อที่ Agent 1 รายงานค้างไว้ใน feat-115**: ชื่อ attribute ที่ GLTFLoader ตั้งคือ `_part` (ไม่ใช่ `part`) และพารามิเตอร์ `Buffer<ArrayBuffer>` แก้ typecheck `ArrayBuffer | SharedArrayBuffer` — ตอนนี้ `npx vitest run` ทั้ง workspace ผ่าน 100 files / 1117 tests
- **การตรวจ**: เทสต์ใหม่ 4 ไฟล์ / 42 tests ผ่าน, `eslint` บนไฟล์ของ Agent 3 ผ่าน 0 warning/error, `tsc --noEmit` ผ่านทั้ง workspace, `validate_harness.py` ผ่าน (Done 110/123)
- **Code Review (2026-10-29)**: ปรับ `LightingSettingsPanel` ให้ใช้ Design Tokens โทนสีน้ำเงิน–ขาว (`bg-white`, `bg-surface`, `bg-blue-soft`, `border-line`, `text-ink`, `text-secondary-strong`) และ `line-height` ภาษาไทยตาม `SKILL.md` กฎข้อ 2–3; แก้ `usedLiteVariant` ใน `table-service.ts` เมื่อ `lite` โหลดเสร็จก่อน `full` ให้อัปเกรดเป็น `full` ได้ครบ; และซิงก์เวลา `clock` 60 วินาทีเข้า `use-lighting-store.ts` ใน `scene-lighting.ts`
- **ขอบเขต**: ไม่แตะ `three-view.tsx`, `scripts/create-cafe-customer-model.mjs`, `scripts/model-generation/*`, `runtime/contracts.ts`, GLB ตัวละคร หรือไฟล์ของ Agent 1/2; แก้เฉพาะ write_scope ของ 109–112 บวก `harness/feature_list.json` (สถานะ+หลักฐาน 4 งาน), `harness/progress.md`, `harness/session-handoff.md`
- **ถัดไปของ Agent 3**: `117` (staff-actions + export staff GLB, รอ 114), `118` (customer-actions + export customer GLB, รอ 114 และอาหาร), `119` (seating, รอ 115 ซึ่งเสร็จแล้ว)
