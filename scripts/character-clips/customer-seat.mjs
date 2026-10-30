/**
 * feat-112 · คลิปลูกค้าเลื่อนเก้าอี้และนั่ง/ลุก: PullChair, SitDown, PushChair, StandUp
 *
 * SitDown/StandUp ยืม track ท่อนล่างของคลิป Sit เดิมมาทั้งเส้น (StandUp = Sit ย้อนเวลา)
 * เฟรมแรก/เฟรมท้ายจึงตรงกับท่ายืนและท่านั่งเดิมเป๊ะ cross-fade กับ Idle/Sit/Eat ได้ทันที
 * ส่วนที่เพิ่มคือแขนที่เกาะพนัก/ยันเบาะ และท่าครึ่งตัวที่หันไปดึงเก้าอี้
 *
 * Root motion: คลิปไม่เลื่อน root และสะโพกขยับเฉพาะย่อ/หันตัว (|z| ≤ 0.06 ม.)
 * ระยะถอยไปนั่งบนเก้าอี้ที่ดึงออก (CHAIR_PULL) เป็นของ seat-motion/controller เท่านั้น
 * จึงไม่ถูกคูณซ้ำกับการเลื่อนเก้าอี้
 *
 * ระยะดึง: มือเกาะพนักเฉพาะช่วง gripWindow ซึ่งเก้าอี้เคลื่อนไปแค่ GRIP_TRAVEL (0.16 ม.)
 * แล้วปล่อยมือ เก้าอี้ที่เหลือเลื่อนเองต่อ ท่าจึงถูกทั้งที่ระยะดึงเต็ม 0.30 ม. และที่ลดเหลือ 0.16 ม.
 * ถ้าพื้นที่แคบกว่านั้นให้ข้าม PullChair/PushChair ไปเล่น SitDown/StandUp ตรง ๆ (ดู SEAT_MOTION_PROFILE.fallback)
 *
 * provider ไม่เขียนไฟล์และไม่แตะกระดูกจริง (คำนวณท่าบนสำเนากระดูก)
 */
import * as THREE from "three";

export const roles = ["customer"];

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---- เก้าอี้ของฉากในพื้นที่โมเดล (ม., ลูกค้ายืน/นั่งหันหน้าเข้าโต๊ะ = +Z) ----
/** ผิวบนเบาะ (กล่องเบาะหนา 0.06 วางที่ 0.42) */
const SEAT_TOP_Y = 0.45;
/** ขอบบนพนักพิง (กล่องพนัก 0.42 วางที่ 0.66) */
const BACKREST_TOP_Y = 0.87;
/** ระนาบพนักพิงของเก้าอี้ขนาดมาตรฐาน: seatD = 0.45 × 0.86 → z = seatD/2 − 0.025 ฝั่งตรงข้ามโต๊ะ */
const BACKREST_Z = -0.1685;
/** ครึ่งความกว้างเบาะ (seatW = 0.45 × 0.86) */
const SEAT_HALF_X = 0.1935;
/** ระยะดึงเก้าอี้เต็มของฉาก (CHAIR_PULL ใน seat-motion.ts) */
const NOMINAL_PULL = 0.3;
/** เก้าอี้เคลื่อนไปเท่านี้ขณะที่มือยังเกาะพนัก — ระยะดึงที่น้อยกว่านี้ต้องใช้ท่าสำรอง */
const GRIP_TRAVEL = 0.16;

/** จุดจับบนพนักพิง: ต่ำจากขอบบนเล็กน้อย ฝั่งมือขวา */
const GRIP_X = 0.18;
const GRIP_Y = BACKREST_TOP_Y - 0.03;

/** จุดยันเบาะตอนดันเก้าอี้ขณะนั่ง (ขอบเบาะข้างสะโพกขวา) */
const SEAT_PUSH = V(SEAT_HALF_X + 0.02, SEAT_TOP_Y, -0.05);
/**
 * จุดเกาะพนักพิงตอนหย่อนตัวลง/ดันตัวขึ้น — ไม่ใช่ผิวเบาะ เพราะไหล่ท่ายืนอยู่สูงจากเบาะ ~0.9 ม.
 * ซึ่งเกินช่วงเอื้อมไหล่→ข้อมือ (0.54 ม.) ขณะที่พนักพิงสูง 0.84 ม. เอื้อมถึงได้ทั้งท่ายืนและท่านั่ง
 * ขณะ SitDown/StandUp ตัวและเก้าอี้ถูก controller เลื่อนไปพร้อมกัน พนักพิงจึงอยู่ที่เดิมในพิกัดโมเดล
 */
const SIT_SUPPORT = V(GRIP_X + 0.02, BACKREST_TOP_Y - 0.03, BACKREST_Z);
/** ตำแหน่งมือตอนปล่อยพนัก (ข้างตัว) — เอื้อมถึงทั้งท่ายืนและท่านั่ง */
const SUPPORT_RELEASE = V(0.225, 0.78, 0);

const PULL_DURATION = 1.1;
const PUSH_DURATION = 0.9;
/** phase ของ marker (normalized) */
const MARKER_TIMES = {
  pullGrip: 0.22, pullRelease: 0.46,
  sitSupport: 0.35, sitSeated: 0.92,
  pushGrip: 0.2, standPush: 0.2,
};

/** จุดกลางผิวฝ่ามือใน local ของกระดูก Hand (หน้า local −Z ของก้อนมือ) */
const palmLocal = (side) => V(side * -0.0099, -0.0864, -0.0253);

const smooth = (t) => t * t * (3 - 2 * t);
const pulse = (t, from, to) => (t <= from || t >= to ? 0 : Math.sin((Math.PI * (t - from)) / (to - from)) ** 2);
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

function handQuaternion(fingers, palmNormal) {
  const y = fingers.clone().normalize().negate();
  const z = palmNormal.clone().normalize().negate();
  z.sub(y.clone().multiplyScalar(z.dot(y)));
  if (z.lengthSq() < 1e-8) z.set(y.y, -y.x, 0);
  z.normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

function placePalm(skeleton, side, contact, fingers, palmNormal) {
  const prefix = side < 0 ? "Left" : "Right";
  const hand = skeleton.map.get(`${prefix}Hand`);
  const handQ = handQuaternion(fingers, palmNormal);
  const wrist = contact.clone().sub(palmLocal(side).applyQuaternion(handQ));
  const miss = solveLimb(skeleton.map.get(`${prefix}Arm`), skeleton.map.get(`${prefix}ForeArm`), hand, wrist, V(side * 0.5, -0.6, -0.6));
  setWorldQuaternion(hand, handQ);
  return miss;
}

/** ตรึงข้อเท้าไว้ที่ตำแหน่งท่ายืน: หันตัว/ย่อได้โดยเท้าไม่ไถล (เท้าไม่ยกเลยทั้งคลิป) */
function plantFeet(skeleton) {
  const hipsY = skeleton.rest.get("Hips").y;
  let miss = 0;
  for (const side of [-1, 1]) {
    const prefix = side < 0 ? "Left" : "Right";
    const ankle = skeleton.rest.get(`${prefix}Leg`).clone()
      .add(skeleton.rest.get(`${prefix}LowerLeg`)).add(skeleton.rest.get(`${prefix}Foot`)).add(V(0, hipsY, 0));
    miss = Math.max(miss, solveLimb(skeleton.map.get(`${prefix}Leg`), skeleton.map.get(`${prefix}LowerLeg`), skeleton.map.get(`${prefix}Foot`), ankle, V(side * 0.12, 0, 1)));
    setWorldQuaternion(skeleton.map.get(`${prefix}Foot`), new THREE.Quaternion());
  }
  return miss;
}

const ARM_BONES = ["LeftArm", "RightArm", "LeftForeArm", "RightForeArm", "LeftHand", "RightHand"];
const LOWER_BODY_TRACKS = [
  "LeftLeg.quaternion", "RightLeg.quaternion", "LeftLowerLeg.quaternion", "RightLowerLeg.quaternion",
  "LeftFoot.quaternion", "RightFoot.quaternion", "Hips.position",
];
const QUATERNION_BONES = ["Hips", "Spine", "Neck", "Head", ...ARM_BONES, "LeftLeg", "RightLeg", "LeftLowerLeg", "RightLowerLeg", "LeftFoot", "RightFoot"];

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

const frameValues = (track, index, size) => Array.from({ length: size }, (_, k) => track.values[index * size + k]);

function baseClip(baseClips, name) {
  const clip = baseClips.find((candidate) => candidate.name === name);
  if (!clip) throw new Error(`customer-seat: ไม่พบคลิปฐาน ${name}`);
  return clip;
}

/** ท่าของคลิปฐานที่คีย์ลำดับ index (reversed = อ่านย้อนจากท้ายคลิป) */
function basePoseAt(clip, index, count, reversed) {
  const frame = reversed ? count - 1 - index : index;
  const pose = new Map();
  let hips = null;
  for (const track of clip.tracks) {
    const [name, property] = track.name.split(".");
    if (property === "quaternion") pose.set(name, new THREE.Quaternion().fromArray(frameValues(track, frame, 4)));
    else if (track.name === "Hips.position") hips = V(...frameValues(track, frame, 3));
  }
  return { pose, hips };
}

/** track ท่อนล่างของคลิปฐาน (ย้อนเวลาได้) — จังหวะนั่ง/ลุกเดิมจึงไม่เปลี่ยน */
function lowerBodyTracks(clip, times, reversed) {
  return clip.tracks.filter((track) => LOWER_BODY_TRACKS.includes(track.name)).map((track) => {
    const size = track.getValueSize();
    const count = track.times.length;
    const values = [];
    for (let index = 0; index < count; index += 1) values.push(...frameValues(track, reversed ? count - 1 - index : index, size));
    return track.name === "Hips.position"
      ? new THREE.VectorKeyframeTrack(track.name, times, values)
      : new THREE.QuaternionKeyframeTrack(track.name, times, values);
  });
}

/**
 * นั่งลง/ลุกขึ้นบนท่อนล่างของคลิป Sit เดิม + แขนที่ยันเบาะเก้าอี้
 * ปลายทั้งสองข้างของคลิป slerp กลับไปใช้ท่าแขนของ Sit เดิม เพื่อ cross-fade ได้สนิท
 */
function seatTransition(skeleton, sit, reversed, supportAt) {
  const times = Array.from(sit.tracks.find((track) => track.name === "Hips.position").times);
  const count = times.length;
  const recorder = createRecorder();
  let miss = 0;
  for (let index = 0; index < count; index += 1) {
    const t = index / (count - 1);
    const base = basePoseAt(sit, index, count, reversed);
    resetPose(skeleton);
    if (base.hips) skeleton.map.get("Hips").position.copy(base.hips);
    for (const [name, quaternion] of base.pose) skeleton.map.get(name).quaternion.copy(quaternion);
    skeleton.root.updateMatrixWorld(true);
    // มือขวาเกาะพนักพิงช่วงกลางท่า แล้วกลับไปท่าแขนของ Sit เดิมที่ปลายคลิป
    // 0 ที่เฟรมแรก/ท้ายเสมอ (ท่าแขนตรงกับ Sit เดิมพอดี) และเต็ม 1 ที่ marker hand-contact
    const support = rampAt(t, [[0, 0], [supportAt, 1], [Math.min(0.9, supportAt + 0.25), 1], [0.98, 0], [1, 0]]);
    const contact = SUPPORT_RELEASE.clone().lerp(SIT_SUPPORT, support);
    const fingers = V(0, -1, 0.12).lerp(V(0.08, -0.88, 0.47), support);
    miss = Math.max(miss, placePalm(skeleton, 1, contact, fingers, V(0, -1, 0)));
    const blend = 1 - support;
    for (const name of ARM_BONES) {
      const reference = base.pose.get(name);
      if (reference) skeleton.map.get(name).quaternion.slerp(reference, blend);
    }
    skeleton.root.updateMatrixWorld(true);
    recorder.capture(skeleton);
  }
  const reused = lowerBodyTracks(sit, times, reversed);
  const authored = recorder.tracks(times, false).filter((track) => !reused.some((existing) => existing.name === track.name));
  return { duration: sit.duration, tracks: [...reused, ...authored], miss };
}

export default function createCustomerSeatClips({ role, bones, baseClips }) {
  if (role !== "customer") throw new Error(`customer-seat รองรับเฉพาะ customer (ได้ ${role})`);
  const skeleton = cloneSkeleton(bones);
  const sit = baseClip(baseClips, "Sit");

  // ---- PullChair: ยืนตรงที่เก้าอี้ หันครึ่งตัวไปเกาะพนัก (hand-contact) ดึงเก้าอี้ออก GRIP_TRAVEL แล้วปล่อย ----
  const { pullGrip, pullRelease } = MARKER_TIMES;
  const pullFrames = 48;
  const pullTimes = Array.from({ length: pullFrames + 1 }, (_, i) => (PULL_DURATION * i) / pullFrames);
  const pullRecorder = createRecorder();
  let pullMiss = 0;
  for (const time of pullTimes) {
    const t = time / PULL_DURATION;
    const turn = rampAt(t, [[0, 0], [pullGrip, 1], [pullRelease, 1], [0.86, 0.12], [1, 0]]);
    resetPose(skeleton);
    // หันครึ่งตัวและย่อเข่าเล็กน้อยเพื่อเอื้อมถึงพนักโดยเท้าทั้งสองยังอยู่กับที่
    skeleton.map.get("Hips").position.add(V(0.02 * turn, -0.05 * turn, -0.04 * turn));
    skeleton.map.get("Hips").quaternion.setFromEuler(new THREE.Euler(0, 0.55 * turn, 0));
    skeleton.map.get("Spine").quaternion.setFromEuler(new THREE.Euler(0.12 * turn, 0.25 * turn, 0));
    skeleton.map.get("Neck").quaternion.setFromEuler(new THREE.Euler(0.04 * turn, 0.16 * turn, 0));
    skeleton.map.get("Head").quaternion.setFromEuler(new THREE.Euler(0.1 * turn, 0.2 * turn, 0));
    skeleton.root.updateMatrixWorld(true);
    pullMiss = Math.max(pullMiss, plantFeet(skeleton));
    // พนักพิงเลื่อนออกจากโต๊ะ (−Z) ระหว่าง gripWindow; ก่อน/หลังนั้นมือเดินทางจาก/ไปข้างตัว
    const travel = rampAt(t, [[0, 0], [pullGrip, 0], [pullRelease, GRIP_TRAVEL], [1, GRIP_TRAVEL]]);
    const grip = V(GRIP_X, GRIP_Y, BACKREST_Z - travel);
    const reaching = rampAt(t, [[0, 0], [pullGrip, 1], [pullRelease, 1], [0.78, 0], [1, 0]]);
    const resting = V(0.215, 0.73, 0.03);
    const contact = resting.clone().lerp(grip, reaching);
    const fingers = V(0, -1, 0.12).lerp(V(0.1, -0.85, 0.52), reaching);
    pullMiss = Math.max(pullMiss, placePalm(skeleton, 1, contact, fingers, V(0, -1, 0)));
    // มือซ้ายปล่อยข้างตัวตามการหันตัว
    pullMiss = Math.max(pullMiss, placePalm(skeleton, -1, rampVector(t, [[0, [-0.215, 0.73, 0.03]], [pullGrip, [-0.2, 0.73, 0.09]], [1, [-0.215, 0.73, 0.03]]]), V(0, -1, 0.12), V(0, 1, 0)));
    pullRecorder.capture(skeleton);
  }

  // ---- PushChair: นั่งอยู่แล้วเอื้อมยันขอบเบาะดันเก้าอี้เข้าใต้โต๊ะ (hand-contact) ----
  const seatedBase = basePoseAt(sit, sit.tracks.find((track) => track.name === "Hips.position").times.length - 1, 1, false);
  const pushFrames = 36;
  const pushTimes = Array.from({ length: pushFrames + 1 }, (_, i) => (PUSH_DURATION * i) / pushFrames);
  const pushRecorder = createRecorder();
  let pushMiss = 0;
  for (const time of pushTimes) {
    const t = time / PUSH_DURATION;
    resetPose(skeleton);
    if (seatedBase.hips) skeleton.map.get("Hips").position.copy(seatedBase.hips);
    for (const [name, quaternion] of seatedBase.pose) skeleton.map.get(name).quaternion.copy(quaternion);
    skeleton.map.get("Spine").quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.06 * pulse(t, 0, 0.8), -0.1 * pulse(t, 0, 0.8), 0)));
    skeleton.root.updateMatrixWorld(true);
    const pressing = rampAt(t, [[0, 0], [MARKER_TIMES.pushGrip, 1], [0.66, 1], [1, 0]]);
    const contact = SEAT_PUSH.clone().lerp(V(SEAT_PUSH.x + 0.02, SEAT_TOP_Y + 0.22, SEAT_PUSH.z + 0.05), 1 - pressing);
    pushMiss = Math.max(pushMiss, placePalm(skeleton, 1, contact, V(0.18, -0.92, 0.35), V(0, -1, 0)));
    const reference = seatedBase.pose;
    for (const name of ARM_BONES) {
      const target = reference.get(name);
      if (target && name.startsWith("Left")) skeleton.map.get(name).quaternion.copy(target);
      else if (target) skeleton.map.get(name).quaternion.slerp(target, 1 - pressing);
    }
    skeleton.root.updateMatrixWorld(true);
    pushRecorder.capture(skeleton);
  }

  const sitDown = seatTransition(skeleton, sit, false, MARKER_TIMES.sitSupport);
  const standUp = seatTransition(skeleton, sit, true, MARKER_TIMES.standPush);

  const miss = Math.max(pullMiss, pushMiss, sitDown.miss, standUp.miss);
  if (miss > 0.004) throw new Error(`customer-seat: แขน/ขาเอื้อมไม่ถึงเป้า (พลาด ${miss.toFixed(4)} ม.)`);

  return {
    clips: [
      new THREE.AnimationClip("PullChair", PULL_DURATION, pullRecorder.tracks(pullTimes)),
      new THREE.AnimationClip("SitDown", sitDown.duration, sitDown.tracks),
      new THREE.AnimationClip("PushChair", PUSH_DURATION, pushRecorder.tracks(pushTimes)),
      new THREE.AnimationClip("StandUp", standUp.duration, standUp.tracks),
    ],
    markers: {
      PullChair: [{ name: "hand-contact", time: pullGrip }],
      SitDown: [{ name: "hand-contact", time: MARKER_TIMES.sitSupport }, { name: "seated", time: MARKER_TIMES.sitSeated }],
      PushChair: [{ name: "hand-contact", time: MARKER_TIMES.pushGrip }, { name: "seated", time: 0 }],
      StandUp: [{ name: "seated", time: 0 }, { name: "hand-contact", time: MARKER_TIMES.standPush }],
    },
  };
}

/** ค่าที่ 119 ใช้คุมเก้าอี้ให้ตรงกับคลิป */
export const SEAT_MOTION_PROFILE = {
  chair: { seatTopY: SEAT_TOP_Y, backrestTopY: BACKREST_TOP_Y, backrestZ: BACKREST_Z, seatHalfX: SEAT_HALF_X },
  grip: { x: GRIP_X, y: GRIP_Y, palmLocal: palmLocal(1).toArray() },
  seatPush: SEAT_PUSH.toArray(),
  /** มือเกาะพนักเฉพาะช่วงนี้ และเก้าอี้ต้องเคลื่อนไป gripTravel พอดีระหว่างสองจุดนี้ */
  gripWindow: [MARKER_TIMES.pullGrip, MARKER_TIMES.pullRelease],
  gripTravel: GRIP_TRAVEL,
  nominalPullDistance: NOMINAL_PULL,
  minimumPullDistance: GRIP_TRAVEL,
  rootMotion: {
    ownedByController: `offset ถอยไปนั่งบนเก้าอี้ที่ดึงออก ${NOMINAL_PULL} ม. (seat-motion stepSeat)`,
    clipTranslatesRoot: false,
    clipHipsLateralLimit: 0.06,
  },
  fallback: "พื้นที่ดึงเก้าอี้ < minimumPullDistance → ข้าม PullChair/PushChair แล้วเล่น SitDown/StandUp ตรง ๆ (เฟรมแรก/ท้ายเป็นท่ายืน-ท่านั่งเดิม จึง blend จาก Idle/Sit ได้)",
  markerTimes: MARKER_TIMES,
  durations: { PullChair: PULL_DURATION, PushChair: PUSH_DURATION },
};
