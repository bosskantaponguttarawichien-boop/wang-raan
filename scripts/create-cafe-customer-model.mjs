/**
 * สร้าง GLB mannequin สีเทาสำหรับ Character Lab และฉาก 3D
 *
 * ผิวทั้งตัวเป็น SkinnedMesh ชิ้นเดียว: ประกอบรูปทรงด้วย signed distance field แบบ smooth union
 * (ข้อต่อมีส่วนโค้งเชื่อมแทนรอยตัดระหว่างชิ้น) แล้วผูกน้ำหนักกับกระดูกแบบไล่ระดับ
 * ทำให้หัวไหล่ สะโพก และหัวเข่างอได้โดยผิวยืดต่อเนื่อง ไม่แยกเป็นก้อน
 *
 * ตัวละครมีความสูง native ราว 1.16 ม. (แสดงผลที่ scale 0.9 = ราว 1.04 ม.)
 * และมีคลิป Idle, Walk, Sit อยู่ในไฟล์เดียว
 * รัน: node scripts/create-cafe-customer-model.mjs         → cafe-customer.glb (ละเอียด, Character Lab)
 *      node scripts/create-cafe-customer-model.mjs --lite  → cafe-customer-lite.glb (ฉากร้านที่มีลูกค้าหลายสิบคน)
 * สองไฟล์ใช้โครงกระดูกและ animation ชุดเดียวกัน ต่างกันแค่จำนวน polygon
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
const LITE = process.argv.includes("--lite");
const outputFile = new URL(LITE ? "cafe-customer-lite.glb" : "cafe-customer.glb", outputDirectory);
const mannequin = new THREE.MeshStandardMaterial({ color: "#9da4af", roughness: 0.84, metalness: 0 });

const GRID_STEP = 0.009;
// ฉากร้านเห็นตัวละครเล็กกว่ามาก แต่มีพร้อมกันหลายสิบตัว (×2 รอบรวมเงา) → ลด polygon ได้โดยภาพไม่ต่าง
const KEEP_VERTEX_RATIO = LITE ? 0.1 : 0.38;
const WEIGHT_REACH = 0.045;

function bone(name, position) {
  const part = new THREE.Bone();
  part.name = name;
  part.position.set(...position);
  return part;
}

const model = new THREE.Group();
model.name = "CafeMannequin";

// Reference: three head units tall (1.125 m); shoulder → elbow → wrist,
// hip → knee → ankle. Bone pivots and surface endpoints share these landmarks.
const HIPS_Y = 0.46;
const hips = bone("Hips", [0, HIPS_Y, 0]);
const spine = bone("Spine", [0, 0.15, 0]);
const neck = bone("Neck", [0, 0.13, 0]);
const head = bone("Head", [0, 0.085, 0]);
const leftArm = bone("LeftArm", [-0.148, 0.04, 0]);
const rightArm = bone("RightArm", [0.148, 0.04, 0]);
const leftForeArm = bone("LeftForeArm", [-0.027, -0.11, 0]);
const rightForeArm = bone("RightForeArm", [0.027, -0.11, 0]);
// Lower the shoulder pivot to follow the rounded shoulder surface; keep elbow/wrist landmarks.
// Avoid a lateral elbow kink: relaxation is in the sagittal animation plane.
const leftHand = bone("LeftHand", [-0.02, -0.155, 0]);
const rightHand = bone("RightHand", [0.02, -0.155, 0]);
const leftLeg = bone("LeftLeg", [-0.07, -0.03, 0]);
const rightLeg = bone("RightLeg", [0.07, -0.03, 0]);
const leftLowerLeg = bone("LeftLowerLeg", [0, -0.20, 0]);
const rightLowerLeg = bone("RightLowerLeg", [0, -0.20, 0]);
const leftFoot = bone("LeftFoot", [0, -0.175, 0]);
const rightFoot = bone("RightFoot", [0, -0.175, 0]);

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

// Reference silhouette: oversized broad head, visible ears, a small straight torso,
// relaxed slender arms and wide feet. Keep leg landmarks for the planted-foot IK.
const torso = capsule(spine, v3(0, 0.535), v3(0, 0.625), 0.105, [1.08, 1, 0.72]);
const pelvis = ellipsoid(hips, v3(0, 0.455, -0.008), v3(0.125, 0.085, 0.085));
const neckPart = capsule(neck, v3(0, 0.713), v3(0, 0.825), 0.029);
// หัวเล็กลงราว 10% จากรุ่นก่อน โดยคงคาง (ขอบล่างของหัว) ไว้ที่เดิมบนคอ
const skull = ellipsoid(head, v3(0, 0.969), v3(0.198, 0.189, 0.167));
const ears = [-1, 1].map((side) =>
  ellipsoid(head, v3(side * 0.182, 0.864, 0), v3(0.039, 0.042, 0.023)),
);
const arms = [
  [leftArm, leftForeArm, leftHand, -1],
  [rightArm, rightForeArm, rightHand, 1],
].map(([upper, fore, hand, side]) => ({
  // End the clavicle above/inboard of the upper-arm pivot. The old arm cap
  // stood above this slope, producing a second hump at the shoulder tip.
  shoulder: capsule(spine, v3(side * 0.038, 0.709), v3(side * 0.128, 0.675), 0.025, [1, 0.85, 1]),
  upper: roundCone(upper, v3(side * 0.148, 0.65), v3(side * 0.175, 0.54), 0.032, 0.030),
  fore: roundCone(fore, v3(side * 0.175, 0.54), v3(side * 0.195, 0.385), 0.030, 0.024),
  hand: ellipsoid(hand, v3(side * 0.198, 0.36), v3(0.026, 0.03, 0.025)),
}));
const thumbs = arms.map((_, i) => {
  const side = i === 0 ? -1 : 1;
  return capsule(i === 0 ? leftHand : rightHand, v3(side * 0.194, 0.371, 0.016), v3(side * 0.19, 0.385, 0.038), 0.012);
});
const legs = [
  [leftLeg, leftLowerLeg, leftFoot, -1],
  [rightLeg, rightLowerLeg, rightFoot, 1],
].map(([upper, lower, foot, side]) => {
  const x = side * 0.07;
  return {
    thigh: roundCone(upper, v3(x, 0.43), v3(x, 0.23), 0.064, 0.052),
    shin: roundCone(lower, v3(x, 0.23), v3(x, 0.055), 0.052, 0.038),
    foot: capsule(foot, v3(x, 0.037, -0.018), v3(x + side * 0.012, 0.037, 0.102), 0.036, [1.62, 0.95, 1]),
  };
});
const primitives = [
  torso, pelvis, neckPart, skull, ...thumbs,
  ...arms.flatMap((arm) => [arm.shoulder, arm.upper, arm.fore, arm.hand]),
  ...legs.flatMap((leg) => [leg.thigh, leg.shin, leg.foot]),
  ...ears,
];

const distances = new Float64Array(primitives.length);
function bodyDistance(p) {
  for (let i = 0; i < primitives.length; i += 1) distances[i] = primitives[i].distance(p);
  const [dTorso, dPelvis, dNeck, dSkull, dThumbL, dThumbR, ...limbs] = distances;
  const [dShoulderL, dUpperL, dForeL, dHandL, dShoulderR, dUpperR, dForeR, dHandR, dThighL, dShinL, dFootL, dThighR, dShinR, dFootR, dEarL, dEarR] = limbs;
  let body = smoothMin(dTorso, dPelvis, 0.06);
  body = smoothMin(body, dNeck, 0.032);
  const headShape = smoothMin(smoothMin(dSkull, dEarL, 0.012), dEarR, 0.012);
  body = smoothMin(body, headShape, 0.015);
  // Merge each limb once. Taking a hard minimum of overlapping body/shoulder
  // branches leaves a crease at the shoulder even though the mesh is connected.
  const armL = smoothMin(smoothMin(smoothMin(dShoulderL, dUpperL, 0.026), dForeL, 0.022), smoothMin(dHandL, dThumbL, 0.01), 0.012);
  const armR = smoothMin(smoothMin(smoothMin(dShoulderR, dUpperR, 0.026), dForeR, 0.022), smoothMin(dHandR, dThumbR, 0.01), 0.012);
  // Broad blend at the shoulder, negligible below the armpit to preserve air gaps.
  const shoulderBlend = THREE.MathUtils.lerp(0.002, 0.045, THREE.MathUtils.smoothstep(p.y, 0.61, 0.70));
  body = smoothMin(smoothMin(body, armL, shoulderBlend), armR, shoulderBlend);
  // A small knee blend avoids adding a ball-shaped bulge to matching radii.
  const legL = smoothMin(smoothMin(dThighL, dShinL, 0.012), dFootL, 0.014);
  const legR = smoothMin(smoothMin(dThighR, dShinR, 0.012), dFootR, 0.014);
  const hipBlend = THREE.MathUtils.lerp(0.002, 0.035, THREE.MathUtils.smoothstep(p.y, 0.34, 0.43));
  return smoothMin(smoothMin(body, legL, hipBlend), legR, hipBlend);
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
  const min = v3(-0.36, -0.02, -0.21);
  const max = v3(0.36, 1.23, 0.21);
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
  // Every nearby influence fades continuously. Switching an allowed-bone list
  // at the nearest primitive boundary caused jagged deformation at the armpit.
  const weights = new Map();
  primitives.forEach((primitive, i) => {
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

// Solve a two-bone leg toward a planted/swinging ankle instead of swinging
// every joint independently. ก้าวสั้นแต่จังหวะกลาง ๆ (~130 ก้าว/นาที) ไม่รัวและไม่ยืด
const WALK_DURATION = 0.84;
const WALK_DISTANCE = 0.36;
const walkCycle = sampled(WALK_DURATION, 60);
model.userData.walkCycleDistance = WALK_DISTANCE;
const hipHeights = walkCycle.phases.map((phase) => 0.4464 + 0.002 * (1 - Math.cos(phase * 2)));
function legPose(phase, hipY) {
  const t = ((phase / (Math.PI * 2)) % 1 + 1) % 1;
  const swing = Math.max(0, (t - 0.5) * 2);
  const z = t <= 0.5
    ? WALK_DISTANCE / 4 - WALK_DISTANCE * t
    : -WALK_DISTANCE / 4 + WALK_DISTANCE / 2 * (swing * swing * (3 - 2 * swing));
  const ankleY = 0.055 + 0.028 * Math.sin(Math.PI * swing) ** 2;
  const down = hipY - 0.03 - ankleY;
  const thigh = 0.20;
  const shin = 0.175;
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

// ยกสะโพกให้ใต้ต้นขาอยู่ระดับเบาะเก้าอี้ในฉากร้าน (0.48 ม. ÷ scale 0.9 ≈ 0.533 หน่วยโมเดล).
const SIT_HIPS_Y = 0.533 + 0.03 + 0.064;
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
  // ต้นแขนห้อยเกือบตรง ปลายแขนงอไปข้างหน้า (ทิศเดียวกับข้อศอกจริง) แล้ววางมือบนต้นขา
  // เดิมปลายแขนหมุนสวนทางต้นแขน ข้อศอกจึงหักไปด้านหลังดูงอผิดท่า
  sitTrack("LeftArm", pose(-0.25, 0.04)),
  sitTrack("RightArm", pose(-0.25, -0.04)),
  sitTrack("LeftForeArm", pose(-1.05, 0, 0.4)),
  sitTrack("RightForeArm", pose(-1.05, 0, -0.4)),
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
