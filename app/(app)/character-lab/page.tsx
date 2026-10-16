import type { Metadata } from "next";
import { CharacterLab } from "@/components/character-lab/character-lab";

export const metadata: Metadata = { title: "Character Lab" };

/**
 * พื้นที่ทดลองตัวละครแยกจาก Playground
 * V1 ตั้งใจให้โฟกัสที่การโหลดโมเดลและท่ายืนก่อน จึงไม่เชื่อมกับ simulation worker
 */
export default function CharacterLabPage() {
  return <CharacterLab />;
}
