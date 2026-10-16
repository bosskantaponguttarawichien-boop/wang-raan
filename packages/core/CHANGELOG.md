# Changelog — @bosskantaponguttarawichien-boop/wang-raan-core

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
