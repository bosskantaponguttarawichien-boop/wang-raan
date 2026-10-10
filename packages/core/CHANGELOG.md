# Changelog — @bosskantaponguttarawichien-boop/wang-raan-core

## 1.0.0 — 2026-10-10

เวอร์ชันแรก (feat-037)

- โมเดลผัง: types, ค่าคงที่ (Grid 0.25 ม., ร้าน 2–30 ม., Clearance V1), geometry, table-set lifecycle (Cascade Delete, Group Transform)
- Validation Engine 4 ด้าน (`validateLayout`) และ `computeLayoutRevision`
- Zod schemas: `StoreLayoutSchema`, `SaveLayoutRequestSchema`, `ValidationResultSchema`, `P1LayoutContractSchema`, `ContactSchema`
- รองรับ ESM + CommonJS + type declarations; `zod ^3.25` เป็น peer dependency
