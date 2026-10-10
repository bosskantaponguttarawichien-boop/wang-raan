# Sprint 2 — หน้าเว็บพร้อมขึ้น Production (FE เท่านั้น)

> เริ่ม 2026-10-10 · งานทั้งหมดอยู่ใน `harness/feature_list.json` (ฟิลด์ `"sprint": 2`)

## เป้าหมาย

หน้าเว็บขึ้น Cloudflare ได้จริง ทำส่วน FE ครบทุกอย่างที่ต้องมีก่อนเปิดให้ผู้ใช้จริง และพร้อมต่อกับ Backend ทันทีที่ Backend เสร็จ

**ขอบเขต:** repo นี้ทำเฉพาะหน้าเว็บ + BFF — Backend และฐานข้อมูลผู้ใช้สร้างเองใน repo แยก (TypeScript) แล้วต่อเข้ามาตาม `contracts/openapi.yaml`

## สแตกที่ตกลงกัน

| ส่วน | ใช้ | หมายเหตุ |
|---|---|---|
| โดเมน + กันโจมตี | Cloudflare DNS / WAF | |
| หน้าเว็บ + BFF | Cloudflare Workers (Next.js ผ่าน OpenNext) | ต้องใช้ Workers Paid — แผนฟรีจำกัด CPU 10 ms/request ไม่พอสำหรับ SSR |
| Backend | Railway — Node + TypeScript ใน Docker (Singapore) | repo แยก |
| ฐานข้อมูล | Railway Postgres (Singapore) | repo แยก |
| Backup สำรอง | dump ทุกคืน → Cloudflare R2 | backup ในตัวของ Railway กู้ข้ามโปรเจกต์/region ไม่ได้ |
| กฎตรวจผังร่วม | `@bosskantaponguttarawichien-boop/wang-raan-core` — private package บน GitHub Packages | BE ติดตั้งไปตรวจผังซ้ำด้วยกฎชุดเดียวกัน |

**ประมาณการค่าใช้จ่ายช่วงแรก** (ราคาจากหน้าเว็บทางการ ณ 2026-10-10, ~35 บาท/USD)

| รายการ | production อย่างเดียว | มี staging |
|---|---|---|
| Cloudflare Workers Paid | $5 | $5 |
| Railway Hobby ($5 รวมเครดิต $5 + ส่วนเกิน) | ~$5–8 | ~$10–15 |
| R2 (ฟรีถึง 10 GB) | $0 | $0 |
| โดเมน .com | ~$1 | ~$1 |
| **รวม/เดือน** | **~$11–14 (≈400–500 บาท)** | **~$16–21 (≈550–750 บาท)** |

ถ้าขยับเป็น Railway Pro ($20) ≈ $26–35/เดือน — ตั้ง usage limit บน Railway ตั้งแต่วันแรก

## ลำดับงาน

```
ด่าน 0  feat-024 (WebKit), feat-034 (คำตัดสินค้าง)
ด่าน 1  feat-035 ลองรันบน Cloudflare  ← ต้องผ่านก่อนงาน deploy / auth บน Workers
ด่าน 2  feat-036 สัญญา API → feat-038 BE จำลอง → feat-039 ต่อ BFF กับ BE
        feat-037 แยก core เป็น package (ทำคู่ขนานได้)
ด่าน 3  feat-040 จัดการลิงก์แชร์, feat-041 Google/LINE → feat-042 PDPA
ด่าน 4  feat-043 CI → feat-044 deploy Cloudflare → feat-045 Sentry/uptime
ด่าน 5  feat-046 ต่อ BE จริงบน staging → feat-047 ตรวจ Production Gate
ถ้าเวลาเหลือ  feat-048 ฟอนต์ไทยใน OG image / PNG
```

`feat-036` และ `feat-037` คือสิ่งที่ฝั่ง BE ต้องใช้เริ่มงาน — ทำให้เสร็จก่อน

## ผลลองรันบน Cloudflare (feat-035, 2026-10-10)

**สรุป: ใช้ Cloudflare Workers ได้ ไม่ต้องถอยไป Vercel**

| เรื่อง | ผล |
|---|---|
| เครื่องมือ | `@opennextjs/cloudflare` 1.20 + `wrangler` 4.149, Next.js 15.5 |
| E2E บน workerd ในเครื่อง (`make e2e-cf`) | ผ่าน 98/98 (Chromium + WebKit) — รวมล็อกอิน Auth.js, OG image (`next/og`), ลิงก์แชร์, Backend ล่ม |
| ขนาด worker | 7.4 MB (gzip 1.8 MB) — เพดาน 64 MB |
| ต้องแก้ | `metadataBase` ของหน้าแชร์: Workers เดา origin เองไม่ได้ → ใช้ `SITE_URL` หรือ host ของคำขอ |
| ความปลอดภัย | production เปิด `global_fetch_strictly_public` (fetch ได้เฉพาะปลายทางสาธารณะ); env `local` ปิดไว้เพื่อเรียก Backend จำลองที่ localhost |

ยังไม่ได้ทดสอบ (ต้องใช้บัญชี Cloudflare — ทำใน feat-044):
- deploy จริงและวัด CPU time ต่อคำขอบน Workers Paid
- IP ผู้ใช้: บน Cloudflare ควรอ่าน `CF-Connecting-IP` แทน `X-Forwarded-For`
- incremental cache (R2) — ตอนนี้ไม่ได้เปิด เพราะหน้าที่มีข้อมูลเป็น dynamic ทั้งหมด
- secret ตั้งด้วย `wrangler secret put`: `AUTH_SECRET`, `INTERNAL_TOKEN_SECRET`, OAuth; var: `WANGRAAN_BACKEND_URL`, `SITE_URL`, `AUTH_TRUST_HOST`

## CI (feat-043)

`.github/workflows/ci.yml` — 3 job ขนานกันทุก PR และทุก push เข้า `main`:

| job | ตรวจอะไร | คำสั่งเดียวกับในเครื่อง |
|---|---|---|
| Lint + Unit + Package | harness, ESLint + tsc + boundary + สัญญา API, unit (รวม contract), smoke ของ package core | `make status` · `make lint` · `make test` · `npm run core:smoke` |
| E2E (Node) | E2E + responsive + axe บน Chrome และ WebKit | `E2E_WEBKIT=1 make e2e` |
| E2E (Cloudflare) | E2E ชุดเดียวกันบน workerd | `make e2e-cf` |

**ต้องตั้งเองบน GitHub (ยังไม่ได้ทำ):** Settings → Branches → Add rule สำหรับ `main` → Require a pull request + Require status checks:
`Lint + Unit + Package`, `E2E (Node — Chromium + WebKit)`, `E2E (Cloudflare Workers runtime)`
(repo ส่วนตัวของบัญชีผู้ใช้ทั่วไปต้องใช้ GitHub Pro ถึงจะบังคับ branch protection ได้ — repo สาธารณะใช้ได้ฟรี)

## Production Gate

ต้องผ่านครบทุกข้อก่อนเปิดให้ผู้ใช้จริง

### ฝั่ง FE (Sprint นี้)

- [ ] หน้าเว็บรันบน Cloudflare Workers ผ่าน unit + E2E ทั้ง Chromium และ WebKit
- [ ] ล็อกอินด้วย Google / LINE ได้ และผังที่ทำตอนเป็น Guest ไม่หาย
- [ ] Backend ล่มหรือช้า → หน้าเว็บแจ้งผู้ใช้ ไม่ค้าง ไม่ทำผังหาย; production ไม่ fallback ไปเก็บในหน่วยความจำ
- [ ] มี CI บังคับก่อน merge, staging แยกจาก production, ซ้อมย้อนเวอร์ชันแล้ว
- [ ] Sentry + uptime check แจ้งเตือนได้จริง
- [ ] PDPA: นโยบายความเป็นส่วนตัว, ดาวน์โหลดข้อมูลของตัวเอง, ลบบัญชี
- [ ] ไม่มี secret ใน repo, ผ่าน security review ฝั่ง FE/BFF
- [ ] axe 0 violations, ไม่มี horizontal scroll ทั้ง 6 breakpoints บน production build
- [ ] E2E + contract test ผ่านกับ Backend จริงบน staging

### ฝั่ง BE (repo แยก — checklist อ้างอิงสำหรับ feat-046)

- [ ] ทำตาม `contracts/openapi.yaml` ครบทุก endpoint (contract test ผ่าน)
- [ ] ตรวจผังซ้ำด้วย `@bosskantaponguttarawichien-boop/wang-raan-core` ก่อนบันทึก — ผัง Blocked ถูกปฏิเสธ
- [ ] ผู้ใช้เปิด/แก้/ลบผังของคนอื่นไม่ได้
- [ ] ตรวจ internal Bearer token จาก BFF ทุก request
- [ ] Rate limit เก็บที่ที่ใช้ร่วมกันได้ (Postgres หรือ Redis)
- [ ] ลิงก์แชร์ยกเลิกได้ / หมดอายุได้
- [ ] ลบบัญชีแล้วไม่เหลือข้อมูลของผู้ใช้ในฐานข้อมูล
- [ ] Migration เป็นไฟล์ในโค้ด รันอัตโนมัติตอน deploy
- [ ] Backup ทุกคืน → R2 และซ้อมกู้คืนจริงแล้ว (บันทึกเวลาที่ใช้)
- [ ] ตั้ง usage limit บน Railway แล้ว

## คำถามที่ต้องตอบก่อนถึงงานนั้น

| คำถาม | ต้องรู้ก่อน |
|---|---|
| คำตัดสิน 4 เรื่อง: ลบเก้าอี้, นิยามทางเดิน, ค่าลูกค้าจำลอง, โทเคน `--muted` | feat-034 |
| ยังให้ใช้แบบ Guest ได้อยู่ไหม หรือบังคับล็อกอินก่อนบันทึก | feat-041 |
| ชื่อโดเมน | feat-044 |
| ช่องทางรับแจ้งเตือน (อีเมล / LINE / Slack) | feat-045 |
