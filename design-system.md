# วางร้าน — Design System

อัปเดต: 8 ตุลาคม 2026

ระบบดีไซน์นี้สรุปจากโค้ดจริงใน `dist/index.html` (Landing) และ `dist/playground/index.html` (Playground) ใช้เป็นแหล่งอ้างอิงเดียวเมื่อเพิ่มหรือแก้หน้าจอ

---

## 1. หลักการ

1. **น้ำเงิน–ขาว สงบ อ่านง่าย** — UI ใช้น้ำเงินกับเทาอมฟ้า สีอุ่น (เหลือง มิ้นต์ คอรัล) อยู่ในภาพประกอบเท่านั้น
2. **ผังร้านคือพระเอก** — ทุกหน้าควรมีผังหรือกริดให้เห็น ภาพประกอบเป็นตัวเสริม ไม่ใช่ตัวแทนผัง
3. **พื้นที่ว่างแต่ไม่โล่ง** — เติมไอคอนเล็ก ลายกริด เส้นประทางเดิน วงกลมเส้นบาง แทนการใส่บล็อกสีใหญ่
4. **ภาษาไทยก่อน** — line-height สูงพอสำหรับสระบน/ล่าง คำสั้น ไม่ใช้ศัพท์เทคนิค
5. **เคลื่อนไหวเบา ๆ** — ทุกแอนิเมชันปิดได้ด้วย `prefers-reduced-motion`

---

## 2. สี (Color tokens)

### Core

| Token | ค่า | ใช้กับ |
| --- | --- | --- |
| `--blue` | `#3b62f4` | ปุ่มหลัก ลิงก์ active ตัวเน้นหัวข้อ selection |
| `--blue-hover` | `#2e50da` | hover ของปุ่มหลัก |
| `--blue-soft` | `#edf1ff` | พื้นหลังไอคอน, tool active, badge |
| `--blue-tint` | `#eff3ff` / `#f5f8ff` / `#f8faff` | พื้น section อ่อน, feature symbol |
| `--ink` | `#1e2b40` | ข้อความหลัก หัวข้อ |
| `--secondary` | `#66758a` | ข้อความรอง คำอธิบาย |
| `--muted` | `#8492a5` | caption, hint, footer |
| `--line` | `#e8ecf3` (Landing) / `#e2e8f1` (Playground) | เส้นแบ่ง ขอบการ์ด |
| `--surface` | `#f7f9fc` | พื้นรอง พื้นที่ผัง |
| `--focus` | `#a4b6ff` | focus ring |
| `--toast` | `#233a57` | พื้น toast |

### สถานะ (Playground)

| Token | ค่า | ใช้กับ |
| --- | --- | --- |
| `--success` | `#2e9b78` | ข้อความสำเร็จ (จุดสถานะ `#84cdb4`) |
| `--danger` | `#e4685d` | ชิ้นงานทับ / ออกนอกพื้นที่ (ring `#e4685d25`) |
| `--warning` | `#e5b762` | กำลังบันทึก |

### เฟอร์นิเจอร์บนผัง

| ชิ้นงาน | Fill | Stroke | รูปทรง |
| --- | --- | --- | --- |
| โต๊ะ | `#edf1ff` | `#8da6ef` | radius 10px + ขาเก้าอี้ `#cad7fa` |
| เก้าอี้ | `#f8f0e5` | `#d9ad7d` | วงกลม |
| ชั้นวาง | `#e7edf3` | `#b5c3d3` | radius 3px + เส้นชั้น 3 ช่อง |
| เคาน์เตอร์ | `#e1e8f3` | `#aebed3` | radius 4px + ช่องเครื่องคิดเงิน |
| ผนัง/ขอบห้อง | — | `#b6c4d7` 4px | |
| กริด | เส้นย่อย `#e9eef6` · เส้นหลัก (1 ม.) `#dce5f0` | | |

### ภาพประกอบเท่านั้น (ห้ามใช้เป็นสี UI)

| ชื่อ | ค่า |
| --- | --- |
| Cobalt | `#3B62F4` |
| Navy | `#213B75` |
| Butter yellow | `#FFF0BD` |
| Coral | `#F7A28C` |
| Mint | `#B9D9CF` |

> **กติกา:** ข้อความบนพื้นขาวต้องใช้ `--ink` หรือ `--secondary` เท่านั้นสำหรับเนื้อหา `--muted` ใช้กับข้อความ ≥ 12px ที่ไม่สำคัญ

---

## 3. ตัวอักษร (Typography)

```css
--font: "Noto Sans Thai", system-ui, -apple-system, "Tahoma", sans-serif;
```

โหลดจาก Google Fonts น้ำหนัก 400 / 500 / 600 / 650 (ใช้ 650 กับ H1 เท่านั้น)

| Role | ขนาด | น้ำหนัก | line-height | letter-spacing |
| --- | --- | --- | --- | --- |
| H1 (hero) | `clamp(44px, 4.6vw, 67px)` | 650 | 1.4 | -1.5px |
| H2 (section) | 32px | 600 | 1.55 | -0.5px |
| H2 (contact) | 30px | 600 | 1.5 | -0.5px |
| H3 (card) | 19–20px | 500 | 1.6 | 0 |
| Body lead | 17px | 400 | 1.9 | 0 |
| Body | 15–16px | 400 | 1.85 | 0 |
| Small | 14px | 400 | 1.9 | 0 |
| Caption / hint | 12–13px | 400–500 | 1.55 | 0 |
| Kicker | 13–14px | 500 | — | 0 สี `--blue` + เส้นนำหน้า |

กฎภาษาไทย: line-height ขั้นต่ำ 1.5 สำหรับหัวข้อ และ 1.8 สำหรับเนื้อความ, ใช้ `white-space: nowrap` กับวลีสำคัญที่ไม่ควรถูกตัด (เช่น `h1 span`), ใช้ `overflow-wrap: anywhere` กับหัวข้อในพื้นที่แคบ

---

## 4. ระยะห่างและเลย์เอาต์

| Token | ค่า |
| --- | --- |
| `--page-gutter` | `clamp(18px, 4vw, 52px)` |
| `--section-space` | `clamp(44px, 6vw, 76px)` |
| สเกลช่องว่าง | 4 · 8 · 12 · 16 · 20 · 24 · 32 · 48 · 72 · 88 |

| คอนเทนเนอร์ | max-width |
| --- | --- |
| Header / Footer | 1176–1280px |
| Section ทั่วไป | 1100px |
| FAQ | 900px |
| Hero copy | 800px (ข้อความ description 430px) |
| ผังร้าน (Playground) | 640px |

### Breakpoints

| ความกว้าง | พฤติกรรม |
| --- | --- |
| > 1200px | ภาพประกอบสองฝั่ง hero, ป้ายตกแต่งข้างผัง |
| ≤ 1200px | ซ่อนป้ายข้างผัง |
| ≤ 1100px | ภาพ hero เปลี่ยนเป็นภาพเต็มฉากใต้ข้อความ |
| ≤ 800px | เมนูขึ้นแถวใหม่, grid 3 คอลัมน์ → 1, ติดต่อ 1 คอลัมน์ |
| ≤ 600px | แถบเครื่องมือผังย้ายขึ้นด้านบน |
| ≤ 480px | เมนู 2 × 2, ภาพขั้นตอนอยู่เหนือข้อความ |

เขียน media query แบบ **desktop-first (`max-width`)** ให้สอดคล้องโค้ดเดิม และวางกฎ responsive ไว้ท้าย `<style>`

---

## 5. รูปทรง เงา และเส้น

| Token | ค่า | ใช้กับ |
| --- | --- | --- |
| `--radius-xs` | 2–5px | กริด, badge ขนาดเล็ก, view-label |
| `--radius-sm` | 7–9px | input, ปุ่ม, tool, template |
| `--radius-md` | 12–14px | feature symbol, contact box, preview chip |
| `--radius-lg` | 16–18px | การ์ดผัง (editor), logo lab |
| `--shadow-card` | `0 18px 48px -28px #20396230` | การ์ดผัง |
| `--shadow-card-hover` | `0 22px 52px -27px #20396238` | การ์ดผังตอน hover |
| `--shadow-chip` | `0 10px 30px -20px #29477c35` | ป้ายตกแต่ง |
| `--ring-selected` | `0 0 0 5px #3b62f422` | ชิ้นงานที่เลือก |

เส้นทั้งหมดบาง 1–1.5px ใช้เส้นประ (`dashed`) เพื่อสื่อ "ทางเดิน" หรือ "สิ่งที่ยังไม่ถาวร"

---

## 6. คอมโพเนนต์

### ปุ่ม

| ชนิด | สไตล์ |
| --- | --- |
| Primary `.cta` | พื้น `--blue` ตัวขาว 17px/500, padding 15×31, radius 9px, hover `#2e50da` |
| Primary small `.header-cta` | 14px, padding 11×20 |
| Secondary / action | ขอบ `--line` พื้นขาว ตัว `--secondary`, hover ขอบ `#b4c4f2` |
| Icon tool `.tool` | 34×34 radius 7, ไอคอน 18px stroke 1.5, active พื้น `--blue-soft` ตัว `--blue` |
| Segmented `.view-switch` | ราง `#f7f9fd` ขอบ 1px radius 7, ปุ่มที่เลือกพื้นขาวมีเงาเล็ก |
| Disabled | คงสีเดิม `cursor: default` ไม่ลดความทึบ (ใช้ข้อความบอกว่า "เร็ว ๆ นี้" แทน) |

### อื่น ๆ

- **Kicker** — ข้อความสีน้ำเงิน 13px + เส้น 17×2px นำหน้า
- **Section heading** — กึ่งกลาง max 650px: kicker → H2 → คำอธิบาย
- **Feature card** — ไอคอนในกล่อง 44×44 พื้น `#eff3ff` radius 12, คั่นการ์ดด้วยเส้นตั้ง
- **How step** — ตัวเลข "01" สีน้ำเงิน + เส้นยาวตามหลัง, ภาพจาก sprite `store-steps-illustrations.png`
- **FAQ** — `<details>` เส้นคั่นบน–ล่าง, ไอคอน `+` / `−`
- **Editor card** — header (ชื่อ + ขนาดห้อง) · workspace (แถบเครื่องมือ 54px + พื้นที่ผัง) · footer (hint + สถานะ)
- **Input** — ขอบ `#e0e6ef` radius 7 padding 11×12, label อยู่เหนือช่อง
- **Status dot** — จุด 6px นำหน้าข้อความสถานะ (มิ้นต์ = บันทึกแล้ว, เหลือง = กำลังบันทึก, แดง = ผิดพลาด)
- **Toast** — ล่างกลางจอ พื้น `#233a57` ตัวขาว radius 10
- **Brand mark** — กล่องน้ำเงิน radius 10 ภายในเป็นกริด 2×2 ช่องละ 8px (ช่องล่างขวาทึบ) — ใช้จนกว่าจะเลือกโลโก้ใน `assets/logos/`

---

## 7. การเคลื่อนไหว

| ลูกเล่น | ค่า |
| --- | --- |
| Reveal เมื่อเลื่อน | opacity 0→1, translateY 18px→0, 650ms `cubic-bezier(.2,.7,.2,1)`, หน่วง 0 / 70 / 140ms ตามลำดับการ์ด |
| Hover การ์ด | translateY(-4px) 280ms — เฉพาะ `(hover:hover) and (pointer:fine)` |
| เส้นใต้เมนู | scaleX 0→1 240ms |
| แสงตามเมาส์บนผัง | radial-gradient 260px `#3b62f40a` |
| ซูมผัง | transform 160ms ease |

ต้องมี `@media (prefers-reduced-motion: reduce)` และ `@media print` ที่ปิดทุกอย่างข้างบน

---

## 8. ภาพประกอบ

- สไตล์ flat 2D editorial, รูปทรงเรขาคณิตมน, เส้น navy, ตัวละครอบอุ่นแบบมืออาชีพ
- ไม่มีตัวอักษร ตัวเลข โลโก้ หรือ UI ในภาพ
- ใช้พื้นหลังโปร่งใส และจำกัดสีเหลืองให้อยู่หลังภาพเท่านั้น
- ภาพ hero ต้องเว้นพื้นที่กลาง 60% ว่างสำหรับข้อความ
- Prompt ต้นฉบับ: `hero-illustration-prompt.txt`, `support-illustrations-prompt.txt` — ใช้ต่อยอดเพื่อให้สไตล์ตรงกัน

---

## 9. Accessibility checklist

- [ ] คอนทราสต์ข้อความ ≥ 4.5:1 (ระวัง `--muted` บน `--surface`)
- [ ] focus ring `3px solid #a4b6ff` offset 3–5px ทุกองค์ประกอบที่โต้ตอบได้
- [ ] เป้าแตะ ≥ 44×44px บนมือถือ
- [ ] `aria-label` ภาษาไทยสำหรับผัง SVG ชิ้นงาน และทางเข้า
- [ ] ข้อความสถานะใช้ `aria-live="polite"`
- [ ] ผังอนุญาตเลื่อนหน้าแนวตั้งด้วยนิ้วบน Landing (ผังตัวอย่างไม่ดักการแตะ)
