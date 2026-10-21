/**
 * mannequin ปั้นด้วยสัดส่วนผู้ใหญ่จริง สูง 1.70 ม. ที่ขนาด 1:1 (หน่วยโมเดล = เมตร) จึงแสดงที่ scale 1
 * เข้ากับโต๊ะ 0.74 ม. เบาะ 0.45 ม. และเคาน์เตอร์ 1.05 ม. — ท่า Sit ใน GLB วางต้นขาไว้บนเบาะที่ขนาดนี้
 */
export const CHARACTER_SCALE = 1;
/** ความสูงตัวละครที่แสดงผล (เมตร) */
export const CHARACTER_HEIGHT = 1.7;

/** บทบาทตัวละครในร้าน — แต่ละบทบาทมีไฟล์ GLB ของตัวเอง แต่ใช้โครงกระดูกและ animation (Idle/Walk/Sit) ชุดเดียวกัน */
export type CharacterRole = "customer" | "staff";

/**
 * full = ผิวละเอียด (Character Lab, ตัวละครใหญ่บนจอ)
 * lite = polygon ราว 1/4 — สลับแค่ geometry ตอนตัวละครเล็กบนจอ
 * สร้างด้วย scripts/create-cafe-customer-model.mjs (--staff สำหรับพนักงาน)
 */
export const CHARACTER_MODELS: Record<CharacterRole, { full: string; lite: string; label: string; description: string }> = {
  customer: {
    full: "/assets/models/cafe-customer.glb",
    lite: "/assets/models/cafe-customer-lite.glb",
    label: "ลูกค้า",
    description: "เสื้อยืดสีอ่อน กางเกงยีนส์ รองเท้าผ้าใบ",
  },
  staff: {
    full: "/assets/models/cafe-staff.glb",
    lite: "/assets/models/cafe-staff-lite.glb",
    label: "พนักงาน",
    description: "เสื้อยืดและหมวกแก๊ปสีเขียว กางเกงยีนส์",
  },
};

