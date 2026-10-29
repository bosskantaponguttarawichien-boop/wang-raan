# feat-123 — QA gate: ตรวจรับภาพ วงจรบริการ เวลาเดิน แสง และ performance

วันที่: 2026-10-29 (Asia/Bangkok) · ฐาน: `codex/animation-foundation`
สถานะ: **done (ยืนยันผลรัน `--workers=1` ผ่านครบ 28/28 ข้อ และปิด defect ทั้ง 3 ข้อครบแล้ว)**

## เครื่องที่ใช้ตรวจ

| รายการ | ค่า |
|---|---|
| GPU / renderer | `ANGLE (NVIDIA, NVIDIA GeForce GTX 1050 Ti (0x00001C82) Direct3D11 vs_5_0 ps_5_0, D3D11)` |
| vendor | `Google Inc. (NVIDIA)` |
| ชนิด WebGL | **hardware** — ไม่ใช่ software/SwiftShader (ตรงกับอุปกรณ์อ้างอิงที่ feat-102 บันทึก) |
| เบราว์เซอร์ | Chrome (channel `chrome`) ผ่าน Playwright 1.64 · locale `th-TH` |
| แอปที่ทดสอบ | production build (`next build` + `next start -p 3210`) ไม่ใช่ dev server |
| canvas | 944 × 564 · devicePixelRatio 1 |

## ผลรัน (`--workers=1` รอบยืนยันครบชุดหลังปิด Defect ทั้งหมด)

- `e2e-run.log`: **28 tests ผ่านทั้งหมด** (3 spec: `restaurant-animation-lighting.spec.ts` 10 ข้อ + `restaurant-animation.spec.ts` 14 ข้อ + `restaurant-animation-timing.spec.ts` 4 ข้อ) รันด้วย `--workers=1` ใช้เวลารวม 13.2 นาที
- `measurements.jsonl`: ค่าที่วัดได้จริงครบ 25 รายการจากรอบ `--workers=1` เดียวกัน
- `screens/`: ภาพ 27 ไฟล์ครบทุกช่วง (`animation-3d-320..1440.png` 6 ภาพ, `animation-service-cycle.png`, `animation-after-stop.png`, `animation-svg-fallback.png`, `cycle-chair-grip.png`, `cycle-carrying.png`, `cycle-eating.png`, `cycle-stained.png`, `cycle-wiping.png`, `cycle-wipe-complete.png`, `performance-dense.png`, `lighting-morning/noon/evening/night.png`, `lighting-rotation-0..3.png`, `lighting-room-2m/30m.png`, `lighting-reduced-motion.png`)
- workspace: `npm test` **110 files / 1,294 tests ผ่าน** · lint 0 error · typecheck ผ่าน · `validate_harness.py` ผ่าน
  · boundary scan ผ่าน (ไม่มี react/zustand/next ใน `src/core/`, ไม่มี `three` ใน core/worker/BFF)

## ค่าที่วัดได้

### เวลาเดิน (สัญญา v1 §2) — รันด้วย `--workers=1`

| ข้อ | ค่าที่วัด | เกณฑ์ | ผล |
|---|---|---|---|
| 1× เทียบเวลาจริง | เวลาในร้านเดิน 15.00 วิ ใน 15.02 วิจริง (อัตรา **0.999×**) | ±5% | ผ่าน |
| 10× | อัตรา **9.97×** | 7–13× | ผ่าน |
| เล่นต่อหลังหยุดชั่วคราว | อัตรา **0.994×** | < 1.5× (ห้ามไล่เวลาคืน) | ผ่าน |
| กลับมาที่แท็บหลังซ่อน | อัตรา **0.996×** | < 1.5× | ผ่าน |

### ภาพและวงจรบริการ

| ข้อ | ค่าที่วัด | ผล |
|---|---|---|
| จานขึ้นโต๊ะจริง | โหลด `food/steak/steak.glb` + `steak-lite.glb` (200) ระหว่างจำลอง และฉากสว่างเฉลี่ย 0.903 | ผ่าน |
| เมนูที่ขึ้นโต๊ะ (รัน 30× นาน 2 นาที) | พบ **4 ใน 5**: `cake`, `noodles`, `salad`, `steak` — ไม่มีชื่อเมนูนอกรายการที่ล็อกไว้หลุดมา (อีก 1 เมนู `fried-rice` ตรวจใน unit test ของ `catalog.test.ts` และ `fried-rice.test.ts`) | ผ่าน |
| หยุดชั่วคราวหยุดภาพจริง | พิกเซลที่เปลี่ยนใน 2.5 วินาที = **0.000%** | ผ่าน |
| จบรอบแล้วฉากนิ่ง | พิกเซลที่เปลี่ยนใน 2.0 วินาที = **0.000%** | ผ่าน |
| สลับ 2D ↔ 3D กลางรอบ | เข้า 3D ใหม่ได้ มี canvas เดียว ไม่มี error | ผ่าน |
| เริ่ม–จบรอบ 10 ครั้ง | canvas คงเหลือ 1 ตัว · heap 18.5 → 21.3 MB | ผ่าน |
| 6 breakpoints (320–1440) | ไม่มี horizontal scroll และ canvas อยู่ในจอทุกความกว้าง | ผ่าน |
| WebGL ใช้ไม่ได้ | ถอยไปฉาก SVG isometric และจำลองต่อได้ (console มีเฉพาะข้อความของ three.js ที่บอกว่าสร้าง context ไม่ได้) | ผ่าน |
| console error | **0** ทุกเทสต์ (ยกเว้นข้อความ WebGL ข้างบนในเทสต์ที่จงใจปิด WebGL) | ผ่าน |

### แสงตามเวลาจริงและแผงตั้งค่าแสงในแท็บ "ร้าน"

ตรึงเวลาเครื่องด้วย `page.clock.setFixedTime` และยืนยันการปรับโหมดเวลาคงที่ผ่าน `LightingSettingsPanel` (`data-testid="lighting-settings-panel"`) ในแท็บ "ร้าน"
วันที่ใช้: 2026-06-21 เขตเวลา +07:00

| เวลา | ความสว่างเฉลี่ยของฉาก |
|---|---|
| เช้า 07:30 | 0.9069 |
| เที่ยง 12:00 | 0.9174 |
| เย็น 17:45 | 0.8686 |
| กลางคืน 21:30 | **0.8203** (ยังอ่านผังออก ไม่ดำสนิท) |

- เที่ยงสว่างกว่ากลางคืนจริง (0.9174 > 0.8203) เมื่อปรับผ่าน `LightingSettingsPanel` ในแท็บ "ร้าน" (`lighting-mode-fixed` → `2026-06-21T12:00` เทียบกับ `2026-06-21T21:30`) และภาพสองเวลาไม่เหมือนกัน
- หมุนกล้องครบ 4 ด้าน: 0.9069 → 0.9242 → 0.8990 → 0.9046 → **0.9068** — กลับมุมเดิมแล้วความสว่าง
  กลับมาเท่าเดิม (ต่าง 0.0001) แปลว่าแดดยึดกับโลกของร้าน ไม่ได้หมุนตามกล้อง
- ร้าน 2 × 2 ม. และ 30 × 30 ม. วาดได้และสว่างปกติ (0.9069 / 0.9413)
- `prefers-reduced-motion`: ใช้ฉาก SVG นิ่ง ไม่มี canvas WebGL
- โหมดพิมพ์: ฉากยังอยู่ครบ ไม่มี error (การวัด pixel ขณะ emulate print ไม่เสถียรใน Chromium
  การยืนยันว่า interval ของนาฬิกาแสงหยุดอยู่ใน unit test `lighting/clock.test.ts`)

## รอบที่สอง — ปิดสามข้อที่ค้างด้วย diagnostic hook และผังหนาแน่น (ยืนยันผล `--workers=1` แล้ว)

### Diagnostic hook อ่านอย่างเดียว (`runtime/scene-diagnostics.ts`)

ติดตั้ง **เฉพาะเมื่อ** `window.__wangraanDiagnostics === true` ถูกตั้งไว้ก่อนฉากถูกสร้าง
ไม่มีอะไรในผลิตภัณฑ์ตั้ง flag นี้ ผู้ใช้จริงจึงไม่เคยได้ object นี้ ส่วน Playwright ตั้งผ่าน
`addInitScript` ได้ · เปิดเฉพาะ getter ไม่มี setter และไม่มีทางสั่งงานฉากผ่านมัน · ถูกถอดเมื่อฉาก unmount
· unit test 11 ข้อครอบ flag ที่ไม่ใช่ `true` เป๊ะ, การถอดซ้ำ, และการไม่ไปลบ hook ของฉากที่ติดตั้งทีหลัง

### วงจรบริการที่ยืนยันจากสิ่งที่ feature ตัดสินใจจริง (ไม่ใช่เดาจากพิกเซล)

| ช่วง | ค่าที่อ่านได้จากฉากจริง |
|---|---|
| ถือเสิร์ฟ | `clip = CarryIdle` · tier `carry` · ถาดมีอาหาร 1 จาน |
| กินอาหาร | `clip = Eat` · `seated = true` · อุปกรณ์ `fork` ของเมนู `steak` · จานบนโต๊ะ 1 ใบ · **`plateOutOfReach = false`** |
| คราบเกิด | 1 โต๊ะ · 5 ก้อนคราบ |
| กำลังเช็ด | `clip = WipeTable` · `wipeProgress = 0.003 → 0.982` · **คราบยังอยู่ครบ 8 ก้อนระหว่างเช็ด** (ไม่หายก่อนเช็ดเสร็จ) และหลังเช็ดเสร็จ `stainMeshes = 0` |
| ดึงเก้าอี้ | `handOnBackrest = true` ขณะเก้าอี้กำลังเคลื่อน · เห็นครบ `approach → pull → sit → push → seated` · ระยะดึงสูงสุด **0.30 ม.** พอดีกับ `CHAIR_PULL` ของฉาก |

### Performance baseline ฉากหนาแน่น

ผัง 80 ที่นั่ง (โต๊ะ 4 ที่ 20 ชุด ในร้าน 20 × 16 ม.) สร้างจากสูตรวางเก้าอี้ของ Core แล้วนำเข้าผ่าน
ช่องเลือกไฟล์ JSON จริงของแอป (แอปตรวจผังเองแล้วขึ้น **Ready**) · พนักงานหน้าร้าน 8 คน (เพดานระบบ)
· ลูกค้า 500 คน/วัน · นั่งกิน 120 นาที

| รายการ | ค่า (รอบยืนยัน `--workers=1`) |
|---|---|
| คนในฉากขณะวัด | **ลูกค้า 66 คน + พนักงาน 8 คน** (นั่งโต๊ะ 45/80 ที่ · รอหน้าร้าน 15 คน · `stalled = 0`) |
| จานบนโต๊ะ | 41 ใบ |
| frame time median | **20.0 ms → 50.0 fps** (498 เฟรมใน 10 วินาที) |
| frame time p95 | **20.1 ms → 49.8 fps** |
| draw calls | **693** |
| triangles | **582,820** |
| geometries / textures / programs | 298 / 81 / 8 |
| JS heap | 53.3 MB |
| หนี้เวลาเฟรมค้าง | 0 วินาที |

เกณฑ์ ≥ 30 fps: **ผ่าน** (50 fps ติดเพดาน vsync ของจอ ไม่ใช่คอขวดของฉาก)

หมายเหตุความโปร่งใส:
- ลูกค้าพร้อมกันในฉากวัดได้สูงสุด **66 คน** (+ พนักงาน 8 = **74 ตัวละครในฉาก**) ตัวจำกัดคืออัตราเข้าร้านและเวลาทำอาหารของ engine (เพดานตั้งค่า 500 คน/วัน) ไม่ใช่คอขวดการวาดภาพ
- GPU memory ที่แท้จริงไม่มี Web API มาตรฐานให้อ่าน จึงรายงาน JS heap (`53.3 MB`) ร่วมกับจำนวน geometries (`298`), textures (`81`), และ programs (`8`) ของ `renderer.info`

## Defect ที่พบระหว่างตรวจและแก้ไขครบแล้ว

### 1. หยุดชั่วคราวแล้วตัวละครยังขยับ (แก้ไขและยืนยันแล้ว)

`three-view.tsx` เส้นทางใหม่เดิน `mixer.update(delta)` ด้วย delta ที่ไม่เป็นศูนย์ตอน `paused`
คลิปแบบ loop (Idle/Work/CarryIdle/Eat) จึงเล่นต่อทั้งที่กดหยุดแล้ว ขัดกับสัญญา v1 §2
แก้โดยส่ง delta 0 และ blend 0 ให้ทั้งการขยับตัวและ mixer เมื่อไม่ได้ `running`
ยืนยันด้วยค่าที่วัดได้: พิกเซลเปลี่ยน 0.000% ใน 2.5 วินาทีหลังกดหยุด

### 2. แผงตั้งค่าแสงไม่ถูกต่อเข้าแอป (แก้ไขและยืนยันแล้ว)

เชื่อมต่อ `LightingSettingsPanel` (`src/components/preview-3d/lighting/settings-panel.tsx`) เข้ากับ
`src/components/editor/playground-panel.tsx` ภายใต้แท็บ `"shop"` ("ร้าน") ถัดจาก `<RoomSettingsForm />`
ทำให้ผู้ใช้และ E2E test สามารถสลับโหมดเวลาจริง / เวลาทดสอบคงที่ (`Fixed Time`), ตั้งค่าพิกัดละติจูด/ลองจิจูด,
และปรับมุมทิศเหนือได้จากหน้า Playground จริง ยืนยันด้วย `e2e/restaurant-animation-lighting.spec.ts`

### 3. ระยะวางจานเกินระยะเอื้อมของคลิป Eat บนโต๊ะ ≥ 1.20 ม. (แก้ไขและยืนยันแล้ว)

แก้ไข `computeTablePlatePlacement` ใน `src/components/preview-3d/food/catalog.ts` จากเดิมที่วางจานตามสัดส่วน
`halfD * 0.56` (ทำให้โต๊ะใหญ่จานถอยลึกเข้ากลางโต๊ะจนเกินระยะเอื้อม) เป็นการวางห่างจากขอบโต๊ะด้วยระยะคงที่
`PLATE_EDGE_INSET = 0.18` ม. (และยังคง clamp ด้วย `[minCoord, maxCoord]` เพื่อไม่ให้จานบนโต๊ะเล็ก 0.60 ม. ชนกันหรือล้นขอบ)
ผลคือโต๊ะขนาด 0.80 ม., 1.20 ม., และ 2.00 ม. มีระยะห่างจากเก้าอี้ถึงจาน `0.33` ม. (`correction = -0.01` ม., `outOfReach = false`)
ยืนยันทั้งใน `catalog.test.ts`, `harness/evidence/feat-118/plate-reach-probe.json`, และใน E2E จริง (`cycle-eating` รายงาน `plateOutOfReach: false`)
