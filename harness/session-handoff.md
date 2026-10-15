# Session Handoff — วางร้าน (Wang-Raan)

> **archive**: เก็บ 5 entry ล่าสุดเท่านั้น — รายการก่อนหน้าจะถูกย้ายไปเก็บที่
> `harness/archive/session-handoff-archive.md`

## 2026-10-15 ICT — feat-066 เมนูเดียวของ Playground

- ผังของฉัน + ส่งออก/แชร์ อยู่ในเมนูโปรเจกต์ (หมวด) แล้ว — E2E ที่อ้างปุ่ม "ส่งออก" / `#myProjectsLink` เปลี่ยนเป็นผ่านเมนู
- dev server: แก้คลาส Tailwind ใน `.tsx` แล้วต้อง `rm -rf .next` (cache ไม่ invalidate)

## 2026-10-15 ICT — feat-065 หน้า /login ใหม่ + ปุ่ม Google

- หน้า /login: โลโก้ถูกไฟล์แล้ว, layout 2 คอลัมน์/ซ้อนแนวตั้ง, ไม่มี h-scroll 6 breakpoints
- **Google ยังไม่เปิดบน production** — ต้องสร้าง OAuth client (Web) ใน Google Cloud Console, redirect URI:
  `https://wang-raan.boss-kantapong-uttarawichien.workers.dev/api/auth/callback/google` และ `http://localhost:3000/api/auth/callback/google`
  แล้ว `npx wrangler secret put AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` (feat-041 เป็น in-progress รอขั้นนี้ + ทดสอบจริง)
- **อัปเดต**: ผู้ใช้ตั้ง OAuth client แล้ว Google ผ่าน แต่ Backend จริงบน Railway ตอบ 500 ทุก endpoint ที่แตะตาราง (แม้ GET /v1/me) ขณะที่ /health 200 → น่าจะยังไม่ได้รัน migration บน DB ของ Railway (ดู feat-041 progress_note)
- **แก้แล้ว**: รัน migration 001–003 บน DB ของ Railway (ผ่าน `railway ssh`) — backend ไม่ 500 แล้ว · pre-deploy ใน railway.json ไม่ถูกรันตอน deploy ต้องตามแก้ฝั่ง wang-raan-service
- ⚠️ **Security (wang-raan-service)**: build log ของ Railway แสดง GitHub token (`NODE_AUTH_TOKEN`) เป็น plaintext ใน step `RUN` ของ Dockerfile — ต้อง revoke/สร้างใหม่ และแก้ Dockerfile ไม่ให้ token โผล่ใน log
- E2E ตั้ง Google client ปลอมใน `playwright.config.ts` และดัก accounts.google.com — server ยัง fetch discovery ของ Google จึงต้องมีอินเทอร์เน็ตตอนรัน E2E

## 2026-10-15 ICT — E2E กลับมาเขียวทั้งชุด (89/89)

- spec ชุด UI เก่าปรับตาม Playground UX ใหม่แล้ว — ใช้ helper ใน `e2e/helpers.ts` (openTab / addItem / placeSelected / cloud) แทน selector เดิม
- แก้บั๊กที่ E2E จับได้ 7 จุด (horizontal scroll มือถือ, พิมพ์เห็นเครื่องมือ, header 320px, ป๊อปโอเวอร์พิกัด, notes นำเข้า, contrast, ชื่อปุ่ม 3D) — ดู progress.md
- ⚠️ แก้ `app/globals.css` แล้วต้อง `rm -rf .next` ก่อน build/E2E ในเครื่อง (cache ไม่ invalidate)

## 2026-10-15 ICT — feat-061 ทำใหม่ตามสัญญา v1.3.0 (identities)

- สัญญา v1.3.0 + mock + BFF + UI เสร็จบน `feat/login-projects` — **BE รีวิวสัญญาได้แล้ว** (ข้อที่ FE ตัดสินเองอยู่ใน `harness/handoff-fe-accounts.md` §7)
- BFF ไม่สร้าง user id เองแล้ว; Google เปิดเมื่อตั้ง `AUTH_GOOGLE_ID` + `AUTH_GOOGLE_SECRET`
- E2E ชุด UI เก่า 28 เคสล้มมาตั้งแต่ก่อนงานนี้ (selector ของ playground เดิม) — ควรแยกงานแก้ spec เหล่านี้
- ยังเปิด: โดเมน/บริการส่งเมล (Resend หรือ SES), feat-041 รอ Backend จริงบน staging

## 2026-10-14 21:55 ICT — FE handoff: Identities + Email OTP

- ข้อตกลงกับ BE และลำดับงาน FE ทั้งหมดอยู่ที่ `harness/handoff-fe-accounts.md` — อ่านก่อนแตะ feat-061–064
- งาน OTP / `/login` ใน working tree ยังไม่ commit และยังใช้แบบเดิม (BFF สร้าง user id เอง) — ต้องแก้ตาม handoff และคืน feat-061 เป็น `in-progress`
- BE รอสัญญา v1.3.0 ที่ merge แล้วจึงเริ่ม endpoint
