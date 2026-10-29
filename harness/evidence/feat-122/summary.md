# feat-122 — Integration: รวมวงจรอาหาร พนักงาน ลูกค้า เก้าอี้ และแสงทุกมุมมอง

วันที่: 2026-10-29 (Asia/Bangkok) · ฐาน: `codex/animation-foundation` @ `87c9eec`

## ส่งมอบ

| ไฟล์ | หน้าที่ |
|---|---|
| `runtime/scene-features.ts` | จุดเดียวที่ประกอบ factory ทั้งห้าและเดินสายพอร์ตข้ามสายตามสัญญา |
| `runtime/frame-clock.ts` | delta ที่ไม่ทิ้งเวลาตอน fps ต่ำ (เก็บเป็นหนี้แล้วทยอยคืน) |
| `three-view.tsx` | เส้นทางใหม่เมื่อมี metadata: host ส่ง rig ให้ feature, ย้ายตัวก่อนแล้วให้ feature ตั้งคลิป, เดิน mixer เอง |
| `runtime/legacy-lighting.ts` | คืน `ambient` ออกมาด้วย เพื่อให้ feature แสงรับไฟเดิมไปใช้แทนการสร้างดวงที่สอง |
| `iso-simulation-overlay.tsx` | `tableBadges()` + การวาดจาน/คราบ/จังหวะเช็ดใน fallback 2D |
| `character-lab*.tsx` | เลือกดูคลิปใดก็ได้ที่ฝังมากับ GLB แบบวนรอบ (ไม่ hardcode รายชื่อ) |
| `PRD.md` · `architecture.md` · `design-system.md` · `SKILL.md` | sync เฉพาะ clock / semantic state / animation / lighting / ownership |

## หลักฐาน

- `unit-tests.log`: 6 files / 69 tests ผ่าน (frame-clock 9, scene-features 7 รวม full-cycle, overlay 8, design tokens 28, runtime เดิม)
- `full-suite.log`: `npm test` **109 files / 1,283 tests ผ่าน** · lint 0 error (เหลือ warning เดิม `_initial`)
  · typecheck ผ่าน · `validate_harness.py` ผ่าน
- `browser-flow.json` + ภาพ: รันจริงบน Chrome ในเครื่องนี้ (`NVIDIA GeForce GTX 1050 Ti` ผ่าน ANGLE/D3D11
  = **hardware WebGL** ไม่ใช่ software) ตามอุปกรณ์อ้างอิงที่ feat-102 บันทึกไว้
  - `browser-3d-during-sim.jpg` — เปิด 3D ระหว่างจำลอง ตัวละครเดินและทำงานจริง
  - `browser-service-cycle.jpg` — ลูกค้านั่งกินที่โต๊ะ 1 พร้อมจานบนโต๊ะ และพนักงานรับออร์เดอร์ที่โต๊ะ 2
  - `browser-eating-closeup.png` — ภาพขยายท่า Eat กับจานบนผิวโต๊ะ
  - `browser-after-stop.jpg` — หลัง STOP เก้าอี้กลับเข้าโต๊ะ ไม่เหลือลูกค้า/จาน/คราบ
  - network: `cafe-customer-lite.glb`, `cafe-staff-lite.glb`, `food/steak/steak-lite.glb` → 200 ทั้งหมด
  - console error = 0, canvas WebGL = 1 ตัว, `scrollWidth − clientWidth = 0`
  - pause: pixel ของ canvas ไม่เปลี่ยนเลยใน 1.2 วินาที (หยุดจริง ไม่ใช่ช้าลง) แล้ว resume/stop ได้ปกติ

## การตัดสินใจที่ต้องบันทึก

1. **สองเส้นทางชัดเจน** — `modern = simulating && presentation !== undefined`
   - มี metadata: feature เป็นเจ้าของคลิป/ถาด/เก้าอี้/จาน ทั้งหมด legacy state machine ถูกข้าม
   - ไม่มี metadata (worker รุ่นเก่า/ยังไม่เริ่ม): เส้นทางเดิมทั้งเส้น ไม่เดาสถานะอาหาร/คราบ/ที่นั่ง
     ตามสัญญา v1 §1 "workerเก่า → วาดเดิน/นั่งแบบเดิม"
2. **ลำดับในหนึ่งเฟรม** — ย้ายตัวละครก่อน → `runtime.update()` (feature อ่านความเร็วที่วาดจริงของเฟรม
   นั้น แล้วตั้ง action) → `mixer.update(delta)` ครั้งเดียวต่อ rig; feature ไม่เดินเวลา mixer เอง
   จึงไม่มีการเดินเวลาซ้อน
3. **เลิกใช้เก้าอี้ที่ใกล้ที่สุด** — เส้นทางใหม่วางลูกค้าที่นั่งจาก `getBodyPlacements()` ของสาย seating
   ซึ่งผูกกับ `chairId` ที่ engine จัดสรรจริง (สัญญา v1 §1 ห้ามใช้ nearest chair)
4. **ชดเชยระยะเอื้อมจานที่จุดเดียว** — `plateForwardCorrection` ของ feat-118 ถูกบวกเข้ากับ
   `outwardOffset` ของ feat-119 ในที่เดียวและจำกัดไม่เกิน `MAX_SEAT_REACH_SHIFT = 0.10 ม.`
   (เท่าระยะที่เก้าอี้สอดใต้โต๊ะได้) สองค่าจึงไม่หักล้างกันและตัวไม่ดันทะลุขอบโต๊ะ
5. **แสงจริงรับไฟเดิม** — feature แสงถูกส่ง `existingLights` ของฉาก และ `fitKeyLight` เดิมถูกถอดออก
   เพราะ shadow camera เป็นของ feature แล้ว ไม่มีไฟสองชุดหรือ fit สองที่แย่งกัน
6. **หนี้เวลาเฟรม** — `FrameClock` clamp ที่ 0.1 วิ/เฟรมเหมือนเดิม แต่เก็บส่วนเกินแล้วคืนไม่เกิน 40%
   ของ delta เฟรมถัดไป เครื่อง 15 fps จึงไม่ค่อย ๆ ล้าหลังนาฬิกาจำลอง ส่วนการกระตุกเกิน 0.5 วิ ถูก
   **ทิ้ง** ไม่เล่นย้อน และ pause ล้างหนี้ทิ้งเพื่อไม่ให้ไล่เวลาเมื่อกลับมา
7. **`food` ยังเป็น no-op โดยตั้งใจ** — แคตตาล็อกอาหารของ feat-103 เป็นข้อมูลที่ `table-service` วาด
   ถ้าเสียบ feature ที่สองที่วาดจานเดียวกันจะกลายเป็นสองเจ้าของของวัตถุเดียว

## ขอบเขตที่แตะเพิ่มนอก write_scope (ต้องให้ coordinator รับทราบ)

- `src/components/preview-3d/runtime/legacy-lighting.ts` — อยู่ใน `runtime/` ซึ่งอยู่ใน scope แล้ว
- `app/globals.css` — เพิ่ม 3 token (`--iso-dish`, `--iso-dish-edge`, `--iso-stain`) เพราะ
  `src/test/design-tokens.test.ts` บังคับว่าทุกสีในตาราง §2.3–§2.5 ของ `design-system.md`
  ต้องมีใน `globals.css` การ sync เอกสารที่อยู่ใน scope จึงพาไฟล์นี้มาด้วยโดยเลี่ยงไม่ได้

## สิ่งที่ยังไม่ได้ตรวจในงานนี้ (เป็นของ feat-123)

- ตัวเลข performance (median/p95/draw calls/memory) ฉาก 80 ลูกค้า + 8 staff
- 6 breakpoints, 4 ช่วงเวลาของแสง × 4 มุมกล้อง, ร้าน 2–30 ม.
- SVG fallback ที่ `prefers-reduced-motion` และกรณี WebGL/asset ใช้ไม่ได้ (มี unit test แล้ว แต่ยังไม่มีภาพ)
- Playwright 3 spec ตามแผน §8
