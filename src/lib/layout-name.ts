/** ชื่อผังยาวได้ 80 ตัว นับแบบ code point ตามสัญญา (ตัดด้วย .slice จะผ่ากลาง emoji ได้ครึ่งตัว) */
export const LAYOUT_NAME_MAX = 80;

export function limitLayoutName(name: string): string {
  return Array.from(name).slice(0, LAYOUT_NAME_MAX).join("");
}
