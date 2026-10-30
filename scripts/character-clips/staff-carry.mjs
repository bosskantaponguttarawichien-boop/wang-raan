/**
 * feat-109 · คลิปพนักงานถือถาดอาหาร: CarryIdle, CarryWalk, PickUp, PutDown
 *
 * ท่าทั้งสี่ใช้ rig เดิม (scripts/model-generation/rig.mjs) และยืม track ท่อนล่างของ Idle/Walk เดิมมาตรง ๆ
 * จังหวะขาและระยะก้าวจึงไม่เปลี่ยน — ที่เพิ่มคือท่อนบนสองแขนที่ "ล็อกฝ่ามือไว้ที่ grip ของถาด"
 *
 * ถาดในฉากติดกับ root ของโมเดล (TRAY_HEIGHT/TRAY_FORWARD ใน three-view.tsx) ไม่ใช่ติดมือ
 * ท่าที่ถูกจึงเป็น "มือตามถาด" ไม่ใช่ "ถาดตามมือ": ผิวฝ่ามือถูกตรึงแนบใต้ขอบถาดที่พิกัดคงที่
 * ในพื้นที่โมเดล แล้วปล่อยให้ IK ของแขนดูดซับการโยกของลำตัว ถาดจึงได้ระดับนิ่งสนิท
 * โดยฉากไม่ต้องแก้ parenting และอาหารบนถาดไม่ลอยหนีมือ
 *
 * provider ไม่เขียนไฟล์และไม่แตะกระดูกจริง (คำนวณท่าบนสำเนากระดูก) ตาม contract v1 §3
 */
import * as THREE from "three";

export const roles = ["staff"];

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---- ถาดเสิร์ฟในพื้นที่โมเดล (ม., โมเดลสูง 1.70 หันหน้า +Z) ----
// ตรงกับ TRAY_HEIGHT = CHARACTER_HEIGHT * 0.6 และ TRAY_FORWARD ของ three-view.tsx ที่ CHARACTER_SCALE = 1
/** ระดับกลางแผ่นถาด */
const TRAY_Y = 1.02;
/** กลางถาดยื่นออกหน้าตัวเท่านี้ */
const TRAY_FORWARD = 0.3;
/** ใต้ขอบถาด (ขอบ 0.46 × 0.34 หนา 0.012 อยู่ต่ำจากกลางแผ่น 0.014) — ผิวที่ฝ่ามือแนบ */
const TRAY_BOTTOM = TRAY_Y - 0.014 - 0.006;
/** ใต้แผ่นถาด (0.42 × 0.30 หนา 0.022) — ไม่มีส่วนใดของแขนขึ้นเหนือระดับนี้ในพื้นที่แผ่นถาด */
const BOARD_BOTTOM = TRAY_Y - 0.011;
/** ครึ่งขนาดขอบถาด */
const TRAY_HALF_X = 0.23;
const TRAY_HALF_Z = 0.17;
/** ผิวบนจานที่วางบนถาด (จานหนา 0.025 ยกจากกลางแผ่นถาด 0.024) */
const PLATE_ON_TRAY_TOP = TRAY_Y + 0.024 + 0.0125;

/** ผิวบนเคาน์เตอร์รับอาหาร (topY 1.005 + slab 0.045 ใน createCounter) */
const COUNTER_SURFACE_Y = 1.05;
/** ระดับที่ฝ่ามือแบรับถาดจากครัว — สูงพ้นผิวเคาน์เตอร์เผื่อความหนาฝ่ามือ */
const RECEIVE_Y = COUNTER_SURFACE_Y + 0.085;
/** ฝ่ามือยื่นออกไปรับถาดเท่านี้ */
const RECEIVE_FORWARD = 0.34;
/**
 * ผิวบนโต๊ะอาหารจริงของฉาก: three-view.tsx วางกล่องหนา 0.04 ม. โดยให้ "จุดกลาง" อยู่ที่ 0.74 ม.
 * (placeMesh ตั้ง mesh.position.y) ผิวบนจึงอยู่ที่ 0.76 ม. — สัญญา v1 §3 ที่เขียน "tabletop 0.74"
 * หมายถึงความสูงที่ตั้งกล่อง ไม่ใช่ผิวสัมผัส; feat-116 ของสาย table-service ก็ใช้ 0.76 ม.
 */
const TABLE_BOX_CENTER_Y = 0.74;
const TABLE_SURFACE_Y = TABLE_BOX_CENTER_Y + 0.02;
/** จานถูกวางห่างจากกลางตัวพนักงานเท่านี้ตามแกนหน้า */
const PLACE_FORWARD = 0.38;
/** ความหนาจาน (CylinderGeometry ของ legacy serving props) */
const PLATE_THICKNESS = 0.025;

/** ความยาวคลิปรับถาด / วางจาน (วินาที) */
const PICK_UP_DURATION = 1.2;
const PUT_DOWN_DURATION = 1.4;

/**
 * จุดกลางผิวฝ่ามือใน local ของกระดูก Hand — ผิวที่แตะถาด/จาน ไม่ใช่จุดกลางก้อนมือ
 * (ก้อนมือกินพื้นที่ local y −0.168..−0.005 และ z −0.025..+0.075 จาก bounding box ของผิวที่ผูกกับ Hand
 *  ฝ่ามือคือหน้า local −Z เนื้อมือที่เหลือจึงอยู่ฝั่งตรงข้ามผิวสัมผัสเสมอ)
 */
const palmLocal = (side) => V(side * -0.0099, -0.0864, -0.0253);
/** ผิวฝ่ามือรองใต้ขอบถาดซ้าย/ขวา */
const trayGrip = (side) => V(side * 0.155, TRAY_BOTTOM, TRAY_FORWARD - 0.038);
/** นิ้วชี้ไปหน้าเฉียงเข้าหากลางตัวและอยู่ระดับเดียวกับถาด — ฝ่ามือแนบเต็มหน้า ไม่ใช่แตะปลายนิ้ว */
const trayFingers = (side) => V(side * -0.26, 0, 0.95);
/** ท่ามือตอนปล่อย: นิ้วห้อยลงหน้าเล็กน้อยเหมือนท่ายืนเดิม */
const restFingers = () => V(0, -1, 0.12);

const smooth = (t) => t * t * (3 - 2 * t);
/** 0 → 1 → 0 แบบนุ่ม ระหว่าง from..to */
const pulse = (t, from, to) => (t <= from || t >= to ? 0 : Math.sin((Math.PI * (t - from)) / (to - from)) ** 2);
/** ค่าตามคีย์เวลา (คีย์เรียงขึ้น) แล้ว ease ระหว่างคีย์ */
function rampAt(t, keys) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i += 1) {
    if (t > keys[i][0]) continue;
    const [t0, v0] = keys[i - 1];
    const [t1, v1] = keys[i];
    return v0 + (v1 - v0) * smooth((t - t0) / (t1 - t0));
  }
  return keys[keys.length - 1][1];
}

/** สำเนาโครงกระดูกเพื่อคำนวณท่า — กระดูกจริงถูก export จึงห้ามแตะ */
function cloneSkeleton(bones) {
  const root = bones.get("Hips").clone();
  const map = new Map();
  root.traverse((bone) => map.set(bone.name, bone));
  return { root, map, rest: new Map([...map].map(([name, bone]) => [name, bone.position.clone()])) };
}

function resetPose({ root, map, rest }) {
  for (const [name, bone] of map) {
    bone.quaternion.identity();
    bone.position.copy(rest.get(name));
  }
  root.updateMatrixWorld(true);
}

/** หมุนกระดูกให้แกนท่อน (ทิศของกระดูกลูกใน local) ชี้ไปทาง worldDir */
function aimBone(bone, childLocal, worldDir) {
  const parentQ = bone.parent ? bone.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion();
  const target = worldDir.clone().normalize().applyQuaternion(parentQ.invert());
  bone.quaternion.setFromUnitVectors(childLocal.clone().normalize(), target);
  bone.updateMatrixWorld(true);
}

function setWorldQuaternion(bone, worldQ) {
  const parentQ = bone.parent.getWorldQuaternion(new THREE.Quaternion());
  bone.quaternion.copy(parentQ.invert().multiply(worldQ));
  bone.updateMatrixWorld(true);
}

/**
 * จัดท่อนสองท่อน (ไหล่→ศอก→ข้อมือ หรือ สะโพก→เข่า→ข้อเท้า) ให้ปลายถึง target โดยข้อพับชี้ไปทาง pole
 * @returns ระยะที่ target อยู่นอกช่วงเอื้อม (0 = ถึงพอดี)
 */
function solveLimb(root, mid, tip, target, pole) {
  const start = root.getWorldPosition(V());
  const upper = mid.position.length();
  const lower = tip.position.length();
  const toTarget = target.clone().sub(start);
  const span = toTarget.length();
  const reach = THREE.MathUtils.clamp(span, Math.abs(upper - lower) + 1e-4, upper + lower - 1e-4);
  const forward = toTarget.clone().normalize();
  const side = pole.clone().normalize();
  side.sub(forward.clone().multiplyScalar(side.dot(forward)));
  if (side.lengthSq() < 1e-8) side.set(forward.z, 0, -forward.x);
  side.normalize();
  const angle = Math.acos(THREE.MathUtils.clamp((upper * upper + reach * reach - lower * lower) / (2 * upper * reach), -1, 1));
  const joint = start.clone().addScaledVector(forward, upper * Math.cos(angle)).addScaledVector(side, upper * Math.sin(angle));
  aimBone(root, mid.position, joint.clone().sub(start));
  aimBone(mid, tip.position, start.clone().addScaledVector(forward, reach).sub(joint));
  return Math.abs(span - reach);
}

/** ท่ามือจากทิศนิ้ว (local −Y) และทิศที่ฝ่ามือ (local −Z) หันไป — คุมระนาบฝ่ามือได้ตรง ไม่ใช่แค่ทิศนิ้ว */
function handQuaternion(fingers, palmNormal) {
  const y = fingers.clone().normalize().negate();
  const z = palmNormal.clone().normalize().negate();
  z.sub(y.clone().multiplyScalar(z.dot(y)));
  if (z.lengthSq() < 1e-8) z.set(y.y, -y.x, 0);
  z.normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

const PALM_UP = V(0, 1, 0);
const PALM_DOWN = V(0, -1, 0);

/**
 * วางผิวฝ่ามือข้างหนึ่งไว้ที่จุด contact
 * @param flip 0 = ฝ่ามือหงายรับของ, 1 = ฝ่ามือคว่ำจับของจากด้านบน (slerp สองท่า ข้อมือจึงพลิกต่อเนื่อง)
 */
function placePalm(skeleton, side, contact, fingers, flip = 0) {
  const prefix = side < 0 ? "Left" : "Right";
  const hand = skeleton.map.get(`${prefix}Hand`);
  const handQ = handQuaternion(fingers, PALM_UP).slerp(handQuaternion(fingers, PALM_DOWN), flip);
  const wrist = contact.clone().sub(palmLocal(side).applyQuaternion(handQ));
  const miss = solveLimb(skeleton.map.get(`${prefix}Arm`), skeleton.map.get(`${prefix}ForeArm`), hand, wrist, V(side * 0.45, -0.5, -0.8));
  setWorldQuaternion(hand, handQ);
  return miss;
}

/** ตรึงข้อเท้าไว้ที่ตำแหน่งท่ายืนและกดฝ่าเท้าให้ราบ — สะโพกเลื่อน/โน้มได้โดยเท้าไม่ไถล */
function plantFeet(skeleton) {
  const hipsY = skeleton.rest.get("Hips").y;
  for (const side of [-1, 1]) {
    const prefix = side < 0 ? "Left" : "Right";
    const ankle = skeleton.rest.get(`${prefix}Leg`).clone()
      .add(skeleton.rest.get(`${prefix}LowerLeg`)).add(skeleton.rest.get(`${prefix}Foot`)).add(V(0, hipsY, 0));
    solveLimb(skeleton.map.get(`${prefix}Leg`), skeleton.map.get(`${prefix}LowerLeg`), skeleton.map.get(`${prefix}Foot`), ankle, V(side * 0.12, 0, 1));
    setWorldQuaternion(skeleton.map.get(`${prefix}Foot`), new THREE.Quaternion());
  }
}

const QUATERNION_BONES = [
  "Hips", "Spine", "Neck", "Head",
  "LeftArm", "RightArm", "LeftForeArm", "RightForeArm", "LeftHand", "RightHand",
  "LeftLeg", "RightLeg", "LeftLowerLeg", "RightLowerLeg", "LeftFoot", "RightFoot",
];

/** บันทึกท่าของกระดูกทุกเฟรม แล้วประกอบเป็น track ชุดเดียว */
function createRecorder() {
  const rotations = new Map(QUATERNION_BONES.map((name) => [name, []]));
  const hips = [];
  return {
    capture(skeleton) {
      for (const name of QUATERNION_BONES) rotations.get(name).push(...skeleton.map.get(name).quaternion.toArray());
      const { x, y, z } = skeleton.map.get("Hips").position;
      hips.push(x, y, z);
    },
    tracks(times, withHipsPosition = true) {
      const result = QUATERNION_BONES.map((name) => new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, times, rotations.get(name)));
      if (withHipsPosition) result.push(new THREE.VectorKeyframeTrack("Hips.position", times, hips));
      return result;
    },
  };
}

/** ค่าคีย์เฟรมลำดับที่ i (คลิปฐานถูก sample ที่คีย์ของตัวเองพอดี จึงไม่ต้อง interpolate) */
const frameValues = (track, index, size) => Array.from({ length: size }, (_, k) => track.values[index * size + k]);

const baseClip = (baseClips, name) => {
  const clip = baseClips.find((candidate) => candidate.name === name);
  if (!clip) throw new Error(`staff-carry: ไม่พบคลิปฐาน ${name}`);
  return clip;
};

const trackOf = (clip, name) => {
  const track = clip.tracks.find((candidate) => candidate.name === name);
  if (!track) throw new Error(`staff-carry: ไม่พบ track ${name} ในคลิป ${clip.name}`);
  return track;
};

/** track ท่อนล่าง (ขา + ความสูงสะโพก) ที่ยกจากคลิปฐานมาทั้งเส้น จังหวะเดินจึงไม่เปลี่ยน */
const LOWER_BODY_TRACKS = [
  "LeftLeg.quaternion", "RightLeg.quaternion", "LeftLowerLeg.quaternion", "RightLowerLeg.quaternion",
  "LeftFoot.quaternion", "RightFoot.quaternion", "Hips.position",
];

/**
 * ถือถาดบนท่อนล่างของคลิปฐาน: sample คีย์ของคลิปฐานทีละเฟรม ตั้งท่อนล่าง/ลำตัวตามนั้น
 * แล้วแก้สองแขนให้ผิวฝ่ามืออยู่ที่ grip เดิมทุกเฟรม (ถาดอยู่กับที่ ระดับถาดจึงนิ่งสนิท)
 * @param damp ลดการโยกลำตัว/หัวของคลิปฐาน (ถือของอยู่ ตัวนิ่งกว่าเดิม)
 */
function carryOnBase(skeleton, base, damp) {
  const hipsPosition = trackOf(base, "Hips.position");
  const times = Array.from(hipsPosition.times);
  const hipsRotation = base.tracks.find((track) => track.name === "Hips.quaternion");
  const legTracks = LOWER_BODY_TRACKS.filter((name) => name.endsWith(".quaternion")).map((name) => trackOf(base, name));
  const swayTracks = ["Spine", "Neck", "Head"].map((name) => [name, base.tracks.find((track) => track.name === `${name}.quaternion`)]);
  const recorder = createRecorder();
  const spineLift = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.05, 0, 0));
  const headLift = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.06, 0, 0));
  let miss = 0;
  for (let frame = 0; frame < times.length; frame += 1) {
    resetPose(skeleton);
    skeleton.map.get("Hips").position.fromArray(frameValues(hipsPosition, frame, 3));
    if (hipsRotation) skeleton.map.get("Hips").quaternion.fromArray(frameValues(hipsRotation, frame, 4));
    for (const track of legTracks) skeleton.map.get(track.name.split(".")[0]).quaternion.fromArray(frameValues(track, frame, 4));
    for (const [name, track] of swayTracks) {
      if (track) skeleton.map.get(name).quaternion.slerp(new THREE.Quaternion().fromArray(frameValues(track, frame, 4)), damp);
    }
    // ลำตัวตั้งขึ้นนิดและหัวมองทางเดินข้ามถาด (ถือของจริงจะเก็บไหล่ ไม่ห่อตัว)
    skeleton.map.get("Spine").quaternion.multiply(spineLift);
    skeleton.map.get("Head").quaternion.multiply(headLift);
    skeleton.root.updateMatrixWorld(true);
    for (const side of [-1, 1]) miss = Math.max(miss, placePalm(skeleton, side, trayGrip(side), trayFingers(side)));
    recorder.capture(skeleton);
  }
  const reused = base.tracks.filter((track) => LOWER_BODY_TRACKS.includes(track.name)).map((track) => track.clone());
  const authored = recorder.tracks(times, false).filter((track) => !reused.some((existing) => existing.name === track.name));
  return { duration: base.duration, tracks: [...reused, ...authored], miss };
}

/**
 * ท่ารับถาด/วางจาน: เขียนเส้นทางผิวฝ่ามือเป็นช่วงเวลา ท่อนล่างยืนอยู่กับที่ (ข้อเท้าถูกตรึง)
 * โน้มตัวเอื้อมแล้วกลับมาตั้งตรง — ไม่มี track ของ root โมเดล controller จึงเป็นเจ้าของตำแหน่งเดียว
 */
function authoredClip(skeleton, duration, frames, pathAt) {
  const times = Array.from({ length: frames + 1 }, (_, i) => (duration * i) / frames);
  const recorder = createRecorder();
  let miss = 0;
  for (const time of times) {
    const step = pathAt(time / duration);
    resetPose(skeleton);
    skeleton.map.get("Hips").position.add(V(0, -step.crouch, step.hipsForward));
    skeleton.map.get("Spine").quaternion.setFromEuler(new THREE.Euler(step.lean, 0, 0));
    skeleton.map.get("Neck").quaternion.setFromEuler(new THREE.Euler(step.lean * 0.3, 0, 0));
    skeleton.map.get("Head").quaternion.setFromEuler(new THREE.Euler(step.lean * 0.25 + 0.06, 0, 0));
    skeleton.root.updateMatrixWorld(true);
    plantFeet(skeleton);
    miss = Math.max(miss,
      placePalm(skeleton, -1, step.left, step.leftFingers, step.leftFlip ?? 0),
      placePalm(skeleton, 1, step.right, step.rightFingers, step.rightFlip ?? 0));
    recorder.capture(skeleton);
  }
  return { duration, tracks: recorder.tracks(times), miss };
}

export default function createStaffCarryClips({ role, bones, baseClips }) {
  if (role !== "staff") throw new Error(`staff-carry รองรับเฉพาะ staff (ได้ ${role})`);
  const skeleton = cloneSkeleton(bones);

  const idle = carryOnBase(skeleton, baseClip(baseClips, "Idle"), 0.45);
  const walk = carryOnBase(skeleton, baseClip(baseClips, "Walk"), 0.5);

  // ---- PickUp: ยืนที่เคาน์เตอร์ → ยกมือขึ้นพ้นผิวเคาน์เตอร์แล้วแบฝ่ามือออกไปรับ (hand-contact)
  // → ถาดถูกวางบนฝ่ามือ (food-contact) → ดึงเข้าตัวจนเข้า grip เดียวกับเฟรมแรกของ CarryIdle ----
  const pickUp = authoredClip(skeleton, PICK_UP_DURATION, 36, (t) => {
    const hold = rampAt(t, [[0, 0], [0.36, 1], [1, 1]]);
    // ยกมือขึ้นก่อนแล้วจึงยื่นออกไป — มือจึงไม่ผ่านเข้าไปในตัวเคาน์เตอร์
    const palm = (side) => V(
      side * rampAt(t, [[0, 0.215], [0.4, 0.175], [1, 0.155]]),
      rampAt(t, [[0, 0.73], [0.3, RECEIVE_Y], [0.58, RECEIVE_Y], [1, TRAY_BOTTOM]]),
      rampAt(t, [[0, 0.03], [0.22, 0.12], [0.4, RECEIVE_FORWARD], [0.58, RECEIVE_FORWARD], [1, TRAY_FORWARD - 0.038]]),
    );
    const fingers = (side) => restFingers().lerp(trayFingers(side), hold);
    return {
      left: palm(-1), right: palm(1), leftFingers: fingers(-1), rightFingers: fingers(1),
      lean: 0.14 * pulse(t, 0, 0.78), hipsForward: 0.03 * pulse(t, 0, 0.78), crouch: 0.01 * pulse(t, 0.08, 0.7),
    };
  });

  // ---- PutDown: มือขวาสไลด์ออกพ้นขอบถาด พลิกคว่ำฝ่ามือจับจานจากด้านบน (hand-contact)
  // → ยกข้ามขอบถาดไปวางให้ก้นจานแตะโต๊ะ 0.74 ม. (food-contact) → ปล่อยแล้วย้อนทางเดิมกลับมารองถาด
  // มือซ้ายรองถาดไว้ทั้งคลิป ถาดจึงไม่เอียงและของบนถาดไม่ลอย ----
  const putDown = authoredClip(skeleton, PUT_DOWN_DURATION, 42, (t) => {
    // น้ำหนักการโน้มตัวเดินตามระยะที่มือยื่นออกไป (ไม่ใช่ pulse สมมาตร) — ตอนหุบมือกลับลำตัวยังช่วยเอื้อมอยู่
    const reaching = rampAt(t, [[0, 0], [0.2, 0.18], [0.5, 0.95], [0.62, 1], [0.82, 0.86], [0.95, 0.06], [1, 0]]);
    const outside = TRAY_HALF_X + 0.03;
    return {
      left: trayGrip(-1),
      right: V(
        rampAt(t, [[0, 0.155], [0.08, outside], [0.2, outside], [0.26, 0], [0.62, 0], [0.78, 0.03], [0.86, outside], [0.95, outside], [1, 0.155]]),
        rampAt(t, [[0, TRAY_BOTTOM], [0.08, TRAY_BOTTOM], [0.2, PLATE_ON_TRAY_TOP + 0.05], [0.26, PLATE_ON_TRAY_TOP], [0.42, PLATE_ON_TRAY_TOP + 0.08], [0.62, TABLE_SURFACE_Y + PLATE_THICKNESS], [0.78, TABLE_SURFACE_Y + 0.14], [0.86, PLATE_ON_TRAY_TOP + 0.05], [0.95, TRAY_BOTTOM], [1, TRAY_BOTTOM]]),
        rampAt(t, [[0, TRAY_FORWARD - 0.038], [0.2, TRAY_FORWARD - 0.01], [0.26, TRAY_FORWARD], [0.62, PLACE_FORWARD], [0.78, PLACE_FORWARD - 0.04], [0.86, TRAY_FORWARD - 0.01], [1, TRAY_FORWARD - 0.038]]),
      ),
      leftFingers: trayFingers(-1),
      rightFingers: trayFingers(1),
      // พลิกฝ่ามือคว่ำตอนอยู่นอกขอบถาด แล้วพลิกหงายกลับหลังปล่อยจาน — ไม่พลิกข้อมือเหนือถาด
      rightFlip: rampAt(t, [[0, 0], [0.08, 0], [0.2, 1], [0.8, 1], [0.92, 0], [1, 0]]),
      // ย่อเข่าช่วยเอื้อม: ช่วงไหล่→ข้อมือยาวได้สุด 0.54 ม. การวางจานระดับโต๊ะจึงต้องทั้งโน้มตัวและลดสะโพก
      lean: 0.35 * reaching, hipsForward: 0.1 * reaching, crouch: 0.08 * reaching,
    };
  });

  const miss = Math.max(idle.miss, walk.miss, pickUp.miss, putDown.miss);
  if (miss > 0.004) throw new Error(`staff-carry: แขนเอื้อมไม่ถึง grip (พลาด ${miss.toFixed(4)} ม.)`);

  return {
    clips: [
      new THREE.AnimationClip("CarryIdle", idle.duration, idle.tracks),
      new THREE.AnimationClip("CarryWalk", walk.duration, walk.tracks),
      new THREE.AnimationClip("PickUp", pickUp.duration, pickUp.tracks),
      new THREE.AnimationClip("PutDown", putDown.duration, putDown.tracks),
    ],
    markers: {
      // ฝ่ามืออยู่ที่ grip ของถาดตั้งแต่เฟรมแรก — 117 ใช้ยืนยันว่าถาดติดมือได้ทันทีที่เข้าคลิป
      CarryIdle: [{ name: "hand-contact", time: 0 }],
      CarryWalk: [{ name: "hand-contact", time: 0 }],
      PickUp: [{ name: "hand-contact", time: 0.4 }, { name: "food-contact", time: 0.58 }],
      PutDown: [{ name: "hand-contact", time: 0.26 }, { name: "food-contact", time: 0.62 }],
    },
  };
}

/** ค่าที่ 117 ใช้วางถาด/จานให้ตรงกับคลิป (อ่านได้โดยไม่ต้องโหลด GLB) */
export const STAFF_CARRY_PROFILE = {
  tray: { centerY: TRAY_Y, bottomY: TRAY_BOTTOM, boardBottomY: BOARD_BOTTOM, forward: TRAY_FORWARD, halfX: TRAY_HALF_X, halfZ: TRAY_HALF_Z },
  grips: { left: trayGrip(-1).toArray(), right: trayGrip(1).toArray(), palmLocal: palmLocal(1).toArray() },
  receive: { surfaceY: COUNTER_SURFACE_Y, palmY: RECEIVE_Y, forward: RECEIVE_FORWARD },
  place: { surfaceY: TABLE_SURFACE_Y, forward: PLACE_FORWARD, plateThickness: PLATE_THICKNESS, plateOnTrayTopY: PLATE_ON_TRAY_TOP },
  durations: { CarryIdle: 6, CarryWalk: 0.95, PickUp: PICK_UP_DURATION, PutDown: PUT_DOWN_DURATION },
};
