# feat-126 — แก้ท่ากินกระตุกที่ 1×

- แก้ feedback ใน ThreeView: correction วัดเทียบตำแหน่งปัจจุบัน แต่เดิมนำไปใช้เป็นตำแหน่งสัมบูรณ์จากเก้าอี้ ทำให้ตัวสลับตำแหน่งทุกเฟรม; ใช้ correction เพิ่มจากระยะเลื่อนปัจจุบันและจำกัดระยะ 0.10 ม.
- ปรับทิศศอกและการถืออุปกรณ์ในคลิป Eat ลดการพลิกอย่างฉับพลัน; ตรวจ quaternion ระหว่างเฟรมต่ำกว่า 40 องศา และจุดสัมผัสจาน/ปากยังผ่าน สร้าง customer GLB ทั้ง full/lite ใหม่โดยรวมคลิปเดิมครบ
- Chrome E2E production ที่ 1× เก็บ 201 เฟรม: 200 เฟรมมีการเปลี่ยน phase, max phase jump 0.00804 รอบ และระยะจานเทียบตัวคงที่; เห็น Eat พร้อมจานและส้อมในระยะ (measurements.jsonl)
- npm test 111 files / 1,304 tests ผ่าน; typecheck ผ่าน; Core/Worker/BFF boundary scan ผ่าน; init บน Windows ยังติด python3 launcher/dirname
- ผลรัน npm test รอบแรกมี test อื่น timeout เมื่อรันพร้อม build และ E2E; รันซ้ำหลัง E2E จบแล้วผ่านทั้งหมด
