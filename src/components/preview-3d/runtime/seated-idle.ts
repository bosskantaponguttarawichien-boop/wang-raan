import * as THREE from "three";

/**
 * ท่านั่งรอที่ไม่นิ่งเป็นรูปปั้น — ลูกค้าที่นั่งรอสั่ง/รออาหาร/กินเสร็จแล้วถือท่า Sit ค้าง (timeScale 0)
 * จึงซ้อนการขยับเบา ๆ หลังมิกเซอร์วางท่าแล้ว: หายใจ (ลำตัวโยกช้า ๆ) และหันมองรอบ ๆ เป็นระยะ
 * ทุกค่าขึ้นกับ seed ต่อคน จึงไม่ขยับพร้อมกันทั้งร้าน ต้องเรียกทุกเฟรมหลัง mixer.update()
 *
 * ค่าที่ซ้อนเป็นค่าสัมบูรณ์ ไม่สะสม: คลิปที่ไม่มี track ของกระดูกนั้นจะไม่เขียนทับทุกเฟรม จึงถอดค่าที่ซ้อนไว้
 * เฟรมก่อนออกก่อน (ถ้ากระดูกยังอยู่ที่ค่าที่เราวางไว้) — หยุดชั่วคราว (นาฬิกาไม่เดิน) ภาพจึงนิ่งสนิท
 */

const BREATH_SECONDS = 4.2;
const BREATH_RADIANS = 0.022;
const LOOK_SECONDS = 9;
const LOOK_YAW_RADIANS = 0.16;
const LOOK_PITCH_RADIANS = 0.035;

interface Applied {
  /** ค่าที่ซ้อนไว้เฟรมก่อน */
  readonly offset: THREE.Vector2;
  /** มุมของกระดูกหลังซ้อนเฟรมก่อน — ถ้ายังเท่าเดิมแปลว่ามิกเซอร์ไม่ได้เขียนทับ */
  readonly result: THREE.Vector2;
  valid: boolean;
}

interface IdleBones {
  spine: THREE.Object3D | null;
  head: THREE.Object3D | null;
  spineApplied: Applied;
  headApplied: Applied;
}

const cache = new WeakMap<THREE.Object3D, IdleBones>();

const applied = (): Applied => ({ offset: new THREE.Vector2(), result: new THREE.Vector2(), valid: false });

function bonesOf(model: THREE.Object3D): IdleBones {
  let bones = cache.get(model);
  if (!bones) {
    bones = {
      spine: model.getObjectByName("Spine") ?? null,
      head: model.getObjectByName("Head") ?? model.getObjectByName("Neck") ?? null,
      spineApplied: applied(),
      headApplied: applied(),
    };
    cache.set(model, bones);
  }
  return bones;
}

/** วางมุม (x = pitch, y = yaw) ที่ซ้อนบนท่าคลิปของกระดูกนี้ */
function setOffset(bone: THREE.Object3D, state: Applied, x: number, y: number) {
  const untouched = state.valid && bone.rotation.x === state.result.x && bone.rotation.y === state.result.y;
  if (untouched) {
    bone.rotation.x -= state.offset.x;
    bone.rotation.y -= state.offset.y;
  }
  bone.rotation.x += x;
  bone.rotation.y += y;
  state.offset.set(x, y);
  state.result.set(bone.rotation.x, bone.rotation.y);
  state.valid = true;
}

/**
 * @param seconds นาฬิกาท่าทาง (หยุดเดินเมื่อหยุดชั่วคราว)
 * @param seed ค่าคงที่ต่อคน
 */
export function applySeatedIdle(model: THREE.Object3D, seconds: number, seed: number) {
  const bones = bonesOf(model);
  const phase = (seed * 0.618) % 1;
  if (bones.spine) {
    const breath = Math.sin(((seconds / BREATH_SECONDS) + phase) * Math.PI * 2);
    setOffset(bones.spine, bones.spineApplied, breath * BREATH_RADIANS, 0);
  }
  if (bones.head) {
    // หันมองซ้ายขวาแบบช้า ๆ มีจังหวะพักตรงกลาง (sin ยกกำลังสามให้ค้างที่ปลายนานกว่ากลาง)
    const look = Math.sin(((seconds / (LOOK_SECONDS + phase * 3)) + phase * 2) * Math.PI * 2);
    const pitch = Math.sin(((seconds / (LOOK_SECONDS * 0.7)) + phase) * Math.PI * 2) * LOOK_PITCH_RADIANS;
    setOffset(bones.head, bones.headApplied, pitch, look * look * look * LOOK_YAW_RADIANS);
  }
}

/** ลูกค้าเลิกนั่งรอ (เริ่มกิน/ลุก) — ถอดค่าที่ซ้อนค้างไว้ออก ไม่ให้หัว/ลำตัวเอียงค้างในท่าอื่น */
export function clearSeatedIdle(model: THREE.Object3D) {
  const bones = cache.get(model);
  if (!bones) return;
  for (const [bone, state] of [[bones.spine, bones.spineApplied], [bones.head, bones.headApplied]] as const) {
    if (!bone || !state.valid) continue;
    if (bone.rotation.x === state.result.x && bone.rotation.y === state.result.y) {
      bone.rotation.x -= state.offset.x;
      bone.rotation.y -= state.offset.y;
    }
    state.valid = false;
  }
}
