# Session Handoff — วางร้าน (Wang-Raan)

> **archive**: เก็บ 5 entry ล่าสุดเท่านั้น — รายการก่อนหน้าจะถูกย้ายไปเก็บที่
> `harness/archive/session-handoff-archive.md`

## 2026-10-29 ICT — feat-123 รอบสอง: diagnostic hook + ผังหนาแน่น (เหลือเก็บผลรันสุดท้าย)

**สถานะโควตาตอนเขียน**: โควตา 5 ชั่วโมงใช้ไป **88%** (รีเซ็ตอีก ~2.5 ชม.) · รายสัปดาห์ 33% · context 69%
จึงหยุดเปิดงานยาวรอบใหม่ และเขียนส่งต่อไว้ให้ทำต่อได้ทันที

### ทำเพิ่มจากรอบแรก (commit ไว้แล้ว)

- `src/components/preview-3d/runtime/scene-diagnostics.ts` + test 11 ข้อ — hook อ่านอย่างเดียวบน `window`
  ติดตั้งเฉพาะเมื่อ `window.__wangraanDiagnostics === true` ถูกตั้งก่อนฉากถูกสร้าง (ผู้ใช้จริงไม่เคยได้)
  คืน `staffActions` / `customerActions` / `seating` reports, `tableService` stats, `renderer.info` และ `frame`
  · ต่อเข้า `three-view.tsx` แล้ว ถอดตอน unmount
- `e2e/restaurant-animation.spec.ts` เพิ่มสองเทสต์ใหญ่: วงจรบริการรายช่วงจาก hook จริง และ performance ฉากหนาแน่น
  (สร้างผัง 80 ที่นั่งใน spec แล้วนำเข้าผ่านช่องเลือกไฟล์ JSON ของแอป แอปตรวจเองขึ้น Ready)

### ผลที่วัดได้แล้ว (จากการรันเดี่ยว — ตัวเลขจริง ไม่ใช่ประมาณ)

- วงจรบริการ: ถือเสิร์ฟ `CarryIdle` ถาด 1 จาน → กิน `Eat` ด้วย `fork` เมนู `steak` → คราบ 1 โต๊ะ 5 ก้อน
  → เช็ด `WipeTable` `wipeProgress 0.095` โดย **คราบยังอยู่ครบ 8 ก้อน** → ดึงเก้าอี้ `handOnBackrest = true`
  ขณะเก้าอี้เคลื่อน เห็นครบ approach→pull→sit→push→seated ระยะดึงสูงสุด **0.30 ม.** พอดี `CHAIR_PULL`
- Performance ฉากหนาแน่น: **ลูกค้า 52 + พนักงาน 8** นั่ง 41/80 ที่ จาน 40 ใบ · median **50.0 fps** p95 **49.5 fps**
  · **draw calls 650** · triangles 485,446 · geometries 282 / textures 67 / programs 8 · heap 47.5 MB · frame debt 0

### สิ่งที่ค้างอยู่จริง ๆ (ทำต่อได้ทันที)

1. **รัน `npx playwright test e2e/restaurant-animation.spec.ts --workers=1` ให้จบแล้วเก็บผล** — สองเทสต์ที่วัดผล
   ใช้ throughput ของการจำลองเป็นตัวแปร รันขนานกับเบราว์เซอร์อื่นแล้วร้านเดินไม่เท่ากันจนล้ม (รอบขนานล่าสุด
   26 ผ่าน 2 ล้มด้วยเหตุนี้) · รันเดี่ยวผ่านมาแล้วทีละตัว แต่ยังไม่มีผลรันเดี่ยวทั้งไฟล์ในมือ
   · หลังรันเสร็จให้ copy `harness/evidence/feat-123/measurements.jsonl` และภาพใน `e2e/.results/screens/`
   เข้า `harness/evidence/feat-123/screens/` แล้วอัปเดต `feature_list.json` ของ feat-123
2. **เมนูที่ 5 (`fried-rice`)** ยังไม่เคยขึ้นโต๊ะในรอบที่รัน (เห็น 4 จาก 5) — ผลของ hash เลือกเมนูต่อกลุ่ม ไม่ใช่บั๊ก
   แต่ยังไม่มีภาพยืนยันครบห้าเมนู
3. **ลูกค้าพร้อมกันยังไม่ถึง 80** (สูงสุด 52) — ตัวจำกัดคืออัตราเข้าร้าน/เวลาทำอาหารของ engine ไม่ใช่การวาดภาพ
4. **GPU memory จริง** อ่านจากหน้าเว็บไม่ได้ (มีแค่ JS heap กับจำนวน geometry/texture)

### Defect ที่ยังรอเจ้าของสาย (ยังไม่ได้ส่งให้ใคร — ไม่มี agent อื่นบนเครื่องนี้ และยังไม่ push)

1. `lighting/settings-panel.tsx` (feat-120) ไม่ถูก mount ที่ไหนเลยในแอป
2. `computeTablePlatePlacement` วางจานไกลเกินระยะเอื้อมคลิป Eat ที่โต๊ะ ≥ 1.2 ม.
   (ตัวเลข `harness/evidence/feat-118/plate-reach-probe.json`)

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

## 2026-10-29 ICT — Agent 2: feat-116, feat-120, feat-121 เสร็จครบทุกงานของสายอาหาร โต๊ะ และแสง

- **ผลลัพธ์**:
  - `feat-116`: สร้าง `src/components/preview-3d/table-service/` (`createTableServiceFeature`) วางจานอาหาร 5 เมนูบนผิวโต๊ะ (`y = 0.76m`) ตาม `chairId` รองรับโต๊ะกลม/เหลี่ยม ขนาดเล็ก `0.60×0.60m` ถึงใหญ่ หมุน `0/90/180/270` องศา กลุ่ม 1/2/4 คน, สลับ `FoodFull → FoodPartial → FoodEmpty`, สร้างคราบสะสมแบบ deterministic (`y = 0.7616m`) แยก material รายโต๊ะ/รอบบริการ คงจานและคราบหลังลูกค้าออก จางลงตาม `wipeProgress` และลบเมื่อ `clean`
  - `feat-120`: สร้าง `src/components/preview-3d/lighting/solar-position.ts`, `clock.ts`, `settings.ts`, `settings-panel.tsx` และ `src/store/use-lighting-store.ts` คำนวณมุมแดดตาม NOAA จาก UTC + พิกัด + `northOffsetDegrees` โดยไม่ขึ้นกับ `viewRotation`, นาฬิกาเวลาจริงอัปเดตทุก 60 วินาทีแยกจาก `playbackRate` ของการจำลอง พร้อมโหมด `fixed` และค่าอ้างอิงเริ่มต้นกรุงเทพฯ
  - `feat-121`: สร้าง `src/components/preview-3d/lighting/shadow-fit.ts` และ `scene-lighting.ts` (`createSceneLightingFeature`) คำนวณ orthographic shadow frustum + texel stabilization สำหรับห้อง `2–30m`, ปรับสี/ความเข้มแสงเช้า-เที่ยง-เย็น-กลางคืน (กลางคืนปิด direct sun shadow และเปิดไฟอบอุ่นในร้าน `indoorFillLight`)
- **การตรวจ**: ยูนิตเทสต์ทั้งหมดของ Agent 2 (`food/`, `table-service/`, `lighting/` รวม 12 ไฟล์ 32 tests) ผ่าน 100%, `eslint` บนไฟล์ทั้งหมดของ Agent 2 ผ่าน (0 warnings/errors), `validate_harness.py` ผ่านครบ (Done 110/123 งาน), หลักฐานภาพและ `report.json` อยู่ใน `harness/evidence/feat-116/`, `harness/evidence/feat-120/`, และ `harness/evidence/feat-121/`
- **ขอบเขตและไฟล์กลาง**: ไม่ได้แก้ไข `three-view.tsx`, `scripts/create-cafe-customer-model.mjs`, หรือไฟล์ GLB ตัวละคร (`cafe-customer*.glb`, `cafe-staff*.glb`) และไม่แตะไฟล์คู่ขนานของ Agent 3; พร้อมส่งให้ Agent 1 รวมเข้าฉากใน `feat-122`
