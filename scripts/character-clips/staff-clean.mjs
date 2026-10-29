/**
 * feat-111 · คลิปพนักงานเก็บจานและเช็ดโต๊ะ: WipeTable
 *
 * ท่าเดียวครบสามช่วง: เก็บจาน (hand-contact) → ลงผ้าเช็ดโต๊ะ (wipe-contact) → เช็ดเสร็จยืนขึ้น (clear-complete)
 * มือซ้ายถือจานที่เก็บไว้ตั้งแต่ hand-contact จนจบคลิป มือขวาถือผ้าแนบผิวโต๊ะทั้งช่วงเช็ด
 * 117 ควรลดคราบตามช่วง stainWindow (wipe-contact → clear-complete) ไม่ใช่ตอนคลิปจบ
 * คราบจึงไม่หายก่อนงานเช็ดเสร็จ ส่วนการปล่อยโต๊ะยังเป็นของ engine ตามสัญญา v1 §1
 *
 * ช่วงไหล่→ข้อมือยาวได้สุด 0.54 ม. ท่านี้จึงเช็ดได้เฉพาะแถบหน้า service point ของตัวเอง
 * (ดู WIPE_FOOTPRINT) โต๊ะที่ลึกหรือกว้างกว่านั้นต้องเช็ดจากหลายด้าน — 117 เป็นผู้เลือกด้าน
 *
 * provider ไม่เขียนไฟล์และไม่แตะกระดูกจริง (คำนวณท่าบนสำเนากระดูก)
 */
import * as THREE from "three";

export const roles = ["staff"];

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---- ของจริงในฉาก (ม., พื้นที่โมเดล: โมเดลสูง 1.70 หันหน้า +Z) ----
/**
 * ผิวบนโต๊ะอาหารจริงของฉาก: three-view.tsx วางกล่องหนา 0.04 ม. โดยให้ "จุดกลาง" อยู่ที่ 0.74 ม.
 * (placeMesh ตั้ง mesh.position.y) ผิวบนจึงอยู่ที่ 0.76 ม. — สัญญา v1 §3 ที่เขียน "tabletop 0.74"
 * หมายถึงความสูงที่ตั้งกล่อง ไม่ใช่ผิวสัมผัส; feat-116 ของสาย table-service ก็ใช้ 0.76 ม.
 */
const TABLE_BOX_CENTER_Y = 0.74;
const TABLE_SURFACE_Y = TABLE_BOX_CENTER_Y + 0.02;
/** ความหนาผ้าเช็ดในมือ — ผิวฝ่ามือจึงอยู่สูงกว่าผิวโต๊ะเท่านี้ตอนเช็ด */
const CLOTH_THICKNESS = 0.03;
const WIPE_CONTACT_Y = TABLE_SURFACE_Y + CLOTH_THICKNESS;
/** ความหนาจานที่เก็บ (CylinderGeometry ของ legacy serving props) */
const PLATE_THICKNESS = 0.025;
/** จานที่ต้องเก็บวางอยู่หน้าพนักงานเท่านี้ */
const PLATE_FORWARD = 0.42;
/** จานที่เก็บแล้วถูกถือไว้ระดับนี้ (เอวสูงข้างตัว) ตลอดช่วงเช็ด */
const CARRIED_PLATE = V(-0.21, 1.0, 0.2);

/** จุดหมุนของวงกวาดผ้า (ใต้ไหล่ขวา เลื่อนตามสะโพกที่ก้าวเข้าโต๊ะ) */
const WIPE_PIVOT = V(0.175, 0, 0.16);
/** มุมกวาดข้าง (rad) รอบจุดหมุน — กลางวงเอียงเข้าหากลางตัวเล็กน้อย */
const WIPE_SWEEP_CENTER = -0.05;
const WIPE_SWEEP_HALF = 0.5;
/** รัศมีวงกวาด: เริ่มจากขอบไกลแล้วรูดเข้าหาตัว */
const WIPE_RADIUS_FAR = 0.43;
const WIPE_RADIUS_NEAR = 0.2;
/** จำนวนรอบกวาดซ้าย-ขวาในหนึ่งคลิป */
const WIPE_STROKES = 2.5;

const WIPE_DURATION = 4;
/** phase ของ marker (normalized) */
const MARKER_TIMES = { handContact: 0.12, wipeContact: 0.3, clearComplete: 0.82 };

/** ผิวฝ่ามือจริงอยู่ด้านในลำตัว (local −X สำหรับมือขวา) */
const palmLocal = (side) => V(side * -0.014, -0.065, 0.008);

const smooth = (t) => t * t * (3 - 2 * t);
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
const rampVector = (t, keys) => V(
  rampAt(t, keys.map(([time, point]) => [time, point[0]])),
  rampAt(t, keys.map(([time, point]) => [time, point[1]])),
  rampAt(t, keys.map(([time, point]) => [time, point[2]])),
);

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

function handQuaternion(fingers, palmNormal, side) {
  const y = fingers.clone().normalize().negate();
  const x = palmNormal.clone().normalize().multiplyScalar(-side);
  x.sub(y.clone().multiplyScalar(x.dot(y)));
  if (x.lengthSq() < 1e-8) x.set(y.y, -y.x, 0);
  x.normalize();
  const z = new THREE.Vector3().crossVectors(x, y).normalize();
  x.crossVectors(y, z).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

function placePalm(skeleton, side, contact, fingers, palmNormal) {
  const prefix = side < 0 ? "Left" : "Right";
  const hand = skeleton.map.get(`${prefix}Hand`);
  const handQ = handQuaternion(fingers, palmNormal, side);
  const wrist = contact.clone().sub(palmLocal(side).applyQuaternion(handQ));
  const miss = solveLimb(skeleton.map.get(`${prefix}Arm`), skeleton.map.get(`${prefix}ForeArm`), hand, wrist, V(side * 0.55, -0.55, -0.65));
  setWorldQuaternion(hand, handQ);
  return miss;
}

/** ตรึงข้อเท้าไว้ที่ท่ายืนและกดฝ่าเท้าราบ — ก้าวเข้าโต๊ะด้วยสะโพกได้โดยเท้าไม่ไถล */
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

function createRecorder() {
  const rotations = new Map(QUATERNION_BONES.map((name) => [name, []]));
  const hips = [];
  return {
    capture(skeleton) {
      for (const name of QUATERNION_BONES) rotations.get(name).push(...skeleton.map.get(name).quaternion.toArray());
      const { x, y, z } = skeleton.map.get("Hips").position;
      hips.push(x, y, z);
    },
    tracks(times) {
      return [
        ...QUATERNION_BONES.map((name) => new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, times, rotations.get(name))),
        new THREE.VectorKeyframeTrack("Hips.position", times, hips),
      ];
    },
  };
}

/** จุดที่ผ้าแตะโต๊ะที่ phase u ของช่วงเช็ด (0 = เริ่มกวาด, 1 = จบกวาด) */
function wipePoint(u) {
  const angle = WIPE_SWEEP_CENTER + WIPE_SWEEP_HALF * Math.sin(2 * Math.PI * WIPE_STROKES * u);
  const radius = WIPE_RADIUS_FAR + (WIPE_RADIUS_NEAR - WIPE_RADIUS_FAR) * u;
  return {
    angle,
    point: V(WIPE_PIVOT.x + radius * Math.sin(angle), WIPE_CONTACT_Y, WIPE_PIVOT.z + radius * Math.cos(angle)),
  };
}

export default function createStaffCleanClips({ role, bones }) {
  if (role !== "staff") throw new Error(`staff-clean รองรับเฉพาะ staff (ได้ ${role})`);
  const skeleton = cloneSkeleton(bones);

  const { handContact, wipeContact, clearComplete } = MARKER_TIMES;
  // มือซ้าย: ปล่อยข้างตัว → กดลงบนขอบจาน (hand-contact) → ยกจานขึ้นถือไว้จนจบคลิป
  const leftPath = [
    [0, [-0.215, 0.78, 0.03]],
    [handContact - 0.06, [-0.19, TABLE_SURFACE_Y + 0.1, PLATE_FORWARD - 0.08]],
    [handContact, [-0.17, TABLE_SURFACE_Y + PLATE_THICKNESS, PLATE_FORWARD - 0.05]],
    [handContact + 0.1, [-0.2, TABLE_SURFACE_Y + 0.17, PLATE_FORWARD - 0.14]],
    [wipeContact, CARRIED_PLATE.toArray()],
    [1, CARRIED_PLATE.toArray()],
  ];
  // คีย์ถี่พอให้การ slerp ระหว่างคีย์ไม่ยกผ้าลอยจากผิวโต๊ะเกิน 2 มม. ตอนกวาดเร็ว
  const frames = 192;
  const times = Array.from({ length: frames + 1 }, (_, i) => (WIPE_DURATION * i) / frames);
  const recorder = createRecorder();
  let miss = 0;
  for (const time of times) {
    const t = time / WIPE_DURATION;
    // โน้มตัวและก้าวสะโพกเข้าหาโต๊ะช่วงเก็บจาน/เช็ด แล้วยืนขึ้นหลัง clear-complete
    const engaged = rampAt(t, [[0, 0], [handContact, 0.8], [wipeContact, 1], [clearComplete, 1], [0.94, 0.08], [1, 0]]);
    resetPose(skeleton);
    skeleton.map.get("Hips").position.add(V(0, -0.05 * engaged, 0.16 * engaged));
    skeleton.map.get("Spine").quaternion.setFromEuler(new THREE.Euler(0.48 * engaged, 0, 0));
    skeleton.map.get("Neck").quaternion.setFromEuler(new THREE.Euler(0.1 * engaged, 0, 0));
    skeleton.root.updateMatrixWorld(true);
    plantFeet(skeleton);

    const wiping = t >= wipeContact && t <= clearComplete;
    const u = wiping ? (t - wipeContact) / (clearComplete - wipeContact) : 0;
    const stroke = wipePoint(u);
    // ก่อน/หลังช่วงเช็ด มือขวายกขึ้นจากผิวโต๊ะแล้วกลับไปข้างตัว (ผ้ายังอยู่ในมือ)
    const rightContact = wiping ? stroke.point : rampVector(t, [
      [0, [0.215, 0.78, 0.03]],
      [wipeContact - 0.1, [0.21, TABLE_SURFACE_Y + 0.16, 0.34]],
      [wipeContact, wipePoint(0).point.toArray()],
      [clearComplete, wipePoint(1).point.toArray()],
      [clearComplete + 0.08, [0.22, TABLE_SURFACE_Y + 0.17, 0.3]],
      [1, [0.215, 0.78, 0.03]],
    ]);
    // ฝ่ามือกดลงบนผ้า นิ้วชี้ตามแนวกวาด; ตอนปล่อยมือ นิ้วห้อยลงเหมือนท่ายืน
    const wipeFingers = V(Math.sin(stroke.angle * 0.6), 0, Math.cos(stroke.angle * 0.6));
    const pressing = wiping ? 1 : rampAt(t, [[0, 0], [wipeContact - 0.12, 1], [clearComplete + 0.12, 1], [0.97, 0], [1, 0]]);
    const rightFingers = V(0, -1, 0.12).lerp(wipeFingers, pressing);
    const rightNormal = V(0, 1, 0).lerp(V(0, -1, 0), pressing);
    miss = Math.max(miss, placePalm(skeleton, 1, rightContact, rightFingers, rightNormal));

    const leftContact = rampVector(t, leftPath);
    const holding = rampAt(t, [[0, 0], [handContact - 0.06, 1], [1, 1]]);
    miss = Math.max(miss, placePalm(skeleton, -1, leftContact, V(0, -1, 0.12).lerp(V(-0.12, 0, 0.99), holding), V(0, 1, 0).lerp(V(0, -1, 0), holding)));
    recorder.capture(skeleton);
  }
  if (miss > 0.004) throw new Error(`staff-clean: แขนเอื้อมไม่ถึงเส้นทางเช็ด (พลาด ${miss.toFixed(4)} ม.)`);

  return {
    clips: [new THREE.AnimationClip("WipeTable", WIPE_DURATION, recorder.tracks(times))],
    markers: {
      WipeTable: [
        { name: "hand-contact", time: handContact },
        { name: "wipe-contact", time: wipeContact },
        { name: "clear-complete", time: clearComplete },
      ],
    },
  };
}

/**
 * ขอบเขตที่ผ้าเช็ดถึงจริงในพื้นที่โมเดล (วงกวาดรอบจุดหมุนใต้ไหล่ขวา)
 * โต๊ะที่กินพื้นที่เกินแถบนี้ต้องเช็ดจาก service point อื่นเพิ่ม — คลิปเดียวไม่ครอบทั้งโต๊ะ
 */
export const WIPE_FOOTPRINT = {
  pivot: WIPE_PIVOT.toArray(),
  sweepCenter: WIPE_SWEEP_CENTER,
  sweepHalfAngle: WIPE_SWEEP_HALF,
  radiusFar: WIPE_RADIUS_FAR,
  radiusNear: WIPE_RADIUS_NEAR,
  strokes: WIPE_STROKES,
  /** กรอบสี่เหลี่ยมหยาบของแถบที่เช็ดถึง [xMin, xMax, zMin, zMax] */
  bounds: [
    WIPE_PIVOT.x + WIPE_RADIUS_FAR * Math.sin(WIPE_SWEEP_CENTER - WIPE_SWEEP_HALF),
    WIPE_PIVOT.x + WIPE_RADIUS_FAR * Math.sin(WIPE_SWEEP_CENTER + WIPE_SWEEP_HALF),
    WIPE_PIVOT.z + WIPE_RADIUS_NEAR * Math.cos(WIPE_SWEEP_CENTER),
    WIPE_PIVOT.z + WIPE_RADIUS_FAR,
  ].map((value) => Number(value.toFixed(4))),
  fallback: "โต๊ะที่ลึก/กว้างเกิน bounds ให้ 117 เล่นซ้ำจาก service point ด้านอื่นของโต๊ะเดียวกัน",
};

/** ค่าที่ 117 ใช้ผูกผ้า/จาน/คราบให้ตรงกับคลิป */
export const STAFF_CLEAN_PROFILE = {
  tableSurfaceY: TABLE_SURFACE_Y,
  clothThickness: CLOTH_THICKNESS,
  wipeContactY: WIPE_CONTACT_Y,
  plateThickness: PLATE_THICKNESS,
  plateForward: PLATE_FORWARD,
  carriedPlate: CARRIED_PLATE.toArray(),
  palmLocal: palmLocal(1).toArray(),
  markerTimes: MARKER_TIMES,
  /** ช่วงที่ควรลดคราบ — คราบต้องยังเหลือจนถึง clear-complete */
  stainWindow: [MARKER_TIMES.wipeContact, MARKER_TIMES.clearComplete],
  durations: { WipeTable: WIPE_DURATION },
};
