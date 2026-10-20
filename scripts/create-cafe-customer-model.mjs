/**
 * สร้าง GLB mannequin สำหรับ Character Lab และฉาก 3D — ลูกค้า (สีเทาทั้งตัว) และพนักงาน (เสื้อกั๊ก + หมวกแก๊ป)
 *
 * ผิวปั้นแบบ box modeling ใน Blender เป็นชิ้นแยกตามรอยต่อตุ๊กตา (scripts/blender/blockout-cafe-customer.py)
 * แล้วเกลาและผูกน้ำหนักกับกระดูก (scripts/blender/build-cafe-customer-mesh.py) — สคริปต์นี้ใส่โครงกระดูกและ animation
 *
 * ตัวละครมีความสูง native ราว 1.05 หน่วย (แสดงผลที่ scale DISPLAY_SCALE 1.6 = ราว 1.67 ม. เท่าผู้ใหญ่)
 * และมีคลิป Idle, Walk, Sit อยู่ในไฟล์เดียว
 * รัน: python scripts/blender/build-cafe-customer-mesh.py   (เมื่อแก้รูปร่างใน blockout-cafe-customer.py)
 *      node scripts/create-cafe-customer-model.mjs         → cafe-customer.glb (ละเอียด, Character Lab)
 *      node scripts/create-cafe-customer-model.mjs --lite  → cafe-customer-lite.glb (ฉากร้านที่มีลูกค้าหลายสิบคน)
 *      เติม --staff → cafe-staff.glb / cafe-staff-lite.glb (พนักงาน)
 * ทุกไฟล์ใช้โครงกระดูกและ animation ชุดเดียวกัน — รุ่น lite ต่างแค่จำนวน polygon,
 * พนักงานต่างแค่สีลำตัว (vertex color) และหมวกที่ผูกกับกระดูก Head
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

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
const SKIN_COLOR = "#9da4af";
// สีชุดพนักงาน: เข้มกว่าผิวหุ่นและต่างจากสีเฟอร์นิเจอร์ มองจากมุมสูงในฉากร้านก็แยกออกจากลูกค้า
const UNIFORM_COLOR = "#2f6b5a";
// พนักงาน: สีผิวมาจาก vertex color (ลำตัว = ชุด, ที่เหลือ = สีหุ่น) จึงตั้งสีวัสดุเป็นขาว
const mannequin = new THREE.MeshStandardMaterial({ color: STAFF ? "#ffffff" : SKIN_COLOR, vertexColors: STAFF, roughness: 0.84, metalness: 0 });

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
const ANKLE_Y = 0.065;
const THIGH = 0.129;
const SHIN = 0.166;
// ข้อสะโพกต่ำกว่ากระดูก Hips (กลางเชิงกราน)
const LEG_DROP = 0.04;
const HIPS_Y = ANKLE_Y + SHIN + THIGH + LEG_DROP;
const hips = bone("Hips", [0, HIPS_Y, 0]);
const spine = bone("Spine", [0, 0.12, 0]);
const neck = bone("Neck", [0, 0.18, 0]);
const head = bone("Head", [0, 0.022, 0]);
const leftArm = bone("LeftArm", [-0.09, 0.115, 0]);
const rightArm = bone("RightArm", [0.09, 0.115, 0]);
const leftForeArm = bone("LeftForeArm", [-0.051, -0.114, 0]);
const rightForeArm = bone("RightForeArm", [0.051, -0.114, 0]);
const leftHand = bone("LeftHand", [-0.034, -0.096, 0]);
const rightHand = bone("RightHand", [0.034, -0.096, 0]);
const leftLeg = bone("LeftLeg", [-0.068, -LEG_DROP, 0]);
const rightLeg = bone("RightLeg", [0.068, -LEG_DROP, 0]);
const leftLowerLeg = bone("LeftLowerLeg", [0, -THIGH, 0]);
const rightLowerLeg = bone("RightLowerLeg", [0, -THIGH, 0]);
const leftFoot = bone("LeftFoot", [0.002, -SHIN, 0]);
const rightFoot = bone("RightFoot", [-0.002, -SHIN, 0]);

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

if (STAFF) {
  // ---- ชุดพนักงาน: จุดผิวที่ขยับตาม Hips/Spine อย่างเดียว = ลำตัว → ระบายสีชุด (แขน ขา คอ หัวยังเป็นสีหุ่น)
  // ลำตัวเป็นชิ้นแยกจากแขนขาตั้งแต่ใน Blender เส้นแบ่งสีจึงคมตรงรอยต่อตุ๊กตา และไม่มีผ้าทะลุตัวตอนนั่ง/เดิน
  const torsoBones = new Set([boneIndex.get(hips), boneIndex.get(spine)]);
  const skin = new THREE.Color(SKIN_COLOR);
  const uniform = new THREE.Color(UNIFORM_COLOR);
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i += 1) {
    let torso = true;
    for (let slot = 0; slot < 4; slot += 1) {
      if (skinWeights[i * 4 + slot] > 1e-4 && !torsoBones.has(skinIndices[i * 4 + slot])) torso = false;
    }
    (torso ? uniform : skin).toArray(colors, i * 3);
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

  // ---- หมวกแก๊ป: ครอบหัวตามเงา HEAD_PROFILE ใน blockout-cafe-customer.py (สูงกว่าหู) + ปีกหมวกยื่นไปหน้า
  const HEAD_DEPTH = 0.93;
  const crown = [[0.95, 0.143], [0.962, 0.137], [0.977, 0.124], [0.99, 0.114], [1.004, 0.102], [1.018, 0.086], [1.032, 0.062], [1.046, 0]];
  // จุดเรียงจากขอบล่างขึ้นยอด (ผิวหันออก); ยอดรัศมี 0 จึงไม่เป็นรู
  const capProfile = crown.map(([y, r]) => new THREE.Vector2(r > 0 ? r + 0.007 : 0, y + 0.006));
  capProfile.unshift(new THREE.Vector2(capProfile[0].x - 0.004, capProfile[0].y - 0.004));
  const capCrown = new THREE.LatheGeometry(capProfile, LITE ? 16 : 32);
  capCrown.scale(1, 1, HEAD_DEPTH);
  const brimShape = new THREE.Shape();
  brimShape.absellipse(0, 0, 0.115, 0.095, 0, Math.PI, false, 0);
  const capBrim = new THREE.ExtrudeGeometry(brimShape, { depth: 0.008, bevelEnabled: false, curveSegments: LITE ? 6 : 12 });
  // Shape อยู่บนระนาบ XY → พลิกลงนอนบนระนาบ XZ ปีกชี้ +Z (หน้า) แล้วกดปลายลงนิดเหมือนปีกหมวกจริง
  capBrim.rotateX(Math.PI / 2 - 0.12);
  capBrim.translate(0, 0.96, 0.1);
  const capGeometry = mergeGeometries([capCrown, capBrim].map((part) => {
    // normal ของแต่ละชิ้นคำนวณมาแล้ว (โดมโค้งเรียบ, ปีกขอบคม) — แค่คลายดัชนีให้รวมกันได้
    const flat = part.index ? part.toNonIndexed() : part;
    flat.deleteAttribute("uv");
    return flat;
  }));
  const headIndex = boneIndex.get(head);
  const count = capGeometry.getAttribute("position").count;
  capGeometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(new Uint16Array(count * 4).map((_, i) => (i % 4 === 0 ? headIndex : 0)), 4));
  capGeometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(new Float32Array(count * 4).map((_, i) => (i % 4 === 0 ? 1 : 0)), 4));
  const cap = new THREE.SkinnedMesh(capGeometry, new THREE.MeshStandardMaterial({ color: UNIFORM_COLOR, roughness: 0.78, metalness: 0 }));
  cap.name = "StaffCap";
  cap.castShadow = true;
  model.add(cap);
  model.updateMatrixWorld(true);
  cap.bind(skeleton);
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
// every joint independently. ขาสั้นก้าวสั้นจึงถี่ขึ้นนิด (~150 ก้าว/นาที) ดูเดินต้วมเตี้ยมน่ารัก ไม่รัว
const WALK_DURATION = 0.78;
const WALK_DISTANCE = 0.31;
const walkCycle = sampled(WALK_DURATION, 60);
model.userData.walkCycleDistance = WALK_DISTANCE;
const hipHeights = walkCycle.phases.map((phase) => HIPS_Y - 0.0136 + 0.002 * (1 - Math.cos(phase * 2)));
function legPose(phase, hipY) {
  const t = ((phase / (Math.PI * 2)) % 1 + 1) % 1;
  const swing = Math.max(0, (t - 0.5) * 2);
  const z = t <= 0.5
    ? WALK_DISTANCE / 4 - WALK_DISTANCE * t
    : -WALK_DISTANCE / 4 + WALK_DISTANCE / 2 * (swing * swing * (3 - 2 * swing));
  const ankleY = ANKLE_Y + 0.028 * Math.sin(Math.PI * swing) ** 2;
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
const armAngles = (offset) => walkCycle.phases.map((phase) => 0.12 * Math.cos(phase + offset));
const upperBodyFrames = (sign) => walkCycle.phases.flatMap((phase) => new THREE.Quaternion().setFromEuler(new THREE.Euler(0, sign * 0.012 * Math.sin(phase), sign * 0.006 * Math.cos(phase))).toArray());
const walk = new THREE.AnimationClip("Walk", WALK_DURATION, [
  jointTrack("LeftLeg", leftPoses, "hip"), jointTrack("RightLeg", rightPoses, "hip"),
  jointTrack("LeftLowerLeg", leftPoses, "knee"), jointTrack("RightLowerLeg", rightPoses, "knee"),
  jointTrack("LeftFoot", leftPoses, "ankle"), jointTrack("RightFoot", rightPoses, "ankle"),
  // Left leg forward → left arm back, right arm forward.
  new THREE.QuaternionKeyframeTrack("LeftArm.quaternion", walkCycle.times, quaternionFrames(armAngles(0))),
  new THREE.QuaternionKeyframeTrack("RightArm.quaternion", walkCycle.times, quaternionFrames(armAngles(Math.PI))),
  new THREE.QuaternionKeyframeTrack("LeftForeArm.quaternion", walkCycle.times, quaternionFrames(armAngles(0).map((a) => -0.12 + a * 0.25))),
  new THREE.QuaternionKeyframeTrack("RightForeArm.quaternion", walkCycle.times, quaternionFrames(armAngles(Math.PI).map((a) => -0.12 + a * 0.25))),
  new THREE.QuaternionKeyframeTrack("Spine.quaternion", walkCycle.times, upperBodyFrames(1)),
  new THREE.QuaternionKeyframeTrack("Head.quaternion", walkCycle.times, upperBodyFrames(-0.6)),
  new THREE.VectorKeyframeTrack("Hips.position", walkCycle.times, hipHeights.flatMap((y) => [0, y, 0])),
]);

// ขนาดแสดงผลในแอป — ต้องตรงกับ CHARACTER_SCALE ใน src/components/preview-3d/character-models.ts
const DISPLAY_SCALE = 1.6;
// ใต้ต้นขาอยู่ระดับเบาะเก้าอี้ในฉากร้าน (0.48 ม. ÷ DISPLAY_SCALE หน่วยโมเดล)
// = เบาะ + ข้อสะโพกต่ำกว่า Hips + รัศมีต้นขา (~5.5 ซม.) — ขาสั้นแบบตุ๊กตา เท้าจึงลอยเหนือพื้นตอนนั่ง
const SIT_HIPS_Y = 0.48 / DISPLAY_SCALE + LEG_DROP + 0.055;
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
const sit = new THREE.AnimationClip("Sit", SIT_DURATION, [
  new THREE.VectorKeyframeTrack("Hips.position", sitTimes, sitEase.flatMap((e) => [0, THREE.MathUtils.lerp(HIPS_Y, SIT_HIPS_Y, e), 0])),
  new THREE.QuaternionKeyframeTrack("Spine.quaternion", sitTimes, quaternionFrames(sitTimes.map((time) => 0.22 * Math.sin((Math.PI * time) / SIT_DURATION)))),
  // GLB faces +Z. Rotate the character toward the chair front so thighs and
  // forearms move forward (+Z) while the knees fold down.
  sitTrack("LeftLeg", pose(-1.5)),
  sitTrack("RightLeg", pose(-1.5)),
  sitTrack("LeftLowerLeg", pose(1.4)),
  sitTrack("RightLowerLeg", pose(1.4)),
  sitTrack("LeftFoot", pose(0.1)),
  sitTrack("RightFoot", pose(0.1)),
  // ท่าผ่อนคลาย มือวางบนเข่า: ต้นแขนห้อยข้างตัวเอนไปหน้านิด ศอกอยู่ใต้ไหล่ ปลายแขนลาดลงไปหาเข่า
  // ถุงมือวางตะแคง (นิ้วโป้งขึ้น) บนเข่าค่อนด้านนอก ข้อมืองอนิดเดียว — มุมหาจากการวัดผิว:
  // ก้นมือแตะผิวต้นขา และแขนไม่จมลำตัว
  sitTrack("LeftArm", pose(-0.2, -0.114)),
  sitTrack("RightArm", pose(-0.2, 0.114)),
  sitTrack("LeftForeArm", pose(-0.857, 0, 0.615)),
  sitTrack("RightForeArm", pose(-0.857, 0, -0.615)),
  sitTrack("LeftHand", pose(-0.08, 0.055)),
  sitTrack("RightHand", pose(-0.08, -0.055)),
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
