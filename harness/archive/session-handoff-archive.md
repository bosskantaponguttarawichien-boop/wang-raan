## 2026-10-16 ICT — feat-070 ปรับฉาก 3D ตามคำขอผู้ใช้ (เสร็จแล้ว)

- ถอด Person GLB ค่าเริ่มต้นก่อนจำลอง โดยระหว่าง P2 Simulation ยังคงสร้างตัวละครเดินตามผลเดิม
- แก้ความขัดกันของ dev server/.next cache แล้ว และปรับกล้อง ThreeView เป็น isometric จริง; QA ณ เวลานั้น `npm test` 822/822, typecheck และ lint ผ่าน

## 2026-10-15 ICT — feat-066 เมนูเดียวของ Playground

- ผังของฉัน + ส่งออก/แชร์ อยู่ในเมนูโปรเจกต์ (หมวด) แล้ว — E2E ที่อ้างปุ่ม "ส่งออก" / `#myProjectsLink` เปลี่ยนเป็นผ่านเมนู
- dev server: แก้คลาส Tailwind ใน `.tsx` แล้วต้อง `rm -rf .next` (cache ไม่ invalidate)
## 2026-10-15 ICT — feat-068 จำลองลูกค้าใน 3D

- 3D แสดงลูกค้าจำลอง + heatmap แล้ว (`src/components/simulation/iso-simulation-overlay.tsx`) พร้อม mock ท่าทางเดิน, รอคิว, สั่ง, นั่งทาน และเดินออก
- มี visual mock และ asset 2.5D สำหรับทิศทางการออกแบบตัวละคร; QA ณ เวลานั้น `make test` 822/822 และ `make lint` ผ่าน

## 2026-10-15 ICT — feat-070 Three.js Runtime (เสร็จแล้ว)

- มุมมอง 3D ใช้ Three.js แบบ lazy-load, มี SVG fallback/reduced motion และโมเดล local GLB ที่เชื่อมกับผลจำลอง
- QA ณ เวลานั้น: `npm test` 822/822, typecheck, lint ผ่าน
