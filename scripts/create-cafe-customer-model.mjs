/**
 * สร้าง GLB mannequin สีเทาสำหรับ Character Lab และฉาก 3D
 *
 * ผิวทั้งตัวเป็น SkinnedMesh ชิ้นเดียว: ประกอบรูปทรงด้วย signed distance field แบบ smooth union
 * (ข้อต่อมีส่วนโค้งเชื่อมแทนรอยตัดระหว่างชิ้น) แล้วผูกน้ำหนักกับกระดูกแบบไล่ระดับ
 * ทำให้หัวไหล่ สะโพก และหัวเข่างอได้โดยผิวยืดต่อเนื่อง ไม่แยกเป็นก้อน
 *
 * ตัวละครมีความสูง native 1.13 ม. (แสดงผลที่ scale 0.9 = ราว 1.02 ม.)
 * และมีคลิป Idle, Walk, Sit อยู่ในไฟล์เดียว
 * รัน: node scripts/create-cafe-customer-model.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { SimplifyModifier } from "three/addons/modifiers/SimplifyModifier.js";

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
const outputFile = new URL("cafe-customer.glb", outputDirectory);
const mannequin = new THREE.MeshStandardMaterial({ color: "#9da4af", roughness: 0.84, metalness: 0 });

const GRID_STEP = 0.009;
const KEEP_VERTEX_RATIO = 0.38;
const WEIGHT_REACH = 0.07;

function bone(name, position) {
  const part = new THREE.Bone();
  part.name = name;
  part.position.set(...position);
  return part;
}

const model = new THREE.Group();
model.name = "CafeMannequin";

// โครง 14 ข้อต่อ: สะโพก ลำตัว คอ หัว ไหล่ ศอก โคนขา เข่า ข้อเท้า
// ชื่อกระดูกเดิม (Hips/Spine/Head/แขน/ขา/LowerLeg) คงไว้ให้ฉากร้านใช้คลิปเดิมได้.
const hips = bone("Hips", [0, 0.56, 0]);
const spine = bone("Spine", [0, 0.08, 0]);
const neck = bone("Neck", [0, 0.12, 0]);
const head = bone("Head", [0, 0.05, 0]);
const leftArm = bone("LeftArm", [-0.15, 0.07, 0]);
const rightArm = bone("RightArm", [0.15, 0.07, 0]);
const leftForeArm = bone("LeftForeArm", [-0.05, -0.16, 0]);
const rightForeArm = bone("RightForeArm", [0.05, -0.16, 0]);
const leftLeg = bone("LeftLeg", [-0.075, -0.03, 0]);
const rightLeg = bone("RightLeg", [0.075, -0.03, 0]);
const leftLowerLeg = bone("LeftLowerLeg", [0, -0.24, 0]);
const rightLowerLeg = bone("RightLowerLeg", [0, -0.24, 0]);
const leftFoot = bone("LeftFoot", [0, -0.22, 0]);
const rightFoot = bone("RightFoot", [0, -0.22, 0]);

model.add(hips);
hips.add(spine, leftLeg, rightLeg);
spine.add(neck, leftArm, rightArm);
neck.add(head);
leftArm.add(leftForeArm);
rightArm.add(rightForeArm);
leftLeg.add(leftLowerLeg);
rightLeg.add(rightLowerLeg);
leftLowerLeg.add(leftFoot);
rightLowerLeg.add(rightFoot);
model.updateMatrixWorld(true);

const bones = [
  hips, spine, neck, head,
  leftArm, rightArm, leftForeArm, rightForeArm,
  leftLeg, rightLeg, leftLowerLeg, rightLowerLeg, leftFoot, rightFoot,
];
const boneIndex = new Map(bones.map((part, index) => [part, index]));

// กระดูกที่ผิวไล่น้ำหนักหากันได้ — แขน/ขาคนละข้างไม่ดึงกัน และหัวไม่ถูกแขนดึง.
const blendsWith = new Map([
  [hips, [spine, leftLeg, rightLeg]],
  [spine, [hips, neck, leftArm, rightArm, leftLeg, rightLeg]],
  [neck, [spine, head]],
  [head, [neck]],
  [leftArm, [spine, leftForeArm]],
  [rightArm, [spine, rightForeArm]],
  [leftForeArm, [leftArm]],
  [rightForeArm, [rightArm]],
  [leftLeg, [hips, spine, leftLowerLeg]],
  [rightLeg, [hips, spine, rightLowerLeg]],
  [leftLowerLeg, [leftLeg, leftFoot]],
  [rightLowerLeg, [rightLeg, rightFoot]],
  [leftFoot, [leftLowerLeg]],
  [rightFoot, [rightLowerLeg]],
]);

// ---- รูปทรงพื้นฐาน (พิกัดท่ายืน หน่วยเมตร) ----
const v3 = (x, y, z = 0) => new THREE.Vector3(x, y, z);

/** capsule จาก a→b รัศมี r; scale ย่อ/ขยายหน้าตัดแกน x/z (ประมาณค่า distance พอสำหรับหา surface). */
function capsule(owner, a, b, r, scale = [1, 1, 1]) {
  const inv = v3(1 / scale[0], 1 / scale[1], 1 / scale[2]);
  const minScale = Math.min(...scale);
  const center = a.clone().add(b).multiplyScalar(0.5);
  const sa = a.clone().sub(center).multiply(inv);
  const sb = b.clone().sub(center).multiply(inv);
  const ab = sb.clone().sub(sa);
  const abLengthSq = ab.lengthSq();
  const q = new THREE.Vector3();
  return {
    owner,
    distance(p) {
      q.copy(p).sub(center).multiply(inv).sub(sa);
      const t = THREE.MathUtils.clamp(q.dot(ab) / abLengthSq, 0, 1);
      q.addScaledVector(ab, -t);
      return (q.length() - r) * minScale;
    },
  };
}

/** capsule เรียว (round cone): รัศมี r1 ที่ a ค่อย ๆ ลดเป็น r2 ที่ b — ใช้กับแขนให้โคนหนา ปลายเรียว. */
function roundCone(owner, a, b, r1, r2) {
  const ba = b.clone().sub(a);
  const l2 = ba.lengthSq();
  const rr = r1 - r2;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const pa = new THREE.Vector3();
  const side = new THREE.Vector3();
  return {
    owner,
    distance(p) {
      pa.copy(p).sub(a);
      const y = pa.dot(ba);
      const z = y - l2;
      const x2 = side.copy(pa).multiplyScalar(l2).addScaledVector(ba, -y).lengthSq();
      const y2 = y * y * l2;
      const z2 = z * z * l2;
      const k = Math.sign(rr) * rr * rr * x2;
      if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
      if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
      return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
    },
  };
}

function ellipsoid(owner, center, radii) {
  const q = new THREE.Vector3();
  const minRadius = Math.min(radii.x, radii.y, radii.z);
  return {
    owner,
    distance(p) {
      q.copy(p).sub(center).divide(radii);
      return (q.length() - 1) * minRadius;
    },
  };
}

function smoothMin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

// Chibi ตามภาพอ้างอิง: หัวกลมใหญ่ คอสั้น ลำตัวอวบ และแขนขาเป็นก้อนนุ่ม.
// ลำตัวแคบกว่าหัวเล็กน้อย เพื่อให้แขนห้อยลงข้างตัวได้โดยไม่ติดสีข้าง.
// หุ่น 3D man: หัวกลมใหญ่ คอเล็ก ลำตัวยาว ขายาว มือถุงมือมีนิ้วโป้ง และรองเท้าก้อนมน.
const torso = capsule(spine, v3(0, 0.6), v3(0, 0.69), 0.15, [0.9, 1, 0.62]);
const pelvis = ellipsoid(hips, v3(0, 0.555), v3(0.13, 0.075, 0.09));
const neckPart = capsule(neck, v3(0, 0.75), v3(0, 0.82), 0.045);
const skull = ellipsoid(head, v3(0, 0.965), v3(0.16, 0.16, 0.155));
// แขนห้อยลงข้างตัว: หัวไหล่มน → ต้นแขนเรียว → ข้อศอก → ปลายแขน → มือ (ข้อต่อไม่มีรอยหัก).
const arms = [
  [leftArm, leftForeArm, -1],
  [rightArm, rightForeArm, 1],
].map(([upper, fore, side]) => ({
  shoulder: ellipsoid(upper, v3(side * 0.145, 0.71), v3(0.052, 0.046, 0.046)),
  upper: roundCone(upper, v3(side * 0.15, 0.71), v3(side * 0.2, 0.55), 0.046, 0.039),
  fore: roundCone(fore, v3(side * 0.2, 0.55), v3(side * 0.215, 0.425), 0.039, 0.034),
  hand: ellipsoid(fore, v3(side * 0.218, 0.395), v3(0.038, 0.05, 0.036)),
}));
// นิ้วโป้งชี้ไปด้านหน้าจากมือแบบถุงมือ.
const thumbs = arms.map((_, i) => {
  const side = i === 0 ? -1 : 1;
  return capsule(i === 0 ? leftForeArm : rightForeArm, v3(side * 0.214, 0.41, 0.02), v3(side * 0.212, 0.425, 0.05), 0.014);
});
const legs = [
  [leftLeg, leftLowerLeg, leftFoot, -1],
  [rightLeg, rightLowerLeg, rightFoot, 1],
].map(([upper, lower, foot, side]) => {
  const x = side * 0.075;
  return {
    thigh: roundCone(upper, v3(x, 0.53), v3(x, 0.29), 0.066, 0.052),
    shin: roundCone(lower, v3(x, 0.29), v3(x, 0.08), 0.052, 0.042),
    // รองเท้าก้อนมน ยาวไปด้านหน้า.
    foot: capsule(foot, v3(x, 0.045, -0.02), v3(x, 0.045, 0.1), 0.045, [1.1, 0.95, 1]),
  };
});
const primitives = [
  torso, pelvis, neckPart, skull, ...thumbs,
  ...arms.flatMap((arm) => [arm.shoulder, arm.upper, arm.fore, arm.hand]),
  ...legs.flatMap((leg) => [leg.thigh, leg.shin, leg.foot]),
];

const distances = new Float64Array(primitives.length);
function bodyDistance(p) {
  for (let i = 0; i < primitives.length; i += 1) distances[i] = primitives[i].distance(p);
  const [dTorso, dPelvis, dNeck, dSkull, dThumbL, dThumbR, ...limbs] = distances;
  const [dShoulderL, dUpperL, dForeL, dHandL, dShoulderR, dUpperR, dForeR, dHandR, dThighL, dShinL, dFootL, dThighR, dShinR, dFootR] = limbs;
  let body = smoothMin(dTorso, dPelvis, 0.06);
  body = smoothMin(body, dNeck, 0.03);
  body = smoothMin(body, dSkull, 0.03);
  // แขนผสานกับลำตัวเฉพาะต้นแขน (หัวไหล่); ปลายแขนและมือแยกจากลำตัว เวลาแกว่งจึงไม่ลากผิวตัวตาม.
  const armL = smoothMin(smoothMin(smoothMin(dShoulderL, dUpperL, 0.04), dForeL, 0.012), smoothMin(dHandL, dThumbL, 0.012), 0.02);
  const armR = smoothMin(smoothMin(smoothMin(dShoulderR, dUpperR, 0.04), dForeR, 0.012), smoothMin(dHandR, dThumbR, 0.012), 0.02);
  const shoulders = smoothMin(smoothMin(body, smoothMin(dShoulderL, dUpperL, 0.04), 0.05), smoothMin(dShoulderR, dUpperR, 0.04), 0.05);
  // ขาสองข้างผสานกับลำตัวแยกกัน จึงไม่มีพังผืดเชื่อมระหว่างต้นขาซ้าย-ขวา.
  const left = smoothMin(body, smoothMin(smoothMin(dThighL, dShinL, 0.04), dFootL, 0.03), 0.04);
  const right = smoothMin(body, smoothMin(smoothMin(dThighR, dShinR, 0.04), dFootR, 0.03), 0.04);
  return Math.min(shoulders, armL, armR, left, right);
}

const EPSILON = 1e-4;
const probe = new THREE.Vector3();
function gradient(p, target) {
  const axis = (dx, dy, dz) =>
    bodyDistance(probe.set(p.x + dx, p.y + dy, p.z + dz)) - bodyDistance(probe.set(p.x - dx, p.y - dy, p.z - dz));
  return target.set(axis(EPSILON, 0, 0), axis(0, EPSILON, 0), axis(0, 0, EPSILON)).normalize();
}

function projectToSurface(p) {
  const normal = new THREE.Vector3();
  for (let i = 0; i < 4; i += 1) p.addScaledVector(gradient(p, normal), -bodyDistance(p));
  return p;
}

// ---- Surface nets: สุ่ม SDF บนกริดแล้วต่อเป็น mesh ปิดชิ้นเดียว ----
function buildSurface() {
  const min = v3(-0.3, -0.02, -0.2);
  const max = v3(0.3, 1.16, 0.2);
  const nx = Math.ceil((max.x - min.x) / GRID_STEP) + 1;
  const ny = Math.ceil((max.y - min.y) / GRID_STEP) + 1;
  const nz = Math.ceil((max.z - min.z) / GRID_STEP) + 1;
  const at = (i, j, k) => i + nx * (j + ny * k);
  const field = new Float64Array(nx * ny * nz);
  const point = new THREE.Vector3();
  for (let k = 0; k < nz; k += 1)
    for (let j = 0; j < ny; j += 1)
      for (let i = 0; i < nx; i += 1)
        field[at(i, j, k)] = bodyDistance(point.set(min.x + i * GRID_STEP, min.y + j * GRID_STEP, min.z + k * GRID_STEP));

  const cellVertex = new Int32Array(nx * ny * nz).fill(-1);
  const positions = [];
  const corners = [];
  for (let c = 0; c < 8; c += 1) corners.push([c & 1, (c >> 1) & 1, (c >> 2) & 1]);
  const cubeEdges = [];
  for (let a = 0; a < 8; a += 1)
    for (let b = a + 1; b < 8; b += 1) if ([1, 2, 4].includes(a ^ b)) cubeEdges.push([a, b]);

  for (let k = 0; k < nz - 1; k += 1)
    for (let j = 0; j < ny - 1; j += 1)
      for (let i = 0; i < nx - 1; i += 1) {
        const values = corners.map(([di, dj, dk]) => field[at(i + di, j + dj, k + dk)]);
        if (values.every((value) => value < 0) || values.every((value) => value >= 0)) continue;
        const sum = new THREE.Vector3();
        let count = 0;
        for (const [a, b] of cubeEdges) {
          if (values[a] < 0 === values[b] < 0) continue;
          const t = values[a] / (values[a] - values[b]);
          sum.x += corners[a][0] + t * (corners[b][0] - corners[a][0]);
          sum.y += corners[a][1] + t * (corners[b][1] - corners[a][1]);
          sum.z += corners[a][2] + t * (corners[b][2] - corners[a][2]);
          count += 1;
        }
        sum.divideScalar(count);
        cellVertex[at(i, j, k)] = positions.length;
        positions.push(v3(min.x + (i + sum.x) * GRID_STEP, min.y + (j + sum.y) * GRID_STEP, min.z + (k + sum.z) * GRID_STEP));
      }

  const indices = [];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) indices.push(a, c, b, a, d, c);
    else indices.push(a, b, c, a, c, d);
  };
  for (let k = 1; k < nz - 1; k += 1)
    for (let j = 1; j < ny - 1; j += 1)
      for (let i = 1; i < nx - 1; i += 1) {
        const inside = field[at(i, j, k)] < 0;
        if (i < nx - 1 && inside !== field[at(i + 1, j, k)] < 0)
          quad(cellVertex[at(i, j - 1, k - 1)], cellVertex[at(i, j, k - 1)], cellVertex[at(i, j, k)], cellVertex[at(i, j - 1, k)], inside);
        if (j < ny - 1 && inside !== field[at(i, j + 1, k)] < 0)
          quad(cellVertex[at(i - 1, j, k - 1)], cellVertex[at(i - 1, j, k)], cellVertex[at(i, j, k)], cellVertex[at(i, j, k - 1)], inside);
        if (k < nz - 1 && inside !== field[at(i, j, k + 1)] < 0)
          quad(cellVertex[at(i - 1, j - 1, k)], cellVertex[at(i, j - 1, k)], cellVertex[at(i, j, k)], cellVertex[at(i - 1, j, k)], inside);
      }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions.flatMap((p) => p.toArray()), 3));
  geometry.setIndex(indices);
  return geometry;
}

function orientFaces(geometry) {
  const position = geometry.getAttribute("position");
  const index = geometry.getIndex();
  const [a, b, c] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const normal = new THREE.Vector3();
  const outward = new THREE.Vector3();
  for (let f = 0; f < index.count; f += 3) {
    a.fromBufferAttribute(position, index.getX(f));
    b.fromBufferAttribute(position, index.getX(f + 1));
    c.fromBufferAttribute(position, index.getX(f + 2));
    normal.subVectors(c, b).cross(a.clone().sub(b));
    gradient(a.add(b).add(c).divideScalar(3), outward);
    if (normal.dot(outward) < 0) {
      const second = index.getX(f + 1);
      index.setX(f + 1, index.getX(f + 2));
      index.setX(f + 2, second);
    }
  }
}

/** น้ำหนักกระดูกจากระยะถึงแต่ละชิ้น: ใกล้รอยต่อจะแบ่งน้ำหนักให้ทั้งสองฝั่ง ผิวจึงยืดแบบไล่ระดับ. */
function skinFor(p) {
  for (let i = 0; i < primitives.length; i += 1) distances[i] = primitives[i].distance(p);
  let nearest = 0;
  for (let i = 1; i < primitives.length; i += 1) if (distances[i] < distances[nearest]) nearest = i;
  const owner = primitives[nearest].owner;
  const allowed = new Set([owner, ...blendsWith.get(owner)]);
  const weights = new Map();
  primitives.forEach((primitive, i) => {
    if (!allowed.has(primitive.owner)) return;
    const reach = 1 - THREE.MathUtils.clamp((distances[i] - distances[nearest]) / WEIGHT_REACH, 0, 1);
    const weight = reach * reach * (3 - 2 * reach);
    if (weight > (weights.get(primitive.owner) ?? 0)) weights.set(primitive.owner, weight);
  });
  const ranked = [...weights].sort((x, y) => y[1] - x[1]).slice(0, 4);
  const total = ranked.reduce((sum, [, weight]) => sum + weight, 0);
  const joints = [0, 0, 0, 0];
  const values = [0, 0, 0, 0];
  ranked.forEach(([part, weight], slot) => {
    joints[slot] = boneIndex.get(part);
    values[slot] = weight / total;
  });
  return { joints, values };
}

let geometry = buildSurface();
geometry = new SimplifyModifier().modify(geometry, Math.floor(geometry.getAttribute("position").count * (1 - KEEP_VERTEX_RATIO)));
geometry.deleteAttribute("normal");
geometry.deleteAttribute("uv");

const position = geometry.getAttribute("position");
const normals = [];
const skinIndices = [];
const skinWeights = [];
const point = new THREE.Vector3();
const normal = new THREE.Vector3();
for (let i = 0; i < position.count; i += 1) {
  // หลังลดจำนวน polygon ดึงจุดกลับมาบนผิวจริง และใช้ normal จาก SDF ให้แสงเงาเนียน.
  projectToSurface(point.fromBufferAttribute(position, i));
  position.setXYZ(i, point.x, point.y, point.z);
  normals.push(...gradient(point, normal).toArray());
  const skin = skinFor(point);
  skinIndices.push(...skin.joints);
  skinWeights.push(...skin.values);
}
geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIndices, 4));
geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinWeights, 4));
orientFaces(geometry);

const body = new THREE.SkinnedMesh(geometry, mannequin);
body.name = "MannequinBody";
body.castShadow = true;
body.receiveShadow = true;
model.add(body);
model.updateMatrixWorld(true);
body.bind(new THREE.Skeleton(bones));

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

const walkCycle = sampled(0.8, 16);
const swingAngles = (offset) => walkCycle.phases.map((phase) => 0.32 * Math.cos(phase + offset));
// งอเข่าช่วงที่ขาเหวี่ยงจากหลังมาหน้า (sin² ทำให้เริ่ม/จบการงออย่างนุ่ม).
const kneeAngles = (offset) => walkCycle.phases.map((phase) => 0.42 * Math.max(0, Math.sin(phase + offset)) ** 2);
// ข้อเท้าหักล้างมุมขา+เข่าเกือบทั้งหมด ฝ่าเท้าจึงขนานพื้นตลอดก้าว.
const ankleAngles = (offset) => swingAngles(offset).map((angle, i) => -(angle + kneeAngles(offset)[i]) * 0.85);
const armAngles = (offset) => swingAngles(offset).map((angle) => angle * 0.8);
// ข้อศอกงอค้างเล็กน้อย และงอเพิ่มตอนแขนแกว่งมาด้านหน้า.
const elbowAngles = (offset) => armAngles(offset).map((angle) => -0.22 + angle * 0.4);
const walk = new THREE.AnimationClip("Walk", 0.8, [
  new THREE.QuaternionKeyframeTrack("LeftLeg.quaternion", walkCycle.times, quaternionFrames(swingAngles(0))),
  new THREE.QuaternionKeyframeTrack("RightLeg.quaternion", walkCycle.times, quaternionFrames(swingAngles(Math.PI))),
  new THREE.QuaternionKeyframeTrack("LeftLowerLeg.quaternion", walkCycle.times, quaternionFrames(kneeAngles(0))),
  new THREE.QuaternionKeyframeTrack("RightLowerLeg.quaternion", walkCycle.times, quaternionFrames(kneeAngles(Math.PI))),
  new THREE.QuaternionKeyframeTrack("LeftFoot.quaternion", walkCycle.times, quaternionFrames(ankleAngles(0))),
  new THREE.QuaternionKeyframeTrack("RightFoot.quaternion", walkCycle.times, quaternionFrames(ankleAngles(Math.PI))),
  new THREE.QuaternionKeyframeTrack("LeftArm.quaternion", walkCycle.times, quaternionFrames(armAngles(Math.PI))),
  new THREE.QuaternionKeyframeTrack("RightArm.quaternion", walkCycle.times, quaternionFrames(armAngles(0))),
  new THREE.QuaternionKeyframeTrack("LeftForeArm.quaternion", walkCycle.times, quaternionFrames(elbowAngles(Math.PI))),
  new THREE.QuaternionKeyframeTrack("RightForeArm.quaternion", walkCycle.times, quaternionFrames(elbowAngles(0))),
  new THREE.VectorKeyframeTrack(
    "Hips.position",
    walkCycle.times,
    walkCycle.phases.flatMap((phase) => [0, 0.56 + 0.008 * Math.cos(phase * 2), 0]),
  ),
]);

// ยกสะโพกให้ใต้ต้นขาอยู่ระดับเบาะเก้าอี้ในฉากร้าน (0.48 ม. ÷ scale 0.9 ≈ 0.533 หน่วยโมเดล).
const SIT_HIPS_Y = 0.533 + 0.03 + 0.066;
const sit = new THREE.AnimationClip("Sit", 1, [
  new THREE.VectorKeyframeTrack("Hips.position", [0, 1], [0, 0.56, 0, 0, SIT_HIPS_Y, 0]),
  new THREE.QuaternionKeyframeTrack("LeftLeg.quaternion", [0, 1], quaternionFrames([0, -1.32])),
  new THREE.QuaternionKeyframeTrack("RightLeg.quaternion", [0, 1], quaternionFrames([0, -1.32])),
  new THREE.QuaternionKeyframeTrack("LeftLowerLeg.quaternion", [0, 1], quaternionFrames([0, 1.24])),
  new THREE.QuaternionKeyframeTrack("RightLowerLeg.quaternion", [0, 1], quaternionFrames([0, 1.24])),
  new THREE.QuaternionKeyframeTrack("LeftFoot.quaternion", [0, 1], quaternionFrames([0, 0.08])),
  new THREE.QuaternionKeyframeTrack("RightFoot.quaternion", [0, 1], quaternionFrames([0, 0.08])),
  new THREE.QuaternionKeyframeTrack("LeftArm.quaternion", [0, 1], quaternionFrames([0, -0.36])),
  new THREE.QuaternionKeyframeTrack("RightArm.quaternion", [0, 1], quaternionFrames([0, -0.36])),
  // วางปลายแขนไว้บนตัก.
  new THREE.QuaternionKeyframeTrack("LeftForeArm.quaternion", [0, 1], quaternionFrames([0, -0.75])),
  new THREE.QuaternionKeyframeTrack("RightForeArm.quaternion", [0, 1], quaternionFrames([0, -0.75])),
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
