/**
 * สร้าง GLB ตัวละครสำหรับ Character Lab และฉาก 3D — ลูกค้า (เสื้อยืดสีอ่อน) และพนักงาน (เสื้อยืด + หมวกแก๊ปสีเขียว)
 *
 * ผิวและเสื้อผ้าปั้นแบบ box modeling ใน Blender เป็นชิ้นแยก (scripts/blender/blockout-cafe-customer.py)
 * แล้วเกลาและผูกน้ำหนักกับกระดูก (scripts/blender/build-cafe-customer-mesh.py) — สคริปต์นี้ใส่โครงกระดูกและ animation
 *
 * ตัวละครสัดส่วนผู้ใหญ่จริง สูง 1.70 ม. ที่ขนาด 1:1 (หน่วยโมเดล = เมตร) เข้ากับโต๊ะ เก้าอี้ เคาน์เตอร์ขนาดจริงในฉากร้าน
 * และมีคลิป Idle, Walk, Sit อยู่ในไฟล์เดียว
 * รัน: python scripts/blender/build-cafe-customer-mesh.py   (เมื่อแก้รูปร่างใน blockout-cafe-customer.py)
 *      node scripts/create-cafe-customer-model.mjs         → cafe-customer.glb (ละเอียด, Character Lab)
 *      node scripts/create-cafe-customer-model.mjs --lite  → cafe-customer-lite.glb (ฉากร้านที่มีลูกค้าหลายสิบคน)
 *      เติม --staff → cafe-staff.glb / cafe-staff-lite.glb (พนักงาน)
 * ทุกไฟล์ใช้รูปร่าง โครงกระดูก และ animation ชุดเดียวกัน — รุ่น lite ต่างแค่จำนวน polygon,
 * ลูกค้า/พนักงานต่างกันที่สีเสื้อผ้า (vertex color ตามหมวดชิ้นจาก Blender) และหมวกที่ผูกกับกระดูก Head
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

if (!globalThis.FileReader) {
  globalThis.FileReader = class FileReader {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((result) => {
        this.result = result;
        this.onloadend?.();
      });
    }
  };
}

const outputDirectory = new URL("../public/assets/models/", import.meta.url);
const LITE = process.argv.includes("--lite");
const STAFF = process.argv.includes("--staff");
const outputFile = new URL(`cafe-${STAFF ? "staff" : "customer"}${LITE ? "-lite" : ""}.glb`, outputDirectory);
// สีชุดพนักงาน: เขียวเข้มต่างจากสีเฟอร์นิเจอร์และเสื้อลูกค้า มองจากมุมสูงในฉากร้านก็แยกออก
const UNIFORM_COLOR = "#2f5e47";
// สีตามหมวดชิ้น (_part จาก build-cafe-customer-mesh.py): ผิว, เสื้อ, กางเกง, รองเท้า, พื้นรองเท้า, ผม (+ ขอบคอเสื้อ)
const PALETTE = {
  skin: "#d9ab86",
  shirt: STAFF ? UNIFORM_COLOR : "#c9d2de",
  pants: "#3d5a86",
  shoe: "#eef0f3",
  sole: "#c4c8cf",
  hair: "#33261d",
};
// ขอบยางคอเสื้อ: สีเดียวกับเสื้อแต่เข้มลงนิดให้เห็นเป็นขอบ
const RIB_COLOR = new THREE.Color(PALETTE.shirt).multiplyScalar(0.86);
const PART_COLORS = [PALETTE.skin, PALETTE.shirt, PALETTE.pants, PALETTE.shoe, PALETTE.sole, PALETTE.hair].map((hex) => new THREE.Color(hex)).concat(RIB_COLOR);
// สีมาจาก vertex color ทั้งตัว จึงตั้งสีวัสดุเป็นขาว
const mannequin = new THREE.MeshStandardMaterial({ color: "#ffffff", vertexColors: true, roughness: 0.84, metalness: 0 });

// ฉากร้านเห็นตัวละครเล็กกว่ามาก แต่มีพร้อมกันหลายสิบตัว (×2 รอบรวมเงา) → ใช้ผิวที่เกลาน้อยกว่า
const meshFile = new URL(LITE ? "blender/cafe-customer-mesh-lite.glb" : "blender/cafe-customer-mesh.glb", import.meta.url);

function bone(name, position) {
  const part = new THREE.Bone();
  part.name = name;
  part.position.set(...position);
  return part;
}

const model = new THREE.Group();
model.name = "CafeMannequin";

// Shoulder → elbow → wrist, hip → knee → ankle. ตำแหน่งข้อต่อ (ตำแหน่งจริงในโมเดล) ต้องตรงกับ JOINTS
// ใน build-cafe-customer-mesh.py — ผิวจาก Blender ผูกน้ำหนักไว้กับข้อต่อชุดนั้น; ศอก ข้อมือ เข่า อยู่ตรงรอยต่อตุ๊กตา
const ANKLE_Y = 0.08;
const THIGH = 0.39;
const SHIN = 0.41;
// ข้อสะโพกต่ำกว่ากระดูก Hips (กลางเชิงกราน)
const LEG_DROP = 0.04;
const HIPS_Y = ANKLE_Y + SHIN + THIGH + LEG_DROP;
const hips = bone("Hips", [0, HIPS_Y, 0]);
const spine = bone("Spine", [0, 0.13, 0]);
const neck = bone("Neck", [0, 0.35, 0]);
const head = bone("Head", [0, 0.1, 0]);
const leftArm = bone("LeftArm", [-0.175, 0.305, 0]);
const rightArm = bone("RightArm", [0.175, 0.305, 0]);
const leftForeArm = bone("LeftForeArm", [-0.023, -0.29, 0]);
const rightForeArm = bone("RightForeArm", [0.023, -0.29, 0]);
const leftHand = bone("LeftHand", [-0.012, -0.25, 0]);
const rightHand = bone("RightHand", [0.012, -0.25, 0]);
const leftLeg = bone("LeftLeg", [-0.09, -LEG_DROP, 0]);
const rightLeg = bone("RightLeg", [0.09, -LEG_DROP, 0]);
const leftLowerLeg = bone("LeftLowerLeg", [-0.005, -THIGH, 0]);
const rightLowerLeg = bone("RightLowerLeg", [0.005, -THIGH, 0]);
const leftFoot = bone("LeftFoot", [0, -SHIN, 0]);
const rightFoot = bone("RightFoot", [0, -SHIN, 0]);

model.add(hips);
hips.add(spine, leftLeg, rightLeg);
spine.add(neck, leftArm, rightArm);
neck.add(head);
leftArm.add(leftForeArm);
rightArm.add(rightForeArm);
leftForeArm.add(leftHand);
rightForeArm.add(rightHand);
leftLeg.add(leftLowerLeg);
rightLeg.add(rightLowerLeg);
leftLowerLeg.add(leftFoot);
rightLowerLeg.add(rightFoot);
model.updateMatrixWorld(true);

const bones = [
  hips, spine, neck, head,
  leftArm, rightArm, leftForeArm, rightForeArm, leftHand, rightHand,
  leftLeg, rightLeg, leftLowerLeg, rightLowerLeg, leftFoot, rightFoot,
];
const boneIndex = new Map(bones.map((part, index) => [part, index]));

// ---- ผิว: ปั้นใน Blender (scripts/blender/build-cafe-customer-mesh.py) แล้วผูกกับโครงกระดูกชุดนี้ ----
// ไฟล์จาก Blender มีกระดูกชื่อและตำแหน่งเดียวกัน — ใช้แค่ตำแหน่งผิว normal และน้ำหนักผิว แล้วจับคู่กระดูกตามชื่อ
const meshBytes = await readFile(meshFile);
const source = await new GLTFLoader().parseAsync(meshBytes.buffer.slice(meshBytes.byteOffset, meshBytes.byteOffset + meshBytes.byteLength), "");
let sourceMesh = null;
source.scene.traverse((object) => {
  if (object.isSkinnedMesh) sourceMesh = object;
});
if (!sourceMesh) throw new Error(`ไม่พบผิวที่ผูกกระดูกใน ${meshFile.pathname}`);
const boneByName = new Map(bones.map((part) => [part.name, part]));
const remap = sourceMesh.skeleton.bones.map((part) => {
  const target = boneByName.get(part.name);
  if (!target) throw new Error(`กระดูก ${part.name} จาก Blender ไม่มีในโครงกระดูกของ mannequin`);
  return boneIndex.get(target);
});
const geometry = new THREE.BufferGeometry();
for (const name of ["position", "normal"]) geometry.setAttribute(name, sourceMesh.geometry.getAttribute(name).clone());
geometry.setIndex(sourceMesh.geometry.getIndex().clone());
const sourceJoints = sourceMesh.geometry.getAttribute("skinIndex");
const sourceWeights = sourceMesh.geometry.getAttribute("skinWeight");
const skinIndices = new Uint16Array(sourceJoints.count * 4);
const skinWeights = new Float32Array(sourceJoints.count * 4);
for (let i = 0; i < sourceJoints.count; i += 1) {
  let total = 0;
  for (let slot = 0; slot < 4; slot += 1) total += sourceWeights.getComponent(i, slot);
  for (let slot = 0; slot < 4; slot += 1) {
    skinIndices[i * 4 + slot] = remap[sourceJoints.getComponent(i, slot)];
    skinWeights[i * 4 + slot] = total > 0 ? sourceWeights.getComponent(i, slot) / total : slot === 0 ? 1 : 0;
  }
}
geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIndices, 4));
geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinWeights, 4));
const position = geometry.getAttribute("position");

const body = new THREE.SkinnedMesh(geometry, mannequin);
body.name = "MannequinBody";
body.castShadow = true;
body.receiveShadow = true;
model.add(body);
model.updateMatrixWorld(true);
const skeleton = new THREE.Skeleton(bones);
body.bind(skeleton);

// ---- สีเสื้อผ้า: แต่ละชิ้นจาก Blender มีหมวดเดียวทั้งชิ้น เส้นแบ่งสีจึงคมตรงชายเสื้อ/ปลายแขนเสื้อ/ปลายขากางเกง
// สีมีไม่กี่ค่า → เก็บช่องละ 8 บิต (normalized) แทน float 32 บิต ไฟล์เล็กลงโดยสีไม่ต่างกันให้เห็น
const sourcePart = sourceMesh.geometry.getAttribute("_part");
if (!sourcePart) throw new Error(`ไม่พบหมวดชิ้น (_part) ใน ${meshFile.pathname} — รัน build-cafe-customer-mesh.py ใหม่`);
const colors = new Uint8Array(position.count * 3);
for (let i = 0; i < position.count; i += 1) {
  const color = PART_COLORS[Math.round(sourcePart.getX(i))] ?? PART_COLORS[0];
  colors.set([color.r, color.g, color.b].map((channel) => Math.round(channel * 255)), i * 3);
}
geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3, true));

if (STAFF) {
  // ---- หมวกแก๊ป: ครอบหัวตามเงา HEAD_PROFILE ใน blockout-cafe-customer.py (สูงกว่าหู) + ปีกหมวกยื่นไปหน้า
  const HEAD_DEPTH = 1.18;
  const HEAD_FORWARD = 0.012;
  const crown = [[1.612, 0.086], [1.635, 0.085], [1.655, 0.081], [1.672, 0.072], [1.686, 0.058], [1.695, 0.037], [1.7, 0]];
  // จุดเรียงจากขอบล่างขึ้นยอด (ผิวหันออก); ยอดรัศมี 0 จึงไม่เป็นรู
  // ครอบผมได้มิด (กลางกระหม่อม ~1.3 ซม., ผมหน้าผากปัดขึ้น ~1.9 ซม.): ใหญ่กว่าหัว 2.2 ซม. ยอดสูงกว่า 1.8 ซม.
  const capProfile = crown.map(([y, r]) => new THREE.Vector2(r > 0 ? r + 0.022 : 0, y + 0.018));
  capProfile.unshift(new THREE.Vector2(capProfile[0].x - 0.004, capProfile[0].y - 0.004));
  const capCrown = new THREE.LatheGeometry(capProfile, LITE ? 16 : 32);
  capCrown.scale(1, 1, HEAD_DEPTH);
  capCrown.translate(0, 0, HEAD_FORWARD);
  const brimShape = new THREE.Shape();
  brimShape.absellipse(0, 0, 0.095, 0.095, 0, Math.PI, false, 0);
  const capBrim = new THREE.ExtrudeGeometry(brimShape, { depth: 0.006, bevelEnabled: false, curveSegments: LITE ? 6 : 12 });
  // Shape อยู่บนระนาบ XY → พลิกลงนอนบนระนาบ XZ ปีกชี้ +Z (หน้า) แล้วกดปลายลงนิดเหมือนปีกหมวกจริง
  capBrim.rotateX(Math.PI / 2 - 0.12);
  capBrim.translate(0, 1.628, 0.1);
  // normal ของแต่ละชิ้นคำนวณมาแล้ว (โดมโค้งเรียบ, ปีกขอบคม) — ปีกหมวกรวมจุดซ้ำให้มีดัชนีเหมือนโดม
  // (mergeVertices รวมเฉพาะจุดที่ normal ตรงกัน ขอบคมจึงยังคม) จุดน้อยลงหลายเท่าจากการคลายดัชนี
  for (const part of [capCrown, capBrim]) part.deleteAttribute("uv");
  const capGeometry = mergeGeometries([capCrown, mergeVertices(capBrim)]);
  // หมวกแข็งทั้งใบ → เป็น mesh ธรรมดาลูกของกระดูก Head ไม่ต้องเก็บน้ำหนักผิวทุกจุด
  capGeometry.translate(...head.getWorldPosition(new THREE.Vector3()).negate().toArray());
  const cap = new THREE.Mesh(capGeometry, new THREE.MeshStandardMaterial({ color: UNIFORM_COLOR, roughness: 0.78, metalness: 0 }));
  cap.name = "StaffCap";
  cap.castShadow = true;
  head.add(cap);
}

// ---- Animation: keyframe ถี่จากคลื่น sine เพื่อให้ข้อต่อเคลื่อนแบบนุ่ม ไม่หักมุมที่ปลายวงสวิง ----
const quaternionFrames = (angles) =>
  angles.flatMap((angle) => new THREE.Quaternion().setFromEuler(new THREE.Euler(angle, 0, 0)).toArray());

function sampled(duration, frames) {
  const times = Array.from({ length: frames + 1 }, (_, i) => (duration * i) / frames);
  const phases = times.map((time) => (time / duration) * Math.PI * 2);
  return { times, phases };
}

const idleCycle = sampled(2.4, 24);
const idleWave = (amount, shift = 0, base = 0) =>
  quaternionFrames(idleCycle.phases.map((phase) => base + amount * Math.sin(phase + shift)));
const idle = new THREE.AnimationClip("Idle", 2.4, [
  new THREE.QuaternionKeyframeTrack("Head.quaternion", idleCycle.times, idleWave(0.02, Math.PI / 2)),
  new THREE.QuaternionKeyframeTrack("Neck.quaternion", idleCycle.times, idleWave(0.012, Math.PI / 2)),
  new THREE.QuaternionKeyframeTrack("Spine.quaternion", idleCycle.times, idleWave(0.012)),
  new THREE.QuaternionKeyframeTrack("LeftArm.quaternion", idleCycle.times, idleWave(0.03)),
  new THREE.QuaternionKeyframeTrack("RightArm.quaternion", idleCycle.times, idleWave(0.03)),
  new THREE.QuaternionKeyframeTrack("LeftForeArm.quaternion", idleCycle.times, idleWave(0.03, -0.6, -0.08)),
  new THREE.QuaternionKeyframeTrack("RightForeArm.quaternion", idleCycle.times, idleWave(0.03, -0.6, -0.08)),
]);

// Solve a two-bone leg toward a planted/swinging ankle instead of swinging
// every joint independently. ก้าวละ 0.5 ม. ราว 126 ก้าว/นาที (~1.05 ม./วิ) เท่าคนเดินในร้าน
const WALK_DURATION = 0.95;
const WALK_DISTANCE = 1.0;
const walkCycle = sampled(WALK_DURATION, 60);
model.userData.walkCycleDistance = WALK_DISTANCE;
// สะโพกต่ำสุดตอนสองขากางสุด (ขาเหยียดถึงพื้นพอดี) สูงสุดตอนขาผ่านกัน
const hipHeights = walkCycle.phases.map((phase) => HIPS_Y - 0.045 + 0.012 * (1 - Math.cos(phase * 2)));
function legPose(phase, hipY) {
  const t = ((phase / (Math.PI * 2)) % 1 + 1) % 1;
  const swing = Math.max(0, (t - 0.5) * 2);
  const z = t <= 0.5
    ? WALK_DISTANCE / 4 - WALK_DISTANCE * t
    : -WALK_DISTANCE / 4 + WALK_DISTANCE / 2 * (swing * swing * (3 - 2 * swing));
  const ankleY = ANKLE_Y + 0.07 * Math.sin(Math.PI * swing) ** 2;
  const down = hipY - LEG_DROP - ankleY;
  const thigh = THIGH;
  const shin = SHIN;
  const knee = Math.acos(THREE.MathUtils.clamp((down * down + z * z - thigh * thigh - shin * shin) / (2 * thigh * shin), -1, 1));
  const hip = Math.atan2(-z, down) - Math.atan2(shin * Math.sin(knee), thigh + shin * Math.cos(knee));
  return { hip, knee, ankle: -hip - knee };
}
const legsAt = (offset) => walkCycle.phases.map((phase, i) => legPose(phase + offset, hipHeights[i]));
const leftPoses = legsAt(0);
const rightPoses = legsAt(Math.PI);
const jointTrack = (name, poses, key) => new THREE.QuaternionKeyframeTrack(name + ".quaternion", walkCycle.times, quaternionFrames(poses.map((pose) => pose[key])));
// แขนแกว่งสวนขา: ไปหน้ามากกว่าไปหลัง (ศูนย์กลางเอนหน้า 0.05 rad) และกางออกจากลำตัวนิดหนึ่งไม่ให้มือถูขา
const ARM_SWING = 0.24;
const armAngles = (offset) => walkCycle.phases.map((phase) => -0.05 + ARM_SWING * Math.cos(phase + offset));
// ศอกงอเสมอเล็กน้อย และงอมากขึ้นตอนแขนแกว่งไปหน้า (ท่อนแขนตามแรงเหวี่ยง) งอน้อยลงตอนแกว่งไปหลัง
const foreArmAngles = (offset) => armAngles(offset).map((a) => -0.22 + Math.min(0, a) * 0.9 + Math.max(0, a) * 0.35);
// ข้อมือห้อยผ่อนคลาย ตามจังหวะแขนช้ากว่านิดหน่อย
const handAngles = (offset) => walkCycle.phases.map((phase) => -0.03 + 0.04 * Math.cos(phase + offset - 0.5));
const armTrack = (name, angles, outward) =>
  new THREE.QuaternionKeyframeTrack(name + ".quaternion", walkCycle.times, angles.flatMap((angle) => new THREE.Quaternion().setFromEuler(new THREE.Euler(angle, 0, outward, "XYZ")).toArray()));
const upperBodyFrames = (sign) => walkCycle.phases.flatMap((phase) => new THREE.Quaternion().setFromEuler(new THREE.Euler(0, sign * 0.012 * Math.sin(phase), sign * 0.006 * Math.cos(phase))).toArray());
const walk = new THREE.AnimationClip("Walk", WALK_DURATION, [
  jointTrack("LeftLeg", leftPoses, "hip"), jointTrack("RightLeg", rightPoses, "hip"),
  jointTrack("LeftLowerLeg", leftPoses, "knee"), jointTrack("RightLowerLeg", rightPoses, "knee"),
  jointTrack("LeftFoot", leftPoses, "ankle"), jointTrack("RightFoot", rightPoses, "ankle"),
  // Left leg forward → left arm back, right arm forward.
  // ต้นแขนกางออก ~3° (แกน z: ซ้าย −, ขวา +) มือจึงผ่านข้างสะโพก ไม่ทะลุกางเกง
  armTrack("LeftArm", armAngles(0), -0.05),
  armTrack("RightArm", armAngles(Math.PI), 0.05),
  new THREE.QuaternionKeyframeTrack("LeftForeArm.quaternion", walkCycle.times, quaternionFrames(foreArmAngles(0))),
  new THREE.QuaternionKeyframeTrack("RightForeArm.quaternion", walkCycle.times, quaternionFrames(foreArmAngles(Math.PI))),
  new THREE.QuaternionKeyframeTrack("LeftHand.quaternion", walkCycle.times, quaternionFrames(handAngles(0))),
  new THREE.QuaternionKeyframeTrack("RightHand.quaternion", walkCycle.times, quaternionFrames(handAngles(Math.PI))),
  new THREE.QuaternionKeyframeTrack("Spine.quaternion", walkCycle.times, upperBodyFrames(1)),
  new THREE.QuaternionKeyframeTrack("Head.quaternion", walkCycle.times, upperBodyFrames(-0.6)),
  new THREE.VectorKeyframeTrack("Hips.position", walkCycle.times, hipHeights.flatMap((y) => [0, y, 0])),
]);

// ใต้ต้นขาอยู่บนเบาะเก้าอี้ในฉากร้าน (ผิวบน 0.45 ม. มาตรฐานเก้าอี้ทานอาหาร) = เบาะ + ข้อสะโพกต่ำกว่า Hips + ครึ่งความหนาต้นขา
const SEAT_TOP = 0.45;
const THIGH_UNDER = 0.09;
const SIT_HIPS_Y = SEAT_TOP + LEG_DROP + THIGH_UNDER;
// ต้นขาลาดลงหาเข่าเล็กน้อย หน้าแข้งเอนไปหน้านิด → เท้าวางราบบนพื้นพอดี (ข้อเท้ากลับมาที่ ANKLE_Y)
const SIT_SHIN_LEAN = 0.05;
const SIT_THIGH_SLOPE = Math.asin((SIT_HIPS_Y - LEG_DROP - ANKLE_Y - SHIN * Math.cos(SIT_SHIN_LEAN)) / THIGH);
// ท่านั่งลงค่อย ๆ เร่งแล้วชะลอ (ease in-out) และโน้มตัวไปหน้าเล็กน้อยกลางจังหวะเหมือนคนหย่อนตัวลงเก้าอี้
// ฉากเล่นคลิปนี้ย้อนกลับ = ท่าลุกขึ้น
const SIT_DURATION = 0.9;
const sitTimes = Array.from({ length: 19 }, (_, i) => (SIT_DURATION * i) / 18);
const sitEase = sitTimes.map((time) => {
  const t = time / SIT_DURATION;
  return t * t * (3 - 2 * t);
});
// ก้ม/เงยก่อน (X) แล้วค่อยหมุนเข้าหาลำตัว (Y) — ท่อนแขนที่ยื่นไปหน้าจึงหันเข้าด้านในได้
const pose = (x, z = 0, y = 0) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, "YXZ"));
const sitTrack = (name, to) =>
  new THREE.QuaternionKeyframeTrack(name + ".quaternion", sitTimes, sitEase.flatMap((e) => new THREE.Quaternion().slerp(to, e).toArray()));
// แขนท่านั่ง: กำหนดทิศของแต่ละท่อนในพิกัดตัว (ลำตัวตั้งตรงตอนจบท่า) แล้วหมุนกระดูกจากทิศตอนยืนไปหา
// ศอกห้อยข้างตัวใต้ไหล่ → ข้อมืออยู่เหนือต้นขากลางตัก (ไหล่ → ข้อมือ: ข้าง +0.05, ลง 0.385, หน้า 0.24 ม.)
// → ถุงมือวางตะแคง (นิ้วโป้งขึ้น) บนต้นขาชี้ไปทางเข่า — ทิศหาจากความยาวต้นแขน 0.29 / ปลายแขน 0.25 ม.
const unit = (v) => new THREE.Vector3(...v).normalize();
const sitArm = (sign) => {
  const upper = new THREE.Quaternion().setFromUnitVectors(unit([sign * 0.023, -0.29, 0]), unit([sign * 0.04, -0.286, 0.031]));
  const foreTarget = unit([-sign * 0.09, -0.099, 0.209]).applyQuaternion(upper.clone().invert());
  const fore = new THREE.Quaternion().setFromUnitVectors(unit([sign * 0.012, -0.25, 0]), foreTarget);
  const handTarget = unit([0, -0.3, 0.95]).applyQuaternion(upper.clone().multiply(fore).invert());
  const hand = new THREE.Quaternion().setFromUnitVectors(unit([0, -1, 0]), handTarget);
  return { upper, fore, hand };
};
const [leftSitArm, rightSitArm] = [sitArm(-1), sitArm(1)];
const sit = new THREE.AnimationClip("Sit", SIT_DURATION, [
  // สะโพกลดตามมุมขาที่งอ (ไม่ใช่เส้นตรง) ข้อเท้าจึงอยู่ระดับพื้นตลอดท่า — เท้าไม่จมพื้นระหว่างนั่งลง/ลุก
  new THREE.VectorKeyframeTrack("Hips.position", sitTimes, sitEase.flatMap((e) => {
    const thighAngle = e * (Math.PI / 2 - SIT_THIGH_SLOPE);
    return [0, LEG_DROP + ANKLE_Y + THIGH * Math.cos(thighAngle) + SHIN * Math.cos(e * SIT_SHIN_LEAN), 0];
  })),
  new THREE.QuaternionKeyframeTrack("Spine.quaternion", sitTimes, quaternionFrames(sitTimes.map((time) => 0.22 * Math.sin((Math.PI * time) / SIT_DURATION)))),
  // GLB faces +Z. Rotate the character toward the chair front so thighs and
  // forearms move forward (+Z) while the knees fold down.
  sitTrack("LeftLeg", pose(SIT_THIGH_SLOPE - Math.PI / 2)),
  sitTrack("RightLeg", pose(SIT_THIGH_SLOPE - Math.PI / 2)),
  sitTrack("LeftLowerLeg", pose(Math.PI / 2 - SIT_THIGH_SLOPE - SIT_SHIN_LEAN)),
  sitTrack("RightLowerLeg", pose(Math.PI / 2 - SIT_THIGH_SLOPE - SIT_SHIN_LEAN)),
  sitTrack("LeftFoot", pose(SIT_SHIN_LEAN)),
  sitTrack("RightFoot", pose(SIT_SHIN_LEAN)),
  sitTrack("LeftArm", leftSitArm.upper),
  sitTrack("RightArm", rightSitArm.upper),
  sitTrack("LeftForeArm", leftSitArm.fore),
  sitTrack("RightForeArm", rightSitArm.fore),
  sitTrack("LeftHand", leftSitArm.hand),
  sitTrack("RightHand", rightSitArm.hand),
]);

const exporter = new GLTFExporter();
const glb = await exporter.parseAsync(model, {
  binary: true,
  animations: [idle, walk, sit],
  onlyVisible: true,
});

await mkdir(outputDirectory, { recursive: true });
await writeFile(outputFile, new Uint8Array(glb));
console.log(`สร้าง ${outputFile.pathname} (${position.count} จุด, ${geometry.getIndex().count / 3} หน้า)`);
