# FE Handoff — บัญชีผู้ใช้ (Identities + Email OTP) และหน้ารวมโปรเจกต์

> เขียน 2026-10-14 21:55 ICT · branch `feat/login-projects` (แตกจาก `feat/playground-ux-v2`)
> อ่านคู่กับ PRD §9 ข้อ 16–21 และ `harness/feature_list.json` (feat-041, feat-061–064)

## 1. สรุปสั้น

FE ต้อง **ร่างสัญญา API ให้ครบตามข้อตกลงกับ BE แล้ว commit ให้ BE รีวิวก่อน** — BE รอสัญญาที่ merge แล้วจึงเริ่มเขียน endpoint (ระหว่างนี้ BE ทำ migration ที่ไม่ขึ้นกับรูปแบบ API ไปก่อน)

สัญญา (`contracts/openapi.yaml`) คือแหล่งอ้างอิงหลักของทั้งสองฝั่ง — ห้ามให้ mock / BFF / BE เดาเอง

## 2. สถานะ branch และ working tree

| ที่ | สถานะ |
|---|---|
| `feat/playground-ux-v2` | Sprint 3 (feat-053–060) commit + push แล้ว · **ยังไม่ได้เปิด PR** (เครื่องไม่มี `gh`) → https://github.com/bosskantaponguttarawichien-boop/wang-raan/compare/main...feat/playground-ux-v2 |
| `feat/login-projects` (commit แล้ว) | feat-061–064 ใน harness, PRD §9 ข้อ 16–21, prototype `design-html/account-ux/{login,projects}.html` |
| `feat/login-projects` (**ยังไม่ commit**) | งาน OTP + หน้า `/login` จาก session อื่น — ดูข้อ 3 |

ลำดับ merge: `feat/playground-ux-v2` → `main` ก่อน แล้วค่อยเปิด PR ของ `feat/login-projects`

## 3. งานที่ยังไม่ commit (จาก session อื่น) — ต้องตรวจและแก้ต่อ

ไฟล์: `contracts/openapi.yaml`, `contracts/openapi.test.ts`, `mock-backend/handler{,.test}.ts`, `src/server/{auth,account-repository,otp-handlers}.ts` (+ tests), `app/api/auth/otp/**`, `app/login/page.tsx`, `src/components/auth/login-form{,.test}.tsx`, `src/lib/safe-redirect{,.test}.ts`, `e2e/login-otp.spec.ts`, `app/(marketing)/page.tsx`, `harness/feature_list.json`, `harness/progress.md`

**ใช้ต่อได้**
- `POST /v1/auth/otp/request` + `/verify` (`x-allow-anonymous: true`), schema `RequestOtp*` / `VerifyOtp*`
- error code `OTP_INVALID`, `OTP_EXPIRED`, `OTP_ATTEMPTS_EXCEEDED` + ฟิลด์ `attemptsLeft`
- `email` ใน `AuthProvider`
- `name` ใน `SaveLayoutRequest` / `StoredLayout` / `LayoutSummary` และ `layout` ใน `LayoutSummary`
- `safe-redirect` (กัน open redirect ของ `?next=`), หน้า `/login`, login-form

**ขัดกับข้อตกลงใหม่ — ต้องแก้**
- BFF ยังสร้าง user id เองเป็น `<provider>-<providerAccountId>` (`src/server/auth-config.ts:31`) → ต้องขอ id จาก BE ผ่าน `resolve`
- `PUT /v1/me` ยังใช้สร้างบัญชี → ต้องเปลี่ยนเป็นอัปเดตอย่างเดียว
- `LayoutSummary` ส่ง `layout` เต็มโดยไม่แบ่งหน้า (กรณีแย่สุด ~24 MB ต่อคำขอ) → เพิ่ม pagination
- **feat-061 ถูกตั้งเป็น `done` แล้ว — คืนเป็น `in-progress`** จนกว่าจะครบข้อ 4

⚠️ ก่อนแตะไฟล์เหล่านี้ ยืนยันกับผู้ใช้ว่า session นั้นหยุดแล้ว (ล่าสุดยังแก้ไฟล์อยู่ 21:49) และ commit งานเดิมแยกไว้ 1 commit ก่อนแก้ทับ

## 4. งาน FE ตามลำดับ

### ขั้น 1 — สัญญา API (feat-061, ต้องเสร็จและ commit ก่อน BE เริ่ม)

ปรับ `info.version` เป็น `1.3.0` และเพิ่ม/แก้ใน `contracts/openapi.yaml`:

1. **`POST /v1/auth/identities/resolve`** (`x-allow-anonymous: true`, tag `auth`)
   - request `ResolveIdentityRequest`: `provider` (AuthProvider), `providerAccountId` (string 1–255), `email` (string|null, email, ≤254), `emailVerified` (boolean), `name` / `image` (nullable เหมือน `UpsertProfileRequest`)
   - response 200 `{ user: User, created: boolean }`
   - 400 (ข้อมูลไม่ครบ / `provider: "email"` — อีเมลต้องผ่าน `otp/verify` เท่านั้น), 401, 429, 5XX
   - กติกา (เขียนใน `description`):
     - หาบัญชีจาก `(provider, providerAccountId)` ก่อนเสมอ — เจอแล้วไม่ดูอีเมลอีก (เปลี่ยนอีเมลที่ Google ทีหลังบัญชีไม่หลุด)
     - ไม่เจอ: ผูกกับบัญชีเดิมที่มีอีเมลเดียวกัน **เฉพาะ** `google` + `emailVerified: true` · `line` / `github` ไม่ผูกอัตโนมัติ
     - เทียบอีเมลหลัง trim + lowercase (ไม่ตัดจุดของ gmail)
     - ไม่เจอทั้งคู่: สร้างบัญชีใหม่ id `usr-<uuid>`
     - `provider: "guest"`: `providerAccountId` = uuid ที่ BFF สุ่ม → id `guest-<uuid>` (คงรูปแบบเดิมเพื่อให้ `merge-guest` ทำงาน), ไม่มีอีเมล
     - อัปเดต `users.provider` เป็นวิธีที่ login ล่าสุด
2. **`POST /v1/auth/otp/verify`** — เพิ่มใน description: ผ่านแล้วใช้กติกาเดียวกับ resolve (identity `email` + อีเมลนั้น, ถือว่ายืนยันแล้ว, ผูกกับบัญชีที่มีอีเมลเดียวกันได้) และตอบ `{ user, created }`
3. **`otp/request`** — เพิ่ม: เก็บรหัสเป็น hash, ใช้ได้ครั้งเดียว, ขอใหม่แล้วรหัสเก่าใช้ไม่ได้, rate limit ต่ออีเมล (60 วิ + เพดานต่อชั่วโมง) และต่อ `X-Client-IP`, ตอบเหมือนกันทุกกรณี, ห้าม log รหัส/อีเมลเต็ม
4. **รูปแบบ `sub`** (หัวไฟล์ บรรทัด ~15): `guest-<uuid>` · `usr-<uuid>` · `<provider>-<providerAccountId>` (ผู้ใช้เดิม) · `anonymous`
5. **`PUT /v1/me`** — แก้ summary เป็น "อัปเดตโปรไฟล์" และเพิ่ม `404` เมื่อไม่มีผู้ใช้ตาม `sub`
6. **`AccountExport`** — เพิ่ม `identities: [{ provider, providerAccountId, email, createdAt }]`
7. **`DELETE /v1/me`** — description: ลบ identities และ OTP ของอีเมลของบัญชีใน transaction เดียวกัน
8. **`GET /v1/layouts`** — query `limit` (1–50, ค่าเริ่มต้น 24) + `cursor` (string ทึบ) · response เพิ่ม `nextCursor: string|null` · เรียงตาม `updatedAt` ใหม่สุดก่อน
9. อัปเดต `contracts/README.md` (ถ้าพูดถึง anonymous / รูปแบบ sub)

verify: `make lint` (มี contract check) + `contracts/openapi.test.ts` ครอบ endpoint ใหม่

### ขั้น 2 — mock-backend + BFF (feat-061 ต่อ)

- `mock-backend/handler.ts`: ตาราง identities ในหน่วยความจำ + `resolve` ตามกติกาข้างบน, `PUT /v1/me` → 404, export มี identities, delete ลบ identities/OTP, `GET /v1/layouts` แบ่งหน้า
- `src/server/auth-config.ts` + `auth.ts`: jwt callback เรียก `resolve` (ใช้ token `sub: "anonymous"`) แล้วใช้ `user.id` ที่ได้เป็น `sub` · ส่ง `emailVerified` จาก profile ของ Google (`email_verified`) · Guest เรียก `resolve` ด้วย `provider: "guest"`
- `src/server/account-sync.ts`: เลิกใช้ `PUT /v1/me` สร้างบัญชี (ใช้อัปเดตชื่อ/รูปเท่านั้น) · `merge-guest` เหมือนเดิม
- `src/lib/layout-queries.ts` / `api-client.ts`: รองรับ `nextCursor`
- unit test ที่ต้องมี: resolve ครั้งแรก/ครั้งต่อไป, Google verified ผูกกับบัญชี OTP เดิม, Google ไม่ verified ไม่ผูก, GitHub ไม่ผูก, เปลี่ยนอีเมลแล้วบัญชีเดิม, Guest → OTP ย้ายผังครบ, `PUT /v1/me` 404, export มี identities
- verify: `make test`, `make lint`, `make e2e` (login-otp)

### ขั้น 3 — หน้าจอ (feat-062 → 063 → 064)

ยึด prototype `design-html/account-ux/` และรายละเอียดใน feature_list:
- **feat-062 `/login`**: Google + อีเมล OTP, ไม่มี register, `?next=` ผ่าน safe-redirect, ล็อกอินอยู่แล้ว → `/projects`
- **feat-063 `/projects`**: การ์ดแบบไฟล์ Figma (ภาพย่อจาก `renderPlanSvg(layout, { grid: false })`), เมนู ⋯ (เปิด/ลบ + ยืนยัน), dialog "สร้างผังใหม่" เดียว = ชื่อ + กว้าง × ลึก + ผนังประตู + ใช้ผังตัวอย่าง (แยกฟอร์มขนาด/ประตูจาก `onboarding-modal.tsx` เป็น component ร่วม), โหลดเพิ่มด้วย `nextCursor`
- **feat-064 `/playground/[id]`**: เปิด/บันทึกผังจาก BE, แก้ชื่อในที่ที่ header, Guest บันทึกออนไลน์ → ถามชื่อ → `/login?next=` → ผังย้ายเข้าบัญชีไม่หาย, ผังจาก `/projects` ไม่ขึ้น onboarding

## 5. ข้อตกลงกับ BE (อ้างอิง)

ตกลงแล้ว: BE ออก user id + ตาราง `identities` · ผูกด้วยอีเมลเฉพาะที่ยืนยันแล้ว · ใช้อีเมลแค่ตอนผูกครั้งแรก · ไม่เปลี่ยน id ผู้ใช้เดิม · ไม่รวมบัญชีอีเมลซ้ำที่มีอยู่แล้วอัตโนมัติ · `resolve` / `otp/request` / `otp/verify` เรียกด้วย `anonymous` ได้ · `PUT /v1/me` อัปเดตอย่างเดียว · `users.provider` = login ล่าสุด · OTP เก็บใน Postgres · PDPA ครอบ identities/OTP

FE ใส่ในร่างแล้วให้ BE แย้งตอนรีวิวได้: Guest ผ่าน `resolve` คง `guest-<uuid>` · `GET /v1/layouts` แบ่งหน้า

BE ทำไปก่อนระหว่างรอสัญญา: migration `identities`, `email` ใน `CHECK`, backfill identities ผู้ใช้เดิม, คอลัมน์ `name` + ตั้งชื่อผังเก่า "ผังร้าน {กว้าง} × {ลึก} ม."

BE ต้องอัปเดตเอกสารฝั่งตัวเอง (`AGENTS.md`, `architecture.md`, `BACKEND_HANDOFF.md`) เรื่อง anonymous endpoints

## 6. ยังเปิดอยู่

- ใครดูแลโดเมนส่งเมล (SPF/DKIM/DMARC) และเลือก Resend หรือ SES — ผูกกับ feat-044 (ชื่อโดเมนยังไม่ตัดสิน)
- feat-041 (Google จริง) ยัง blocked รอ Backend จริงบน staging — ระหว่างนี้ใช้ mock OAuth ใน E2E
