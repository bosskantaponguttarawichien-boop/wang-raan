# feat-118 — Customer runtime: GLB ลูกค้าและกินอาหารตามสถานะจริง

วันที่: 2026-10-29 (Asia/Bangkok) · ฐาน: `codex/animation-foundation` @ `9cc9609`

## ส่งมอบ

| ไฟล์ | หน้าที่ |
|---|---|
| `customer-actions/contracts.ts` | ports: `CustomerRig`/`CustomerRigPort`, `CustomerSeatPose` + `CustomerPosePort` (จุดเชื่อมกับ feat-119), `CustomerTableServicePort` |
| `customer-actions/customer-action-controller.ts` | pure: gating การกิน, priority seating > eat > walk > base, utensil ต่อเมนู, bite offset |
| `customer-actions/customer-actions.ts` | scene feature: ขับ mixer, ติดอุปกรณ์เข้า `RightHand`, วัดระยะจานจริง, รายงานต่อเฟรม |
| `customer-actions/clip-providers.d.ts` | type ของ provider feat-110 สำหรับ test เท่านั้น (runtime ไม่ import `scripts/`) |
| `public/assets/models/cafe-customer.glb` | 8 คลิป + markers (sha256 `a162f599…`) |
| `public/assets/models/cafe-customer-lite.glb` | 8 คลิป + markers (sha256 `85246314…`) |

## หลักฐาน

- `glb-customer-full.json` / `glb-customer-lite.json`: nodes/skins/meshes **เท่าเดิมทุกค่า** เทียบไฟล์ก่อนแก้
  (`_PART` 7 ค่า 0–6, `walkCycleDistance` 0.9) เพิ่มคลิป
  `Eat 3.2s / PullChair 1.1s / SitDown 0.9s / PushChair 0.9s / StandUp 0.9s` พร้อม markers ครบ
- `unit-tests.log`: 5 files / 74 tests ผ่าน (controller 32, feature 14, eat-clip tests เดิม 10, byte-equality 13, character-models 5)
- เต็มชุด: `npm test` 104 files / 1,200 tests ผ่าน · lint 0 error · typecheck ผ่าน · `validate_harness.py` ผ่าน
- staff GLB ไม่ถูกเขียนซ้ำ (sha256 `888a6ecd…` / `99134baa…` เท่าค่าที่ feat-117 บันทึก) และไม่แก้ `three-view.tsx`
- **equivalence กับคลิปจริง**: test import `scripts/character-clips/customer-eat.mjs` ตรง ๆ แล้วเทียบว่า
  `eatPhaseOffset` และ `utensilGripOffset` ของ runtime TS ให้ค่าเท่ากับ provider ทุกเมนู/ทุก seed
  (runtime ไม่ import build script แต่พิสูจน์ว่าไม่ drift)

## การตัดสินใจที่ต้องบันทึก

1. **เงื่อนไขเริ่มกิน 3 ข้อแยกกัน** — engine บอก `activity = eating` **และ** seating lane บอกว่า
   `phase = seated` จริง **และ** `meal.placedAtSeconds` ผ่านมาแล้ว; ไม่มีการใช้ "คลิปเล่นจบ" เป็นเงื่อนไข
   ดังนั้น `waiting-order`/`waiting-food` นั่งเฉย, จานที่ยังไม่ถึงโต๊ะไม่ทำให้เริ่มตัก และ `finished` หยุดตัก
   โดยยังนั่งอยู่ (สัญญา v1 §1 ข้อ 2)
2. **ไม่มีเก้าอี้ = ไม่มีท่านั่ง** — `chairId` ว่างหรือ `seatingPhase` ว่าง ให้เล่นได้แค่ Walk/Idle
   แม้ engine จะยังรายงาน `eating` อยู่
3. **จังหวะเป็นของ simulation** — Eat เป็น loop ที่ seam ต่อเนื่อง จึงเขียน `action.time` จาก
   `simTime − placedAt` ได้ตรง ๆ; pause หยุดคาคำ, playbackRate ไม่ทำให้หลุด และ 3D ที่เปิดกลาง run
   คำนวณ bite เดียวกับ feature ที่รันมาตลอด (มี test ยืนยัน)
4. **เหลื่อมจังหวะต่อคน** — ใช้ FNV-1a เดียวกับ feat-110 โดย seed มาจาก `layoutRevision`
   (snapshot ไม่มี field seed) จึงซ้ำได้ต่อผังหนึ่งผัง และไม่แตะ RNG ของ simulation
5. **อุปกรณ์ตามเมนู** — ด้ามเลื่อนเข้าฝ่ามือเท่า `length − 0.135` ปลายอุปกรณ์จึงอยู่ที่ระยะเดียว
   ทุกชนิด; prop ถูก parent เข้า `RightHand` ที่จุดผิวฝ่ามือและชี้ตามแกน local −Y ซึ่งเป็นทิศด้าม
   ที่คลิปล็อกไว้ (`handQuaternion` ของ provider) จึงไม่ต้องเดาทิศต่อเฟรม
6. **PushChair ย้อนเวลาสำหรับ `rise-pull`** — ท่าดึงเก้าอี้ออกขณะนั่งคือ PushChair กลับทาง
   จึงส่ง `phase = 1 − clipPhase` ไม่สร้างคลิปใหม่
7. **จุดเชื่อมกับ feat-119** — รับ pose ได้สองทาง: `setSeatPose()` (push) และ `options.pose`
   (pull) โดย push ชนะสำหรับลูกค้าคนเดียวกัน; pose ที่ push ไว้ถูกลบเมื่อลูกค้าออกจาก snapshot
   เพื่อไม่ให้ค่าเก่ากลับมาใช้กับ id ที่ถูกใช้ซ้ำในรอบใหม่

## Defect ที่พบต่อสาย food/table (feat-103/116 · เจ้าของ Agent 2)

`computeTablePlatePlacement` วางจานโดยอิง `halfD × 0.56` ของโต๊ะ ระยะจาน-ถึง-คนจึงโตตามขนาดโต๊ะ
ขณะที่คลิป Eat ล็อกระยะจานไว้ที่ **0.34 ม.** หน้าตัว (ปลายอุปกรณ์ห่างฝ่ามือ 0.135 ม. คงที่)
วัดจากฟังก์ชันจริง (`plate-reach-probe.json`, เก้าอี้ default 0.50 ม. สอดใต้โต๊ะ 0.10 ม.):

| preset | ขนาดโต๊ะ | ระยะจานจากตัวคน | ต้องเลื่อนตัวเพิ่ม | เกินระยะคลิป (>0.06 ม.) |
|---|---|---|---|---|
| table-2-seats | 0.80 ม. | 0.326 ม. | −0.014 ม. | ไม่ |
| table-4-seats | 1.20 ม. | 0.414 ม. | **+0.074 ม.** | ใช่ |
| โต๊ะกว้าง | 2.00 ม. | 0.590 ม. | **+0.250 ม.** | ใช่ |

ค่าเท่ากันทั้ง 5 เมนู (footprint 0.19–0.25 ม. ไม่ใช่ตัวกำหนด เพราะ `halfD × 0.56` ชนะทุกครั้ง)

- เคส 1.20 ม. **122 แก้ได้** โดยเลื่อนตัวที่นั่งไปข้างหน้า ~7 ซม. (เก้าอี้สอดใต้โต๊ะ 0.10 ม. จึงมีที่)
- เคส 2.00 ม. **แก้ด้วยการเลื่อนตัวไม่ได้** — ต้องให้สาย food/table จำกัดระยะจานจากขอบโต๊ะ
  (เช่น `min(halfD − r − margin, 0.34 + chairInset)`) แทนการ scale ตามขนาดโต๊ะ
- feature นี้ไม่แก้ค่าของสายอื่นเอง แต่รายงาน `plateLocalOffset` / `plateForwardCorrection` /
  `plateOutOfReach` ทุกเฟรมเพื่อให้ 122 ปรับตัวที่นั่งและให้ 123 เห็นเคสที่เหลือ
