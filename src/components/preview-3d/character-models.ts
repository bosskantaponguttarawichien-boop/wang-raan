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


/**
 * หน้าตาลูกค้าแต่ละคน: สีตามหมวดชิ้นของโมเดล (attribute _part) — ผิว, เสื้อ, กางเกง, รองเท้า, พื้นรองเท้า, ผม, ขอบคอเสื้อ
 * และความสูงต่างกันเล็กน้อย — สุ่มแบบกำหนดผลได้จาก id ของลูกค้า (คนเดิมหน้าตาเดิมตลอดการจำลอง)
 */
export interface CustomerLook {
  /** สี sRGB เรียงตามหมวดชิ้น 0–6 */
  colors: readonly string[];
  /** ตัวคูณขนาดตัว (สูง ~1.67–1.73 ม.) — แคบพอให้ท่านั่งยังลงเบาะพอดี (ต่างไม่เกิน ~1 ซม.) */
  scale: number;
}

const SKIN_TONES = ["#f1d2b6", "#e8c39e", "#d9ab86", "#c08a64", "#9a6a4a"];
const SHIRT_COLORS = ["#c9d2de", "#f4f4f2", "#2b3446", "#b5473a", "#e2b33c", "#4f7cac", "#7a8b5c", "#d77fa1", "#5b5f66", "#e9dccb"];
const PANTS_COLORS = ["#3d5a86", "#3d5a86", "#2b3446", "#b9a27c", "#262a30", "#6b7280"];
// ผมเข้มทุกเฉด — สีอ่อนกลืนกับผิวเข้มจนดูเหมือนหัวล้านเมื่อมองจากมุมสูง
const HAIR_COLORS = ["#33261d", "#1c1714", "#1c1714", "#4a3324", "#2a2a2a"];
const SHOE_COLORS: ReadonlyArray<readonly [string, string]> = [
  ["#eef0f3", "#c4c8cf"],
  ["#eef0f3", "#c4c8cf"],
  ["#2b2f36", "#e7e2d8"],
  ["#c9b79c", "#f1ece2"],
];

/** สุ่มตัวเลข 0–1 จาก seed (mulberry32) */
function random(seed: number) {
  let t = (seed + 0x6d2b79f5) | 0;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function shade(hex: string, factor: number) {
  const value = parseInt(hex.slice(1), 16);
  const channel = (shift: number) => Math.round(((value >> shift) & 255) * factor);
  return `#${((channel(16) << 16) | (channel(8) << 8) | channel(0)).toString(16).padStart(6, "0")}`;
}

export function customerLook(id: number): CustomerLook {
  const next = random(id * 2654435761);
  const pick = <T,>(items: readonly T[]) => items[Math.floor(next() * items.length)]!;
  const shirt = pick(SHIRT_COLORS);
  const [shoe, sole] = pick(SHOE_COLORS);
  return {
    colors: [pick(SKIN_TONES), shirt, pick(PANTS_COLORS), shoe, sole, pick(HAIR_COLORS), shade(shirt, 0.86)],
    scale: 0.98 + next() * 0.04,
  };
}
