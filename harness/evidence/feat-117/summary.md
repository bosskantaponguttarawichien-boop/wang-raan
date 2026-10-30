# feat-117 — Staff runtime: ถือเสิร์ฟและเช็ดโต๊ะ

วันที่: 2026-10-29 (Asia/Bangkok) · ฐาน: `codex/animation-foundation` @ `de27453`

## ส่งมอบ

| ไฟล์ | หน้าที่ |
|---|---|
| `src/components/preview-3d/staff-actions/contracts.ts` | typed ports: `StaffRig`/`StaffRigPort` (host ส่ง rig มาให้), `TableServicePort` (อ่านอย่างเดียว), `WipeFootprint` |
| `src/components/preview-3d/staff-actions/staff-action-controller.ts` | pure resolution: clip + phase + props จาก `StaffPresentation` ตาม priority สัญญา v1 §3 |
| `src/components/preview-3d/staff-actions/staff-actions.ts` | scene feature: ขับ mixer, ติดผ้า/จาน, สลับถาด, รายงานผลต่อเฟรม |
| `public/assets/models/cafe-staff.glb` | 9 คลิป + `animationMarkers` (sha256 `888a6ecd…`) |
| `public/assets/models/cafe-staff-lite.glb` | 9 คลิป + `animationMarkers` (sha256 `99134baa…`) |

## หลักฐาน

- `glb-staff-full.json` / `glb-staff-lite.json`: nodes/skins/meshes **เท่าเดิมทุกค่า** เทียบไฟล์ก่อนแก้
  (bone list เดิม, `_PART` 7 ค่า 0–6, `walkCycleDistance` 0.9) และเพิ่มคลิป
  `CarryIdle 6s / CarryWalk 0.95s / PickUp 1.2s / PutDown 1.4s / WipeTable 4s` พร้อม markers
- `unit-tests.log`: 6 files / 76 tests ผ่าน (controller matrix 24, feature 13, clip tests เดิม 33, byte-equality 13, character-models 5)
- เต็มชุด workspace: `npm test` 102 files / 1,154 tests ผ่าน · `npm run lint` 0 error (เหลือ warning เดิม `_initial`)
  · `npm run typecheck` ผ่าน · `python scripts/validate_harness.py` ผ่าน
- boundary scan: ไม่มี react/zustand/next ใน `src/core/`, ไม่มี `three` ใน `src/core/`, `src/workers/`, `app/api/`
- `public/assets/models/cafe-customer*.glb` ไม่ถูกเขียน (sha256 `12f1715e…` เท่าสำเนาก่อนเริ่มงาน)

## การตัดสินใจที่ต้องบันทึก

1. **เวลาเป็นของ simulation ไม่ใช่ของ mixer** — คลิป one-shot (PickUp/PutDown/WipeTable) ถูกตั้ง
   `action.paused = true` แล้วเขียน `action.time` จาก `phaseStartedAtSeconds..phaseEndsAtSeconds`
   ทุกเฟรม จึงไม่มี catch-up, pause หยุดสนิท และ playbackRate ไม่ทำให้ท่าหลุดจากข้อมูล
   (สัญญา v1 §2: markers เป็น normalized time ไม่พึ่ง mixer-finished callback)
2. **host ยังเป็นเจ้าของ rig** — feature ไม่ย้าย/หมุน/dispose โมเดล และไม่เรียก `mixer.update()`
   เอง (ถ้าเรียกจะเดินเวลาซ้อน render loop เดิม) ถาดเป็นของ host จึงแตะแค่ `visible`
   และคืนค่าเดิมตอน release/reset/dispose
3. **ไม่ blend carry กับ walk** — CarryWalk ยืม track ท่อนล่างของ Walk มาทั้งเส้น ถ้า crossFade
   สองคลิปนี้แขนจะแย่งกัน จึง `stop()` คลิปเก่าแล้วเล่นคลิปใหม่ตรง ๆ
4. **คราบเป็นของ table-service** — feature อ่าน `getDishPlacements`/`getTableStainInfo` อย่างเดียว
   และคำนวณ `wipeProgress` จากช่วง `wipe-contact → clear-complete` เท่านั้น คราบจึงไม่หาย
   ตอนเข้าคลิปหรือตอน task เสร็จ (ตามที่ feat-111 กำกับไว้ใน `stainWindow`)
5. **จานไม่หายกลางอากาศ** — ถาดยังแสดงอาหารจนกว่า feat-116 จะรายงานว่าจานอยู่บนโต๊ะเป้าหมายจริง
   (`trayMealIds` = เมนูที่ยัง unaccounted) โหลด asset ช้าจึงไม่ทำให้อาหารกระพริบหาย
6. **เท้าไม่ไถล** — เลือก CarryWalk/Walk จากความเร็วของโมเดลที่วาดจริง (วัดจาก `model.position`)
   ไม่ใช่ `walkMetersPerSecond` ที่วางแผนไว้ และ `timeScale = speed × clipDuration / walkCycleDistance`

## การข้ามขอบเขตที่เกิดขึ้นจริง (ต้องให้ coordinator รับทราบ)

การ export staff GLB ทำให้แตะไฟล์ที่ feature_list ระบุว่าเป็น write_scope ของ **feat-122** สองจุด
เพราะ gate ของ 117 สั่งให้ `npm test` ผ่าน 100% แต่ทั้งสองไฟล์ assert รายการคลิปของ staff GLB:

- `scripts/create-cafe-customer-model.mjs` — เพิ่ม `REGISTERED_CLIP_MODULES` (registration เท่านั้น
  ตามที่ 122 อนุญาตไว้) ใช้เมื่อ **ไม่มี** `--clips` ส่วน `--clips` ยังแทนที่ชุด default ทั้งหมด
  จึงทำให้ byte-equality test และ provider-fixture test เดิมผ่านโดยไม่ต้องแก้
- `src/components/preview-3d/character-models.test.ts` — assertion เดิมคือ
  `staff = customer + ["Work"]` ซึ่งเป็นจริงไม่ได้อีกเมื่อ staff มีคลิปของสายตัวเอง
  เปลี่ยนเป็น `BASE_CLIPS + STAFF_ONLY_CLIPS` และเว้น `CUSTOMER_ONLY_CLIPS` ไว้ให้ feat-118 เติม

ทั้งสองจุดเป็นลำดับที่หลีกไม่ได้ในแผน (122 ขึ้นกับ 117/118 แต่ test/registration ที่ 122 ถือ
ต้องเปลี่ยนตั้งแต่ 117 export) ไม่ได้แก้ `three-view.tsx`, `runtime/contracts.ts` หรือ GLB ของลูกค้า
