/**
 * feat-110 · คลิปลูกค้านั่งกินอาหาร: Eat (หนึ่งคำต่อหนึ่งรอบ loop)
 *
 * Eat เป็นเจ้าของท่อนล่างของตัวเองทั้งหมด (สะโพก/ขา = เฟรมสุดท้ายของ Sit เดิมแบบคงที่)
 * จึงเล่นเต็มน้ำหนักได้โดยไม่ต้อง blend กับ Sit และไม่แย่งขา/hips ตามสัญญา v1 §3
 * ไม่มี track ของ root โมเดลและสะโพกไม่ขยับเลย — ตัวจึงไม่เลื่อนออกจากเบาะและไม่ซ้อนกับ controller
 *
 * ปลายอุปกรณ์ (ช้อน/ส้อม/ตะเกียบ) ถูกล็อกไว้ที่ระยะเดียวจากผิวฝ่ามือ (EAT_TIP_REACH)
 * อุปกรณ์แต่ละชนิดยาวไม่เท่ากัน จึงเลื่อนด้ามตาม gripOffset ของ EAT_UTENSILS แล้วปลายจะถึง
 * จานและปากที่จุดเดียวกันทุกชนิด — คลิปเดียวใช้ได้ครบทั้ง 5 เมนูโดยไม่เดารหัสอาหาร
 *
 * provider ไม่เขียนไฟล์และไม่แตะกระดูกจริง (คำนวณท่าบนสำเนากระดูก)
 */
import * as THREE from "three";

export const roles = ["customer"];

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---- ของจริงในฉาก (ม., พื้นที่โมเดล: โมเดลสูง 1.70 หันหน้า +Z) ----
/** ผิวบนเบาะเก้าอี้ที่ท่า Sit เดิมวางต้นขาไว้ */
const SEAT_TOP_Y = 0.45;
/**
 * ผิวบนโต๊ะอาหารจริงของฉาก: three-view.tsx วางกล่องหนา 0.04 ม. โดยให้ "จุดกลาง" อยู่ที่ 0.74 ม.
 * (placeMesh ตั้ง mesh.position.y) ผิวบนจึงอยู่ที่ 0.76 ม. — สัญญา v1 §3 ที่เขียน "tabletop 0.74"
 * หมายถึงความสูงที่ตั้งกล่อง ไม่ใช่ผิวสัมผัส; feat-116 ของสาย table-service ก็ใช้ 0.76 ม.
 */
const TABLE_BOX_CENTER_Y = 0.74;
const TABLE_SURFACE_Y = TABLE_BOX_CENTER_Y + 0.02;
/** ความหนาจาน — ปลายอุปกรณ์แตะผิวในจาน ไม่ใช่ผิวโต๊ะ */
const PLATE_THICKNESS = 0.025;
const FOOD_SURFACE_Y = TABLE_SURFACE_Y + PLATE_THICKNESS;
/** กลางจานอยู่หน้าลูกค้าเท่านี้ (รัศมีจาน 0.13 ม. จึงกินพื้นที่ 0.21–0.47) */
const PLATE_FORWARD = 0.34;
/** ปากในพิกัดกระดูก Head (จาก bounding box ของผิวที่ผูกกับ Head) */
const MOUTH_LOCAL = V(0, 0.075, 0.115);
/** ปลายอุปกรณ์หยุดห่างริมปากเท่านี้ตอนเข้าปาก — ไม่ทะลุใบหน้าแต่ยังเห็นว่าถึงปาก */
const BITE_OFFSET = V(0.015, -0.01, 0.012);
/** ระยะจากผิวฝ่ามือถึงปลายอุปกรณ์ที่คลิปนี้ล็อกไว้ */
const EAT_TIP_REACH = 0.135;
/** หนึ่งคำกินใช้เวลาเท่านี้ (วินาที) — คลิปวนรอบละหนึ่งคำ */
const EAT_DURATION = 3.2;

/** จุดกลางผิวฝ่ามือใน local ของกระดูก Hand (หน้า local −Z ของก้อนมือ) */
const palmLocal = (side) => V(side * -0.0099, -0.0864, -0.0253);

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

/** จัดไหล่→ศอก→ข้อมือให้ปลายถึง target โดยศอกชี้ไปทาง pole; คืนระยะที่เอื้อมไม่ถึง */
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

/** ท่ามือจากทิศนิ้ว (local −Y) และทิศที่ฝ่ามือ (local −Z) หันไป */
function handQuaternion(fingers, palmNormal) {
  const y = fingers.clone().normalize().negate();
  const z = palmNormal.clone().normalize().negate();
  z.sub(y.clone().multiplyScalar(z.dot(y)));
  if (z.lengthSq() < 1e-8) z.set(y.y, -y.x, 0);
  z.normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

/** วางผิวฝ่ามือไว้ที่ contact โดยนิ้วชี้ไปทาง fingers และฝ่ามือหันไปทาง palmNormal */
function placePalm(skeleton, side, contact, fingers, palmNormal) {
  const prefix = side < 0 ? "Left" : "Right";
  const hand = skeleton.map.get(`${prefix}Hand`);
  const handQ = handQuaternion(fingers, palmNormal);
  const wrist = contact.clone().sub(palmLocal(side).applyQuaternion(handQ));
  const miss = solveLimb(skeleton.map.get(`${prefix}Arm`), skeleton.map.get(`${prefix}ForeArm`), hand, wrist, V(side * 0.7, -0.6, -0.4));
  setWorldQuaternion(hand, handQ);
  return miss;
}

/**
 * ถืออุปกรณ์: ปลายอุปกรณ์อยู่ที่ tip โดยด้ามพุ่งไปทาง fingers (ผิวฝ่ามือถอยหลังมา EAT_TIP_REACH)
 * ฝ่ามือหันไปทางเดียวกับที่หงายรับอาหาร — ปลายช้อนจึงอยู่ด้านบนของมือเสมอ
 */
function placeUtensil(skeleton, tip, fingers) {
  const direction = fingers.clone().normalize();
  const palm = tip.clone().addScaledVector(direction, -EAT_TIP_REACH);
  const palmNormal = V(0, 1, 0).sub(direction.clone().multiplyScalar(direction.y));
  if (palmNormal.lengthSq() < 1e-6) palmNormal.set(0, 0, -1);
  return { miss: placePalm(skeleton, 1, palm, direction, palmNormal), palm };
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
    /** ช่วงต้น/ปลายต้องเท่ากันทุก track — loop ต่อกันได้ที่ phase offset ใด ๆ */
    seamError() {
      let worst = 0;
      for (const values of rotations.values()) {
        for (let k = 0; k < 4; k += 1) worst = Math.max(worst, Math.abs(values[k] - values[values.length - 4 + k]));
      }
      for (let k = 0; k < 3; k += 1) worst = Math.max(worst, Math.abs(hips[k] - hips[hips.length - 3 + k]));
      return worst;
    },
    tracks(times) {
      return [
        ...QUATERNION_BONES.map((name) => new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, times, rotations.get(name))),
        new THREE.VectorKeyframeTrack("Hips.position", times, hips),
      ];
    },
  };
}

/** ท่านั่งคงที่จากเฟรมสุดท้ายของคลิป Sit เดิม — Eat จึงไม่ต้อง blend ทับขาของ Sit */
function seatedPose(baseClips) {
  const sit = baseClips.find((clip) => clip.name === "Sit");
  if (!sit) throw new Error("customer-eat: ไม่พบคลิปฐาน Sit");
  const pose = new Map();
  let hips = null;
  for (const track of sit.tracks) {
    const [name, property] = track.name.split(".");
    const size = track.getValueSize();
    const last = Array.from({ length: size }, (_, k) => track.values[track.values.length - size + k]);
    if (property === "quaternion") pose.set(name, new THREE.Quaternion().fromArray(last));
    else if (track.name === "Hips.position") hips = V(...last);
  }
  if (!hips) throw new Error("customer-eat: คลิป Sit ไม่มี Hips.position");
  return { pose, hips };
}

export default function createCustomerEatClips({ role, bones, baseClips }) {
  if (role !== "customer") throw new Error(`customer-eat รองรับเฉพาะ customer (ได้ ${role})`);
  const skeleton = cloneSkeleton(bones);
  const seated = seatedPose(baseClips);

  // ปากในพิกัดโลกของท่านั่ง — คำนวณครั้งเดียวจากท่านั่งจริง ไม่ใช่ค่าคาดเดา
  resetPose(skeleton);
  skeleton.map.get("Hips").position.copy(seated.hips);
  for (const [name, quaternion] of seated.pose) skeleton.map.get(name).quaternion.copy(quaternion);
  skeleton.root.updateMatrixWorld(true);
  const restingMouth = skeleton.map.get("Head").localToWorld(MOUTH_LOCAL.clone());

  // ---- เส้นทางปลายอุปกรณ์: ลอยเหนือจาน → ตัก (food-contact) → ยกเข้าปาก (hand-contact) → เคี้ยว → กลับ ----
  const tipPath = [
    [0, [0.045, FOOD_SURFACE_Y + 0.075, PLATE_FORWARD]],
    [0.14, [0.045, FOOD_SURFACE_Y, PLATE_FORWARD]],
    [0.26, [0.035, FOOD_SURFACE_Y + 0.11, PLATE_FORWARD - 0.03]],
    [0.45, restingMouth.clone().add(BITE_OFFSET).toArray()],
    [0.58, [0.03, restingMouth.y - 0.1, restingMouth.z + 0.1]],
    [0.78, [0.045, FOOD_SURFACE_Y + 0.13, PLATE_FORWARD - 0.02]],
    [1, [0.045, FOOD_SURFACE_Y + 0.075, PLATE_FORWARD]],
  ];
  // ด้ามอุปกรณ์: ตอนตักพุ่งลงหน้า ตอนเข้าปากพุ่งขึ้นและถอยเข้าหาตัว
  const handlePath = [
    [0, [-0.06, -0.62, 0.78]],
    [0.14, [-0.06, -0.66, 0.75]],
    [0.26, [-0.09, -0.3, 0.6]],
    [0.45, [-0.14, 0.5, -0.85]],
    [0.58, [-0.12, 0.1, -0.4]],
    [0.78, [-0.08, -0.5, 0.72]],
    [1, [-0.06, -0.62, 0.78]],
  ];
  /** มือซ้ายวางนิ่งบนผิวโต๊ะข้างจาน (ฝ่ามือคว่ำ) */
  const leftRest = V(-0.185, TABLE_SURFACE_Y, PLATE_FORWARD - 0.05);
  const leftFingers = V(0.1, 0, 0.995);

  const frames = 48;
  const times = Array.from({ length: frames + 1 }, (_, i) => (EAT_DURATION * i) / frames);
  const recorder = createRecorder();
  let miss = 0;
  const trace = [];
  for (const time of times) {
    const t = time / EAT_DURATION;
    resetPose(skeleton);
    skeleton.map.get("Hips").position.copy(seated.hips);
    for (const [name, quaternion] of seated.pose) skeleton.map.get(name).quaternion.copy(quaternion);
    // ลำตัวโน้มเข้าจานตอนตักและตั้งขึ้นตอนเคี้ยว; หัวก้มตามช้อนแล้วเคี้ยวเป็นจังหวะ (วนรอบเนียน)
    const lean = rampAt(t, [[0, 0.1], [0.14, 0.17], [0.45, 0.04], [0.62, 0.05], [1, 0.1]]);
    const chew = 0.5 - 0.5 * Math.cos(2 * Math.PI * 3 * t);
    const nod = rampAt(t, [[0, 0.08], [0.14, 0.14], [0.45, 0.04], [0.58, 0.05], [1, 0.08]]);
    skeleton.map.get("Spine").quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(lean, 0, 0)));
    skeleton.map.get("Neck").quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(nod * 0.5, 0, 0)));
    const chewing = rampAt(t, [[0, 0], [0.45, 0], [0.52, 1], [0.86, 1], [0.95, 0], [1, 0]]);
    skeleton.map.get("Head").quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(nod + 0.018 * chew * chewing, 0, 0)));
    skeleton.root.updateMatrixWorld(true);
    miss = Math.max(miss, placePalm(skeleton, -1, leftRest, leftFingers, V(0, -1, 0)));
    // ปากขยับตามการโน้มตัว/ก้มหัว จึงยิงปลายอุปกรณ์ไปที่ปากของเฟรมนั้นจริง ไม่ใช่ปากของท่านั่งนิ่ง
    // น้ำหนักเป็น 0 ที่ปลายทั้งสองข้างของคลิป loop จึงยังต่อเนื่อง
    const biteWeight = rampAt(t, [[0, 0], [0.3, 0], [0.45, 1], [0.56, 0], [1, 0]]);
    const liveMouth = skeleton.map.get("Head").localToWorld(MOUTH_LOCAL.clone());
    const tip = rampVector(t, tipPath).lerp(liveMouth.add(BITE_OFFSET), biteWeight);
    const utensil = placeUtensil(skeleton, tip, rampVector(t, handlePath));
    miss = Math.max(miss, utensil.miss);
    recorder.capture(skeleton);
    trace.push({ t, tip, palm: utensil.palm });
  }
  if (miss > 0.004) throw new Error(`customer-eat: แขนเอื้อมไม่ถึงเส้นทางอุปกรณ์ (พลาด ${miss.toFixed(4)} ม.)`);
  const seam = recorder.seamError();
  if (seam > 1e-6) throw new Error(`customer-eat: loop ไม่ต่อเนื่อง (ต่างกัน ${seam.toExponential(2)})`);

  return {
    clips: [new THREE.AnimationClip("Eat", EAT_DURATION, recorder.tracks(times))],
    markers: {
      // seated@0 = คลิปนี้ถือท่านั่งครบในตัวเอง 118 เล่นเต็มน้ำหนักได้โดยไม่ต้องผสม Sit
      Eat: [
        { name: "seated", time: 0 },
        { name: "food-contact", time: 0.14 },
        { name: "hand-contact", time: 0.45 },
      ],
    },
  };
}

/**
 * อุปกรณ์ของแต่ละเมนู (ล็อกชื่อตามสัญญา v1) — 118 ติดอุปกรณ์เข้ามือโดยเลื่อนด้ามตาม gripOffset
 * ปลายอุปกรณ์จึงอยู่ห่างผิวฝ่ามือ EAT_TIP_REACH เท่ากันทุกชนิด คลิป Eat เดียวใช้ได้ครบ
 */
export const EAT_UTENSILS = {
  "fried-rice": { utensil: "spoon", length: 0.17 },
  noodles: { utensil: "chopsticks", length: 0.24 },
  steak: { utensil: "fork", length: 0.19 },
  salad: { utensil: "fork", length: 0.19 },
  cake: { utensil: "fork", length: 0.16 },
};

/** ระยะเลื่อนด้ามเข้าหามือ เพื่อให้ปลายอุปกรณ์อยู่ที่ EAT_TIP_REACH */
export const utensilGripOffset = (food) => {
  const entry = EAT_UTENSILS[food];
  if (!entry) throw new Error(`customer-eat: ไม่รู้จักเมนู ${food}`);
  return Number((entry.length - EAT_TIP_REACH).toFixed(4));
};

/**
 * เหลื่อมจังหวะกินของลูกค้าแต่ละคนแบบ deterministic (ไม่ใช้ RNG ของ simulation)
 * hash เดียวกันทุกครั้งที่ seed/party/member เดิม → ภาพซ้ำได้และไม่กระทบ arrival/cook/metrics
 */
export function eatPhaseOffset(seed, partyId, memberIndex) {
  let hash = 0x811c9dc5;
  for (const value of [seed, partyId, memberIndex]) {
    const word = Math.trunc(value) >>> 0;
    // คลุกทีละไบต์ ไม่ใช่ทั้งคำ — ค่าที่ต่างกัน 1 จึงกระจายทั่วช่วง ไม่เกาะกลุ่มกัน
    for (let shift = 0; shift < 32; shift += 8) {
      hash ^= (word >>> shift) & 0xff;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  }
  return (hash >>> 8) / 0x01000000;
}

/** ค่าที่ 118 ใช้วางจาน/อุปกรณ์ให้ตรงกับคลิป */
export const CUSTOMER_EAT_PROFILE = {
  seatTopY: SEAT_TOP_Y,
  tableSurfaceY: TABLE_SURFACE_Y,
  foodSurfaceY: FOOD_SURFACE_Y,
  plateForward: PLATE_FORWARD,
  mouthLocal: MOUTH_LOCAL.toArray(),
  tipReach: EAT_TIP_REACH,
  palmLocal: palmLocal(1).toArray(),
  durations: { Eat: EAT_DURATION },
};
