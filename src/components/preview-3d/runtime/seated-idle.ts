import * as THREE from "three";

/**
 * ท่านั่งรอที่ไม่นิ่งเป็นรูปปั้น — ลูกค้าที่นั่งรอสั่ง/รออาหาร/กินเสร็จแล้วถือท่า Sit ค้าง (timeScale 0)
 * จึงซ้อนการขยับเบา ๆ หลังมิกเซอร์วางท่าแล้ว: หายใจ (ลำตัวโยกช้า ๆ) และหันมองรอบ ๆ เป็นระยะ
 * ทุกค่าขึ้นกับ seed ต่อคน จึงไม่ขยับพร้อมกันทั้งร้าน ต้องเรียกทุกเฟรมหลัง mixer.update() เท่านั้น
 * (มิกเซอร์เขียนท่าคลิปทับทุกเฟรม ค่าที่บวกเพิ่มจึงไม่สะสม)
 */

const BREATH_SECONDS = 4.2;
const BREATH_RADIANS = 0.022;
const LOOK_SECONDS = 9;
const LOOK_YAW_RADIANS = 0.16;
const LOOK_PITCH_RADIANS = 0.035;

interface IdleBones {
  spine: THREE.Object3D | null;
  head: THREE.Object3D | null;
}

const cache = new WeakMap<THREE.Object3D, IdleBones>();

function bonesOf(model: THREE.Object3D): IdleBones {
  let bones = cache.get(model);
  if (!bones) {
    bones = { spine: model.getObjectByName("Spine") ?? null, head: model.getObjectByName("Head") ?? model.getObjectByName("Neck") ?? null };
    cache.set(model, bones);
  }
  return bones;
}

/**
 * @param seconds นาฬิกาท่าทาง (หยุดเดินเมื่อหยุดชั่วคราว)
 * @param seed ค่าคงที่ต่อคน
 */
export function applySeatedIdle(model: THREE.Object3D, seconds: number, seed: number) {
  const { spine, head } = bonesOf(model);
  const phase = (seed * 0.618) % 1;
  const breath = Math.sin(((seconds / BREATH_SECONDS) + phase) * Math.PI * 2);
  if (spine) spine.rotation.x += breath * BREATH_RADIANS;
  if (head) {
    // หันมองซ้ายขวาแบบช้า ๆ มีจังหวะพักตรงกลาง (sin ยกกำลังสามให้ค้างที่ปลายนานกว่ากลาง)
    const look = Math.sin(((seconds / (LOOK_SECONDS + phase * 3)) + phase * 2) * Math.PI * 2);
    head.rotation.y += look * look * look * LOOK_YAW_RADIANS;
    head.rotation.x += Math.sin(((seconds / (LOOK_SECONDS * 0.7)) + phase) * Math.PI * 2) * LOOK_PITCH_RADIANS;
  }
}
