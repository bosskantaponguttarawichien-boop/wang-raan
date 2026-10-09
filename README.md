# วางร้าน (Wang-Raan) 🍽️📐

> **เว็บแอปพลิเคชันสำหรับออกแบบและจำลองผังร้านอาหารระดับมืออาชีพ**  
> *"จัดร้านก่อน แล้วค่อยจำลองลูกค้า"* — ใช้งานง่าย โหลดเร็ว คมชัดทุกขนาดหน้าจอ และเข้าถึงได้ทุกคน (Accessibility)

---

## 📌 สารบัญเอกสารโครงการ (Project Documentation)

โครงการนี้มีเอกสารข้อกำหนด สถาปัตยกรรม และระบบดีไซน์ที่ผ่านการอนุมัติและอัปเดตสอดคล้องกันอย่างสมบูรณ์:

| เอกสาร | รายละเอียด | บทบาทหลัก |
| :--- | :--- | :--- |
| 📄 [PRD.md](PRD.md) | **Product Requirements Document (Playground P1 V1)** | ขอบเขตฟังก์ชัน, โมเดลข้อมูล, กฎ Validation 4 ด้าน, และสัญญาส่งต่อ P1 → P2 |
| 🏗️ [architecture.md](architecture.md) | **Frontend Architecture (Next.js + BFF v2.0)** | โครงสร้างระบบ Next.js 15, Tech Stack, Zustand State, Dual-Tier Validation, และ P2 Simulation |
| 🎨 [design-system.md](design-system.md) | **Living Design System Specification v2.0** | โทเค็นสี, ระบบตัวอักษรภาษาไทย, สเปก 2D/3D Isometric, คอมโพเนนต์ และ Tailwind v4 Theme |
| 🛠️ [SKILL.md](SKILL.md) | **Development Guidelines & Agent Skill** | กฎเหล็กที่ห้ามละเมิด, ลำดับขั้นตอนการพัฒนา, และเช็กลิสต์ตรวจสอบงานก่อนส่งมอบ |

---

## 🚀 สรุปชุดเทคโนโลยี (Tech Stack)

สถาปัตยกรรมของ **วางร้าน** ยึดหลักการเบา คมชัด ไม่พึ่งพา Engine 3D ขนาดใหญ่โดยไม่จำเป็น:

- **Core Framework:** Next.js 15+ (App Router, React 19)
- **Styling:** Tailwind CSS v4 + Design Tokens ตาม [design-system.md](design-system.md)
- **UI Components:** Shadcn UI + Radix UI Primitives (WCAG 2.1 AA / ARIA ภาษาไทย)
- **Editor State:** Zustand (รองรับ Undo/Redo 40 ขั้น, Auto-save, และ Group Transformation)
- **Validation Engine:** Pure TypeScript + Zod (Dual-Tier: Client 0ms Instant Feedback + BFF Server Re-check)
- **2D Editor Artboard:** Hybrid DOM (% CSS) + SVG คมชัดทุกความละเอียด พร้อม Snap Grid 0.25 ม.
- **3D Preview:** Pure SVG Isometric Matrix Projection (ไม่ต้องโหลด Three.js/WebGL)
- **P2 Simulation Engine:** Web Worker + Canvas Overlay (0.25m Occupancy Grid & Flow-Field Pathfinding)
- **Testing:** Vitest (Coverage > 95% สำหรับ Core Logic & Validation) + Playwright (E2E & Responsive 6 Breakpoints)

---

## 🧩 องค์ประกอบและกฎของระบบผังร้าน (P1 Store Designer V1)

### 1. วัตถุหลักในผังร้าน (Core Entities)
- **ทางเข้า (Entrance):** วางบนผนัง 4 ทิศ (เหนือ, ใต้, ตะวันออก, ตะวันตก) กว้างมาตรฐาน 1.20 ม.
- **ครัว (Kitchen):** พื้นที่ประกอบอาหารและจุดเตรียมอาหาร (ขนาดเริ่มต้น 2.0 × 1.5 ม.)
- **เคาน์เตอร์ (Counter):** จุดชำระเงินและบริการ (ขนาดเริ่มต้น 2.4 × 0.7 ม. พร้อม POS)
- **ชุดโต๊ะและเก้าอี้ (Table Set):**
  - **ชุดโต๊ะ 2 ที่นั่ง:** โต๊ะ 0.8 × 0.8 ม. พร้อมเก้าอี้ลูก 2 ตัว
  - **ชุดโต๊ะ 4 ที่นั่ง:** โต๊ะ 1.2 × 1.2 ม. พร้อมเก้าอี้ลูก 4 ตัว

### 2. ความสัมพันธ์และวงจรชีวิต (Table–Chair Lifecycle)
- **Hierarchy:** เก้าอี้ทุกตัวต้องสังกัดโต๊ะ (`tableId`) และโต๊ะเป็นเจ้าของเก้าอี้ (`chairIds`)
- **Group Transform:** เมื่อย้ายตำแหน่งหรือหมุนโต๊ะ เก้าอี้ลูกทั้งหมดจะเคลื่อนที่และหมุนตามทั้งชุด
- **Cascade Delete:** เมื่อลบโต๊ะ เก้าอี้ลูกทั้งหมดที่สังกัดโต๊ะนั้นจะถูกลบไปด้วยอัตโนมัติ
- **Tuck-in Rule:** เก้าอี้สามารถสอดใต้โต๊ะของตนเองได้สูงสุด 0.10 ม. (เฉพาะจากด้านหน้าเก้าอี้)

### 3. ระบบตรวจผัง 4 ด้าน (Layout Validation Engine)
ระบบอนุญาตให้ผู้ใช้วางวัตถุผิดกฎหรือชนกันชั่วคราวได้บน Canvas เพื่อทดลองแนวคิด แล้วตรวจสอบผ่าน **Validation Engine**:
1. **Completeness:** ต้องมี Entrance, Kitchen, Counter, Table, และ Chair ที่ใช้งานได้อย่างน้อย 1 ชิ้น
2. **Collision:** ตรวจการทับซ้อนของวัตถุทุกคู่ และการออกนอกขอบร้าน
3. **Clearance:** ทางเดินหลัก ≥ 1.20 ม., ทางเดินรอง ≥ 0.90 ม., ทางเข้าถึงเก้าอี้ ≥ 0.60 ม.
4. **Accessibility:** ลูกค้าเดินจาก Entrance ถึงเก้าอี้ทุกตัวได้ และพนักงานเข้าถึงจุดบริการอัตโนมัติของ Table, Kitchen, และ Counter ได้

### 4. สถานะผลตรวจและ P2 Validation Gate
- 🟢 **Ready:** ผ่านทุกกฎจำเป็น ไม่มีคำเตือน → **เริ่มจำลอง P2 ได้**
- 🟡 **Warning:** ผ่านกฎจำเป็นทั้งหมด แต่มีจุดคับแคบ/ควรปรับปรุง → **เริ่มจำลอง P2 ได้**
- 🔴 **Blocked:** ผิดกฎจำเป็นข้อใดข้อหนึ่ง → **เริ่มจำลอง P2 ไม่ได้ (ปุ่มถูกปิด)**

---

## 📁 โครงสร้างโปรเจกต์ (Repository Structure)

```text
wang-raan/
├── PRD.md                               ← ข้อกำหนดผลิตภัณฑ์ V1 (Approved)
├── architecture.md                      ← สถาปัตยกรรมระบบ Frontend & BFF v2.0
├── design-system.md                     ← คู่มือระบบดีไซน์และโทเค็น v2.0
├── SKILL.md                             ← ข้อปฏิบัติการพัฒนาและเช็กลิสต์สำหรับ Agent
├── README.md                            ← สรุปภาพรวมและแผนที่เอกสารโครงการ
├── design-html/                         ← โค้ด POC ต้นแบบ (Static HTML/CSS/JS)
│   ├── index.html                       ← Landing Page ต้นแบบ
│   ├── assets/                          ← ภาพประกอบและโลโก้ SVG
│   └── playground/                      ← 2D/3D Playground POC ต้นแบบ
├── app/                                 ← Next.js App Router (ตาม architecture.md)
│   ├── (marketing)/                     ← Landing Page (Server Components)
│   ├── (app)/playground/                ← 2D/3D Editor & Simulation Client
│   └── api/                             ← BFF Route Handlers (/api/layouts, /api/share)
└── src/
    ├── core/validation/                 ← Dual-Tier Validation Engine (Pure TypeScript)
    ├── components/                      ← Shadcn UI, Editor 2D, Preview 3D, Validation Bar
    ├── store/                           ← Zustand Layout Store (Cascade Delete & Group Transform)
    └── workers/                         ← Web Worker จำลองลูกค้า P2
```

---

## 🎯 แนวทางการพัฒนา (Development Workflow)

1. **ศึกษาข้อกำหนด:** อ่าน [PRD.md](PRD.md) และ [architecture.md](architecture.md) ก่อนเริ่มเขียนโค้ด Core Logic หรือ API
2. **รักษาระบบดีไซน์:** ใช้ CSS Variables และ Theme Tokens จาก [design-system.md](design-system.md) ห้ามสร้างสีหรือขนาดใหม่โดยพลการ
3. **ตรวจสอบความถูกต้อง:** รัน Unit Test (`vitest`) ครอบคลุมกฎ Validation ทั้ง 4 ด้าน และทดสอบ Responsive 6 Breakpoints (`playwright`) ตามที่ระบุใน [SKILL.md](SKILL.md)
