/**
 * ขนาดแสดงผลของ mannequin (โมเดลสูง native ราว 1.05 หน่วย) → สูงราว 1.67 ม. เท่าผู้ใหญ่ เทียบกับโต๊ะ 0.74 ม.
 * เบาะ 0.48 ม. และเคาน์เตอร์ 1.05 ม. — ท่า Sit ในไฟล์ GLB คำนวณระดับสะโพกจากค่านี้ (DISPLAY_SCALE ใน
 * scripts/create-cafe-customer-model.mjs ต้องตรงกัน)
 */
export const CHARACTER_SCALE = 1.6;

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
    description: "Mannequin สีเทาทั้งตัว",
  },
  staff: {
    full: "/assets/models/cafe-staff.glb",
    lite: "/assets/models/cafe-staff-lite.glb",
    label: "พนักงาน",
    description: "Mannequin สวมเสื้อกั๊กและหมวกแก๊ปสีเขียว",
  },
};
