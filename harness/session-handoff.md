# Session Handoff — วางร้าน (Wang-Raan)

> **archive**: เก็บ 5 entry ล่าสุดเท่านั้น — รายการก่อนหน้าจะถูกย้ายไปเก็บที่
> `harness/archive/session-handoff-archive.md`

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
