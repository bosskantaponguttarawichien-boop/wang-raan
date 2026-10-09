# วางร้าน (Wang-Raan) — Design System Specification

อัปเดต: 9 ตุลาคม 2026 · สถานะ: Living Design System v2.0  
อ้างอิงจากโค้ดจริงใน: [`design-html/index.html`](file:///Users/macintoshhd/wang-raan/design-html/index.html) (Landing Page) และ [`design-html/playground/index.html`](file:///Users/macintoshhd/wang-raan/design-html/playground/index.html) (Playground POC)  
เอกสารที่เกี่ยวข้อง: [PRD.md](file:///Users/macintoshhd/wang-raan/PRD.md) · [architecture.md](file:///Users/macintoshhd/wang-raan/architecture.md) · [SKILL.md](file:///Users/macintoshhd/wang-raan/SKILL.md)

---

## 1. ปรัชญาและหลักการออกแบบ (Design Philosophy & Core Principles)

ระบบดีไซน์ของ **"วางร้าน"** ออกแบบขึ้นบนหลักการที่เน้นความเรียบง่าย สบายตา ชัดเจน และใช้งานได้จริง โดยมีหัวใจหลัก 5 ประการ:

1. **น้ำเงิน–ขาว สงบ น่าเชื่อถือ (Calm Blue & White)**
   - โครงสร้างและส่วนควบคุมของ UI ทั้งหมดใช้เฉดสีน้ำเงิน เทาอมฟ้า และขาว เพื่อให้บรรยากาศสงบ โฟกัสกับเนื้องาน
   - สีโทนอุ่น (เช่น เหลืองเนย มิ้นต์ คอรัล) สงวนไว้สำหรับ**ภาพประกอบและชิ้นส่วน 3D เท่านั้น** ห้ามนำมาใช้เป็นสีพื้นหลัง UI หลัก
2. **ผังร้านคือพระเอก (Store Layout is Hero)**
   - ทุกหน้าจอที่ผู้ใช้เข้าถึงต้องมี "ผังร้าน" หรือ "กริดสเกลจริง" เป็นศูนย์กลางสายตา
   - ภาพประกอบและงานกราฟิกมีหน้าที่เสริมความเข้าใจ ห้ามนำภาพวาดมาวางบดบังหรือทดแทนตัวอย่างผังร้านจริง
3. **พื้นที่ว่างแต่ไม่โล่ง (Subtle Micro-details & Architectural Accents)**
   - เติมลูกเล่นของงานสถาปัตยกรรม เช่น ลายจุดกริดแบบพิมพ์เขียว (Blueprint dots), เส้นบอกระยะ (Dimension line), เส้นประแสดงทางเดิน (Dashed flow), ป้ายกำกับเอียงแบบสเก็ตช์ และวงกลมนำสายตา แทนการใช้กล่องทึบหรือบล็อกสีขนาดใหญ่
4. **ภาษาไทยเป็นหัวใจหลัก (Thai-First Typography & Accessibility)**
   - ออกแบบโดยคำนึงถึงสระบน/ล่างและวรรณยุกต์ภาษาไทยเป็นอันดับแรก ให้ `line-height` สูงพอ (1.4–1.5 สำหรับหัวข้อ และ 1.8–1.9 สำหรับเนื้อความ) ป้องกันสระชนกัน
   - ใช้ภาษาที่เป็นมิตร สั้นกระชับ หลีกเลี่ยงศัพท์เทคนิคยากๆ สื่อสารลำดับแนวคิดหลัก: *"จัดร้านก่อน แล้วค่อยจำลองลูกค้า"*
5. **การเคลื่อนไหวที่นุ่มนวลและปิดได้ (Subtle, Accessible Motion)**
   - ไมโครแอนิเมชันต้องนุ่มนวล เป็นธรรมชาติ (Ease / Cubic-bezier) เสริมการบอกสถานะ ไม่รบกวนสมาธิ
   - ทุกแอนิเมชันและทรานซิชันต้องถูกปิดอย่างสมบูรณ์แบบเมื่อผู้ใช้เปิดใช้งาน `prefers-reduced-motion` หรือเมื่อพิมพ์เอกสาร (`@media print`)

---

## 2. โทนสีและ Color Tokens (Color System & Design Tokens)

### 2.1 Core UI Tokens

| Token | ค่า Hex | คำอธิบายและตำแหน่งที่ใช้งาน |
| :--- | :--- | :--- |
| `--blue` | `#3b62f4` | สีหลักของแบรนด์: ปุ่มหลัก (Primary CTA), ลิงก์ Active, ตัวเน้นหัวข้อ, กรอบ Selection, วงกลมทางเข้า 3D |
| `--blue-hover` | `#2e50da` | สี Hover ของปุ่มหลักและปุ่มสร้างผัง |
| `--blue-soft` | `#edf1ff` | สีพื้นหลังไอคอนเครื่องมือ (`.item-icon`), แท็บที่เลือก, ป้ายข้อความ Active |
| `--blue-tint` | `#eff3ff` / `#f5f8ff` / `#f8faff` | สีพื้นหลังบล็อกฟีเจอร์ (`#eff3ff`), ป้ายสัญลักษณ์ FAQ (`#f5f8ff`), พื้นหลัง Section พิเศษ และบอดี้ Playground (`#f8faff`) |
| `--ink` | `#1e2b40` | สีข้อความหลัก, หัวข้อ H1/H2, แบรนด์, ค่าพิกัด |
| `--secondary` | `#66758a` | สีข้อความรอง, คำอธิบายย่อหน้า, ข้อมูลประกอบ |
| `--muted` | `#8492a5` | แคปชัน, คำใบ้ (Hint), ป้ายฟุตเตอร์, ลายเส้นวัดขนาด |
| `--line` | `#e8ecf3` (Landing)<br>`#e2e8f1` (Playground) | เส้นคั่นแบ่งสัดส่วน, ขอบการ์ด, เส้นแบ่งตาราง |
| `--surface` | `#f7f9fc` | พื้นหลังของพื้นที่ทำงาน (Canvas wrapper / Workspace) |
| `--focus` | `#a4b6ff` (Landing)<br>`#b7c5ff` (Playground) | วงแหวนโฟกัสเมื่อใช้คีย์บอร์ดนำทาง (Focus-visible ring) |
| `--toast` | `#233a57` | สีพื้นหลังของกล่องแจ้งเตือน Toast |

### 2.2 สถานะและการโต้ตอบ (Interactive & Status Tokens)

| Token / State | ค่า Hex | ตัวอย่างการใช้งาน |
| :--- | :--- | :--- |
| **Autosave Tokens** | | |
| `--save-saved` | `#2e9b78` | ข้อความสถานะบันทึกสำเร็จ |
| `--save-saved-dot` | `#84cdb4` / `#72c6ab` | จุดสถานะบันทึกอัตโนมัติแล้ว (Autosaved dot) |
| `--save-saving` | `#e5b762` | จุดสถานะกำลังบันทึกข้อมูล (Saving state) |
| **Validation Status Tokens (PRD C-05/C-06)** | | |
| `--status-ready` | `#2e9b78` | สถานะผลตรวจ **Ready** (ผ่านทุกกฎ พร้อมเริ่มจำลอง P2) |
| `--status-warning` | `#e5b762` | สถานะผลตรวจ **Warning** (ผ่านกฎจำเป็น มีข้อควรระวัง จำลอง P2 ได้) |
| `--status-blocked` | `#e4685d` | สถานะผลตรวจ **Blocked** (ไม่ผ่านกฎจำเป็น เริ่มจำลอง P2 ไม่ได้) |
| `--issue-ring-blocked` | `rgba(228, 104, 93, 0.25)` | วงแหวนสีแดงไฮไลต์รอบชิ้นงานที่ชน ผิดระยะ หรือเข้าไม่ถึง |
| `--issue-ring-warning` | `rgba(229, 183, 98, 0.25)` | วงแหวนสีส้ม/เหลืองรอบชิ้นงานที่มีคำเตือน (คับแคบ/อ้อม) |
| **Selection & UI Chrome** | | |
| `--status-bg` | `#ffffff` | พื้นหลังของ Floating Pill Status Bar ลอยกึ่งกลางล่าง |
| `--status-border`| `#dce5f2` | ขอบของ Floating Pill Status Bar |
| `--table-group-ring` | `rgba(59, 98, 244, 0.12)` | กรอบเน้นความสัมพันธ์ทั้งชุดของ Table Set เมื่อเลือกโต๊ะ |

### 2.3 สีกราฟิกและสัญลักษณ์บนผัง 2D (2D Layout Elements)

| องค์ประกอบ | ค่าสี Fill | ค่าสี Stroke / Border | รัศมีมน / รายละเอียดเส้นสาย |
| :--- | :--- | :--- | :--- |
| **ชุดโต๊ะ 2 ที่นั่ง (Table Set 2 seats)** | `#edf1ff` (โต๊ะ 0.8×0.8ม.) | `#8da6ef` (1.5px) | Radius 8px พร้อมเก้าอี้ 2 ฝั่ง (บน/ล่าง หรือ ซ้าย/ขวา) สอดใต้โต๊ะ 0.10 ม. |
| **ชุดโต๊ะ 4 ที่นั่ง (Table Set 4 seats)** | `#edf1ff` (โต๊ะ 1.2×1.2ม.) | `#8da6ef` (2px) | Radius 10px พร้อมเก้าอี้ 4 ฝั่งสอดใต้โต๊ะ 0.10 ม. หมุนตามโต๊ะทั้งชุด |
| **เก้าอี้ (Chair ในชุดโต๊ะ)** | `#f8f0e5` | `#d9ad7d` (1.5px) | ทรงกลมมน 0.45–0.50ม. สังกัดโต๊ะตนเอง มีจุดบอกทิศทางด้านหน้าเก้าอี้ |
| **ครัว (Kitchen)** | `#e8edf5` | `#9bb0c9` (2px solid) | Radius 4px + สัญลักษณ์เตา/เตรียมอาหาร (Cooktop grid `#c4d3e5`) ขนาดพื้นที่บริการชัดเจน |
| **เคาน์เตอร์ (Counter)** | `#e1e8f3` | `#aebed3` (1.5px) | Radius 4px + ช่องตำแหน่งเครื่องคิดเงิน (POS box) สี `#bdcce0` |
| **ผนัง/ขอบห้อง (Wall)** | — | `#b6c4d7` (4px solid) | ผนังทึบล้อมรอบพื้นที่ผังร้าน |
| **ทางเข้า (Entrance / Door)** | `#ffffff` | `#9eb1ca` (1.5px) | รัศมีสวิงประตูมน 56px, ตัวอักษร "เข้า" 10px สี `#6680a9` กว้าง 1.2ม. |
| **กริดย่อย (0.25 ม.)** | — | `#e9eef6` (1px) / `#e8edf5` (0.7px) | เส้นกริดย่อยแบ่งระยะละเอียด |
| **กริดหลัก (1.0 ม.)** | — | `#dce5f0` (1px) / `#dde5ef` (1px) | เส้นกริดหลักทุก 1 เมตร ช่วยกะระยะง่าย |
| **Selection Box** | — | `#3b62f4` (1.2px dashed `5 4`) | กรอบเส้นประสีน้ำเงินแสดงชิ้นงานที่กำลังถูกเลือก |

### 2.4 จานสีแสงเงาในมุมมอง Isometric 3D (3D Lighting Palettes)

โมเดล Isometric 3D คำนวณแสงแบบ 3 ทิศทาง (บน, ขวา, หน้า) จากทิศตะวันตกเฉียงเหนือ:

| ชิ้นงาน | หน้าบน (Top Slab) | หน้าขวา (Right Face) | หน้าหน้า (Front Face) | ฐาน/เสา/ขา (Posts & Legs) |
| :--- | :--- | :--- | :--- | :--- |
| **โต๊ะ (Table)** | `#d8e3ff` | `#adc2f5` | `#bfd0fb` | ขา 4 ต้น: `#9fb7ed`, `#7894d3`, `#8ea7df` (สูง 29) |
| **เก้าอี้ (Chair)** | `#f7d9ad` | `#dcad70` | `#efc58b` | ขา: `#cb955b`, `#aa7847`, `#bd8851` (สูง 14) / พนักพิง: `#e9bf86`, `#c99057`, `#dba96b` |
| **ครัว (Kitchen)** | `#e5ecf5` (สแตนเลส/ท็อปครัว) | `#aabaca` | `#c2d0df` | ตู้ครัวทึบ: `#b9c9db`, `#98aaba`, `#acbdce` (สูง 45) / ปล่องดูดควันจำลอง |
| **เคาน์เตอร์ (Counter)** | `#e4ebf5` (ท็อปบน) | `#afc0d5` | `#cbd7e6` | ตัวตู้: `#d2ddeb`, `#9eafc5`, `#bdcadb` (สูง 37) / POS: `#eff4fa`, `#aabbd0`, `#cad5e2` |
| **พื้นและผนัง 3D** | พื้น: `#fdfefe` | ขอบเส้นกริด: `#e1e8f2` | ผนังหลัง: `#eaf0fa` (เส้นขอบ `#b5c3d6` หนา 1.5px สูง 24) |
| **เงาตกกระทบ (Shadow)**| `#526f9f` (Opacity 0.13, เลื่อนลงแกน Y 5px) |

### 2.5 จานสีสำหรับภาพประกอบ (Illustration-Only Palette)

> **ข้อห้ามเด็ดขาด:** จานสีชุดนี้มีไว้สำหรับงานภาพประกอบ (Editorial Illustration) เท่านั้น **ห้ามนำมาใช้เป็นสีพื้นหลังหรือตัวอักษร UI**

- **Cobalt Blue:** `#3B62F4` — สีหลักของลายเส้นและรูปทรงกราฟิก
- **Navy Deep:** `#213B75` — ลายเส้นและเงาโครงสร้าง
- **Butter Yellow:** `#FFF0BD` — พื้นแสงนุ่มนวลด้านหลังตัวละคร/วัตถุ (ห้ามใช้เป็นสีพื้น UI)
- **Coral Warm:** `#F7A28C` — สีจุดเน้น เสื้อผ้า หรือของตกแต่งชิ้นเล็ก
- **Mint Green:** `#B9D9CF` — สีต้นไม้ ธรรมชาติ หรือโซนพักสายตา

---

## 3. ระบบตัวอักษร (Typography System)

```css
--font: "Noto Sans Thai", system-ui, -apple-system, "Tahoma", sans-serif;
```

โหลดจาก Google Fonts โดยรองรับน้ำหนัก:
- `400` (Regular) — เนื้อความทั่วไป, คำอธิบาย
- `500` (Medium) — หัวข้อการ์ด, ป้ายกำกับ, ตัวเน้น
- `600` (Semi-Bold) — หัวข้อ Section, ชื่อแบรนด์
- `650` (Bold Plus) — หัวข้อ H1 Hero เท่านั้น

### ตารางสเกลตัวอักษรและระยะบรรทัด (Type Hierarchy)

| ระดับ (Role) | ขนาด (Size) | น้ำหนัก | Line Height | Letter Spacing | คุณสมบัติพิเศษและการใช้งาน |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **H1 (Hero Landing)** | `clamp(44px, 4.6vw, 67px)`<br>*(มือถือ: `clamp(32px, 8.5vw, 43px)`)* | 650 | 1.4 – 1.45 | -1.5px (-0.8px มือถือ) | `text-wrap: balance`, วลีสำคัญใน `<span>` ใช้สี `--blue` |
| **H1 (Playground)** | `clamp(31px, 4vw, 49px)` | 650 | 1.35 | -1.3px | เน้นกระชับ กึ่งกลางหน้าจอ |
| **H2 (Section Heading)** | 32px *(มือถือ: 26–28px)* | 600 | 1.55 | -0.5px | หัวข้อประจำ Section กึ่งกลาง |
| **H2 (Contact Form)** | 30px *(มือถือ: 25–27px)* | 600 | 1.50 | -0.5px | หัวข้อส่วนติดต่อเรา |
| **H3 (Card / How Step)** | 19px – 20px | 500 | 1.60 | 0 | หัวข้อในการ์ดฟีเจอร์และขั้นตอน |
| **Body Lead (Intro)** | 17px *(มือถือ: 16px)* | 400 | 1.90 (1.80 มือถือ) | 0 | ย่อหน้านำใต้ Hero, `max-width: 430px–560px` |
| **Body (Default)** | 15px – 16px | 400 | 1.85 | 0 | เนื้อความทั่วไปใน Section |
| **Small / Form Body** | 14px *(ช่องกรอกมือถือ: 16px)* | 400–500 | 1.90 | 0 | ข้อความในฟอร์ม, เมนูบาร์, ข้อความอธิบายฟีเจอร์ |
| **Caption / Meta / Hint** | 12px – 13px | 400–500 | 1.55 – 1.75 | 0 | คำใบ้เครื่องมือ, ขนาดห้อง, บันทึกอัตโนมัติ |
| **Kicker / Eyebrow** | 13px – 14px | 500 | 1.50 | 0 | สี `--blue` มีเส้นประดับนำหน้า (`17px × 2px` หรือ `18px × 1px`) |

### กฎการตัดคำและจัดวางภาษาไทย (Thai Typography Rules)
1. **Line-height ขั้นต่ำ:** สำหรับภาษาไทย หัวข้อต้องมี `line-height >= 1.4` และเนื้อความต้อง `line-height >= 1.85` เพื่อป้องกันวรรณยุกต์และสระบน/ล่าง (เช่น อิ อี อึ อื ไม้เอก ไม้โท สระอุ สระอู) ทับซ้อนหรือถูกขอบกล่องตัด
2. **การรักษาคำสำคัญ:** ใช้ `white-space: nowrap` สำหรับวลีที่ไม่ควรแยกบรรทัดบนจอใหญ่ (เช่น `h1 span`) และอนุญาตให้ขึ้นบรรทัดใหม่ด้วย `white-space: normal` เมื่ออยู่ในจอมือถือขนาดเล็ก
3. **การป้องกันข้อความล้น:** ใช้ `overflow-wrap: break-word` หรือ `overflow-wrap: anywhere` กับหัวข้อและคำอธิบายในภาชนะยืดหยุ่น เพื่อป้องกันไม่ให้คำยาวดันความกว้างหน้าจอ

---

## 4. ระบบระยะห่าง เลย์เอาต์ และ Breakpoints

### 4.1 Spacing Tokens

```css
:root {
  --page-gutter: clamp(18px, 4vw, 52px);
  --section-space: clamp(44px, 6vw, 76px);
}
```

**สเกลระยะมาตรฐาน (4px Base Grid):**  
`4px` · `8px` · `12px` · `14px` · `16px` · `18px` · `20px` · `24px` · `28px` · `32px` · `42px` · `48px` · `52px` · `76px` · `88px`

### 4.2 ขอบเขตภาชนะ (Container Max-Widths)

| Container | Max-Width | วัตถุประสงค์ |
| :--- | :--- | :--- |
| **Page Header / Shell** | `1280px` | แถบเมนูด้านบนและโครงสร้างหน้าจอ |
| **Footer Shell** | `1176px` | ส่วนท้ายของเว็บไซต์ |
| **Hero Grid** | `1400px` | เลย์เอาต์ส่วน Hero แบบเปิดกว้างรองรับภาพโอบล้อม |
| **Hero Copy** | `560px` (ข้อความกึ่งกลาง) / `430px` (คำอธิบาย) | คุมความยาวบรรทัดให้อ่านง่าย |
| **Main Page Section** | `1100px` | ส่วนเนื้อหาฟีเจอร์และขั้นตอนการทำงาน |
| **FAQ Section** | `900px` | รายการคำถามที่พบบ่อย |
| **Playground Canvas** | `min(100%, 640px)` (POC) / `min(100%, 760px)` (Full App) | อาร์ตบอร์ดจัดผังร้าน |
| **Playground Workspace**| `100dvh - 60px` (Full Height) | เลย์เอาต์หน้าจอทำงานเต็มพื้นที่จอ ไม่มี Scrollbar ภายนอก |

### 4.3 Breakpoints & Responsive Behaviors (Desktop-First)

การเขียน Media Query ทั้งระบบใช้แนวทาง **Desktop-First (`max-width`)** เรียงลำดับจากใหญ่ไปเล็ก:

```
> 1200px  ────  จอคอมพิวเตอร์ขนาดใหญ่ แสดงภาพสองฝั่งและชิปตกแต่งลอยข้างผัง
≤ 1200px  ────  ซ่อนป้ายชิปตกแต่งข้างผัง (.preview-detail)
≤ 1100px  ────  เปลี่ยนภาพ Hero เป็นภาพสเก็ตช์เต็มฉากใต้ข้อความ ลด Padding
≤ 1020px  ────  Playground ยุบเป็น 2 คอลัมน์ (Tools | Canvas) และแถบ Selection ย้ายลงด้านล่าง
≤ 800px   ────  Header ปรับเป็น 2 แถว, เมนูแตะง่าย (min-height 44px), กริดฟีเจอร์และขั้นตอนเปลี่ยนเป็น 1 คอลัมน์
≤ 700px   ────  Playground สลับเป็น 1 คอลัมน์แนวตั้ง (Canvas อยู่บนสุด, Tools อยู่กลาง, Selection อยู่ล่าง)
≤ 600px   ────  แผงเครื่องมือผังตัวอย่างหมุนเป็นแนวนอนด้านบน, ปุ่ม CTA ขยายแตะง่าย (min-height 48px)
≤ 480px   ────  เมนู Header ปรับเป็น 2 × 2, ขั้นตอนเรียงเป็นแนวตั้ง (เลข → ภาพ → คำอธิบาย), บล็อกติดต่อเหลือ 1 คอลัมน์
≤ 390px   ────  Playground พาเล็ตต์ยุบเหลือ 1 คอลัมน์เดี่ยว, ซ่อนข้อความขนาดหัว Canvas เพื่อรักษาพื้นที่
```

---

## 5. รูปทรง เส้น และเงา (Shapes, Borders & Shadows)

### 5.1 Border Radius Tokens

| Token | ค่า | ตัวอย่างการใช้งาน |
| :--- | :--- | :--- |
| `--radius-xs` | `2px` – `5px` | กริด 3D, ขอบห้อง, สัญลักษณ์ Mark ย่อย, ป้ายสถานะห้อง (`.view-label`) |
| `--radius-sm` | `7px` – `9px` | ปุ่มเครื่องมือ (`.tool`), ช่อง Input, ปุ่ม Primary CTA, ปุ่ม Template, สัญลักษณ์ช่องทางติดต่อ |
| `--radius-md` | `12px` – `14px` | กล่องสัญลักษณ์ฟีเจอร์ (`.feature-symbol`), ป้ายชิปลอย (`.preview-detail`), กล่องข้อความ Contact |
| `--radius-lg` | `15px` – `18px` | การ์ด Artboard ผังร้าน (`.editor`, `.canvas-card`), กล่องเครื่องมือแบบลอย |
| `--radius-pill`| `999px` | Floating Status Bar กึ่งกลางล่างจอ |

### 5.2 Elevation & Box Shadows

| Token | ค่า Shadow | การใช้งาน |
| :--- | :--- | :--- |
| `--shadow-card` | `0 18px 48px -28px rgba(32, 57, 98, 0.19)` | การ์ด Artboard ผังร้านบน Landing |
| `--shadow-card-hover` | `0 22px 52px -27px rgba(32, 57, 98, 0.22)` | การ์ด Artboard เมื่อเมาส์ Hover |
| `--shadow-playground` | `0 17px 40px -32px rgba(29, 57, 97, 0.27)` | แผงควบคุมและ Artboard ใน Playground |
| `--shadow-chip` | `0 10px 30px -20px rgba(41, 71, 124, 0.21)` | ป้ายชิปลอยประดับข้างผังร้าน |
| `--shadow-status` | `0 8px 22px rgba(35, 59, 91, 0.08)` | Floating Pill Status Bar |
| `--shadow-iso` | `drop-shadow(0 18px 15px rgba(39, 74, 123, 0.09))` | โมเดล Isometric 3D SVG |

### 5.3 เส้นและการตีกรอบ (Borders & Strokes)
- **เส้นขอบทั่วไป:** เส้นบางคมชัด `1px solid var(--line)`
- **เส้นประ (Dashed Lines):** ใช้สื่อความหมายของ *"ทางเดินลูกค้า"* หรือ *"สิ่งที่ยังยืดหยุ่น/ขยับได้"* เช่น เส้นประ Selection `stroke-dasharray="5 4"`, วงแหวนข้างป้ายชิป `border: 1px dashed #c3d0f1`, และเส้นทางเดินในสเก็ตช์ `border: 2px dashed #a0b8f4`
- **Focus Visible Ring:** `outline: 3px solid #a4b6ff; outline-offset: 2px–5px;` สำหรับทุกองค์ประกอบที่โฟกัสได้ผ่านคีย์บอร์ด

---

## 6. อัตลักษณ์และโลโก้ (Brand Identity & Logos)

### 6.1 โลโก้ทางการ (Official Logo)
โปรเจกต์ใช้ไฟล์ SVG มาตรฐานจาก [`design-html/assets/logos/logo-wangraan-clear-channel.svg`](file:///Users/macintoshhd/wang-raan/design-html/assets/logos/logo-wangraan-clear-channel.svg):
- **สัดส่วน:** ViewBox `0 0 128 128` รัศมีขอบมนแบบกล่องอาคาร พร้อมช่องทางเดินโปร่งใสตรงกลาง (Clear Channel)
- **การไล่เฉดสีหลัก (Gradients):**
  - `navy`: `#1b3f77` → `#102c59` (โครงอาคารภายนอกและโซนขวา)
  - `blue`: `#1699ff` → `#1856ef` (ทางเดินและพื้นที่จัดวางหลัก)
  - `amber`: `#ffcc2f` → `#ff7313` (พื้นที่กิจกรรมและโซนเคาน์เตอร์)
- **ขนาดการแสดงผล:**
  - Header: `42px × 42px` (Landing) / `38px × 38px` (Playground)
  - Footer: `38px × 38px`

### 6.2 สัญลักษณ์สำรองแบบมินิมอล (Fallback Brand Mark)
ในกรณีที่ไม่สามารถโหลดไฟล์ SVG หรือในพื้นที่ UI ที่มีขนาดเล็กมาก สามารถใช้ Brand Mark แบบ CSS Grid ได้:
- กล่องสี่เหลี่ยมสีน้ำเงินขนาด `26px × 26px` รัศมีมน `10px`
- ภายในแบ่งเป็นจุดกริด 2 × 2 ช่องละ `8px` ช่องว่าง `4px`
- จุด 3 ช่องแรกเป็นเส้นกรอบสีขาวหนา `1.5px` และช่องล่างขวาเป็นพื้นสีขาวทึบ

---

## 7. รายละเอียดคอมโพเนนต์ (Component Specifications)

### 7.1 ปุ่มและตัวควบคุม (Buttons & Controls)

#### 1. Primary CTA Button (`.cta`, `.apply-size`)
- **การจัดสไตล์:** พื้นหลัง `--blue`, ตัวอักษรสีขาว, น้ำหนัก 500, ขอบมน 9px, Padding `15px 31px` (ขนาดหลัก) หรือ `11px 20px` (บน Header)
- **สถานะ:**
  - `Hover`: พื้นหลังเปลี่ยนเป็น `#2e50da`, Transition 0.18s
  - `Disabled`: ความทึบ 100%, ตัวชี้ `cursor: default`, คงสีไว้เพื่อความชัดเจนในการอ่าน และบอกสถานะด้วยข้อความแทน (เช่น "ส่งข้อความ (เร็วๆ นี้)")
  - `Focus-visible`: วงแหวนสี `#a4b6ff` หนา 3px

#### 2. Secondary & Action Button (`.action`)
- **การจัดสไตล์:** พื้นหลังสีขาว, เส้นขอบ `1px solid #dfe6f0`, ขอบมน 8px, ตัวอักษรสี `#4e627c`, ขนาด 13px, Padding `9px`
- **สถานะ:**
  - `Hover`: พื้นหลัง `#f7f9fd`, เส้นขอบ `#c5d3f4`
  - `Danger Variant` (เช่น ปุ่มลบชิ้นงาน): ตัวอักษรสี `#c75049`
  - `Disabled`: `opacity: 0.45`, `cursor: not-allowed`

#### 3. Palette Item Button (`.add-item`)
- **การจัดสไตล์:** กล่องแนวยาวเต็มคอลัมน์, พื้นหลังสีขาว, ขอบมน 9px, เส้นขอบ `1px solid #e4e9f2`
- **ส่วนประกอบภายใน:**
  - ไอคอนซ้ายมือในกล่อง `34px × 34px` พื้นหลัง `--blue-soft` ไอคอนสี `--blue`
  - ชื่อชิ้นงานตัวหนา 13px + ขนาดระบุหน่วยเมตรตัวเล็ก 11px สี `#8593a7`
  - เครื่องหมาย `+` สี `#7990dd` ขวามือสุด
- **รายการใน Palette (ตาม PRD C-01 และข้อสรุป V1):**
  1. **ชุดโต๊ะ 2 ที่นั่ง:** โต๊ะ 0.8×0.8ม. + เก้าอี้ 2 ตัว (ลูก)
  2. **ชุดโต๊ะ 4 ที่นั่ง:** โต๊ะ 1.2×1.2ม. + เก้าอี้ 4 ตัว (ลูก)
  3. **เคาน์เตอร์ (Counter):** ขนาด 2.4×0.7ม. (พร้อมช่อง POS)
  4. **ครัว (Kitchen):** ขนาด 2.0×1.5ม. (พร้อมจุดเตรียมอาหาร)
- **Hover:** เส้นขอบ `#afbef2`, พื้นหลัง `#f9faff`

#### 4. Segmented View Switch (`.view-switch`)
- รางเลื่อนสี `#f7f9fd` ขอบมน 7px ล้อมด้วยเส้นขอบ 1px
- ปุ่มภายในขนาด 12px, ปุ่มที่ไม่ได้เลือกสี `#75849a`
- ปุ่มที่เลือก (`aria-pressed="true"`): พื้นหลังสีขาว, ตัวอักษรสี `--blue`, น้ำหนัก 600, เงา `0 1px 3px rgba(24, 49, 91, 0.09)`

#### 5. Canvas Navigation & Zoom (`.canvas-nav`)
- ชุดปุ่มควบคุมการซูมชิดติดกัน ขอบมน 7px: `[ − ] [ 100% ] [ + ] [ พอดี ]`
- ความสูง 27px, หน้าปัดแสดงผลขนาดกว้างขั้นต่ำ 45px ใช้ตัวเลข Tabular Nums

---

### 7.2 อาร์ตบอร์ดและการจัดผัง 2D (2D Editor Artboard)

1. **สเกลและหน่วยวัด:** 
   - หน่วยในระบบคือ **เมตร (m)**
   - ความละเอียดในการวาง (Snap Grid) = **0.25 เมตร** (ปรับได้สูงสุด 2–30 เมตร)
2. **ระบบพื้นผิว (Stage Floor):**
   - แสดงลายเส้นตารางแบบไดนามิกผ่าน CSS Linear Gradients โดยใช้ตัวแปร `--width` และ `--depth`:
     - ลายกริดย่อย 0.25 ม. (4 ช่องต่อเมตร) สี `#e9eef6`
     - ลายกริดหลัก 1.0 ม. สี `#dce5f0`
   - เส้นขอบผนังร้านหนา `4px solid #b6c4d7`
3. **ทางเข้าของร้าน (Entrance Component):**
   - กว้างตามมาตรฐาน 1.20 ม. (ความกว้างทางเดินหลัก) หนา 0.20 ม. วางทับแนวผนัง
   - เลื่อนตำแหน่งได้ตามแนวผนังทั้ง 4 ด้าน (เหนือ, ใต้, ตะวันออก, ตะวันตก)
   - มีเส้นโค้งรัศมีการเปิดประตู (Swing Arc) 56px สี `#9eb1ca`
   - เมื่อลากหรือโฟกัสจะแสดงเงาตกกระทบสีน้ำเงิน `0 3px 3px #3b62f42b`
4. **พฤติกรรมการลากวางและการแสดงผล Issue (Non-blocking Drag & Validation Feedback):**
   - **วางได้อิสระ:** การลากวางวัตถุจะไม่ถูกบล็อกแม้เกิดการชนหรือทับกัน (ตาม PRD C-03 & Section 7) เพื่อให้ผู้ใช้ทดลองแนวคิดได้
   - **ชิ้นงานที่เลือก:** ขอบหนา 2px สี `--blue`, เงาประกาย `0 0 0 5px #3b62f422` หากเลือก `Table` จะแสดงกรอบเน้นความสัมพันธ์ของเก้าอี้ลูกทั้งชุด (`--table-group-ring`)
   - **ผลตรวจ Validation:**
     - ชิ้นงานที่มีข้อผิดพลาดระดับ **Blocked**: แสดงวงแหวนสีแดงรอบชิ้นงาน (`--issue-ring-blocked`)
     - ชิ้นงานที่มีข้อควรปรับปรุงระดับ **Warning**: แสดงวงแหวนสีส้ม/เหลืองรอบชิ้นงาน (`--issue-ring-warning`)
     - แถบสถานะด้านล่างสรุปจำนวน Issues และระบุชัดเจนว่าเริ่มจำลอง P2 ได้หรือไม่

---

### 7.3 สเปกเครื่องยนต์ 3D Isometric SVG (3D Isometric Engine)

การแสดงผลภาพ 3 มิติใช้ Pure SVG Projection โดยไม่ต้องพึ่งพาไลบรารีภายนอก:

#### 1. สูตรการฉายพิกัด (Isometric Projection Formula)
```javascript
const scale = Math.min(42, 430 / (width + depth));
const originX = 300;
originY = 58;

function point(x, y, z = 0) {
  return [
    originX + (x - y) * scale,
    originY + (x + y) * scale * 0.52 - z
  ];
}
```

#### 2. ลำดับการเรียงชั้นความลึก (Depth Sorting)
- วัตถุทุกชิ้นถูกวาดเป็นระนาบ Polygon (หน้าบน, หน้าข้างขวา, หน้าด้านหน้า)
- จัดลำดับการวาด (`layers.sort`) ตามค่า Depth:
  ```javascript
  const depth = x + y + w + h + depthOffset;
  ```
- เงาตกกระทบ (Shadow) ถูกวาดใต้ระนาบชิ้นงานเสมอ (`depth - 0.08`)

---

### 7.4 องค์ประกอบกราฟิกตกแต่งประจำแบรนด์ (Brand Micro-Elements)

1. **เส้นนำสายตา Kicker & Eyebrow:** เส้นทึบปลายมนหน้าข้อความ สี `--blue` กว้าง `17–18px` หนา `1–2px` ความทึบ 50–55%
2. **ลายจุดพิมพ์เขียว (Blueprint Grid Dots):** จุดสีฟ้า `#c8d5fb` ขนาด 1.6px จัดเรียงแบบกริดระยะ `13px × 13px` ความทึบ 60%
3. **ป้ายชิปลอยประดับข้างผัง (`.preview-detail`):**
   - กล่องสีขาวขอบมน 12px เงาฟุ้ง ลอยเอียง `-5°` (ฝั่งเฟอร์นิเจอร์) และ `+5°` (ฝั่งทางเดิน)
   - ล้อมรอบด้วยวงแหวนเส้นประขนาด `39px × 39px` สี `#c3d0f1`
4. **ตราสัญลักษณ์เครื่องหมายคำถาม FAQ (`.faq-emblem`):**
   - ป้ายกล่องพูดคุยขนาด `44px × 39px` ขอบมน 12px เส้นขอบหนา 1.5px สี `#9db4f7` พื้นหลังสีอ่อน `#f5f8ff`
   - หางบอลลูนเอียง `-30°` และมีจุดตกแต่งสี `#c0cffb` ทางขวาบน
5. **ภาพสเก็ตช์พิมพ์เขียวจำลอง (`.contact-sketch`):**
   - ผังกระดาษสเก็ตช์ 150px × 103px เอียง `-5°` มีลายเส้นกริด 12px
   - มีรูปจำลองครัว เคาน์เตอร์ ชุดโต๊ะ 4 ที่นั่ง เส้นประทางเดิน และกล่องแชตจำลอง 3 จุด

---

## 8. ระบบแอนิเมชันและการเคลื่อนไหว (Motion System)

### 8.1 จังหวะและการหน่วงเวลา (Timing & Curves)

| แอนิเมชัน | พารามิเตอร์ | รูปแบบและเป้าหมาย |
| :--- | :--- | :--- |
| **Reveal เมื่อเลื่อนหน้า** | 650ms `cubic-bezier(0.2, 0.7, 0.2, 1)` | ค่อยๆ ปรากฏขึ้น (`opacity: 0 → 1`, `translateY: 18px → 0`) โดยใช้ IntersectionObserver |
| **Stagger Delay** | หน่วงลำดับการ์ด `70ms` (ใบที่ 2) และ `140ms` (ใบที่ 3) | สร้างจังหวะการเปิดตัวแบบเป็นระเบียบ |
| **Hero Landing In** | 650ms–700ms `ease` (หน่วง 0.04s ถึง 0.35s) | เลื่อนข้อความและปุ่มเปิดตัวลงมาทีละบรรทัด |
| **Card Hover Lift** | 280ms `ease` (`translateY(-4px)`) | เฉพาะอุปกรณ์ที่มีเมาส์ละเอียด (`hover: hover and pointer: fine`) |
| **Menu Underline** | 240ms `ease` (`transform: scaleX(0 → 1)`) | ขีดเส้นใต้ขยายจากซ้ายไปขวาเมื่อ Hover หรือ Focus |
| **Spotlight Glow** | 300ms `ease` | แสงรัศมีวงกลม 260px สีน้ำเงินจาง (`#3b62f40a`) เคลื่อนตามตำแหน่งเคอร์เซอร์บน Artboard |
| **Accordion Dropdown** | 250ms `ease` (`answer-in`) | เลื่อนและแสดงคำตอบ FAQ อย่างนุ่มนวล |

### 8.2 ข้อกำหนด Accessibility Motion (Strict Prefers-Reduced-Motion)
เมื่อระบบตรวจพบว่าผู้ใช้ตั้งค่าลดการเคลื่อนไหว:
```css
@media (prefers-reduced-motion: reduce) {
  *, *:before, *:after {
    animation: none !important;
    transition: none !important;
    scroll-behavior: auto !important;
  }
  .reveal {
    opacity: 1 !important;
    transform: none !important;
  }
}
```

---

## 9. ข้อมูลและทรัพย์สินภาพประกอบ (Illustration Asset Inventory)

ภาพทั้งหมดต้องคงแนวทาง **Flat 2D Editorial**, เส้นสายคมสี Navy, รูปทรงเรขาคณิตมน และเว้นพื้นที่โปร่งใส:

| ชื่อไฟล์ | ขนาดจริง / ชนิด | การใช้งานในระบบ |
| :--- | :--- | :--- |
| [`assets/hero-store-surround.png`](file:///Users/macintoshhd/wang-raan/design-html/assets/hero-store-surround.png) | `1983 × 793` PNG | ภาพประกอบฉากโอบล้อมส่วน Hero บนจอ Desktop (เว้นพื้นที่ตรงกลาง 60% สำหรับตัวหนังสือ) |
| [`assets/store-planning-illustration.jpg`](file:///Users/macintoshhd/wang-raan/design-html/assets/store-planning-illustration.jpg) | JPG คุณภาพสูง | ภาพฉากทางเลือกสำหรับจอ Tablet และ Mobile (`max-width: 1100px`) แสดงใต้เนื้อความ |
| [`assets/store-steps-illustrations.png`](file:///Users/macintoshhd/wang-raan/design-html/assets/store-steps-illustrations.png) | PNG Sprite (`300% × 100%`) | ภาพประกอบขั้นตอน 3 ขั้น:<br>• ขั้น 1: `background-position: 0% 50%` (กำหนดพื้นที่)<br>• ขั้น 2: `background-position: 50% 50%` (จัดภายใน)<br>• ขั้น 3: `background-position: 100% 50%` (จำลองลูกค้า) |
| [`assets/logos/logo-wangraan-clear-channel.svg`](file:///Users/macintoshhd/wang-raan/design-html/assets/logos/logo-wangraan-clear-channel.svg) | SVG เวกเตอร์ | ตราสัญลักษณ์ทางการของวางร้าน |

---

## 10. มาตรฐานการเข้าถึง (Accessibility & Usability Standards)

- [x] **อัตราส่วนคอนทราสต์ (Contrast Ratio):** ข้อความหลัก (`--ink`) บนพื้นขาวมีคอนทราสต์ > `11:1` และข้อความรอง (`--secondary`) > `4.6:1` ผ่านเกณฑ์ WCAG 2.1 AA
- [x] **แป้นพิมพ์ควบคุม (Keyboard Navigation):** สามารถเลื่อน Focus ได้ครบทุกปุ่มและลิงก์ พร้อมแสดง Focus Ring ชัดเจน (`outline: 3px solid #a4b6ff`)
- [x] **เป้าหมายการแตะ (Touch Target Size):** บนหน้าจอมือถือ ปุ่มกดและเมนูนำทางทั้งหมดมีความสูงขั้นต่ำ `44px` ถึง `48px`
- [x] **การเลื่อนหน้าจอบนมือถือ (Non-blocking Touch Gesture):** ผังร้านตัวอย่างบนหน้า Landing มีการตั้งค่า `touch-action: pan-y` ป้องกันการดักการแตะเลื่อนหน้าจอของผู้ใช้
- [x] **คำบรรยาย Screen Reader (Accessible Semantics):**
  - ใช้ `role="application"` กับผังแก้ไข และ `role="img"` พร้อม `aria-label` ภาษาไทยอธิบายผังร้าน
  - ปุ่มเปลี่ยนมุมมองระบุ `aria-pressed="true/false"`
  - แจ้งเตือนสถานะการบันทึกด้วย `role="status"` และ `aria-live="polite"`

---

## 11. การนำไปใช้กับ Next.js 15 + Tailwind CSS v4

เพื่อเตรียมพร้อมสำหรับการย้ายโครงสร้างตามที่ระบุใน [`architecture.md`](file:///Users/macintoshhd/wang-raan/architecture.md) ให้นำโทเค็นเหล่านี้ไปแปลงเป็น Tailwind CSS v4 Theme ในไฟล์ `globals.css`:

```css
@import "tailwindcss";

@theme {
  --color-brand-blue: #3b62f4;
  --color-brand-blue-hover: #2e50da;
  --color-brand-blue-soft: #edf1ff;
  --color-brand-ink: #1e2b40;
  --color-brand-secondary: #66758a;
  --color-brand-muted: #8492a5;
  --color-brand-line: #e2e8f1;
  --color-brand-surface: #f7f9fc;
  --color-brand-danger: #e4685d;
  --color-brand-success: #2e9b78;
  --color-brand-warning: #e5b762;

  /* Validation Status Tokens */
  --color-status-ready: #2e9b78;
  --color-status-warning: #e5b762;
  --color-status-blocked: #e4685d;

  --font-thai: "Noto Sans Thai", system-ui, -apple-system, sans-serif;

  --radius-xs: 3px;
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-pill: 999px;
}
```
