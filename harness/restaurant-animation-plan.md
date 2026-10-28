# แผนอาหาร พฤติกรรมตัวละคร และแสงตามเวลาจริง

วันที่วางแผน: 2026-10-28 (Asia/Bangkok) · **Planning only — ยังไม่เริ่ม implementation**

> อัปเดต2026-10-29: Foundation `101–102` ทำแล้ว สัญญาที่ใช้งานจริงอยู่ `animation-contract-v1.md` และจุดเชื่อม/เจ้าของไฟล์อยู่ `animation-module-map.md` งาน103–123ยังไม่เริ่ม ส่วนเนื้อหาด้านล่างเป็นแผนตั้งต้นและผลตรวจฐานในวันที่วางแผน

รายการงานที่ติดตามสถานะจริง: `harness/feature_list.json` — `feat-101` ถึง `feat-123` (23 งาน, sprint 5)

## 1. เป้าหมายและขอบเขต

ทำให้เห็นวงจรบริการที่ต่อเนื่อง: รับอาหารจากครัว → เดินถืออาหาร → วางบนโต๊ะ → ลูกค้านั่งกิน → เหลือจาน/คราบ → พนักงานเช็ดโต๊ะ → โต๊ะสะอาด พร้อมการเดินและการเลื่อนเก้าอี้ที่เป็นธรรมชาติ และแสงเงาที่เปลี่ยนตามเวลาจริง

| คำขอ | งานที่รองรับ |
|---|---|
| 1. โมเดลอาหาร 5 แบบ | 103–108, 116, 122 |
| 2. พนักงานเดินถืออาหาร | 109, 113–115, 117, 122 |
| 3. ทุกคนเดินด้วยเวลาปกติ | 101, 113–115, 119, 122–123 |
| 4. ลูกค้ากินอาหารและมีคราบบนโต๊ะ | 110, 113–114, 116, 118, 122 |
| 5. พนักงานเช็ดโต๊ะแล้วคราบหาย | 111, 113–114, 116–117, 122 |
| 6. นั่งและเลื่อนเก้าอี้เป็นธรรมชาติ | 112–115, 119, 122 |
| 7. แสงเงาตามเวลาจริง | 120–123 |

ไม่เปลี่ยนกฎ validation, P1 schema, BFF, ฐานข้อมูล, API ของ service หรือวิธีคิดผลวิเคราะห์ร้านเพื่อให้เข้ากับภาพโดยพลการ อาหาร/คราบ/ตำแหน่งเก้าอี้ขณะเคลื่อนไหวเป็น runtime presentation state ไม่บันทึกลงผังและไม่เข้า Undo/Redo

## 2. สิ่งที่พบจากโค้ดจริงและเงื่อนไขก่อนเริ่ม

- ฐานที่ตรวจ: branch `main`, HEAD `7d5b122` **รวม working changes ที่ยังไม่ commit** ตามรายการด้านล่าง; HEAD อย่างเดียวไม่ใช่ฐานที่ตรวจในแผนนี้
- มีโมเดลลูกค้า/พนักงาน full และ lite; skeleton ร่วมกันมี `LeftHand`/`RightHand`; สคริปต์ `scripts/create-cafe-customer-model.mjs` เป็นจุดรวม rig, animation และ export GLB ทุกบทบาท
- `src/components/preview-3d/three-view.tsx` รวมฉาก เฟอร์นิเจอร์ เก้าอี้ ตัวละคร ถาด ไฟ และ cleanup ไว้ไฟล์เดียว จึงห้ามให้หลาย agent เข้าแก้พร้อมกัน
- มีถาดพร้อมจาน/อาหาร placeholder อยู่แล้ว แต่ถาดติด root ของโมเดลและใช้ท่า Walk/Work ยังไม่มีท่าแขนถืออาหารหรือวางจานที่สัมพันธ์กับมือ
- `seat-motion.ts` มี pull → sit → push และ rise-pull → rise แต่ระยะคงที่ 0.30 ม., ไม่มีการประเมินพื้นที่ดึงเก้าอี้, ยังไม่ประสานมือและตำแหน่งเท้าครบ
- `WalkPacer` เร่งด้วย `max(speed, left / 4)` และ `StaffPacer` เร่งด้วย `max(speed, left / 8)` จึงยังวิ่งไล่ข้อมูลได้แม้ตั้ง 1×; controller จำกัด dt ที่ 0.25 วินาที และ ThreeView จำกัด delta ที่ 1/30 ซึ่งต้องทดสอบจอ 15/30/60/120 fps
- engine เก็บลูกค้าเป็น party แต่ `agentBuffer()` ใน working tree ล่าสุดปล่อยสมาชิกทุกคนด้วย `partyId * 10 + member`; `drainPaths()` ยังอ้าง party id จึงต้องตรวจ mapping ให้ครบ ห้ามอนุมาน id จากตำแหน่งบนโต๊ะ
- engine มี `clean/occupied/dirty/cleaning` แล้ว แต่ยังไม่ส่งสถานะโต๊ะ/จาน/เวลาจังหวะงานไป renderer; `waiting-order`, `waiting-food`, `seated` ถูกยุบเป็นรหัส 4 เหมือนกันใน buffer เดิม
- งานเสิร์ฟใน `StaffVisuals.plan()` เป็นการแบ่งเวลางานรวมรวมทางกลับ ต้องแยก milestone ถึงโต๊ะ/วางอาหาร/เช็ดสำเร็จจากตอน task จบ ห้ามใช้เพียงรหัส `serving` เพื่อสรุปว่าอาหารถึงโต๊ะแล้ว
- ไฟปัจจุบันเป็น HemisphereLight + DirectionalLight ทิศคงที่ มี shadow map และ AdaptiveQuality แล้ว; เมื่อปิด autoUpdate ต้องสั่งปรับ shadow map หลังไฟ/คราบ/เก้าอี้เปลี่ยนด้วย
- เอกสารเก่าบางตอนยังกล่าวว่า SVG-only หรือ x1 เร่ง 60×; ใช้กฎ Three.js เฉพาะ Presentation Tier และการแก้ 1 วิ = 1 วิล่าสุดเป็นฐาน

ไฟล์ source ที่มี working changes ตอนสำรวจ (เก็บไว้ครบ ไม่แก้ใน session วางแผน):
`playground-status-bar.tsx`, `simulation-controller.ts`, `simulation-gate.test.tsx`, `simulation-panel.tsx`, `engine.ts`, `engine.test.ts`, `worker-runtime.ts`, `day-config.ts`, `use-simulation-store.ts` รวมถึง progress/handoff ที่มีบันทึกอยู่ก่อน

ผล startup: `harness/init.sh` ตรวจ runtime/dependencies/boundaries/Harness เดิม 100 งานผ่าน แต่ tests **981 ผ่าน / 2 ล้ม / รวม 983**:

1. `src/core/simulation/day-analysis.test.ts:89` — `roomy.seating.enough` ได้ true แต่คาด false
2. `src/core/simulation/restaurant.test.ts:91` — จำนวน abandoned ของพนักงาน 1 คนและ 3 คนเท่ากัน (0) แต่คาดต่างกัน

**Gate ก่อนพัฒนา:** feat-101 ต้องตรวจและระบุฐานร่วมที่รวม working changes อย่างถูกต้อง พร้อมแก้สาเหตุ/ปรับสมมติฐานที่พิสูจน์ได้ของสอง failure ให้ผ่าน ห้ามลด assertion เพื่อให้เขียว และห้ามเรียก init ว่าหลักฐาน tests ผ่านเพราะสคริปต์ใช้ `npm test ... || true` การแก้ baseline เป็นงานอนาคต ไม่ได้ทำใน session นี้

บน Windows เรียก Git Bash โดยตั้ง PATH `/usr/bin:/bin` และ `PYTHONIOENCODING=utf-8`; หาก `python3` ชี้ Windows Store ให้ alias/function ไปยัง Python จริงใน process นั้น ไม่แก้ไฟล์ init เพื่อแก้ environment เฉพาะเครื่อง

## 3. สมมติฐานผลิตภัณฑ์สำหรับแตกงาน

1. อาหารตั้งต้น 5 แบบ: **ข้าวผัด, ก๋วยเตี๋ยว, สเต๊ก, สลัด, เค้ก** เป็นข้อเสนอที่เปลี่ยนชื่อได้ใน feat-101 ก่อน freeze; แต่ละแบบมีภาชนะ/ช้อนส้อมที่เหมาะสม และสถานะเต็ม/กินบางส่วน/หมด
2. สไตล์ low-poly ตามฉากเดิม ไม่เปลี่ยนรูปร่างหรือสัดส่วนหลักของคน; ใช้โมเดลเดิมเพิ่ม clips/props เท่าที่จำเป็น
3. คำว่า “เช็คโต๊ะ” ในคำขอข้อ 5 ตีความตามบริบทเป็น **เช็ดทำความสะอาดโต๊ะ** พร้อมกำจัดคราบและเก็บจาน
4. ที่ 1×: วินาทีจำลอง = วินาทีจริง, ทุกคนเดินตามความเร็ว engine ที่กำหนด (ลูกค้าเดิม 1.0–1.4 ม./วินาที, พนักงานเดิม 1.2 ม./วินาที) ไม่เร่งอัตโนมัติเพื่อไล่ backlog ค่าเหล่านี้มาจาก config ของโครงการ ไม่ใช่มาตรฐานกฎหมาย/การแพทย์
5. ปุ่มเร่งที่ผู้ใช้เลือก 2/5/10/30× ยังใช้ได้; ระยะเคลื่อนที่และเวลาจังหวะงานใช้ clock เดียวกัน ส่วนขาจำกัดความถี่เพื่อไม่ให้สั่นได้โดยต้องระบุข้อจำกัดตอนเร่ง ไม่มี silent speed-up
6. แสงเริ่มต้นใช้ **วันและเวลาจริงของอุปกรณ์** ไม่ใช้ `metrics.time` ของร้านโดยอัตโนมัติ; ค่าอ้างอิงสถานที่เสนอเป็นกรุงเทพฯ 13.7563°N, 100.5018°E, `Asia/Bangkok`, ทิศเหนือผัง 0° และต้องแสดงว่าเป็นค่าอ้างอิง ไม่ได้ตรวจพบตำแหน่งผู้ใช้
7. เปิดให้กำหนดพิกัด/ทิศเหนือ/วันที่ทดสอบและสลับ realtime/fixed ได้ในแผงแสงขนาดเล็ก; เก็บใน presentation store แยก ไม่ขอ geolocation และไม่ผูกกับการบันทึกผังในรอบนี้
8. ไม่เพิ่มข้อมูลอากาศจริง หน้าต่าง หรือระบบคำนวณแสงอาคารเชิงวิศวกรรม; ผลแสงเป็นภาพประมาณตำแหน่งดวงอาทิตย์และแสงในร้านแบบ cutaway

## 4. สัญญาที่ต้อง freeze ก่อนแยก agent (feat-101)

รายละเอียดนี้เป็น **design contract ที่เสนอ** ยังไม่มีการสร้าง TypeScript/props/assets จริง feat-101 ต้องยืนยันชื่อและหน่วยให้แน่นอนก่อน feat-102

### 4.1 Clock, identity และลำดับเหตุการณ์

- `runId`, `layoutRevision`, `sequence`, `simTimeSeconds` ใช้คัดทิ้ง TICK ของรอบเก่า/ผิดลำดับ; `realDeltaSeconds` มาจาก monotonic clock; `playbackRate` คูณเพียงครั้งเดียว
- `renderAgentId` ต้อง map ไป `partyId`, `memberIndex`, `tableId`, `chairId` ที่จองจริงได้ครบ; สมาชิกไม่แชร์เก้าอี้เดียวกัน ไม่ใช้ nearest-chair เมื่อมี binding แน่นอน
- path ทุกคนต้องใช้ id เดียวกับ render buffer หรือมี mapping ชัดเจน; รองรับลูกค้า 1–4 คน, เข้าแถว, นั่ง, เปลี่ยนจุดหมาย, ออก, ยกเลิก และเริ่มใหม่
- รักษา agent/staff buffer stride เดิม 4; เพิ่ม optional versioned metadata แทนยัด field ลง buffer เก่า; compatibility เมื่อ worker เก่าไม่มี metadata ต้องยังวาดได้แต่ไม่เดาให้เริ่มกิน
- ส่ง full semantic snapshot เริ่มรอบ/เริ่มแสดง 3D และทุก TICK หรือ cadence ที่ reconstruct ได้; event queue ถ้ามีต้อง bounded และ idempotent ด้วย `eventId`/`serviceCycleId` ห้ามพึ่ง event ที่ renderer อาจพลาด
- ออกแบบความคลาดระหว่าง physics/worker กับภาพแบบ bounded interpolation: ไม่ส่งภาพที่เปลี่ยนท่าข้ามจังหวะเดิน, ไม่เร่งไล่/teleport ที่ 1×, pause/resume ไม่สะสมเวลาจาก background tab หากเกิน buffer ต้อง resync แบบระบุสถานะหลังกลับเข้าแท็บ
- ขั้นตอนถึงโต๊ะและ milestone ของภาพมาจาก simulation clock/path จริง; ถ้า engine task completion อยู่หลังเดินกลับ ใช้ time marker ของช่วงวางจาน ไม่เปลี่ยนสูตร service metrics เงียบ ๆ; ถ้าพิสูจน์ว่าต้องเปลี่ยนสูตร ให้แยกขอบเขต/ผลกระทบก่อนเริ่มส่วนนี้

### 4.2 Semantic state ที่ renderer ต้องอ่านได้

- ลูกค้า: `walking | waiting-order | waiting-food | eating | finished | leaving` + seating phase; เริ่ม Eat หลังวางจานและนั่งพร้อมเท่านั้น
- งานพนักงาน: `taskId`, `kind`, `staffId`, `tableId`, `phase`, ช่วงเวลาเริ่ม/จบ, `carryItems` และ milestone `pickup/put-down/wipe/clear`; ถือจานเมื่อรับจริง หยุดถือเมื่อวางจริง
- โต๊ะ: engine availability (`clean/occupied/dirty/cleaning`) แยกจาก visual surface (`empty/served/eating/used/wiping/clean`); จานมี `mealId`, `ownerRenderAgentId`, `foodKind`, `progress`, anchor และ service cycle
- การเกิดคราบ: ค่อย ๆ ปรากฏระหว่างกิน, ยังอยู่หลังคนออก, ไม่หายตอนเริ่ม cleaning; ลดตามความคืบหน้าเช็ดและหายสนิทที่ cleaning complete ของ cycle เดียวกัน โต๊ะจองรอบใหม่ได้ตามกฎ engine เท่านั้น
- กรณีลูกค้ารอไม่ไหว/ไม่เคยได้รับอาหาร: ไม่สร้างอาหารหรือคราบผี; จานที่เสิร์ฟไปแล้วของโต๊ะที่ยกเลิกยังต้องผ่าน cleanup; กรณี counter-order ต้องระบุ policy ที่สอดคล้อง flow เดิม
- `foodKind` สุ่มแบบ hash จาก seed + party/member โดยใช้สายแยกจาก simulation RNG ห้ามเปลี่ยน arrival, dine, cook time หรือผลวิเคราะห์

### 4.3 Asset/animation และ module API

- หน่วยเมตร, +Y ขึ้น, +Z หน้าตัว; รักษา bone names, bind pose และ `_part` ของเดิม; ทุก role ใช้โครงเดียวกันและทดสอบ full/lite ได้
- อาหาร 5 id คงที่, origin ที่ฐานภาชนะ, footprint ไม่เกินจานเส้นผ่านศูนย์กลางประมาณ 0.26 ม. (ปรับจริงให้พอดีโต๊ะเล็ก); ส่ง bounds, grip/table anchors และสถานะ full/partial/empty
- เกณฑ์งบตั้งต้นต่ออาหาร: full ≤ 8,000 triangles / lite ≤ 2,000, GLB full ≤ 300 KB / lite ≤ 100 KB, ไม่โหลด texture ภายนอก; feat-103 ยืนยันด้วยตัวอย่างจริงก่อนทั้ง 5 ชิ้น ตัวเลขเป็น budget โครงการ
- staff clips: `CarryIdle`, `CarryWalk`, `PickUp`, `PutDown`, `WipeTable`; customer: `Eat`, `PullChair`, `SitDown`, `PushChair`, `StandUp`; เก็บ Idle/Walk/Sit/Work สำหรับ compatibility
- CarryWalk ใช้ lower-body Walk เดิมกับ upper-body pose คงมือรับถาด; root motion ไม่แปลตำแหน่งซ้ำกับ controller; งานกิน/เช็ดใช้ action priority ชัดเจนและ crossfade ไม่ blend สอง clip ที่แย่งมือกัน
- กำหนด marker เช่น hand-contact, food-contact, seated, clear-complete แบบ normalized time ใน manifest; อย่าอาศัย callback mixer ที่อาจหายตอน pause/skip frame
- บริการ feature แยก `create/update/dispose` พร้อม dependencies ผ่าน context จำกัด; no-op ก่อน integration และห้ามมี side effect ตอน import
- ทุกขั้นคืน geometry/material/texture/mixer/subscription/timer ตาม owner; แชร์ asset ได้แต่ไม่ dispose asset ที่ instance อื่นยังใช้อยู่

## 5. การแบ่งไฟล์และความเป็นเจ้าของ

ชื่อไฟล์ใหม่ด้านล่างเป็นตำแหน่งเป้าหมายสำหรับงานอนาคต ไม่ใช่ไฟล์ที่มีอยู่แล้ว feat-102 สร้างโครงที่จำเป็นและหยุดแก้ก่อนเปิดงานคู่ขนาน

| Lane / งาน | พื้นที่เขียนที่เป็นเจ้าของ | เงื่อนไข |
|---|---|---|
| Foundation 101–102 | contracts, `three-view.tsx`, model generator, runtime module shell | ทำลำดับเดียวก่อน fan-out |
| Catalogue 103 | `preview-3d/food/catalog.*`, generator helper, manifest catalogue | ไม่แก้ไฟล์อาหารแต่ละชนิด |
| Food 104–108 | `scripts/food-models/<id>/`, `public/assets/models/food/<id>/`, tests ของ id นั้น | หนึ่ง agent ต่อหนึ่งชนิด ไม่เขียน manifest กลาง |
| Clips 109–112 | `scripts/character-clips/{staff-carry,customer-eat,staff-clean,customer-seat}.mjs` และ test ของตน | ห้าม export ทับ GLB กลาง |
| Core 113 | `core/simulation/{engine,staff-visual}.*`, metadata encoder และ tests | sole writer ของ engine; รอ baseline ผ่าน |
| Transport 114 | `protocol.ts`, `worker-runtime.ts`, bridge metadata และ tests | ไม่แก้ engine/controller |
| Motion 115 | pacers, `simulation-controller.ts`, `motion/` และ tests เดิมที่เกี่ยว | รอ 114 จบเพื่อไม่ชน shared contract |
| Table 116 | `preview-3d/table-service/` | ใช้ catalogue ที่มีอยู่ ไม่แก้ manifest |
| Staff 117 | `preview-3d/staff-actions/`, staff full/lite GLB | เป็นผู้ export staff GLB เพียงรายเดียว |
| Customer 118 | `preview-3d/customer-actions/`, customer full/lite GLB | รวม Eat + Seat clips แล้ว export เพียงรายเดียว |
| Seating 119 | `seat-motion.ts`, tests และ `preview-3d/seating/` | ใช้ pose API ไม่แก้ customer-actions หรือ customer GLB |
| Solar 120 | `preview-3d/lighting/solar-*`, `lighting/clock-*`, `lighting/settings.*`, presentation light store/UI | ไม่แตะ day-config หรือ simulation store |
| Lighting 121 | `preview-3d/lighting/scene-lighting.*`, shadow-fit helpers/tests | อ่าน settings/solar; ไม่แก้ adaptive-quality |
| Integrator 122 | `three-view.tsx`, runtime composition, Character Lab, catalogue imports, fallback renderers, adaptive-quality, เอกสารหลักที่ต้อง sync | เข้าแก้ shared files หลัง lane ต่าง ๆ ส่งงานครบ |
| QA 123 | `e2e/restaurant-animation*`, `harness/evidence/feat-123/` | defect ส่งกลับเจ้าของเดิมก่อนรับรอง |

ไฟล์กลางที่ล็อก: `three-view.tsx` (102 แล้ว 122), `scripts/create-cafe-customer-model.mjs` (102 แล้ว 122), `character-models.ts`/tests และ `character-lab*.tsx` (122), `package.json`/lockfile (ผู้ประสานงานเท่านั้นเมื่อจำเป็นและมีเหตุผล), `harness/feature_list.json`/progress/handoff (ผู้ประสานงานตอนรวมงาน)

CLI หลัง 102 ต้องเลือก role และ output directory ได้: agent clips ใช้ output ชั่วคราวของตน, 117 สร้างเฉพาะ staff, 118 สร้างเฉพาะ customer; ไม่มี build ที่สร้าง GLB ทั้งสี่ไฟล์อัตโนมัติในงานคู่ขนาน อย่าแก้ Blender source mesh ในรอบนี้เว้นแต่พิสูจน์ว่าขาด geometry จริงและปรับ ownership ก่อน

## 6. ลำดับและการทำงานคู่ขนาน

| ช่วง | งานที่เริ่มได้ | จุดตรวจ/ส่งต่อ |
|---|---|---|
| A | 101 | baseline สะอาด + contract/identity/clock/asset freeze |
| B | 102 | แยก module โดยพฤติกรรมเดิมคงอยู่ + ยืนยัน entry points |
| C | 103, 109, 110, 111, 112, 113, 120 | คนละ directory; ถ้ามี agent น้อย ให้หยิบงานที่ปลดล็อก lane ถัดไปก่อน |
| D | 104–108 หลัง103; 114 หลัง113; 121 หลัง120; 117 หลัง109+111+114; 118 หลัง110+112+114 | foods ทั้งห้าไม่ต้องรอกัน; export คนละ role |
| E | 115 หลัง114; 116 หลัง104–108+114; 119 หลัง112+115 | ตรวจ timing, state และ resource ownership ของแต่ละ module |
| F | 122 หลัง115–119+121 และงานอาหารครบ | รวม shared files โดย integrator คนเดียว |
| G | 123 หลัง122 | visual + e2e + performance + regression + evidence |

นี่คือรายการที่ dependency **อนุญาต** ไม่ได้แปลว่าต้องเปิด agent ทุกงานพร้อมกัน One Feature at a Time ใช้ต่อ agent/worktree; agent เดียวจบงานหนึ่งก่อนรับงานต่อไป ห้ามเริ่ม dependent task ด้วย stub แล้วอ้างว่า dependency ผ่าน

แนะนำใช้ **worktree แยกต่อ task** จาก integration base ที่ผ่าน 102 และรวม dependency ล่าสุดแล้ว; branch `codex/feat-NNN-<topic>` ห้ามสร้าง worktree จาก main เดิมที่ขาด uncommitted timing/party fixes Worktree ไม่คัดลอก working changes จึงต้องให้ผู้ประสานงานเตรียม base commit ที่ review แล้วก่อน (session นี้ไม่สร้าง/commit/worktree)

ก่อนเปิด agent ให้ระบุ task id, base commit, dependency commits, write_scope, read-only shared files, contract version, tests และหลักฐานที่ต้องส่ง หากต้องเปลี่ยน contract ให้หยุด dependent lane แจ้งผู้ประสานงานและเปลี่ยน version ก่อน ไม่แก้เงียบ ๆ

แต่ละ agent ส่ง commit/source ของตนพร้อม `harness/evidence/feat-NNN/` และสรุปผลตามเกณฑ์ AGENTS หากอัปเดต Harness ใน worktree ให้แก้เฉพาะ entry ของงานตน ผู้ประสานงานรวม source และพับ status/evidence ของแต่ละงานเข้ากลางทีละงาน ไม่ cherry-pick ทับ feature_list/progress/handoff ทั้งไฟล์จากหลาย branch ส่วน shared checkout ให้ผู้ประสานงานเขียน Harness คนเดียว

## 7. วิธีดำเนินการและตรวจรับแต่ละเรื่อง

### 7.1 โมเดลอาหาร (103–108, 116)

- สร้างอาหารแบบ procedural geometry แล้ว export trusted GLB ผ่าน tooling เดิม ทำซ้ำได้ ไม่ใช้ภาพ 2D แทน 3D
- แยกภาชนะ/อาหาร/อุปกรณ์ด้วยชื่อ node คงที่ ปริมาณอาหารลดผ่านชิ้นส่วนหรือ state variants; ภาชนะคงอยู่หลังอาหารหมด
- ตำแหน่งอาหารคำนวณจาก table local coordinates + chair binding ตรวจทรงกลม/สี่เหลี่ยม/หมุน 0/90/180/270 และหลายขนาด ไม่มีจานชนกันหรือลอย มือเข้าถึงขอบจานได้
- คราบใช้ geometry แผ่นบาง/decal แบบไม่เกิด z-fighting, hash ตำแหน่งใน bounds โต๊ะ, ไม่เขียนทับ material ที่แชร์โต๊ะอื่น; ลดจำนวนชิ้นตาม quality
- หลักฐานอาหารแต่ละแบบ: render 3 มุม, full/lite, full/partial/empty, ขนาด/triangle/bytes/load time และภาพบนถาด/โต๊ะเล็ก

### 7.2 ถือ เสิร์ฟ กิน และเช็ด (109–111, 113–118)

- ถือถาดที่ grip anchor จากมือหรือสองมือกับ constraint ที่คงระดับ ไม่ผูก root ลอย ๆ; ตรวจหมุน/เดินเลี้ยว/Idle และส่งต่อจานโต๊ะตรง marker
- ลูกค้านั่งรอใช้ idle นั่ง; eating ใช้ช้อนหรือส้อมเข้าปากและกลับจานเป็น loop มี phase ต่างกันต่อคน รักษาขา/สะโพกบนเก้าอี้ ไม่เริ่มก่อน served
- คราบและจานอยู่ต่อหลังลูกค้าออก; staff ต้องเดินถึง service point หันเข้าโต๊ะ → วาง/เก็บ props → ถือผ้าเช็ดกวาดหลายจังหวะ → จบ cleanup; ห้ามคราบหายตั้งแต่เริ่มเดินมา
- ผ้าเช็ดเป็น prop มือ พื้นที่แขนและลำตัวไม่ทะลุโต๊ะ; เช็ดจากด้านที่เข้าถึงได้จริง ใช้ milestone จาก state เดียวกันกับ table availability
- pause/resume, เปลี่ยนความเร็ว, สลับ 2D/3D, โหลด asset ช้า/ล้ม, restart และ task cancellation ไม่สร้าง duplicate จาน/คราบหรือเสิร์ฟให้ cycle เก่า
- ไม่ใช้ animation finished callback เป็นตัวเปลี่ยนสถานะ simulation; ถ้าตัด animation เพราะ reduced motion ให้สถานะโต๊ะยังถูกต้อง

### 7.3 เวลาเดินและการนั่ง (112, 115, 119)

- ไม่แก้แค่ Walk duration: ต้องวัดระยะทางบนผัง / elapsed time ของคนจริงบนจอ รวม engine → pacer → interpolation → mixer หลีกเลี่ยง dt clamp ทิ้งเวลาบนจอ 15fps
- ที่ 1× ทางตรง 6 ม. ของพนักงาน 1.2 ม./วิใช้ 5 วิ; ลูกค้าใช้ความเร็ว config ของแต่ละคน ระยะคลาดเป้า ≤ 5% ใน steady state; ส่วนหยุด/เลี้ยวแยกทดสอบ
- backlog ไม่อนุญาตให้เดินเร็วขึ้นที่1×; ป้องกัน backlog ตั้งแต่รับข้อมูล/clock mapping, จัดคิว state transition ตาม presentation time และ bounded buffer ไม่เพิ่ม latency ไปเรื่อย ๆ
- ตรวจ arrival path ต่อ render member ไม่รวมทุกคนกลับไป party เดียว; เดินเข้าแถว/เลี้ยวไม่ตัดโต๊ะ เก้าอี้มี occupant เดียว
- นั่ง: เดินถึงด้านเข้าถึง → หมุนเข้าหาพนัก → มือแตะพนัก → ดึงเก้าอี้พร้อมการถอยเท้า → หัน/นั่งให้สะโพกลงเบาะ → ขยับเท้าและดันเข้า; ลุกทำลำดับกลับและเดินพ้นก่อนคืนเก้าอี้
- ดึงเก้าอี้ตามแกน local ของ chair ระยะจำกัดด้วยพื้นที่ว่างและรูปทรงโต๊ะ; ถ้าคับแคบใช้ระยะน้อยลงหรือท่าทางสำรองที่ไม่ทะลุวัตถุ ไม่แก้พิกัดผัง/validation
- ตำแหน่งเก้าอี้ในผังยัง snap0.25ม.; offset ภาพระหว่างเฟรมเป็นค่าต่อเนื่องเหมือนตัวละครได้ มิฉะนั้นภาพจะกระตุก ระบุข้อยกเว้น presentation ให้ชัดใน contract

### 7.4 แสงเงาตามเวลาจริง (120–121)

- คำนวณ solar azimuth/elevation จาก UTC instant + latitude/longitude; timezone ใช้แปลงเวลาแสดงผล/วันทดสอบ ไม่บวก UTC offset ซ้ำ ลองวันที่ใกล้เที่ยงคืน/ปีอธิกสุรทินและ timezone อื่น
- Azimuth เริ่มเหนือ หมุนตามเข็มนาฬิกา; แปลงเป็นแกนฉากและ north offset ของผัง (ไม่ผูกกับ viewRotation) กล้องหมุนแล้วทิศแดดโลกคงเดิม
- `DirectionalLight` แทนแดด, hemisphere/ambient + indoor fill ทำให้กลางคืนยังมองร้านเห็น; elevation ต่ำลด direct intensity ผ่าน twilight, กลางคืนปิด direct sun และใช้แสงภายในต่อเนื่อง ไม่ทำแดดใต้พื้น
- อัปเดตตำแหน่งแดดประมาณทุก30–60วิจริงและเมื่อเวลา/พิกัดเปลี่ยน มี interpolation ที่ไม่กระพริบ; fixed clock สำหรับ screenshot และทดสอบ; หยุดการเปลี่ยนภาพต่อเนื่องใน reduced motion/print และคืนค่าอย่างถูกต้อง
- fit orthographic shadow camera ตามขนาดผัง 2–30 ม. รวมความสูงคน/ผนังและบริเวณทางเข้า, จำกัดขอบเขตที่ไม่ใช้, texel stabilization/bias ตามระยะเพื่อเลี่ยง acne และเงาลอย
- ใช้แหล่งแสงทอดเงาหลักหนึ่งดวง, ปรับ shadow map ตาม AdaptiveQuality เดิม; แม้ปิด autoUpdate ต้อง invalidate เมื่อแดด/เก้าอี้/จานเปลี่ยน ตรวจไม่ allocate shadow map ใหม่ทุกเฟรม
- cutaway เป็นภาพประมาณ: ต้องกำหนดให้ผนังที่ซ่อนจากกล้องมีนโยบายทอดเงาคงที่ มิฉะนั้นหมุนกล้องแล้วแสงเปลี่ยน บันทึก policy และตรวจ4มุม ไม่เพิ่มหน้าต่างเพื่อแก้โดยปริยาย
- ไม่อ้างว่าพิกัดกรุงเทพฯคือร้านจริงหรือว่าเป็นการวิเคราะห์แสงอาคารแม่นยำ

แหล่งอ้างอิงสำหรับ implementation (ไม่ต้องพึ่ง API ออนไลน์ตอน runtime):
- NOAA: https://gml.noaa.gov/grad/solcalc/solareqns.PDF — สมการตำแหน่งดวงอาทิตย์; เลือก longitude บวกทางตะวันออกให้ตรงสูตร เอกสารอ้างอิงคงที่ ไม่พึ่งบริการ calculator ที่ประกาศหยุดดูแล
- NOAA calculation details: https://www.gml.noaa.gov/grad/solcalc/calcdetails.html
- Three.js shadow guide: https://threejs.org/manual/pages/shadows.html
- Three.js DirectionalLight: https://threejs.org/docs/pages/DirectionalLight.html
- Three.js LightShadow: https://threejs.org/docs/pages/LightShadow.html

## 8. Verification / Definition of Done ร่วม

ทุก task ต้องมี acceptance/steps/verification ใน feature_list และ evidence ที่ชี้ไปไฟล์จริง ห้ามใส่ evidence ว่าสำเร็จก่อนทำจริง

- Foundation ตรวจ baseline unit suite 100%, Harness schema/DAG, architectural boundary, lint/typecheck ก่อนปล่อย fan-out
- Unit: role/skeleton/clip/marker/assets, identity/path mapping, semantic snapshot, food choice deterministic, timeline/seat phases, solar numeric fixtures อ้างอิงแหล่ง/เวลาและ tolerance ชัดเจน
- Integration: ไม่มีอาหารตอน waiting-food; เสิร์ฟครบต่อสมาชิก; คราบยังอยู่หลังออก; clean complete เท่านั้นที่ลบคราบครบ/โต๊ะกลับใช้ได้; cancel/restart ไม่ค้าง props และ metadata optional ไม่ทำให้ worker รุ่นเก่าพัง
- E2E visual: วงจรเต็มทั้ง5อาหาร, ลูกค้า1/2/4คน, พนักงานหลายคน, โต๊ะหลายทรง/ขนาด/มุม, pause/resume/1×/2×/5×/10×/30×, เปลี่ยน2D/3Dกลางคัน และเริ่มใหม่
- นาฬิกาจำลองที่1×ผ่านไป30วิจริงต้องเดิน30วิ ± tolerance ที่กำหนด; วัดเดิน 6ม. ที่15/30/60/120fps และ TICK jitter; background tab ต้องไม่กลับมาวิ่งพรวด
- แสงเช้า/เที่ยง/เย็น/กลางคืนที่เวลา fixed + realtime เปลี่ยนวัน, หมุนกล้อง4มุม, ห้อง2/8/30ม.; ทิศเงาตรงข้ามแดดและไม่กระพริบ/หายตอนลดคุณภาพ
- Performance: เทียบ baseline และหลังรวมในฉากเดียวกัน (เสนอ80ลูกค้า+8พนักงาน ถ้าผังรองรับ), เครื่อง/เบราว์เซอร์/quality/resolutionเดียวกัน, รายงาน median/p95 frame time, draw calls, memory, asset bytes และหลัง start/stop10รอบ; เป้าหมาย median ≥30fps และ regression ไม่เกิน20% บนอุปกรณ์อ้างอิงที่ระบุใน101 ตัวเลขเป็นเป้ารอตรวจเครื่อง ไม่ใช่ผลที่วัดแล้ว
- Reduced motion/print ไม่เล่น motion หรือ clock-driven animation ต่อเนื่อง แต่ยังสื่อสถานะอาหาร/โต๊ะ; WebGL/asset failure ใช้ SVG fallback และ 2D แสดงสถานะเท่าที่เหมาะสม ไม่ import Three เข้า core/worker/BFF
- UIใหม่มี labelภาษาไทย/Tab/focus, 320/375/480/768/1024/1440px ไม่มี horizontal scroll; consoleไม่มี error; trusted assets เท่านั้น
- ก่อนปิด sprint: `npm test`, `npm run lint`, `npm run typecheck`, `python scripts/validate_harness.py`, boundary checks และ browser QA ผ่านครบ บันทึก command/result/commit/ภาพ/ค่าที่วัด ห้ามใช้ init exit0 แทนผล tests

## 9. ข้อความตั้งต้นสำหรับมอบหมาย agent

> ทำเฉพาะ feat-NNN จาก harness/feature_list.json และแผน restaurant-animation-plan.md บน worktree/branch ที่กำหนด ตรวจ dependency และ gate ก่อนเริ่ม อ่าน AGENTS/PRD/architecture/design-system/SKILL และเอกสาร Next.js ใน node_modules ตามส่วนที่เกี่ยวข้อง เขียนได้เฉพาะ write_scope ของงาน ห้ามแก้ shared files หรือ generate GLB ของ role อื่น หากสัญญาไม่พอให้แจ้งจุดเปลี่ยนก่อน ไม่แก้ให้ lane อื่นพัง ส่งหลักฐานตาม acceptance/verification และสรุปไฟล์/commit/ข้อจำกัดเพื่อรวมงานทีละ task

**สถานะ session วางแผน2026-10-28:** สร้างเฉพาะรายการงานและเอกสารแผน/ส่งต่อ ไม่มีโมเดล ไม่มี animation ไม่มี runtime code ใหม่ ไม่มี worktree และไม่มี agent ถูกเปิดทำ implementation; สถานะงานปัจจุบันดูfeature_listและเอกสารmodule-map
