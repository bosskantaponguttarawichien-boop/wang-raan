---
name: wangraan-dev
description: ใช้เมื่อทำงานกับโปรเจกต์ "วางร้าน" (Store Designer & Customer Flow Simulation — Next.js 15, BFF, Zustand, Dual-Tier Validation และ POC ใน design-html/) — แก้ UI, เพิ่มฟีเจอร์ผังร้าน, จัดการ Table Set Hierarchy, พัฒนา Validation Engine, ตรวจ Responsive หรือเขียนเนื้อหาภาษาไทย ครอบคลุมกติกาดีไซน์ โครงสร้างไฟล์ และขั้นตอนตรวจงาน
---

# วางร้าน — Development Skill

คู่มือมาตรฐานสำหรับเอเจนต์และนักพัฒนาที่ทำงานในโปรเจกต์ **วางร้าน (Wang-Raan)** อ่านทำความเข้าใจก่อนเริ่มแก้หรือสร้างไฟล์ใด ๆ

---

## 1. เอกสารอ้างอิงหลัก

| ไฟล์ | ควรอ่านเมื่อ |
| :--- | :--- |
| [README.md](README.md) | ต้องการภาพรวมระบบ แผนที่เอกสาร และสรุปแนวทางการทำงาน |
| [PRD.md](PRD.md) | ต้องทราบฟีเจอร์ในขอบเขต, Data Model, กฎ Validation 4 ด้าน, ค่ามาตรฐานระยะ และ P1→P2 Contract |
| [architecture.md](architecture.md) | ปรับแก้ Core Logic, เพิ่ม Validation Rule, แก้ Zustand State, สร้าง BFF Route, หรือจัดการ Web Worker |
| [design-system.md](design-system.md) | แตะสไตล์ CSS, สี, ตัวอักษร, ขนาดระยะ, Breakpoints, 2D/3D Isometric Palettes, หรือ Tailwind Theme |

---

## 2. กฎเหล็กที่ห้ามละเมิด (Core Non-negotiable Rules)

1. **ผังร้านคือพระเอก:** ข้อความ Hero อยู่กึ่งกลางทุกขนาดจอ และผังตัวอย่างต้องอยู่ใต้ Hero เสมอ (ห้ามใช้ภาพประกอบมาทดแทนผังจริง)
2. **คุมโทนสี UI น้ำเงิน–ขาว:** ใช้โทนสีหลัก `--blue` (`#3b62f4`), `--ink` (`#1e2b40`), `--secondary` (`#66758a`) เท่านั้น ส่วนสีโทนอุ่น (เหลือง, มิ้นต์, คอรัล) สงวนไว้สำหรับภาพประกอบและโมเดล 3D ห้ามใช้เป็นพื้นหลัง UI
3. **ฟอนต์ Noto Sans Thai และ Line-height:** หัวข้อ `line-height >= 1.4` และเนื้อความ `line-height >= 1.85` ป้องกันสระและวรรณยุกต์ภาษาไทยทับซ้อน
4. **ครัว (Kitchen) แทนชั้นวาง (Shelf):** องค์ประกอบหลักของ V1 คือ Entrance, Kitchen, Counter, Table, Chair **ห้ามมี Shelf ในโมเดลของ V1**
5. **Table–Chair Hierarchy & Grouping:**
   - ห้ามแยกเก้าอี้เป็นวัตถุอิสระ เก้าอี้ทุกตัวต้องสังกัดโต๊ะ (`tableId`)
   - การเพิ่มโต๊ะต้องสร้างเก้าอี้ลูกตาม Preset (2 หรือ 4 ที่นั่ง) เสมอ
   - **Cascade Delete:** ลบ Table จะต้องลบ Chair ลูกทั้งหมดตามไปด้วยอัตโนมัติ
   - **Group Transformation:** เมื่อย้ายตำแหน่งหรือหมุน Table เก้าอี้ลูกทั้งหมดต้องเคลื่อนที่และหมุนตามทั้งชุด
6. **Non-blocking Canvas Placement:** ผู้ใช้สามารถลากวางวัตถุในตำแหน่งที่ชนหรือผิดกฎได้ชั่วคราวบน Canvas ห้ามเขียนโค้ดบล็อกการวางที่ Canvas แต่ให้รายงานผลผ่าน Validation Engine แทน
7. **P2 Validation Gate:** ก่อนเริ่ม P2 Simulation หรือส่งข้อมูลข้ามไปยัง P2 ผังต้องผ่านการตรวจ Validation และสถานะต้องเป็น **Ready** หรือ **Warning** เท่านั้น **หากมีข้อผิดพลาดระดับ Blocked ปุ่มเริ่มจำลองต้องถูก Disabled**
8. **Dual-Tier Validation:** เขียนลอจิกการตรวจผังทั้ง 4 ด้านเป็น Pure TypeScript ใน `src/core/validation/` เพื่อให้สามารถรันบน Client (Instant Feedback 0ms) และรันซ้ำที่ BFF Route Handler ก่อนบันทึกลงฐานข้อมูลได้
9. **Accessibility & Reduced Motion:** ทุกคอมโพเนนต์ต้องรองรับคีย์บอร์ด (Tab + Focus Ring), มี `aria-label` ภาษาไทย และปิดแอนิเมชันทั้งหมดเมื่อเปิด `prefers-reduced-motion` หรือสั่งพิมพ์ (`@media print`)

---

## 3. โครงสร้างไฟล์และโค้ด

- **โค้ดต้นแบบดีไซน์ (Design POC):**
  - `design-html/index.html` — Landing Page ต้นแบบ (HTML/CSS/JS ไฟล์เดียว) กฎ Responsive อยู่ท้าย `<style>`
  - `design-html/playground/index.html` — Playground POC ต้นแบบ
  - `design-html/assets/` — ภาพประกอบ, โลโก้ SVG ทางการ, Sprite ขั้นตอน
- **โครงสร้างแอปพลิเคชัน Next.js (ตาม [architecture.md](architecture.md)):**
  - `app/(marketing)/page.tsx` — Landing Page (Next.js Server Components สำหรับ SEO)
  - `app/(app)/playground/page.tsx` — 2D Canvas Editor, 3D Isometric View, และ Sim Controls
  - `app/api/layouts/` — BFF Route Handlers สำหรับจัดเก็บและตรวจสอบผัง
  - `src/core/validation/` — Pure TypeScript Validation (completeness, collision, clearance, accessibility, service-points)
  - `src/store/use-layout-store.ts` — Zustand Store สำหรับจัดการผังร้าน, History Undo/Redo (40 ขั้น), และผล Validation

---

## 4. ขั้นตอนและแนวทางการพัฒนา

### 4.1 แก้ไข UI / Styling
1. ตรวจสอบโทเคนใน [design-system.md](design-system.md) และใช้งานผ่าน CSS Variables หรือ Tailwind Theme Classes (เช่น `--status-ready`, `--status-warning`, `--status-blocked`, `--issue-ring-blocked`)
2. คงความคมชัดและเบาของ 2D Artboard โดยใช้ Hybrid DOM (% CSS) ร่วมกับ SVG และแสดงเส้นกริดด้วย CSS Linear Gradient
3. เขียน Media Query แบบ **Desktop-First (`max-width`)**: `1200px`, `1100px`, `800px`, `700px`, `600px`, `480px`, `390px`

### 4.2 พัฒนาและแก้ไข Logic ผังร้าน (Zustand & Core)
1. **การแปลงตำแหน่ง:** ใช้หน่วย **เมตร (m)** พิกัด Snap Grid ขั้นละ **0.25 เมตร** (ขนาดร้าน 2–30 เมตร)
2. **การแก้ไขผัง:** เมื่อมีการขยับ, หมุน, เพิ่ม หรือลบวัตถุใน Store ให้เรียก `invalidateValidation()` ทันที เพื่อให้ผลตรวจเดิมหมดอายุ และอัปเดต `layoutRevision`
3. **ระยะ Clearance มาตรฐาน V1:**
   - ทางเดินหลักที่จำเป็น: `1.20 ม.`
   - ทางเดินรองที่จำเป็น: `0.90 ม.`
   - พื้นที่เข้าถึง Chair: `0.60 ม.`
   - ระยะสอดใต้โต๊ะของ Chair: สูงสุด `0.10 ม.` (เฉพาะด้านหน้าเก้าอี้และโต๊ะของตนเอง)
4. **จุดบริการอัตโนมัติ (Service Points):** คำนวณจุดบริการของ Table, Kitchen, และ Counter จาก Bounding Box Geometry เพื่อใช้ตรวจ Accessibility

### 4.3 การเขียนเนื้อหาภาษาไทย
- ใช้ประโยคสั้นกระชับ 1 แนวคิดต่อประโยค และใช้คำว่า "คุณ" เรียกผู้ใช้
- สื่อสารลำดับแนวคิดหลัก: *"จัดร้านก่อน แล้วค่อยจำลองลูกค้า"*
- หลีกเลี่ยงศัพท์เทคนิคยากๆ ถ้ามีคำภาษาไทยที่เข้าใจง่าย

---

## 5. เช็กลิสต์ตรวจสอบงานก่อนส่งมอบ (Quality Assurance Checklist)

- [ ] **Responsive 6 Breakpoints:** ตรวจสอบบน Viewport กว้าง `320px`, `375px`, `480px`, `768px`, `1024px`, `1440px` — ไม่มีการเลื่อนแนวนอน (Horizontal Scrollbar), ข้อความไม่ล้น/ไม่ทับกัน
- [ ] **Table Set Lifecycle:**
  - เพิ่มโต๊ะ 2 ที่นั่ง หรือ 4 ที่นั่ง จะสร้างโต๊ะพร้อมเก้าอี้ลูกในระยะสอดใต้โต๊ะ (≤ 0.10 ม.) ทันที
  - หมุนหรือย้ายโต๊ะ เก้าอี้ลูกทั้งหมดต้องหมุนและย้ายตามทั้งชุด
  - ลบโต๊ะ เก้าอี้ลูกทั้งหมดต้องถูกลบตามไปด้วย (Cascade Delete) ไม่เหลือ Orphan Chair
- [ ] **Validation Engine & P2 Gate:**
  - ผังที่ไม่มี Entrance, Kitchen, Counter, หรือ Table Set → ขึ้นสถานะ **Blocked**
  - มีวัตถุชนกัน หรือเก้าอี้สอดโต๊ะเกิน 0.10 ม. → ขึ้นสถานะ **Blocked**
  - ทางเดินหลักแคบกว่า 1.20 ม. หรือเข้าไม่ถึงเก้าอี้/จุดบริการ → ขึ้นสถานะ **Blocked**
  - หากสถานะเป็น **Blocked** ปุ่ม "เริ่มจำลอง (Simulation)" ต้องถูกปิดการใช้งาน
  - เมื่อผังเป็น **Ready** หรือ **Warning** ปุ่มจำลองจึงจะกดได้
- [ ] **Accessibility (a11y):**
  - สามารถใช้แป้นพิมพ์ Tab เลื่อนและเห็น Focus Ring ชัดเจน (`outline: 3px solid #a4b6ff`)
  - อาร์ตบอร์ดและเฟอร์นิเจอร์มี `role` และ `aria-label` ภาษาไทยครบถ้วน
  - เปิด `prefers-reduced-motion` แล้วแอนิเมชันทั้งหมดถูกระงับ
- [ ] **คอนโซลสะอาด:** ไม่มี JavaScript Error หรือ Unhandled Promise Rejections บน Browser Console
- [ ] **Unit Tests ผ่านครบ:** รัน `npm test` หรือ `vitest` ผ่าน 100% ครอบคลุมกฎ Core Validation ทั้ง 4 ด้าน
