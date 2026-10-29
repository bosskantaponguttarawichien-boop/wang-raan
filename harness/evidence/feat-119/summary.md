# feat-119 — Seating runtime: มือดึงเก้าอี้และเลื่อนนั่งลุกตามพื้นที่จริง

วันที่: 2026-10-29 (Asia/Bangkok) · ฐาน: `codex/animation-foundation` @ `f147a7f`

## ส่งมอบ

| ไฟล์ | หน้าที่ |
|---|---|
| `seat-motion.ts` | เพิ่ม `GRIP_TRAVEL`, `SEAT_CLIP_SECONDS`, `SEAT_MARKER_TIMES` (ของเดิมไม่เปลี่ยนพฤติกรรม — `three-view.tsx` ยังใช้ machine เดิมได้จนถึง feat-122) |
| `seating/seating-geometry.ts` | pure: แกน facing/outward จาก rotation, พื้นที่ว่างหลังเก้าอี้, `effectivePull`, เงื่อนไข fallback |
| `seating/seat-sequence.ts` | pure state machine: phase, clipPhase, chairPull, outwardOffset ตาม marker และ clock ของ feat-115 |
| `seating/seating.ts` | scene feature: ขับเก้าอี้ของ host, unique occupant, reassignment, chair กลับบ้านเอง, implement `CustomerPosePort` ของ feat-118 |
| `seating/contracts.ts` · `index.ts` · `clip-providers.d.ts` | ports และ type ของ provider feat-112 (test เท่านั้น) |

## หลักฐาน

- `unit-tests.log`: 5 files / 77 tests ผ่าน (geometry 17, sequence 21, feature 24, seat-motion เดิม+equivalence 4, clip tests เดิม 11)
- เต็มชุด: `npm test` 107 files / 1,263 tests ผ่าน · lint 0 error · typecheck ผ่าน · `validate_harness.py` ผ่าน
- boundary scan: `src/core/` ไม่มี react/zustand/next; ไม่มี `three` ใน `src/core/`, `src/workers/`, `app/api/`
- **equivalence กับคลิปจริง**: `seat-motion.test.ts` import `scripts/character-clips/customer-seat.mjs` แล้วเทียบว่า
  `CHAIR_PULL`/`GRIP_TRAVEL`/`SEAT_MARKER_TIMES`/`SEAT_CLIP_SECONDS` ตรงกับ `SEAT_MOTION_PROFILE` ทุกค่า
  และยืนยัน `rootMotion.clipTranslatesRoot === false` (ระยะถอยเป็นของ controller ฝั่งนี้เท่านั้น ไม่คูณซ้ำ)

## ปัญหาที่รับมาแล้วแก้ในงานนี้

**มือหลุดจากพนักพิงช่วงท้ายการดึง** — คลิป PullChair ของ feat-112 ตรึงมือไว้ที่พนักเฉพาะช่วง
`gripWindow = [0.22, 0.46]` ซึ่งเก้าอี้เคลื่อนได้แค่ `GRIP_TRAVEL = 0.16 ม.` แต่ `CHAIR_PULL` ของฉากคือ
`0.30 ม.` ถ้าเลื่อนเก้าอี้เป็นเส้นตรงตาม `CHAIR_SLIDE_SECONDS` เหมือน machine เดิม มือจะปล่อยพนักไปแล้ว
แต่เก้าอี้ยังเคลื่อนต่ออีก 0.14 ม. โดยไม่มีอะไรดึง

แก้โดยผูกระยะเก้าอี้กับ **normalized time ของคลิป** ไม่ใช่กับนาฬิกาแยก (`pullChairTravel`):

| ช่วงคลิป | เก้าอี้ | มือ |
|---|---|---|
| 0 → 0.22 | นิ่งที่ตำแหน่งผัง | เอื้อมไปหาพนัก |
| 0.22 → 0.46 | เคลื่อน **พอดี 0.16 ม.** | เกาะพนัก |
| 0.46 → 1 | เคลื่อนส่วนที่เหลือจนถึง `effectivePull` | ปล่อยแล้ว (ตามที่ provider กำกับไว้) |

มี test ยืนยันว่า: ทุกเฟรมที่ `handOnBackrest` อยู่ในช่วง gripWindow เท่านั้น, เก้าอี้ไม่เคลื่อนเลยก่อน
`pullGrip`, และระยะเก้าอี้ไม่ถอยหลังตลอดคลิป

## การตัดสินใจที่ต้องบันทึก

1. **เวลาเดินด้วย delta ของ simulation เท่านั้น** — ไม่มีนาฬิกาแยกใน feature; 15/24/30/60/120 fps
   ใช้เวลา simulation เท่ากัน (มี test), `delta = 0` ตอน pause หยุดทั้ง phase, เก้าอี้ และตัว
   และเฟรมเดียวที่ยาวกว่าคลิปทั้งเส้นก็ไม่ข้าม phase
2. **ลำดับไม่ให้ตัวกับเก้าอี้ชนกัน** — pull: ตัวอยู่ที่ 0 เก้าอี้ออกไป P · sit: ตัวเลื่อน 0→P
   (เก้าอี้นิ่งที่ P) · push: ทั้งคู่ P→0 · rise-pull: ทั้งคู่ 0→P · rise: ตัว P→0 โดยเก้าอี้ยังอยู่ P
   · depart: เก้าอี้ P→0 หลังตัวพ้นแล้ว — ค่าต่อเนื่องทุกรอยต่อ (test ตรวจว่าไม่มี jump > 0.02 ม./เฟรม
   ที่ 120 fps) และ `bodyClear` คุมไม่ให้เก้าอี้กลับก่อนคนลุกพ้น
3. **ลุกกลางท่านั่ง** — ถ้าถูกสั่งลุกตอน SitDown ยังไม่จบ จะเริ่ม StandUp จากตำแหน่งที่ตัวอยู่จริง
   (`carried = riseSeconds × (1 − sitProgress)`) จึงไม่กระโดด; ถ้าถูกขัดตอน PullChair ยังไม่ได้นั่ง
   จะปล่อยเก้าอี้แล้วเดินไปเลย ตรงกับ `startRise` เดิม
4. **พื้นที่คับแคบ** — `chairPullSpace` ฉาย footprint ของทุกวัตถุและผนังลงแกน outward แล้วตัดเฉพาะชิ้น
   ที่ซ้อนแถบความกว้างเก้าอี้จริง (ไม่นับโต๊ะของตัวเองและวัตถุข้าง ๆ) เหลือ `available` → `effectivePull`
   ถูก clamp ที่ `[GRIP_TRAVEL, CHAIR_PULL]`; ถ้า `available < GRIP_TRAVEL` → `usesChairClips = false`
   แล้วเล่น SitDown/StandUp ตรง ๆ โดยเก้าอี้ไม่ขยับเลย (ตาม `SEAT_MOTION_PROFILE.fallback`)
   จึงไม่มีเคสเก้าอี้ทะลุผนังหรือโต๊ะ
5. **หนึ่งเก้าอี้หนึ่งคน** — `claims: chairId → renderAgentId`; คนที่ขอเก้าอี้ที่ถูกจองแล้วถูกปฏิเสธ
   (ไม่มี pose, ไม่มี report) ไม่ใช่แย่งกันนั่ง; ย้ายเก้าอี้ = ปล่อยตัวเก่าให้กลับบ้านแล้วเริ่ม sequence ใหม่
6. **เก้าอี้กลับบ้านเองหลังลูกค้าหาย** — ยกเลิกกลางทางไม่เหลือเก้าอี้ค้างนอกโต๊ะ: เก็บ
   `returning: chairId → { pull, remaining }` แล้วลดลงตาม `CHAIR_RETURN_DELAY`
7. **ไม่แตะผัง** — ค่าทั้งหมดเป็น presentation: feature เขียนแค่ `object.position` ของเก้าอี้ที่ host ส่งมา
   และ `reset()` คืนตำแหน่ง `home` ทุกตัว; มี test ที่ `JSON.stringify(layout)` ต้องเท่าเดิมหลังนั่งและลุกครบรอบ
8. **จุดเชื่อม feat-118** — feature implement `getSeatPose(renderAgentId)` ซึ่งเป็น `CustomerPosePort`
   ที่ feat-118 ประกาศไว้ จึงเสียบเข้ากันได้ใน feat-122 โดยไม่มีสายไหน import implementation ของอีกสาย

## สิ่งที่เหลือให้ feat-122

- host ต้องส่ง `ChairRigPort` (เก้าอี้ + ตำแหน่ง home) และนำ `getBodyPlacements()` ไปวางตัวลูกค้า
  แทนการใช้ `stepSeat`/nearest-chair เดิมใน `three-view.tsx`
- ต้องชดเชย `plateForwardCorrection` ที่ feat-118 รายงาน (โต๊ะ 1.20 ม. ต้องเลื่อนตัว ~7 ซม.)
  ร่วมกับ `outwardOffset` ของ feature นี้ในจุดเดียว เพื่อไม่ให้สองค่าหักล้างกัน
