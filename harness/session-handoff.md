# Session Handoff — วางร้าน (Wang-Raan)

> **archive**: เก็บ 5 entry ล่าสุดเท่านั้น — รายการก่อนหน้าจะถูกย้ายไปเก็บที่
> `harness/archive/session-handoff-archive.md`

## 2026-10-28 ICT — ลูกค้าดึงเก้าอี้ออกก่อนนั่ง แล้วดันเข้า (3D)

- **ผลลัพธ์**: เก้าอี้ใน 3D แยกเป็น object ที่ขยับได้ (ไม่รวมกับเฟอร์นิเจอร์อื่น); นั่ง = ดึงเก้าอี้ออก 0.3 ม. → นั่งลง → ดันเก้าอี้พร้อมคนเข้าโต๊ะ, ลุก = เลื่อนออก → ลุก → เดินไป แล้วเก้าอี้เลื่อนกลับ (`seat-motion.ts`, `three-view.tsx`)
- **การตรวจ**: `seat-motion.test.ts` 3 ข้อ, `npm test` 981 ผ่าน, ESLint + `tsc` ผ่าน, ดูภาพ Chromium 3D
- **ข้อควรรู้**: เป็นภาพอย่างเดียว engine ไม่รู้เรื่องเก้าอี้เลื่อน; เวลาเลื่อนเป็นวินาทีจริง ไม่คูณความเร็วจำลอง; 2D/SVG fallback ยังไม่มีภาพเก้าอี้เลื่อน

## 2026-10-28 ICT — มือถือรันโค้ดจำลองรุ่นเก่า (พนักงานหาย / รอหน้าเข้า undefined)

- **ผลลัพธ์**: ต้นเหตุคือ `public/sw.js` ส่งไฟล์เริ่ม worker ของ Turbopack (`turbopack-worker-*.js` ชื่อเดิมทุก build) จากแคชตรง ๆ — worker ได้ URL พร้อม `#params` (รายชื่อ chunk) ของ build ที่แคชครั้งแรก จึงรัน engine รุ่นเก่า (ไม่มี staff / waitingEntrance) แก้โดยห่อ response ใหม่ให้ worker ใช้ URL ของคำขอปัจจุบัน และขึ้น `VERSION` เป็น v3 ล้างแคชเก่า
- **การตรวจ**: Playwright (iPhone 13, profile เดิมที่มี SW) — ก่อนแก้ build ใหม่ยังรันโค้ดเก่า, หลังแก้ deploy ถัดไปได้โค้ดใหม่ทุกครั้ง; `npm test` 978 ผ่าน; จำลองบนมือถือ 2D/3D เห็นพนักงานครบ
- **ข้อควรรู้**: มือถือที่เปิดอยู่ต้องโหลดหน้าใหม่ 1–2 ครั้งหลัง deploy ให้ SW v3 ทำงาน

## 2026-10-28 ICT — Code Review: คืนทรัพยากรถาด 3D และแก้ CRLF ใน test design tokens

- **ผลลัพธ์**: Review โค้ด commit `1e6a8fc` ผ่านการตรวจสอบ boundary, แก้ memory leak ใน `three-view.tsx` เพิ่ม disposal ทรัพยากรถาดเสิร์ฟ (`trayGeometry`, `trayRimGeometry`, `trayMaterial`), และแก้ CRLF normalization ใน `src/test/design-tokens.test.ts`
- **การตรวจ**: `design-tokens.test.ts`, `staff-pacer.test.ts`, `staff-visual.test.ts` ผ่านครบ 100%, `npm run lint` ผ่าน, `python scripts/validate_harness.py` ผ่าน
- **ข้อควรรู้**: การรัน vitest ทั้งหมด 77 ไฟล์พร้อมกันบน Windows อาจเกิด timeout จาก CPU workload แต่เมื่อทดสอบแยกตามชุดไฟล์ผ่านปกติทั้งหมด

## 2026-10-28 ICT — พนักงานเดินให้พอดี ไม่ชิดผนัง ถือถาด แวะครัว 5 วิ

- **ผลลัพธ์**: พนักงานบนจอเดิน 1.4 ม./วินาทีจริงที่ x1 (`staff-pacer.ts`), เส้นทางห่างผนัง 0.35 ม. (`WALL_CLEARANCE`), เดินเข้าประตูครัวหายไป 5 วินาทีแล้วถือถาดมีจานออกมาเสิร์ฟ (3D `createTray`)
- **การตรวจ**: `npm test` 978 ผ่าน (เหลือ 3 failure เดิมนอกขอบเขต), ESLint ไฟล์งานและ `tsc --noEmit` ผ่าน
- **ข้อควรรู้**: รหัส 5 (`STAFF_KITCHEN_CODE`) เป็นรหัสเฉพาะภาพ ไม่ได้มาจาก engine — ผู้วาดต้องข้ามคนที่อยู่ในครัว; เวลารอในครัวย่อตามความเร็วเล่นภาพ (x5 = 1 วินาทีจริง); ยังไม่ได้ตรวจด้วยตาใน Chromium

## 2026-10-27 ICT — ลูกค้าเดินมาจากนอกร้าน + แถวรอนอกประตู (feat-100)

- **ผลลัพธ์**: ลูกค้าใหม่เดินมาจากนอกร้านเข้าประตู, รอโต๊ะเป็นแถวนอกร้าน, กลับแล้วเดินออกไปนอกร้าน (`walk-pacer.ts`)
- **การตรวจ**: `npm test` 965, `make lint` ผ่าน, Chromium 3D
- **ข้อควรรู้**: waiting-entrance เปลี่ยนรหัสเป็น 6; 2D ยังไม่เห็นคนนอกร้าน; ผู้ใช้จะทำงานต่อบนเครื่อง local (pull branch นี้)

## 2026-10-27 ICT — พฤติกรรมร้านตามที่ตั้งไว้ (feat-099)

- **ผลลัพธ์**: เล่นภาพตั้งแต่เปิดร้าน (ร้านว่าง); พนักงานหน้าร้านเดินรับออร์เดอร์ ไปรับอาหารที่ประตูครัวมาเสิร์ฟ และเก็บโต๊ะ (`staff-visual.ts`); x1 = เวลาจริง ช่วงไม่มีใครเดินเล่นเร็วเอง (`skipQuiet`)
- **การตรวจ**: `npm test` 961, `make lint` ผ่าน, Chromium 2D/3D
- **ข้อควรรู้**: easeIn (feat-097) ถูกลบแล้ว; ปรับความเร็วช่วงเงียบที่ `QUIET_SPEED`; ยังไม่มีภาพโต๊ะสกปรก

## 2026-10-27 ICT — ภาพลูกค้าเดินเท่าคนจริง (feat-098)

- **ผลลัพธ์**: ลูกค้าบนจอ (2D / isometric / 3D) เดิน 1.4 ม./วินาทีจริงที่ x1 ตามทางที่จำลองจริง; เวลาและผลจำลองไม่เปลี่ยน (`walk-pacer.ts`, `Simulation.trackPaths`)
- **การตรวจ**: `npm test` 959, `make lint` ผ่าน, Chromium ภาพต่อเนื่องเห็นเดินช้า
- **ข้อควรรู้**: ปรับความเร็วภาพที่ `VISUAL_WALK_SPEED`, ระยะตามหลังสูงสุดที่ `MAX_VISUAL_LAG_SECONDS`; ยังไม่ได้ตรวจ 3D ใน browser รอบนี้

## 2026-10-27 ICT — เริ่มจำลองแบบค่อย ๆ เร่ง (feat-097)

- **ผลลัพธ์**: กดเริ่มจำลอง → ภาพเริ่มตอนลูกค้ากลุ่มถัดไปถึงประตู เดินเท่าของจริง 6 วิ แล้วค่อย ๆ เร่งถึงความเร็วที่เลือกใน 4 วิ (`easeIn` ใน START, ค่าคงที่ใน `worker-runtime.ts`)
- **การตรวจ**: `npm test` 951 ผ่าน, `make lint` ผ่าน, Chromium ตรวจนาฬิกาจำลองค้างช่วงแรกแล้วเร่ง
- **ข้อควรรู้**: หลังเร่งแล้วลูกค้าที่เข้ามาภายหลังยังเคลื่อนที่เร็วตาม x1 = 1 นาที/วินาที (ผู้ใช้เลือกแบบนี้แทนการชะลอภาพตลอดเวลา); ผู้ใช้ส่งคำขอเป็นข้อ "1" อาจมีข้อถัดไปเรื่องจำลองร้านตามมา

## 2026-10-27 ICT — แก้ Cloudflare Preview Build (feat-091)

- **สาเหตุและผลลัพธ์**: dependency ที่ไม่เกี่ยวกับงาน UI ถูกติดไปกับ commit `aa5030a`: `zod` 3 → 4 และ OpenNext Cloudflare 1.20.13 → 1.20.9. Zod v4 ทำให้ `next build` ล้มตอน TypeScript ใน mock backend, form schema และ layout import. คืนสอง package และ lockfile แล้ว `npm run build` ผ่านครบ.
- **การตรวจ**: `npm run lint`, `git diff --check` ผ่าน. `npm test` ยังมี baseline failure 1 ข้อที่ design-token assertion (`globals.css`) ซึ่งไม่เกี่ยวกับ CI failure ครั้งนี้. `npm run cf:build` บน Windows ทำซ้ำไม่ได้เพราะ OpenNext อ่าน parent directory ไม่ได้ตามข้อจำกัด Windows; Cloudflare จะใช้ Linux.
- **Cloudflare log**: GitHub เปิดเผย Build ID `f2a6995b-7b58-4b96-a0b1-3b888156c1b7`; dashboard ต้อง login จึงอ่านรายละเอียดเพิ่มไม่ได้. ให้ผลของ `npm run build` เป็นหลักฐานยืนยันก่อน rerun preview.

## 2026-10-27 ICT — Customer/Staff behavior (feat-096)

- **ผลลัพธ์**: ร้านอาหารแบบ A ใช้ 1 agent = 1 กลุ่ม (สุ่ม 1–4 คน), โต๊ะใช้ได้ทีละกลุ่ม; ไม่มีโต๊ะสะอาดที่พอให้ยืนรอหน้าเข้า; จ่ายและออกแล้วโต๊ะสกปรกจนพนักงานเก็บเสร็จ
- **พนักงาน**: จัดงาน เสิร์ฟ → รับเงิน → เก็บโต๊ะที่ปลดล็อกคิวหน้าเข้า → รับออเดอร์ → เก็บโต๊ะทั่วไป
- **การตรวจ**: simulation core 28 tests, day-analysis 6 tests และ lint ผ่าน
- **ข้อควรรู้**: `customersPerHour`/metrics ยังนับเป็น “คน”; visual 1 ตัวแทนทั้งกลุ่ม จึงยังไม่แสดงเพื่อนร่วมกลุ่มครบทุกคนใน 2D/3D; 48 เก้าอี้ที่มีเพียง 12 โต๊ะไม่เท่ากับ 48 กลุ่ม เพราะไม่อนุญาตให้แชร์โต๊ะ

## 2026-10-27 ICT — หมุนมุมมองแบบ smooth (feat-091 follow-up)

- **ผลลัพธ์**: ปุ่มหมุนของ Playground มีแอนิเมชัน 480 ms ใน 2D และ 620 ms ใน 3D; 3D กล้องโคจรเป็น arc รอบร้านพร้อมไล่ orthographic frame ทุกค่า และ key light ถูกตรึงใน world-space (ไม่ย้าย/fit ใหม่เมื่อเปลี่ยนมุมมอง). พื้นและเฟอร์นิเจอร์เป็นชั้นคงที่; ผนัง วงกบ บาน ธรณี และพรมประตูใช้ material ของผนังด้านเดียวกัน สร้างครบ 4 ด้านเพียงชุดเดียวเมื่อผังเปลี่ยน แล้วไล่ opacity รายด้านพร้อมกล้อง แทนการ cross-fade room สองชุด. จึงไม่มีฐานประตูลอยค้างบนพื้น กรอบประตู หรือเงาซ้อน/โผล่ตามหลังระหว่างหมุน. reduced motion ยังใช้ SVG fallback ที่ไม่เคลื่อนไหว.
- **การตรวจ**: targeted Vitest 4 files / 42 tests, ESLint ไฟล์งาน, diff check และ localhost:3000 หลัง full reload กดหมุนหลายมุม; จับภาพก่อน/หลังและระหว่างแอนิเมชันยืนยันว่าไม่มีกรอบ บาน หรือฐานประตูจากฉากเก่าซ้อน และไม่มี console error.
- **ข้อควรรู้**: `npm test` ทั้งชุดล่าสุด 940/947 ผ่าน แต่มี 7 failure นอกขอบเขต (Zod v4/schema ใน `mock-backend`, `forms/schemas.ts`, `core/io/layout-file.ts`, heading design token, timeout UX และ guest-merge ที่เหลือ state จาก quota test); `tsc --noEmit` ล้มจาก Zod v4 type/schema เดิม. อย่าแก้รวมกับงานแอนิเมชัน.
## 2026-10-23 ICT — จำลองร้าน 1 วัน ครบ (feat-094, feat-095)

- **ผลลัพธ์**: กด "จำลองร้าน 1 วัน" → worker จำลองทั้งวันเบื้องหลัง (~0.5 วิ ผังตัวอย่าง, ~2.4 วิ ผัง 48 ที่) → การ์ดตอบ 3 ข้อ (จ้างกี่คน / อาหารต้องออกภายในกี่นาที / โต๊ะพอไหม) → เล่นภาพช่วงคนเยอะแล้วหยุดเอง
- **การตรวจ**: `make test` 943, `make lint` ผ่าน; Playwright chromium a11y/playground-ux/keyboard/responsive ผ่าน; Chromium จริงที่ 1280 และ 320 px
- **ถัดไป**: (ยังไม่มีใน feature_list) พนักงาน/พ่อครัวเดินให้เห็นใน 2D/3D, จำค่าตั้งค่าไว้กับโปรเจกต์, ตัวเลือกประเภทร้าน A/B เมื่อมีหลายร้าน
- **ข้อควรรู้**: axe "ระหว่างจำลอง" 1440px ล้ม 1 ครั้งแล้วรันซ้ำผ่าน — ถ้า CI ล้มอีกให้ดู error-context; ค่าฟอร์มอยู่ใน simulation store เท่านั้น (รีเฟรชแล้วกลับค่าตั้งต้น); `analyzeDay` ใช้พนักงานหน้าร้านเต็ม (8) ตอนหาพ่อครัว — ถ้าเปลี่ยนลำดับค้นหาต้องแก้เทสต์ day-analysis

## 2026-10-23 ICT — Simulation ร้านอาหารแบบ A (feat-093)

- **ผลลัพธ์**: ตัวจำลองเล่นร้านอาหารตามสั่งแบบ A (นั่ง → รับออร์เดอร์ → ครัว → เสิร์ฟ → ทาน → จ่ายที่เคาน์เตอร์) พร้อมพนักงาน/พ่อครัว/เวลาต่อจาน/ช่วงพีค/ปิดร้าน; แบบ B เดิมยังใช้ได้ด้วย `serviceStyle: "counter-order"`
- **การตรวจ**: `make test` 927, `make lint` ผ่าน; Chromium จำลองผังตัวอย่าง
- **ถัดไป**: feat-094 (วิเคราะห์ทั้งวัน + หาจำนวนพนักงาน + เล่นช่วงพีค) → feat-095 (แผง 3 ส่วนตามร่าง + การ์ดคำตอบ); gate feat-094 ต้องยืนยันเกณฑ์ "กำลังดี" และค่าตั้งต้นใน PRD §9 ข้อ 28
- **ข้อควรรู้**: UI ตอนนี้ยังส่งแค่ `customersPerHour` → ค่าอื่น worker ใช้ค่าตั้งต้นแบบ A (ผังตัวอย่าง 6 ที่ ลูกค้าเต็มเร็วแล้วกลับเยอะ เป็นเรื่องปกติ); พนักงานยังเป็นคิวงาน ไม่มีตัวเดินบนผัง; อย่าใช้ `this.random` กับสิ่งที่ขึ้นกับสถานะร้าน (ใช้ `seatRandom`) ไม่งั้นลูกค้าชุดจะเปลี่ยนตามจำนวนพนักงาน

## 2026-10-23 ICT — มือถือเท่าเดสก์ท็อป + PWA

- **ผลลัพธ์**: มือถือมีปุ่มซูม/หมุนมุมมอง แถบสถานะ และสถานะบันทึกครบ; ติดตั้งเป็นแอปได้ (manifest + Service Worker) และเปิดหน้าจัดผังออฟไลน์ได้
- **การตรวจ**: `make test` 918, `make lint` ผ่าน; next build/start + Chromium มือถือ (ออฟไลน์ reload, 320–1440 px ไม่มีเลื่อนแนวนอน)
- **ข้อควรรู้**: แก้ `public/sw.js` ต้องเพิ่ม `VERSION` เพื่อล้างแคชเก่า; SW ลงทะเบียนเฉพาะ production (dev ไม่มี); `/playground/[id]` (ผังออนไลน์) ยังไม่เปิดออฟไลน์ — จะได้หน้า /offline แทน

## 2026-10-21 ICT — ปรับโมเดล (หน้า มือ เสื้อผ้า หมวก ผม รักแร้) + performance ฉาก 3D

- **ผลลัพธ์**: แก้ทุกข้อจากรีวิวโมเดลยกเว้นคอ; หมวกแก๊ป 6 ชิ้น; ผมมีแสก/ชั้น; ฉาก 3D สามเหลี่ยมต่อเฟรมลด ~70% และโหลดไฟล์ตอนเปิดลดจาก 828 → 220 KB
- **การตรวจ**: `make test` 910, `make lint` ผ่าน; Chromium จำลองผังตัวอย่าง + bench (drawElements hook, CDP metrics/profiler)
- **ข้อควรรู้**: ฉากร้านใช้ผิวรุ่นละเอียดเฉพาะตอนตัวละครสูงเกิน 160 px บนจอ (โหลดตอนนั้น); เงามาจาก `ShadowProxy` รุ่นเบาเสมอ — ถ้าเปลี่ยนโครงกระดูก/ไฟล์ lite ต้องให้ตรงกับรุ่นละเอียด; ระหว่างหยุดจำลองที่ยังมีลูกค้าอยู่ ฉากยังวาดต่อเนื่อง (ท่า Idle)

## 2026-10-21 ICT — บีบอัดโมเดล, ลูกค้าหลายแบบ, กันจุดยืนพนักงาน

- **ผลลัพธ์**: GLB บีบอัด meshopt (ลูกค้า 234 KB); ลูกค้าแต่ละคนสีเสื้อ/ผม/ผิว/สูงต่างกัน; ลูกค้าเดินอ้อมพนักงานหลังเคาน์เตอร์
- **การตรวจ**: `make test` 910, `make lint` ผ่าน; Chromium จำลองผังตัวอย่าง
- **ข้อควรรู้**: โหลด GLB ต้องผ่าน `createCharacterLoader()` (ต้องมี MeshoptDecoder); สีต่อคนอยู่ใน shader ของ three-view อ่าน attribute `_part` — ห้าม prune attribute นี้ทิ้ง

## 2026-10-28 ICT — Simulation behavior corrections (PR #39)

- Branch: `fix/simulation-behavior-model`; PR: #39.
- Party model: a party represents 1–4 diners, creates one kitchen job per diner, and starts dining only after all dishes complete. Customer render buffer emits each party member; heatmap is weighted by party size.
- Customer exits: impossible party/table matches are counted as `noSeat`; entrance and food waits use `patienceMinutes`; cancellation removes queued work, prevents late delivery, and sends the table to cleaning.
- Analysis: adds `abandoned` and `unfinished`; unresolved diners after the four-hour drain window make an option not good.
- Tests updated for patience and per-diner dishes. GitHub CI run 40674434765 was queued at handoff; inspect its result before merging.
