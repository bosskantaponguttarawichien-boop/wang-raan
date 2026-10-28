# Session Handoff — วางร้าน (Wang-Raan)

> **archive**: เก็บ 5 entry ล่าสุดเท่านั้น — รายการก่อนหน้าจะถูกย้ายไปเก็บที่
> `harness/archive/session-handoff-archive.md`

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

## 2026-10-29 ICT — Agent1:113→114→115 พร้อมส่งต่อ

- Commits113=`516f7f8`,114=`6a37025`;115ดูcommitล่าสุดบนcodex/animation-foundation หลังบันทึกชุดนี้ ใช้ฐานรวมเหล่านี้ก่อนงาน116–119/122;ไม่ต้องเริ่ม122ในturnนี้
- 113ผลิตsnapshotv1ต่อสมาชิก/chair/meal/cycle/milestone,114ส่งWorker/run/sequence+bridge,115ต่อcontrollerและเดินตามenginevelocity/staff1.2ไม่catchup พร้อมpausevisibility/boundedqueue
- APIของ122: `controller.current.presentation` และ `current.timing` (absolute simulationSeconds, deltaSecondsที่scaleแล้ว, playbackRate);timingเป็นTICKsample ห้ามบวกdeltaซ้ำทุกRAF ต้องhonourpausedและใช้absolutephase รายละเอียด `harness/evidence/feat-115/README.md`
- GateของAgent1ผ่านบนสำเนาฐานtracked6a37025+115:84files/1043tests,lint/typecheck,boundary53source/Harness;targeted65tests/fps15–120/rates1–30/hidden60วิผ่าน Chromeจริง30.051วิ=sim30.0512วิ,3Dcontrols/visibility/browsererrors0
- Workspaceรวมยังมีงานคู่ขนานuntrackedของAgent2/3:fulltestล้มที่staff-actions/staff-carry-clips.test.ts:142(_part)และtypecheckที่:44(ArrayBuffer|SharedArrayBuffer) ต้องให้laneคลิปแก้ก่อนintegrationทั้งทีม Agent1ไม่ได้แก้/commitไฟล์เหล่านั้น และไม่อ้างว่าworkspaceรวมเขียว
- คงงานอาหาร/คลิป/GLBของagentอื่นในworkingtree ไม่stage;ThreeView/legacycadenceและติดตั้งvisualใหม่รอ122 ไม่มีpush/PR

## 2026-10-29 ICT — Agent1:114เสร็จ ถัดไป115

- Workerส่งoptionalpresentation/runId/sequenceทั้งinitialและTICK;bridgeAPIbegin/accept/current/resetพร้อมสำหรับcontroller115 ไม่มีstrideหรือP1/BFFschemaเปลี่ยน
- ตรวจ88files/1029tests,lint/typecheck/Harness/boundaryผ่าน;กันstalerun/sequence/layoutและผิดschema,legacy/unknownversionไม่มีsemanticguess,transferไม่ทำenginebufferเสีย ดู `harness/evidence/feat-114/README.md`
- 115ต้องbeginbridgeหลังSTARTED/resetเมื่อSTOP,เดินด้วยauthoritativesimdeltaและper-membervelocity,เลิกmaxcatchup,autopausevisibilityและเก็บunsubscribeให้ครบ ยังไม่แตะthree-view/animationintegration122

## 2026-10-29 ICT — Agent1:113เสร็จ กำลังต่อ114→115

- 113fullsnapshot/สมาชิก-เก้าอี้-path/cycle/meals/staffmilestonesพร้อม;อ่านผ่าน `Simulation.presentationSnapshot` หลังtrackPaths ใช้contractv1เดิม ไม่เปลี่ยนmetrics/RNG/สูตรธุรกิจ
- ตรวจ87files/1023tests,lint/typecheck/boundary/Harnessผ่าน หลักฐาน `harness/evidence/feat-113/`;มีงานอาหาร/คลิปจากagentอื่นอยู่ร่วมworkspace ห้ามstageหรือแก้ไฟล์นอกAgent1
- ถัดไป114ส่งmetadata/runId/sequenceข้ามWorkerและbridgefilter จากนั้น115แก้catchup/clock/visibility;ภาพอาหาร/คลิปใหม่ยังเป็นงานของlaneอื่นและ122เชื่อม

## 2026-10-29 ICT — Agent 2: feat-103 → feat-104–108 เสร็จสมบูรณ์ (โมเดลอาหาร 5 เมนู + แคตตาล็อก)

- **ผลลัพธ์**: ทำ `feat-103` (แคตตาล็อกอาหาร, deterministic hash แยกจาก simulation RNG, shared procedural builders, CLI `export-one.mjs`, และ `harness/food-asset-spec.md`) ต่อด้วยโมเดลอาหารทีละงานจนครบทั้ง 5 ชนิด (`feat-104` ข้าวผัด, `feat-105` ก๋วยเตี๋ยว, `feat-106` สเต๊ก, `feat-107` สลัด, `feat-108` เค้ก) ทั้งรุ่น `full` และ `lite` พร้อมโหนด `Vessel`, `FoodFull`, `FoodPartial`, `FoodEmpty`, `Utensil` และ `userData.foodContract`
- **การตรวจ**: ยูนิตเทสต์ใหม่ 6 ไฟล์ (15 tests) และเทสต์ทั้งโปรเจกต์ผ่านครบ, `tsc --noEmit` ผ่าน, `eslint` ผ่าน (0 errors), `validate_harness.py` ผ่าน (Done 100 งาน), ภาพเรนเดอร์ 3D ครบทุกสถานะและบนถาด/โต๊ะเล็กใน `harness/evidence/feat-103/` ถึง `feat-108/`
- **ขอบเขตและไฟล์กลาง**: ไม่ได้แก้ไข `three-view.tsx`, `scripts/create-cafe-customer-model.mjs`, หรือไฟล์ `cafe-customer*.glb` / `cafe-staff*.glb` ตามกฎการแบ่งงาน 3 Agent
- **งานถัดไปของ Agent 2**: รอ `feat-114` (Worker/protocol transport จาก Agent 1) เสร็จเพื่อทำ `feat-116` (Table service runtime: วางอาหารตามที่นั่ง ลดปริมาณตามการกิน คราบบนโต๊ะ และการเช็ด) หรือทำ `feat-120 → 121` (ระบบคำนวณตำแหน่งดวงอาทิตย์และแสงเงาตามเวลาจริง)

## 2026-10-29 ICT — feat-101→102 เสร็จ พร้อมฐานสำหรับ3agent

- **ผลลัพธ์**:101baselineเขียว+contractv1;102แยกscenehost6ช่อง(no-op),legacylighting/servingpropsและgeneratorrig/baseclips/build/export พร้อมrole/output-dir/providers ทุกงาน103–123ยังnot-started ไม่มีagentอื่น/worktreeถูกสร้าง
- **ฐานส่งต่อ**: branch `codex/animation-foundation`;101commit `ad1d3b3`;เริ่มworktreeจากcommit102ล่าสุดบนbranchนี้ (ดู `git log -1 codex/animation-foundation`) รวมการแก้เวลาเดิมและฐานtestที่ผ่านแล้ว อย่าใช้mainเก่า
- **เอกสารที่ต้องอ่าน**: `harness/animation-contract-v1.md`, `harness/animation-module-map.md` และfeature_list;Agent1ทำ113→114→115,Agent2ทำ103→104–108→116และ120→121,Agent3ทำ109–112→117–119ตามdependency ก่อน122รวมและ123QA
- **การตรวจ**:npm test1001/1001ใน80files,lint/typecheck/boundary52sourcefiles/Harness/diffcheckผ่าน;lintexit0เหลือwarningเดิม `_initial`1รายการ โมเดลทั้ง4ไฟล์สร้างซ้ำเท่าเดิมทุกไบต์ publicassetsไม่เปลี่ยน
- **ภาพ/flowจริง**:Chrome156บนGTX1050Ti,modelHTTP200/browsererror0,canvasก่อนหลังต่าง1pixel;หมุน4มุม/เริ่มหยุดจำลอง/สลับ2D3D3รอบ/reducedmotionSVG375pxผ่าน หลักฐาน `harness/evidence/feat-101/` และ `feat-102/`
- **ขอบเขตที่ยังไม่ได้ทำ**: metadataproducer/Workerbridge/แก้catchupเดิน/Eat/Carry/Wipe/seatใหม่/อาหาร5แบบ/แสงrealtime;ทั้ง6featureยังno-opและGLBมีคลิปเดิม การตรวจครั้งแรกของflowเจอselectorในสคริปต์ผิดชื่อiso-svg แก้สคริปต์แล้วผ่าน ไม่มีการแก้UIเพื่อให้testผ่าน
- **สภาพแวดล้อม**:ใช้devserverเดิมlocalhost3000ของผู้ใช้ ไม่หยุดserverนั้น;3DยังมีdeprecationwarningsเดิมClock/PCFSoftShadowMap ไม่ใช่browsererrors

## 2026-10-29 ICT — feat-101 เสร็จ เตรียมทำ102ต่อ

- **ผลลัพธ์**: baseline testsเขียว, contractv1ล็อกแล้วที่ `harness/animation-contract-v1.md`, core/runtimetypesและpayloadexamplesพร้อม ไม่มีอาหาร/คลิปใหม่ถูกสร้าง
- **การตรวจ**: npm test984/984, typecheckผ่าน, lintexit0(warningเดิม1), boundary/Harnessผ่าน; Chrome156/GTX1050Tiเห็นPlayground3D/CharacterLab/staffนั่งและไม่มีbrowsererror ภาพก่อนrefactorใน `harness/evidence/feat-101/browser-before/`
- **ถัดไป**:102แยกscenehost6ช่อง(no-op), legacylighting/propsและgeneratorrig/export/provider;คงภาพ/พฤติกรรมเดิม ตรวจGLBtempไม่เขียนทับpublicassetsและเทียบภาพจริงก่อนเปิดdependentlane
- **ฐานร่วม**: รวมworking changesเวลาจำลองเดิมด้วย;ดูmanifestตั้งต้นเพื่อแยกงานเดิมจากงานfoundation ใช้basecommitหลัง101/102ที่ระบุในเอกสารส่งต่องาน ไม่ใช้mainเก่าที่ขาดworking changes

## 2026-10-28 ICT — Planning only: 23 tasks สำหรับอาหาร/แอนิเมชัน/เวลาเดิน/แสง

- **ผลลัพธ์**: เพิ่ม `feat-101`–`feat-123` (sprint 5) ทุกงาน `not-started`, ระบุ gate/dependencies/เจ้าของไฟล์/steps/acceptance/verification/risks; แผนละเอียดและการจัด agent/worktree อยู่ที่ `harness/restaurant-animation-plan.md` ไม่มี runtime/model/animation code ใหม่ ไม่มี agent/worktree/branch ถูกสร้าง
- **เริ่มเมื่อผู้ใช้สั่งทำจริง**: 101 เตรียมฐานร่วม/แก้ baseline/freeze contract → 102 แยก shared modules/generator → fan-out อาหาร5ชิ้น, คลิป4ชุด, core metadata, solar → transport/timing/runtime → 122 รวม shared files → 123 QA. ห้ามเริ่มทุกงานพร้อมกันจาก main เดิม ดูตารางช่วงและ scope ในแผน §5–6
- **กติกาป้องกันชน**: `three-view.tsx`/model generator เขียนโดย102แล้ว122เท่านั้น; คลิปไม่ export ทับGLB;117เป็นเจ้าของstaffGLB,118เป็นเจ้าของcustomerGLB; Harness กลางรวมทีละงานโดยcoordinator งานsourceเดิมที่ยังไม่commitต้องรวมในbaseก่อนแยกworktree
- **การตรวจ/ข้อจำกัด**: init ตรวจ runtime/dependencies/boundary/Harness เดิมผ่าน แต่ tests 981ผ่าน/2ล้มจาก983 (`day-analysis.test.ts:89`, `restaurant.test.ts:91`) ห้ามอ้างว่า tests ผ่านทั้งหมดหรือเริ่ม dependent implementation ก่อน baseline gate ผ่าน รายงานแผนนี้ไม่ได้แก้สอง failure ดังกล่าว
- **ตรวจแผนหลังบันทึก**: `python scripts/validate_harness.py` ผ่านครบ123รายการ ไม่มีdependencyหาย/วน; ตรวจ100entryเดิมเท่ากับHEADทุกfield,23งานใหม่มีรายละเอียดครบและเป็นnot-startedทั้งหมด มีเพียง101ที่dependencyพร้อม; `git diff --check` ผ่าน และSHA-256ของsourceที่มีworking changesทั้ง9ไฟล์ตรงก่อนเริ่มวางแผน
- **สมมติฐานรอยืนยันใน101**: อาหารข้าวผัด/ก๋วยเตี๋ยว/สเต๊ก/สลัด/เค้ก; “เช็คโต๊ะ”ตีความเป็นเช็ด;1×ตามความเร็วengineไม่เร่งcatch-up;แสงrealtimeของอุปกรณ์โดยใช้Bangkokเป็นreferenceที่แก้ได้ ไม่ใช่เวลาจำลองร้านและไม่ใช่การตรวจพบตำแหน่ง

## 2026-10-28 ICT — ปรับเวลาจำลอง 1 วิ = 1 วิ และแสดงนาฬิการะดับวินาที

- **ผลลัพธ์**: เวลาจำลองที่ `1×` เดินตามเวลาจริง 1 วินาทีต่อ 1 วินาทีตลอดเวลา (ไม่เร่ง 60× เองช่วงที่ไม่มีคนเดิน) โดยตอนกดเริ่มจำลองจากร้านว่างให้ลูกค้ากลุ่มแรกมาทันที (`spawnFirstCustomer()`) และแสดงเวลาในร้านระดับวินาที (`HH:MM:SS น.` เช่น `10:00:05 น.`) ทั้งบนแผงจำลองและแถบสถานะ (`formatClockSeconds`)
- **การตรวจ**: `engine.test.ts`, `day-panel.test.tsx`, `simulation-gate.test.tsx` (44 tests) ผ่านครบ 100%
- **ข้อควรรู้**: หากต้องการเร่งเวลาสามารถกดปุ่ม `2×`, `5×`, `10×`, `30×` ได้โดยตรง

## 2026-10-28 ICT — ลูกค้าดึงเก้าอี้ออกก่อนนั่ง แล้วดันเข้า (3D)

- **ผลลัพธ์**: เก้าอี้ใน 3D แยกเป็น object ที่ขยับได้ (ไม่รวมกับเฟอร์นิเจอร์อื่น); นั่ง = ดึงเก้าอี้ออก 0.3 ม. → นั่งลง → ดันเก้าอี้พร้อมคนเข้าโต๊ะ, ลุก = เลื่อนออก → ลุก → เดินไป แล้วเก้าอี้เลื่อนกลับ (`seat-motion.ts`, `three-view.tsx`)
- **การตรวจ**: `seat-motion.test.ts` 3 ข้อ, `npm test` 981 ผ่าน, ESLint + `tsc` ผ่าน, ดูภาพ Chromium 3D
- **ข้อควรรู้**: เป็นภาพอย่างเดียว engine ไม่รู้เรื่องเก้าอี้เลื่อน; เวลาเลื่อนเป็นวินาทีจริง ไม่คูณความเร็วจำลอง; 2D/SVG fallback ยังไม่มีภาพเก้าอี้เลื่อน

## 2026-10-28 ICT — มือถือรันโค้ดจำลองรุ่นเก่า (พนักงานหาย / รอหน้าเข้า undefined)

- **ผลลัพธ์**: ต้นเหตุคือ `public/sw.js` ส่งไฟล์เริ่ม worker ของ Turbopack (`turbopack-worker-*.js` ชื่อเดิมทุก build) จากแคชตรง ๆ — worker ได้ URL พร้อม `#params` (รายชื่อ chunk) ของ build ที่แคชครั้งแรก จึงรัน engine รุ่นเก่า (ไม่มี staff / waitingEntrance) แก้โดยห่อ response ใหม่ให้ worker ใช้ URL ของคำขอปัจจุบัน และขึ้น `VERSION` เป็น v3 ล้างแคชเก่า
- **การตรวจ**: Playwright (iPhone 13, profile เดิมที่มี SW) — ก่อนแก้ build ใหม่ยังรันโค้ดเก่า, หลังแก้ deploy ถัดไปได้โค้ดใหม่ทุกครั้ง; `npm test` 978 ผ่าน; จำลองบนมือถือ 2D/3D เห็นพนักงานครบ
- **ข้อควรรู้**: มือถือที่เปิดอยู่ต้องโหลดหน้าใหม่ 1–2 ครั้งหลัง deploy ให้ SW v3 ทำงาน

## 2026-10-28 ICT — Code Review: คืนทรัพยากรถาด 3D และแก้ CRLF ใน test design tokens

- **ผลลัพธ์**: Review โค้ด commit `1e6a8fc` ผ่านการตรวจสอบ boundary, แก้ memory leak ใน `three-view.tsx` เพิ่ม disposal ทรัพยากรถาดเสิร์ฟ (`trayGeometry`, `trayRimGeometry`, `trayMaterial`), และแก้ CRLF normalization ใน `src/test/design-tokens.test.ts`
- **การตรวจ**: `design-tokens.test.ts`, `staff-pacer.test.ts`, `staff-visual.test.ts` ผ่านครบ 100%, `npm run lint` ผ่าน, `python scripts/validate_harness.py` ผ่าน
- **ข้อควรรู้**: การรัน vitest ทั้งหมด 77 ไฟล์พร้อมกันบน Windows อาจเกิด timeout จาก CPU workload แต่เมื่อทดสอบแยกตามชุดไฟล์ผ่านปกติทั้งหมด

## 2026-10-28 ICT — พนักงานเดินให้พอดี ไม่ชิดผนัง ถือถาด แวะครัว 5 วิ

- **ผลลัพธ์**: พนักงานบนจอเดิน 1.4 ม./วินาทีจริงที่ x1 (`staff-pacer.ts`), เส้นทางห่างผนัง 0.35 ม. (`WALL_CLEARANCE`), เดินเข้าประตูครัวหายไป 5 วินาทีแล้วถือถาดมีจานออกมาเสิร์ฟ (3D `createTray`)
- **การตรวจ**: `npm test` 978 ผ่าน (เหลือ 3 failure เดิมนอกขอบเขต), ESLint ไฟล์งานและ `tsc --noEmit` ผ่าน
- **ข้อควรรู้**: รหัส 5 (`STAFF_KITCHEN_CODE`) เป็นรหัสเฉพาะภาพ ไม่ได้มาจาก engine — ผู้วาดต้องข้ามคนที่อยู่ในครัว; เวลารอในครัวย่อตามความเร็วเล่นภาพ (x5 = 1 วินาทีจริง); ยังไม่ได้ตรวจด้วยตาใน Chromium

## 2026-10-27 ICT — ลูกค้าเดินมาจากนอกร้าน + แถวรอนอกประตู (feat-100)

- **ผลลัพธ์**: ลูกค้าใหม่เดินมาจากนอกร้านเข้าประตู, รอโต๊ะเป็นแถวนอกร้าน, กลับแล้วเดินออกไปนอกร้าน (`walk-pacer.ts`)
- **การตรวจ**: `npm test` 965, `make lint` ผ่าน, Chromium 3D
- **ข้อควรรู้**: waiting-entrance เปลี่ยนรหัสเป็น 6; 2D ยังไม่เห็นคนนอกร้าน; ผู้ใช้จะทำงานต่อบนเครื่อง local (pull branch นี้)

## 2026-10-27 ICT — พฤติกรรมร้านตามที่ตั้งไว้ (feat-099)

- **ผลลัพธ์**: เล่นภาพตั้งแต่เปิดร้าน (ร้านว่าง); พนักงานหน้าร้านเดินรับออร์เดอร์ ไปรับอาหารที่ประตูครัวมาเสิร์ฟ และเก็บโต๊ะ (`staff-visual.ts`); x1 = เวลาจริง ช่วงไม่มีใครเดินเล่นเร็วเอง (`skipQuiet`)
- **การตรวจ**: `npm test` 961, `make lint` ผ่าน, Chromium 2D/3D
- **ข้อควรรู้**: easeIn (feat-097) ถูกลบแล้ว; ปรับความเร็วช่วงเงียบที่ `QUIET_SPEED`; ยังไม่มีภาพโต๊ะสกปรก

## 2026-10-27 ICT — ภาพลูกค้าเดินเท่าคนจริง (feat-098)

- **ผลลัพธ์**: ลูกค้าบนจอ (2D / isometric / 3D) เดิน 1.4 ม./วินาทีจริงที่ x1 ตามทางที่จำลองจริง; เวลาและผลจำลองไม่เปลี่ยน (`walk-pacer.ts`, `Simulation.trackPaths`)
- **การตรวจ**: `npm test` 959, `make lint` ผ่าน, Chromium ภาพต่อเนื่องเห็นเดินช้า
- **ข้อควรรู้**: ปรับความเร็วภาพที่ `VISUAL_WALK_SPEED`, ระยะตามหลังสูงสุดที่ `MAX_VISUAL_LAG_SECONDS`; ยังไม่ได้ตรวจ 3D ใน browser รอบนี้

## 2026-10-27 ICT — เริ่มจำลองแบบค่อย ๆ เร่ง (feat-097)

- **ผลลัพธ์**: กดเริ่มจำลอง → ภาพเริ่มตอนลูกค้ากลุ่มถัดไปถึงประตู เดินเท่าของจริง 6 วิ แล้วค่อย ๆ เร่งถึงความเร็วที่เลือกใน 4 วิ (`easeIn` ใน START, ค่าคงที่ใน `worker-runtime.ts`)
- **การตรวจ**: `npm test` 951 ผ่าน, `make lint` ผ่าน, Chromium ตรวจนาฬิกาจำลองค้างช่วงแรกแล้วเร่ง
- **ข้อควรรู้**: หลังเร่งแล้วลูกค้าที่เข้ามาภายหลังยังเคลื่อนที่เร็วตาม x1 = 1 นาที/วินาที (ผู้ใช้เลือกแบบนี้แทนการชะลอภาพตลอดเวลา); ผู้ใช้ส่งคำขอเป็นข้อ "1" อาจมีข้อถัดไปเรื่องจำลองร้านตามมา

## 2026-10-27 ICT — แก้ Cloudflare Preview Build (feat-091)

- **สาเหตุและผลลัพธ์**: dependency ที่ไม่เกี่ยวกับงาน UI ถูกติดไปกับ commit `aa5030a`: `zod` 3 → 4 และ OpenNext Cloudflare 1.20.13 → 1.20.9. Zod v4 ทำให้ `next build` ล้มตอน TypeScript ใน mock backend, form schema และ layout import. คืนสอง package และ lockfile แล้ว `npm run build` ผ่านครบ.
- **การตรวจ**: `npm run lint`, `git diff --check` ผ่าน. `npm test` ยังมี baseline failure 1 ข้อที่ design-token assertion (`globals.css`) ซึ่งไม่เกี่ยวกับ CI failure ครั้งนี้. `npm run cf:build` บน Windows ทำซ้ำไม่ได้เพราะ OpenNext อ่าน parent directory ไม่ได้ตามข้อจำกัด Windows; Cloudflare จะใช้ Linux.
- **Cloudflare log**: GitHub เปิดเผย Build ID `f2a6995b-7b58-4b96-a0b1-3b888156c1b7`; dashboard ต้อง login จึงอ่านรายละเอียดเพิ่มไม่ได้. ให้ผลของ `npm run build` เป็นหลักฐานยืนยันก่อน rerun preview.

## 2026-10-27 ICT — Customer/Staff behavior (feat-096)

- **ผลลัพธ์**: ร้านอาหารแบบ A ใช้ 1 agent = 1 กลุ่ม (สุ่ม 1–4 คน), โต๊ะใช้ได้ทีละกลุ่ม; ไม่มีโต๊ะสะอาดที่พอให้ยืนรอหน้าเข้า; จ่ายและออกแล้วโต๊ะสกปรกจนพนักงานเก็บเสร็จ
- **พนักงาน**: จัดงาน เสิร์ฟ → รับเงิน → เก็บโต๊ะที่ปลดล็อกคิวหน้าเข้า → รับออเดอร์ → เก็บโต๊ะทั่วไป
- **การตรวจ**: simulation core 28 tests, day-analysis 6 tests และ lint ผ่าน
- **ข้อควรรู้**: `customersPerHour`/metrics ยังนับเป็น “คน”; visual 1 ตัวแทนทั้งกลุ่ม จึงยังไม่แสดงเพื่อนร่วมกลุ่มครบทุกคนใน 2D/3D; 48 เก้าอี้ที่มีเพียง 12 โต๊ะไม่เท่ากับ 48 กลุ่ม เพราะไม่อนุญาตให้แชร์โต๊ะ

## 2026-10-27 ICT — หมุนมุมมองแบบ smooth (feat-091 follow-up)

- **ผลลัพธ์**: ปุ่มหมุนของ Playground มีแอนิเมชัน 480 ms ใน 2D และ 620 ms ใน 3D; 3D กล้องโคจรเป็น arc รอบร้านพร้อมไล่ orthographic frame ทุกค่า และ key light ถูกตรึงใน world-space (ไม่ย้าย/fit ใหม่เมื่อเปลี่ยนมุมมอง). พื้นและเฟอร์นิเจอร์เป็นชั้นคงที่; ผนัง วงกบ บาน ธรณี และพรมประตูใช้ material ของผนังด้านเดียวกัน สร้างครบ 4 ด้านเพียงชุดเดียวเมื่อผังเปลี่ยน แล้วไล่ opacity รายด้านพร้อมกล้อง แทนการ cross-fade room สองชุด. จึงไม่มีฐานประตูลอยค้างบนพื้น กรอบประตู หรือเงาซ้อน/โผล่ตามหลังระหว่างหมุน. reduced motion ยังใช้ SVG fallback ที่ไม่เคลื่อนไหว.
- **การตรวจ**: targeted Vitest 4 files / 42 tests, ESLint ไฟล์งาน, diff check และ localhost:3000 หลัง full reload กดหมุนหลายมุม; จับภาพก่อน/หลังและระหว่างแอนิเมชันยืนยันว่าไม่มีกรอบ บาน หรือฐานประตูจากฉากเก่าซ้อน และไม่มี console error.
- **ข้อควรรู้**: `npm test` ทั้งชุดล่าสุด 940/947 ผ่าน แต่มี 7 failure นอกขอบเขต (Zod v4/schema ใน `mock-backend`, `forms/schemas.ts`, `core/io/layout-file.ts`, heading design token, timeout UX และ guest-merge ที่เหลือ state จาก quota test); `tsc --noEmit` ล้มจาก Zod v4 type/schema เดิม. อย่าแก้รวมกับงานแอนิเมชัน.
## 2026-10-23 ICT — จำลองร้าน 1 วัน ครบ (feat-094, feat-095)

- **ผลลัพธ์**: กด "จำลองร้าน 1 วัน" → worker จำลองทั้งวันเบื้องหลัง (~0.5 วิ ผังตัวอย่าง, ~2.4 วิ ผัง 48 ที่) → การ์ดตอบ 3 ข้อ (จ้างกี่คน / อาหารต้องออกภายในกี่นาที / โต๊ะพอไหม) → เล่นภาพช่วงคนเยอะแล้วหยุดเอง
- **การตรวจ**: `make test` 943, `make lint` ผ่าน; Playwright chromium a11y/playground-ux/keyboard/responsive ผ่าน; Chromium จริงที่ 1280 และ 320 px
- **ถัดไป**: (ยังไม่มีใน feature_list) พนักงาน/พ่อครัวเดินให้เห็นใน 2D/3D, จำค่าตั้งค่าไว้กับโปรเจกต์, ตัวเลือกประเภทร้าน A/B เมื่อมีหลายร้าน
- **ข้อควรรู้**: axe "ระหว่างจำลอง" 1440px ล้ม 1 ครั้งแล้วรันซ้ำผ่าน — ถ้า CI ล้มอีกให้ดู error-context; ค่าฟอร์มอยู่ใน simulation store เท่านั้น (รีเฟรชแล้วกลับค่าตั้งต้น); `analyzeDay` ใช้พนักงานหน้าร้านเต็ม (8) ตอนหาพ่อครัว — ถ้าเปลี่ยนลำดับค้นหาต้องแก้เทสต์ day-analysis

## 2026-10-23 ICT — Simulation ร้านอาหารแบบ A (feat-093)

- **ผลลัพธ์**: ตัวจำลองเล่นร้านอาหารตามสั่งแบบ A (นั่ง → รับออร์เดอร์ → ครัว → เสิร์ฟ → ทาน → จ่ายที่เคาน์เตอร์) พร้อมพนักงาน/พ่อครัว/เวลาต่อจาน/ช่วงพีค/ปิดร้าน; แบบ B เดิมยังใช้ได้ด้วย `serviceStyle: "counter-order"`
- **การตรวจ**: `make test` 927, `make lint` ผ่าน; Chromium จำลองผังตัวอย่าง
- **ถัดไป**: feat-094 (วิเคราะห์ทั้งวัน + หาจำนวนพนักงาน + เล่นช่วงพีค) → feat-095 (แผง 3 ส่วนตามร่าง + การ์ดคำตอบ); gate feat-094 ต้องยืนยันเกณฑ์ "กำลังดี" และค่าตั้งต้นใน PRD §9 ข้อ 28
- **ข้อควรรู้**: UI ตอนนี้ยังส่งแค่ `customersPerHour` → ค่าอื่น worker ใช้ค่าตั้งต้นแบบ A (ผังตัวอย่าง 6 ที่ ลูกค้าเต็มเร็วแล้วกลับเยอะ เป็นเรื่องปกติ); พนักงานยังเป็นคิวงาน ไม่มีตัวเดินบนผัง; อย่าใช้ `this.random` กับสิ่งที่ขึ้นกับสถานะร้าน (ใช้ `seatRandom`) ไม่งั้นลูกค้าชุดจะเปลี่ยนตามจำนวนพนักงาน

## 2026-10-23 ICT — มือถือเท่าเดสก์ท็อป + PWA

- **ผลลัพธ์**: มือถือมีปุ่มซูม/หมุนมุมมอง แถบสถานะ และสถานะบันทึกครบ; ติดตั้งเป็นแอปได้ (manifest + Service Worker) และเปิดหน้าจัดผังออฟไลน์ได้
- **การตรวจ**: `make test` 918, `make lint` ผ่าน; next build/start + Chromium มือถือ (ออฟไลน์ reload, 320–1440 px ไม่มีเลื่อนแนวนอน)
- **ข้อควรรู้**: แก้ `public/sw.js` ต้องเพิ่ม `VERSION` เพื่อล้างแคชเก่า; SW ลงทะเบียนเฉพาะ production (dev ไม่มี); `/playground/[id]` (ผังออนไลน์) ยังไม่เปิดออฟไลน์ — จะได้หน้า /offline แทน

## 2026-10-21 ICT — ปรับโมเดล (หน้า มือ เสื้อผ้า หมวก ผม รักแร้) + performance ฉาก 3D

- **ผลลัพธ์**: แก้ทุกข้อจากรีวิวโมเดลยกเว้นคอ; หมวกแก๊ป 6 ชิ้น; ผมมีแสก/ชั้น; ฉาก 3D สามเหลี่ยมต่อเฟรมลด ~70% และโหลดไฟล์ตอนเปิดลดจาก 828 → 220 KB
- **การตรวจ**: `make test` 910, `make lint` ผ่าน; Chromium จำลองผังตัวอย่าง + bench (drawElements hook, CDP metrics/profiler)
- **ข้อควรรู้**: ฉากร้านใช้ผิวรุ่นละเอียดเฉพาะตอนตัวละครสูงเกิน 160 px บนจอ (โหลดตอนนั้น); เงามาจาก `ShadowProxy` รุ่นเบาเสมอ — ถ้าเปลี่ยนโครงกระดูก/ไฟล์ lite ต้องให้ตรงกับรุ่นละเอียด; ระหว่างหยุดจำลองที่ยังมีลูกค้าอยู่ ฉากยังวาดต่อเนื่อง (ท่า Idle)

## 2026-10-21 ICT — บีบอัดโมเดล, ลูกค้าหลายแบบ, กันจุดยืนพนักงาน

- **ผลลัพธ์**: GLB บีบอัด meshopt (ลูกค้า 234 KB); ลูกค้าแต่ละคนสีเสื้อ/ผม/ผิว/สูงต่างกัน; ลูกค้าเดินอ้อมพนักงานหลังเคาน์เตอร์
- **การตรวจ**: `make test` 910, `make lint` ผ่าน; Chromium จำลองผังตัวอย่าง
- **ข้อควรรู้**: โหลด GLB ต้องผ่าน `createCharacterLoader()` (ต้องมี MeshoptDecoder); สีต่อคนอยู่ใน shader ของ three-view อ่าน attribute `_part` — ห้าม prune attribute นี้ทิ้ง

## 2026-10-28 ICT — Simulation behavior corrections (PR #39)

- Branch: `fix/simulation-behavior-model`; PR: #39.
- Party model: a party represents 1–4 diners, creates one kitchen job per diner, and starts dining only after all dishes complete. Customer render buffer emits each party member; heatmap is weighted by party size.
- Customer exits: impossible party/table matches are counted as `noSeat`; entrance and food waits use `patienceMinutes`; cancellation removes queued work, prevents late delivery, and sends the table to cleaning.
- Analysis: adds `abandoned` and `unfinished`; unresolved diners after the four-hour drain window make an option not good.
- Tests updated for patience and per-diner dishes. GitHub CI run 40674434765 was queued at handoff; inspect its result before merging.
