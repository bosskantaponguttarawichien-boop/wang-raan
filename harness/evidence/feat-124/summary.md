# feat-124 — แสงตามเวลาร้าน

วันที่ตรวจ: 2026-10-29 (Asia/Bangkok)

## พฤติกรรม

- ค่าเริ่มต้นคือ `simulation`: เวลาเปิดร้าน + `metrics.time` จาก simulation store อัปเดตทุกนาทีจำลอง โดยไม่คูณ speed ซ้ำและไม่มี wall-clock timer
- ก่อนเริ่ม / starting / จบรอบ กลับเวลาเปิดร้าน; running / paused ใช้เวลาจำลองเดียวกับนาฬิกาบนหน้าจอ
- เปลี่ยนความเร็วไม่กระโดดเวลา, remount ฉาก 3D ไม่รีเซ็ตเวลา, เปิดร้านตอนค่ำเห็นแสงกลางคืนทันที
- เก็บโหมด fixed สำหรับตรวจแสงเฉพาะเวลา; ใช้วันอ้างอิงเดิมในการตั้งค่า (เริ่มต้น 2026-03-21) และ timezone ที่กำหนด ไม่อิงวันที่หรือเวลาของเครื่อง
- เปลี่ยนข้อความ UI จากเวลาเครื่องจริงเป็น “ตามเวลาร้าน” พร้อมอธิบายการเริ่มและพัก
- ไม่แก้ layout/history, RNG, Worker หรือ BFF

## หลักฐาน

- `npm test`: 111 files / 1,298 tests ผ่าน
- เฉพาะ clock/store/scene/settings/solar/shadow: 6 files / 17 tests ผ่าน
- `npm run typecheck`: ผ่าน
- `npm run lint`: 0 errors; 1 warning เดิมใน `simulation-gate.test.tsx` (`_initial`)
- `./harness/init.sh`: ผ่านหลังตั้ง Git Bash PATH และ shim python3 → python + PYTHONIOENCODING=utf-8 สำหรับ Windows
- Boundary scan (production sources): Core / Worker / BFF ไม่มี import React/Zustand/Next/Three หรือ DOM globals
- `python scripts/validate_harness.py`: ผ่าน
- Chrome production E2E `restaurant-animation-lighting.spec.ts`: 11 กรณีผ่านรวมสองรอบ — 10 กรณีผ่านรอบแรก; regression เวลาร้านผ่านรอบเจาะจงหลังแก้ test ที่พยายามเปิด shop rail ซึ่ง UI ซ่อนไว้ขณะจำลอง (ไม่ได้แก้ production code จากความล้มเหลวนี้)
- E2E ครอบคลุมแสง 4 ช่วง, noon/night, ทิศเงาเมื่อหมุนกล้อง, reduced-motion SVG, print, ห้อง 2/30 เมตร และ regression เวลาเปิดร้าน/เวลาเครื่อง/พัก/จบรอบ
- `measurements.jsonl`: เปิด 10:00 ความสว่าง 0.941432; เปิด 20:00 ความสว่าง 0.820340; เปลี่ยนเวลาเครื่องไปปี 2035/2040/2045 ไม่มีผลต่อเวลาร้าน
- พักการจำลองที่ `10:01:18`: เวลาและภาพ canvas ตรงกันทุกไบต์หลังรอ 2.5 วินาที; จบรอบกลับ `10:00`
- `screens/restaurant-opening-night.png`: ภาพแสงเมื่อเวลาเปิดร้านเป็น 20:00

ยังไม่ได้ commit, push หรือ deploy
