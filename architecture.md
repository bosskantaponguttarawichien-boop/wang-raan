# วางร้าน — Architecture

อัปเดต: 8 ตุลาคม 2026

เอกสารนี้อธิบาย **สถาปัตยกรรมปัจจุบัน** (static, ไม่มี build) และ **สถาปัตยกรรมเป้าหมาย** เมื่อขยายไปสู่การจำลองลูกค้าและระบบบัญชี ส่วนเป้าหมายเป็นข้อเสนอ ยังไม่ได้ตัดสินใจ

---

## 1. สถาปัตยกรรมปัจจุบัน (P0–P1)

```text
landing/
├── HANDOFF.md · PRD.md · architecture.md · design-system.md · SKILL.md
├── hero-illustration-prompt.txt
├── support-illustrations-prompt.txt
└── dist/                          ← โฟลเดอร์ที่เผยแพร่ได้ทันที
    ├── index.html                 ← Landing (HTML + CSS + JS ในไฟล์เดียว)
    ├── assets/
    │   ├── hero-store-surround.png       (ภาพสองฝั่ง hero, จอ > 1100px)
    │   ├── store-planning-illustration.jpg (ภาพเต็มฉาก, จอ ≤ 1100px)
    │   ├── store-steps-illustrations.png (sprite 3 ขั้นตอน)
    │   └── logos/                         (ตัวเลือกโลโก้ 8 แบบ)
    └── playground/
        ├── index.html             ← Playground POC (ไฟล์เดียว)
        ├── README.md
        └── assets/logos/
```

### หลักการ

- **Zero-build, zero-dependency** — เปิดไฟล์ HTML ได้ตรง ๆ, ภายนอกมีแค่ Google Fonts
- **Single-file pages** — แต่ละหน้ามี `<style>` และ `<script>` แบบ inline
- **Progressive enhancement** — เนื้อหาอ่านได้แม้ JS ไม่ทำงาน; JS เพิ่ม reveal, FAQ animation, pointer glow

### Landing (`dist/index.html`)

| ส่วน | เทคนิค |
| --- | --- |
| ผังตัวอย่าง | SVG `viewBox="0 0 480 360"` (1 ม. = 60 หน่วย), pattern กริดย่อย 15 / หลัก 60 |
| FAQ | `<details>/<summary>` เนทีฟ |
| Reveal | `IntersectionObserver` + class `.reveal` / `.motion-ready` |
| Pointer glow | ตั้ง CSS var `--pointer-x/y` บน `.editor` |
| Logo lab | เก็บตัวเลือกใน `localStorage['wangraan-logo-choice']` (ชั่วคราว) |
| Responsive | media query ท้าย `<style>` คือชุดที่ใช้จริง; CSS ด้านบนบางส่วนถูก override |

### Playground (`dist/playground/index.html`)

**State model** — แหล่งความจริงเดียว เก็บใน `localStorage['wang-ran-playground-v1']`

```ts
type Side = 'top' | 'bottom' | 'left' | 'right';
type ItemType = 'table' | 'chair' | 'shelf' | 'counter';

interface Item {
  id: string;          // `item-${Date.now()}-${random}`
  type: ItemType;
  x: number; y: number; // เมตร มุมซ้ายบน, snap 0.25
  w: number; h: number; // เมตร ก่อนหมุน
  rotation: 0 | 90 | 180 | 270;
}

interface State {
  width: number;  // 2–30 ม.
  depth: number;  // 2–30 ม.
  door: { side: Side; position: number /* 0–100 % */ };
  items: Item[];
}
```

**Catalog** (ขนาดมาตรฐาน, เมตร): โต๊ะ 1.2×1.2 · เก้าอี้ 0.6×0.6 · ชั้นวาง 0.6×1.8 · เคาน์เตอร์ 2.4×0.7

**การไหลของข้อมูล**

```text
ผู้ใช้ (pointer / keyboard / form)
   │
   ▼
handler (add, startDrag/moveDrag/endDrag, rotate, delete, applyTemplate, moveDoor)
   │ snapshot() → history[] (สูงสุด 40)
   ▼
state  ──► fits() / isSpaceFree() / findSpot()   (ตรวจชน AABB + ขอบห้อง)
   │
   ├──► render()      → DOM ปุ่ม .furniture วางด้วย % ของห้อง
   ├──► renderIso()   → SVG isometric (box / slab / shadow ต่อชนิด)
   ├──► renderAdvice()→ รายการคำแนะนำ
   └──► save()        → debounce 180ms → localStorage
```

- 2D editor ใช้ **DOM + CSS %** (ไม่ใช่ canvas) เพื่อให้ได้ focus/ARIA ฟรี; กริดวาดด้วย `linear-gradient` อิง CSS var `--width/--depth`
- 3D เป็น **SVG isometric ที่ derive จาก state** ไม่มีเอนจิน 3D
- ซูมใช้ `transform: scale(var(--canvas-zoom))`

### ข้อจำกัดที่รู้แล้ว

- โค้ดไฟล์เดียว ~50 KB ต่อหน้า แก้ยากเมื่อโตขึ้น, CSS ซ้ำซ้อนจากการ override
- ไม่มี test อัตโนมัติ
- ภาพ PNG รวม ~2.5 MB ยังไม่บีบอัด
- ข้อมูลอยู่ในเบราว์เซอร์เดียว ไม่มี sync/แชร์
- schema localStorage ไม่มีฟิลด์ `version` สำหรับ migration

---

## 2. สถาปัตยกรรมเป้าหมาย (P2–P3, ข้อเสนอ)

### ทางเลือกที่แนะนำ

| ชั้น | ตัวเลือก | เหตุผล |
| --- | --- | --- |
| Framework | **Vite + React + TypeScript** (หรือ Vue หากทีมถนัด) | ระบบนิเวศใหญ่, แยกคอมโพเนนต์ได้ |
| State | Zustand / reducer + immer, undo ผ่าน patches | state ผังเป็น JSON เดียว ทำ undo/redo ง่าย |
| 2D editor | คง DOM/SVG ไว้ (แปลงจาก POC) | accessibility ดีกว่า canvas |
| 3D | SVG isometric ต่อ; Three.js เมื่อจำเป็นจริง | ลดขนาด bundle |
| จำลองลูกค้า | **Web Worker** + กริดเดินได้ 0.25 ม. + A\* / flow-field + agent loop | ไม่บล็อก UI |
| Styling | CSS variables จาก [design-system.md](design-system.md) | คงหน้าตาเดิม |
| Landing | static (Astro หรือคง HTML เดิม) | SEO, โหลดเร็ว |
| Backend (P3) | Supabase หรือ Firebase (Auth + Postgres/Firestore + Storage) | ไม่ต้องดูแลเซิร์ฟเวอร์เอง |
| Hosting | Cloudflare Pages / Vercel / Netlify | static + preview ต่อ PR |
| Test | Vitest (logic), Playwright (E2E + responsive 320–1440) | |

### โครงสร้างโค้ดเป้าหมาย

```text
apps/
├── landing/                 static
└── app/
    └── src/
        ├── domain/          ← logic ล้วน ไม่มี DOM (test ได้)
        │   ├── layout.ts        State, Item, catalog, fits, findSpot, rotate
        │   ├── validation.ts    ทางเดินขั้นต่ำ, ทางเข้าถูกบัง
        │   ├── persistence.ts   serialize + schema version + migrate
        │   └── simulation/
        │       ├── grid.ts      rasterize ผัง → occupancy grid
        │       ├── pathfind.ts  A* / flow-field
        │       ├── agents.ts    พฤติกรรมลูกค้า
        │       └── worker.ts    รันใน Web Worker
        ├── features/
        │   ├── editor/      2D canvas, toolbar, inspector
        │   ├── preview3d/
        │   └── simulate/    ตั้งค่า, เล่น/หยุด, heatmap, สรุปผล
        ├── ui/              ปุ่ม, input, toast ตาม design system
        └── styles/tokens.css
```

### การไหลของการจำลอง (P2)

```text
State (ผังที่ valid) ─► grid.rasterize() ─► Worker
                                            │  spawn agents ตามอัตรามาถึง
                                            │  loop: เลือกเป้าหมาย → pathfind → เดิน → รอคิว
                                            ▼
                         postMessage(frame / heatmap / metrics) ─► UI render
```

### Persistence

| ระยะ | ที่เก็บ | หมายเหตุ |
| --- | --- | --- |
| P1 | localStorage | เพิ่ม `{ version: 1 }` และฟังก์ชัน migrate |
| P1.5 | ส่งออก/นำเข้า JSON | กันข้อมูลหาย |
| P3 | ฐานข้อมูลบนคลาวด์ | ตาราง `layouts(id, owner_id, name, data jsonb, version, updated_at)` + Row Level Security |

### ความปลอดภัย

- ห้ามเก็บข้อมูลส่วนตัวใน URL; ลิงก์แชร์ใช้ id สุ่มที่เดาไม่ได้
- ตรวจ schema ของ JSON ที่นำเข้า (เช่น zod) ก่อนใช้
- ฟอร์มติดต่อ: ส่งผ่าน serverless function + rate limit + CAPTCHA ฝั่งผู้ให้บริการ

---

## 3. แผนการย้าย (Migration path)

1. เพิ่ม `version` ใน schema localStorage ของ POC
2. แยก logic ล้วน (`fits`, `findSpot`, `dims`, template) ออกเป็นโมดูล + เขียน unit test
3. ตั้งโปรเจกต์ Vite ย้าย Playground ทีละ feature โดยคงหน้าตาเดิม
4. จัดระเบียบ CSS ของ Landing (ลบกฎที่ถูก override) และบีบอัดภาพเป็น WebP/AVIF
5. เชื่อมปุ่ม "เริ่มจัดร้าน" → Playground
6. สร้าง simulation ใน Worker (P2)
7. เพิ่ม Auth + cloud save (P3)
