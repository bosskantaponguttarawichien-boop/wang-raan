# Session Handoff — วางร้าน (Wang-Raan)

> **archive**: เก็บ 5 entry ล่าสุดเท่านั้น — รายการก่อนหน้าจะถูกย้ายไปเก็บที่
> `harness/archive/session-handoff-archive.md`

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
