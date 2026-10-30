# Animation / presentation contract v1 — frozen foundation (feat-101)

วันที่: 2026-10-29 (Asia/Bangkok) · scope: metadata/API เท่านั้น การผลิต snapshot และเชื่อม Worker เป็น feat-113–115

## ฐานและการตัดสินใจ

ใช้ HEAD `7d5b122` รวม working changes ของเวลา 1×/ลูกค้ากลุ่มแรก/นาฬิกาวินาทีที่มีอยู่ก่อน session นี้ ดู SHA-256 ตั้งต้นใน `evidence/feat-101/starting-base.json` ฐานส่งต่อจะระบุ commit หลังตรวจครบ ห้ามแยก worktree จาก HEAD เก่าที่ขาด working changes

Baseline ไม่ต้องเปลี่ยนสูตรจำลอง: probe ใน `evidence/feat-101/baseline-scenarios.json` พิสูจน์ว่า 200 คน/วันในร้าน 48 ที่นั่งมีคิวสูงสุดเฉลี่ย4คน ไม่มีคนกลับเพราะที่นั่ง เทียบเกณฑ์เดิม4.8คนจึงถือว่าพอ เพิ่มกรณี300คน/วันเพื่อทดสอบคิว21.5คนและที่นั่งไม่พอ ส่วน fixture พนักงานเปลี่ยนเป็นครัวเร็ว0.5นาที/จาน ทาน1–2นาที รอ6นาที เพื่อให้หน้าร้านเป็นคอขวดจริง: พนักงาน1คนยกเลิก27/ได้อาหาร26 เทียบ3คนยกเลิก4/ได้อาหาร60 คง assertion เดิมและเพิ่ม served-throughput checks

ล็อกเมนู `fried-rice` ข้าวผัด, `noodles` ก๋วยเตี๋ยว, `steak` สเต๊ก, `salad` สลัด, `cake` เค้ก ตามแผน ถือ “เช็คโต๊ะ” เป็นการเช็ดและเก็บโต๊ะ ไม่มีการเพิ่มฟีเจอร์ภาพใน101/102

## 1. ข้อมูลข้ามขอบเขต

Source of truth: `src/core/simulation/presentation-contract.ts` (Pure TS ไม่มี Three/React/DOM) ไม่เพิ่ม fields ลง P1 schema หรือแก้ buffer stride: agents/staff ยังคง4ค่า Add optional `presentation?: PresentationSnapshot` บน STARTED.initial/TICK ใน114เท่านั้น

| Field | ความหมาย/ข้อกำหนด |
|---|---|
| version | literal1; รุ่นไม่รู้จักให้ใช้ legacy rendering และไม่เดา Eat/clean |
| runId | ใหม่ทุกSTART รวม restart ผัง/seedเดิม; ห้ามเอาlayoutRevisionแทน |
| layoutRevision | ตรงผังที่ผ่าน validation; ห้ามรับmetadataผังอื่น |
| sequence | initial0 แล้วเพิ่มเรื่อย ๆ ภายในrun; ทิ้งค่าซ้ำ/ย้อนหลัง |
| simTimeSeconds | วินาทีตั้งแต่เปิดร้าน, ไม่ใช่epochเวลาอุปกรณ์ |
| customers/meals/tables/staff/milestones | full immutable snapshot; รายการที่ไม่อยู่แล้วถูกลบ ไม่ต้อง replay ประวัติ |

สถานะ runtime ไม่มีการบันทึกลง layout/history ค่าจำนวนจริงที่เข้าsnapshotต้องfinite, progress/consumed/stain/wipeอยู่[0,1], เวลาphaseend≥start, milestoneไม่กำหนดใช้null ตรวจที่producer/bridgeใน113/114 ไม่ให้ชนิดข้อมูลใหม่เปลี่ยนexecutionเดิม

### Identity และเก้าอี้

- renderAgentId เป็น id ที่ตรงกับ agent buffer และ path ของคนเดียวกันทุกเฟรม ปัจจุบันbufferใช้ partyId×10+memberIndex; ให้producerส่งmappingจริง ห้ามconsumerถอดสูตรเอง
- memberIndex เริ่ม0ในparty, สมาชิกpartyละ1–4คน; table/chair/cycleเป็นnullก่อนจอง สมาชิกที่นั่งแล้วแต่ละคนมีchairIdไม่ซ้ำและchairสังกัดtableนั้นจริง ใช้party.chairIdsที่จัดสรร ไม่ใช้nearestchair
- หากยังไม่ผูกเก้าอี้อย่าเล่นSit/Eat สมาชิกคนอื่นไม่ย้อนกลับไปใช้leaderchair `drainPaths()` ของเดิมยังใช้partyid;113ต้องจัดpathmappingให้ตรงก่อนเชื่อม
- serviceCycleId ใหม่ต่อการครอบครองโต๊ะหนึ่งรอบ mealId/taskIdไม่ใช้ซ้ำข้ามcycle; cancellation/restartต้องไม่ทำให้จานหรืองานเก่าไปกระทบลูกค้าใหม่

### Milestones และความถูกต้องทางธุรกิจ

เวลาทั้งหมดเป็น absolute simulation seconds: pickup → placed → wipeStarted/wipeFinished → cleared พร้อมtaskCompleted จากplanจริง

งานเดิมรวมเวลาเดินกลับเคาน์เตอร์ไว้ก่อนfinishTask ดังนั้น visual placement/wipe-endอาจก่อนtaskCompleted ห้ามอ้างว่าengine.fed/table.cleanเกิดแล้วก่อนจริง:

1. placed milestoneทำให้เห็นจานบนโต๊ะ แต่ลูกค้ายังนั่งรอถ้าactivityไม่ใช่eating
2. เริ่มEatเมื่อactivity=eating **และ** seatedphase=seated **และ** mealplacedแล้วเท่านั้น
3. คราบค่อยเกิดเมื่อconsumedเพิ่ม, dirty/cleaningคงจานและคราบ; wipeProgressลดคราบได้ แต่จาน/คราบยังคง residual จนclearedAtที่ยืนยันกับcleanCompletedAt ของcycleตรงกัน
4. availability=cleanปล่อยโต๊ะตามengineเดิมเท่านั้น การจบclipไม่ปล่อยโต๊ะเอง หากต้องเปลี่ยนเวลาบริการเชิงธุรกิจให้เสนอcontract revisionและทดสอบผลวิเคราะห์ก่อนแยกงาน
5. ไม่มีdeliveryหลังcancel, ไม่มีคราบถ้ายังไม่เคยserved; ถ้าโต๊ะมีอาหารแล้วและยกเลิกให้ผ่านcleanupตามengine
6. counter-orderยังมีsnapshotและbindings; อาหารถือว่าเสิร์ฟเมื่อถึงที่นั่งตามflowเดิม ไม่สร้างงานพนักงานtable-serviceเพิ่มหรือเปลี่ยนmetricsของโหมดนี้

ตัวอย่างความสัมพันธ์ (payloadฉบับเต็มอยู่ที่ `evidence/feat-101/contract-examples.json`):

| กรณี | ตัวอย่าง |
|---|---|
| ปกติ | customer10→party1/member0→tableA/chairA/cycleA1→mealA; customer11ใช้chairBและmealB |
| รออาหาร | activitywaiting-food, mealplacednull, surfaceempty; legacyรหัส4ไม่ใช้เป็นเหตุให้Eat |
| กำลังกิน | activityeating, seatingseated, mealplaced=300≤simTime360, consumed0.25 |
| ยกเลิก | customerออกจากsnapshot, โต๊ะcycleเดิมยังdirtyและจานยังรอclear; ไม่มีqueueddeliveryเก่า |
| รอบใหม่ | runIdใหม่, sequence0, snapshotว่าง; ทิ้งTICKของrunIdเก่าทั้งหมด |
| workerเก่า | metadataไม่มี; วาดเดิน/นั่งแบบเดิม ไม่มีอาหาร/คราบ/Eatจากการเดาสถานะ |

เลือกfoodด้วยhash(seed,partyId,memberIndex) แยกจากRNG simulation ห้ามทำrandom drawเพิ่มหรือเปลี่ยนarrival/cook/dine/metrics

## 2. Clock

- realDeltaSecondsมาจากmonotonicclock, pause=0ทางanimation; playbackRateคูณเพียงครั้งเดียวเพื่อได้simulationdelta ลูกค้าเดินตามwalkMetersPerSecondเดิม1.0–1.4, staff1.2 ที่1× ไม่มีmax-speedcatchup
- เป้าหมายwalkตรง6ม.ของstaffคือ5วิ ±5% หลังwarmup/interpolation ตรวจ15/30/60/120fps;30วิจริงที่1×simtime30วิ ±0.25วิ (ไม่รวมเวลาที่pause)
- interpolationbufferตั้งเป้า100ms, hardlimit500msของข้อมูลภาพ; เมื่อproducer/consumerห่างเกินlimitให้discard backlogและสร้างsnapshotใหม่ที่resumeboundaryโดยไม่เล่นย้อนหลังเร็วขึ้น การแก้normal foreground jitterใน115ต้องใช้clockalignedpaths ไม่teleportที่1×
- แท็บhiddenหยุดpresentationและไม่สะสมdeltaกลับมา หยุดworkerด้วยคำสั่งpause/restoreตามสถานะที่ตั้งไว้ใน115; resyncก่อนกลับมาวาดและเริ่มdelta0 ไม่ใช้backgroundcatchup
- ลำดับวาด state ผูกpresentationtimeเดียวกับmovement ไม่แสดงนั่งก่อนเดินถึงที่นั่ง; animationmarkersเป็นnormalizedtimeไม่พึ่งmixer-finishedcallback
- 2/5/10/30×เฉพาะที่ผู้ใช้เลือก ระยะและservicephaseใช้rateเดียวกัน; จำกัดความถี่ขาได้แต่บันทึกข้อจำกัดภาพเมื่อเร่งสูง แสงrealtimeใช้wallclockแยกเสมอ
- 101/102ยังไม่แก้pacer/delta/worker behavior การแก้เวลาเหล่านี้อยู่115/122

## 3. Asset และ clip API

หน่วยเมตร, +Yขึ้น, +Zหน้าตัว, modelscale1สูง1.70ม., tabletop0.74ม., seat0.45ม. เก็บbones/bindpose/attribute `_part` เดิมทั้งหมด ใช้trustedlocalassetsและMeshoptDecoderเดิม

อาหารfull≤8,000triangles/300KB, lite≤2,000triangles/100KBต่อGLB ไม่มีtextureภายนอก; ภาชนะfootprintเส้นผ่านศูนย์กลาง≤0.26ม. originอยู่ฐาน nodeชื่อ `Vessel`, `FoodFull`, `FoodPartial`, `FoodEmpty`, `Utensil`; statefull/partial/emptyไม่ลบVessel ส่งbounds/anchor/gripในmanifest103ยืนยันbudgetกับprototypeก่อนเปิด5งานอาหาร

| Clip provider | Role | ชื่อคลิปที่เพิ่ม |
|---|---|---|
| scripts/character-clips/staff-carry.mjs | staff | CarryIdle, CarryWalk, PickUp, PutDown |
| scripts/character-clips/staff-clean.mjs | staff | WipeTable |
| scripts/character-clips/customer-eat.mjs | customer | Eat |
| scripts/character-clips/customer-seat.mjs | customer | PullChair, SitDown, PushChair, StandUp |

คลิปเดิมIdle/Walk/SitและstaffWorkคงชื่อและtrackเดิม ท่าใหม่ไม่translate modelrootซ้ำcontroller การย้ายhipsภายในคลิปยังทำได้ markersชื่อ `hand-contact`, `food-contact`, `seated`, `wipe-contact`, `clear-complete` ค่าtimeอยู่[0,1]ของduration

Provider interfaceที่102ต้องรองรับ:

```ts
// ESM default export; import THREE เองได้ ไม่มีwriteFileตอนimport
type ClipProvider = (context: {
  role: "customer" | "staff";
  lite: boolean;
  model: THREE.Group;
  bones: ReadonlyMap<string, THREE.Bone>;
  baseClips: readonly THREE.AnimationClip[];
}) => {
  clips: THREE.AnimationClip[];
  markers?: Record<string, { name: string; time: number }[]>;
};
```

rejectclipชื่อซ้ำ/trackเป้าหมายไม่มี/markerนอกช่วง; markersรวมในmodel.userData.animationMarkersให้runtimeอ่านได้ Providerเลือกroleผิดต้องfailก่อนเขียนไฟล์ CLI `--role customer|staff`, `--lite`, `--output-dir <dir>`, `--clips <module>` (ซ้ำได้); รองรับ`--staff`เดิม แต่ขัดกับ`--role customer`ต้องfail ไม่exportทั้ง4ไฟล์โดยอัตโนมัติ

Actionpriority: seatingtransition > stafftaskinteraction/servedEat > carry > walk > idle/work; consumerหนึ่งตัวเป็นownerของแต่ละbonechannel ห้ามEatblendกับSitที่แย่งขา/hips;117ถือstaffGLBทั้ง2ไฟล์,118ถือcustomerGLBทั้ง2ไฟล์

## 4. Scene module API และ ownership

Source: `src/components/preview-3d/runtime/contracts.ts` และimplementation102

- feature idsคงที่6ช่อง: food, table-service, staff-actions, customer-actions, seating, lighting ทุกช่องdefaultno-op ไม่มีnewvisual
- factory(context)→ `{syncLayout,update,reset,dispose}` contextมีscene/camera/getLayout/getQuality/invalidate/invalidateShadowsและrootของfeatureเอง ห้ามfeaturedisposeทรัพยากรของlegacyหรือfeatureอื่น
- `syncLayout`เฉพาะlayoutobjectเปลี่ยน ไม่เรียกเมื่อหมุนกล้อง; `update`รับSceneFrame, pauseไม่ขยับphase; `reset`ตอนSTOP; `dispose`ครั้งเดียวตอนhostunmount คืนfeatureย้อนลำดับและถอดrootของhost
- Stageติดตั้งhostหลังrendererพร้อม แล้วdispatchupdateที่renderloopเดิม ไม่แทรกpacer/metadataจริงใน102 หากfactoryสร้างไม่สำเร็จต้องถอดroots/คืนfeatureก่อนหน้าและปล่อยcallerจัดfallback
- ไม่ทำThree/assetimportทะลุlazy3Dboundary ไม่ย้ายSceneRuntimeไปcore/worker/BFF
- 102แยกlegacyprops/legacylightingเป็นmoduleจริง; registries6ช่องยังno-opจน122เสียบimplementationsของแต่ละlane
- IPC/serviceportsข้ามfeatureให้อ้างcontractversionและเพิ่มtypedportโดยcoordinatorก่อนmerge ไม่importprivateimplementationข้ามlaneหรือแก้sharedfilesเงียบ ๆ

## 5. แสงและตรวจรับ

ค่าเริ่มต้นrealtimeDateจากอุปกรณ์, latitude13.7563 longitude100.5018 timezoneAsia/Bangkok, northOffset0° เป็นreferenceที่ผู้ใช้แก้ได้ ไม่ใช่พิกัดที่ตรวจพบ layout+xตะวันออก layout+yใต้ (Three+zใต้), azimuthเริ่มเหนือหมุนตามเข็ม; หมุนกล้องไม่เปลี่ยนแดดโลก

fixedclockใช้QA, timezoneใช้แสดง/เลือกวันเท่านั้นไม่บวกUTCoffsetซ้ำ; cadence60วิจริง (updateทันทีเมื่อsettingsเปลี่ยน) reducedmotion/printหยุดการเปลี่ยนแสงต่อเนื่องแต่รักษาภาพนิ่ง; กลางคืนindoorfillไม่มืดจนดูผังไม่ได้ ค่าแสงจริงอยู่120/121ไม่เพิ่มใน102

Reference browserสำหรับperformanceใน123: ChromeบนWindowsเครื่องlocalนี้ ใช้hardware/WebGLrendererจริงที่เก็บในevidence102 ถ้าQAรันsoftwareWebGLให้รายงานเป็นfunctionaltestและวัดperformanceใหม่บนGPUจริงก่อนอ้างเป้า≥30fps; medianframe regression≤20%เทียบฐานฉากเดียวกัน รายงานmedian/p95/quality/resolution/จำนวนคน/พนักงานเสมอ

Verificationfoundation: unitทั้งหมดผ่าน, lint/typecheck/Harness/boundaryผ่าน; baselineก่อนrefactorและภาพหลังที่สถานะ/กล้อง/fixedsceneตรงกัน, GLBtempfull/liteทั้ง2roleมีbones/geometry/clips/_partเท่าเดิมและpublicassetsไม่เปลี่ยน ไม่มีclaimว่าเริ่มสร้างอาหาร/แอนิเมชันใหม่แล้ว

## Change control

เปลี่ยนชื่อ/หน่วย/ความหมายหลังfreezeต้องเพิ่มcontractversionหรือmigrationที่ชัดเจนก่อนเปิดdependentlane อย่าให้agentสองคนแก้contracts/modelgenerator/three-viewพร้อมกัน ผู้ประสานงานรวมHarnessและsourceทีละtaskตามแผน
