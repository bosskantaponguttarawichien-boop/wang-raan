# Changelog — @bosskantaponguttarawichien-boop/wang-raan-core

## 2.0.0 — 2026-10-18

Breaking change — ครัวเป็นห้องแยก (feat-081–090)

- `StoreLayout` มีฟิลด์ใหม่ `kitchenDoor: KitchenDoor | null` (ประตูครัวบนผนัง `{ id, wall, position, width }`) แทนกล่องครัวบนพื้น — `FurnitureType` ไม่มี `"kitchen"` แล้ว
- `StoreLayoutSchema` แปลงผังรุ่นก่อนให้อัตโนมัติ (Zod preprocess → `migrateLayoutData`): กล่องครัวกลายเป็นประตูครัวบนผนังที่ใกล้ที่สุด จึงยังรับ payload รุ่น 1.x ได้ — Backend ที่ใช้ 1.x ปฏิเสธผังที่มี `kitchenDoor` ด้วย 400 INVALID_LAYOUT_SCHEMA
- ผังที่เก็บไว้ในฐานข้อมูลเป็นรูปแบบเดิมต้องผ่าน `migrateLayout` ก่อนเรียก `validateLayout`
- Validation: Completeness (ไม่มีประตูครัว → Blocked), ประตูครัวทับทางเข้า/ไม่อยู่บนผนัง, เส้นทางพนักงานไปถึงประตูครัว (ทางเดินรอง 0.90 ม.)
- `CounterSchema` รับ `style` (ไม่บังคับ): `variant` · `color`
- เพิ่ม `core/layout/migrate` (`migrateLayoutData`, `migrateLayout`, `kitchenDoorFromLegacy`) และค่าคงที่ `KITCHEN_DOOR_DEFAULT_WIDTH`

## 1.1.0 — 2026-10-16

เพิ่มเติม (ไม่มี breaking change)

- `TableSchema` / `ChairSchema` รับ `style` (ไม่บังคับ): โต๊ะ `shape` · `legStyle` · `color`, เก้าอี้ `kind` · `legStyle` · `color` — Backend ที่ใช้ 1.0.0 ปฏิเสธผังที่มี `style` ด้วย 400 INVALID_LAYOUT_SCHEMA
- `SaveLayoutRequestSchema` รับ `name` (ไม่บังคับ, 1–80 ตัวอักษรหลัง trim)
- Table set: กำหนดจำนวนเก้าอี้ตามความจุของโต๊ะ (`setTableSetChairCount` และฟังก์ชันคำนวณความจุ), ผังตัวอย่าง, ตัวหาตำแหน่งว่าง
- `formatter` สำหรับข้อความผลตรวจ; ใช้ค่า epsilon ร่วมกันใน geometry / validation

## 1.0.0 — 2026-10-10

เวอร์ชันแรก (feat-037)

- โมเดลผัง: types, ค่าคงที่ (Grid 0.25 ม., ร้าน 2–30 ม., Clearance V1), geometry, table-set lifecycle (Cascade Delete, Group Transform)
- Validation Engine 4 ด้าน (`validateLayout`) และ `computeLayoutRevision`
- Zod schemas: `StoreLayoutSchema`, `SaveLayoutRequestSchema`, `ValidationResultSchema`, `P1LayoutContractSchema`, `ContactSchema`
- รองรับ ESM + CommonJS + type declarations; `zod ^3.25` เป็น peer dependency
