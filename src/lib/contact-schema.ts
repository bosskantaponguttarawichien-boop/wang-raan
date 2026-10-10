/** แบบฟอร์มติดต่อ (feat-032) — schema เดียวใช้ทั้งฟอร์มฝั่ง Client และ BFF /api/contact */
import { z } from "zod";

export const ContactSchema = z
  .object({
    name: z.string().trim().min(1, "กรอกชื่อของคุณ").max(80, "ชื่อยาวเกิน 80 ตัวอักษร"),
    email: z.string().trim().min(1, "กรอกอีเมลสำหรับติดต่อกลับ").email("รูปแบบอีเมลไม่ถูกต้อง").max(254, "อีเมลยาวเกินไป"),
    message: z.string().trim().min(10, "เล่าให้เราฟังอีกนิด (อย่างน้อย 10 ตัวอักษร)").max(2000, "ข้อความยาวเกิน 2,000 ตัวอักษร"),
    /** Honeypot: ช่องซ่อนที่คนไม่เห็น — bot มักกรอก */
    website: z.string().max(200).optional(),
  })
  .strict();

export type ContactInput = z.infer<typeof ContactSchema>;
