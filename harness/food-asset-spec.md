# Food Asset Specification v1 (`feat-103`)

วันที่: 2026-10-29 (Asia/Bangkok) · สัญญาฐาน: `harness/animation-contract-v1.md` · เจ้าของ: `food-catalogue` (`feat-103`)

เอกสารนี้ล็อกมาตรฐานแคตตาล็อกอาหาร โครงสร้างโหนด พิกัด Anchor งบประมาณโมเดล และเครื่องมือ Export สำหรับ `feat-104`–`feat-108` และ `feat-116`

---

## 1. รายการอาหารทั้ง 5 ชนิด (`FoodKind`)

กำหนดใน `src/components/preview-3d/food/catalog.ts` โดยใช้ URL คงที่ ไม่ใช้ `require` ตอน import เพื่อให้สามารถพัฒนาแยกกันและมี fallback ระหว่างโหลด:

| `FoodKind` | ชื่อไทย | ภาชนะ (`vesselKind`) | อุปกรณ์ (`utensilKind`) | เส้นผ่านศูนย์กลาง | ความสูงปกติ | URL (`full` / `lite`) |
|---|---|---|---|---|---|---|
| `fried-rice` | ข้าวผัด | `plate` | `spoon` | `0.24 ม.` | `0.068 ม.` | `/assets/models/food/fried-rice/fried-rice[-lite].glb` |
| `noodles` | ก๋วยเตี๋ยว | `bowl` | `chopsticks-spoon` | `0.22 ม.` | `0.092 ม.` | `/assets/models/food/noodles/noodles[-lite].glb` |
| `steak` | สเต๊ก | `steak-plate` | `fork-knife` | `0.25 ม.` | `0.056 ม.` | `/assets/models/food/steak/steak[-lite].glb` |
| `salad` | สลัด | `salad-bowl` | `fork` | `0.22 ม.` | `0.078 ม.` | `/assets/models/food/salad/salad[-lite].glb` |
| `cake` | เค้ก | `dessert-plate` | `dessert-fork` | `0.19 ม.` | `0.072 ม.` | `/assets/models/food/cake/cake[-lite].glb` |

---

## 2. การเลือกเมนูแบบ Deterministic แยกจาก Simulation RNG

- ฟังก์ชัน `chooseFoodKind(seed, partyId, memberIndex)` ใน `src/components/preview-3d/food/catalog.ts` คำนวณด้วย 32-bit avalanche hash จาก `(seed, partyId, memberIndex)`
- **ห้ามเรียก `Simulation.random` หรือ `seatRandom`** เพื่อไม่ให้การเลือกเมนูอาหารไปขยับลำดับตัวเลขสุ่มของเวลาเข้าร้าน เวลาทำอาหาร เวลาทาน หรือผลวิเคราะห์ `analyzeDay`

---

## 3. โครงสร้างโหนดและระบบพิกัดใน GLB

ทุกไฟล์ `.glb` ของอาหารทั้งรุ่น `full` และ `lite` ต้องใช้โครงสร้างเดียวกัน:

- **หน่วย**: เมตร (`1 unit = 1 m`), แกน `+Y` ชี้ขึ้น, แกน `+Z` ชี้หน้าจาน
- **จุดกำเนิด (Origin)**: `(0, 0, 0)` อยู่ที่กึ่งกลางก้นภาชนะด้านล่างสุด (`Vessel` มี `min.y ≈ 0` คลาดเคลื่อนไม่เกิน `±0.002 ม.`) เมื่อวางบนพื้นโต๊ะ (`y = 0.76 ม.`) หรือถาด (`y = 0.011 ม.`) จะไม่ลอยและไม่จม
- **ชื่อโหนดบังคับ (`FOOD_NODE_NAMES`)**:
  - `FoodRoot` (root group พร้อม `userData.foodContract`)
  - `Vessel` — จานหรือชาม (แสดงตลอดเวลาแม้กินหมดแล้ว ห้ามซ่อนหรือลบเมื่อสถานะเป็น `empty`)
  - `FoodFull` — ชิ้นส่วนอาหารเมื่อเสิร์ฟใหม่ (`progress = "full"`, `consumed <= 0.15`)
  - `FoodPartial` — ชิ้นส่วนอาหารเมื่อทานไปบางส่วน (`progress = "partial"`, `0.15 < consumed < 0.85`)
  - `FoodEmpty` — ร่องรอย/เศษอาหารเล็กน้อยก้นจานเมื่อทานหมด (`progress = "empty"`, `consumed >= 0.85`)
  - `Utensil` — ช้อน/ส้อม/มีด/ตะเกียบประจำจาน (อยู่ในขอบเขต footprint ไม่ยื่นชนจานข้างเคียง)

### พิกัด Anchor (`userData.foodContract.anchors`)

แต่ละโมเดลต้องแนบ `anchors` ใน `FoodRoot.userData.foodContract`:
- `baseOrigin`: `[0, 0, 0]`
- `rimGrip`: `[x, y, z]` จุดขอบจานสำหรับมือพนักงานประคองจาน
- `utensilRest`: `[x, y, z]` จุดวางอุปกรณ์บนจาน/ชาม
- `biteTarget`: `[x, y, z]` จุดศูนย์กลางคำอาหารสำหรับท่าตักอาหาร

---

## 4. งบประมาณโมเดลและการบีบอัด (Asset Budgets)

| รายการ | เกณฑ์รุ่น `full` | เกณฑ์รุ่น `lite` |
|---|---|---|
| จำนวนสามเหลี่ยมรวม (`Vessel + Full + Partial + Empty + Utensil`) | `≤ 8,000 triangles` | `≤ 2,000 triangles` |
| ขนาดไฟล์ GLB หลังบีบอัด | `≤ 300 KB (307,200 bytes)` | `≤ 100 KB (102,400 bytes)` |
| เส้นผ่านศูนย์กลาง Footprint (`max(size.x, size.z)`) | `0.14 – 0.26 ม.` | `0.14 – 0.26 ม.` |
| ความสูงรวม (`size.y`) | `0.025 – 0.16 ม.` | `0.025 – 0.16 ม.` |
| External textures / URIs | ห้ามมี (`0 external files`) | ห้ามมี (`0 external files`) |

- ทุก GLB บีบอัดด้วย `KHR_mesh_quantization` และ `EXT_meshopt_compression` ผ่าน `scripts/food-models/shared/index.mjs` เพื่อให้โหลดด้วย `createCharacterLoader()` (`GLTFLoader` + `MeshoptDecoder`) เดิมได้ทันที

---

## 5. การวางบนถาดและโต๊ะเล็ก (Fixtures)

- **ถาดเสิร์ฟ (`0.42 × 0.30 ม.`)**: `computeTraySlotOffsets(count)` จัดตำแหน่งได้สูงสุด 4 จานบนถาดโดยระยะห่างศูนย์กลางจานไม่ซ้อนทับและอยู่ในกรอบถาด
- **โต๊ะเล็ก 2 ที่นั่ง (`0.60 × 0.60 ม.`) และโต๊ะมาตรฐาน (`0.80 × 0.80 ม.`, `1.20 × 1.20 ม.`)**: `computeTablePlatePlacement(...)` คำนวณจุดวางจานหน้าเก้าอี้แต่ละตัวในพิกัดท้องถิ่นของโต๊ะ โดยไม่ล้นขอบโต๊ะและไม่ชนกันตรงกลางโต๊ะ

---

## 6. คำสั่ง Export แยกต่อชนิดอาหาร

```bash
node scripts/food-models/export-one.mjs --id <food-id> [--lite] [--output-dir <dir>] [--builder <module>]
```

- เขียนเฉพาะ `<food-id>.glb` หรือ `<food-id>-lite.glb` ในโฟลเดอร์ของ `<food-id>` เท่านั้น
- ห้ามแก้ไข `catalog.ts` หรือ `scripts/food-models/shared/` ในงาน `feat-104`–`feat-108`

