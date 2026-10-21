/**
 * สร้าง GLB ตัวละครสำหรับ Character Lab และฉาก 3D — ลูกค้า (เสื้อยืดสีอ่อน) และพนักงาน (เสื้อยืด + หมวกแก๊ปสีเขียว)
 *
 * ผิวและเสื้อผ้าปั้นแบบ box modeling ใน Blender เป็นชิ้นแยก (scripts/blender/blockout-cafe-customer.py)
 * แล้วเกลาและผูกน้ำหนักกับกระดูก (scripts/blender/build-cafe-customer-mesh.py) — สคริปต์นี้ใส่โครงกระดูกและ animation
 *
 * ตัวละครสัดส่วนผู้ใหญ่จริง สูง 1.70 ม. ที่ขนาด 1:1 (หน่วยโมเดล = เมตร) เข้ากับโต๊ะ เก้าอี้ เคาน์เตอร์ขนาดจริงในฉากร้าน
 * และมีคลิป Idle, Walk, Sit อยู่ในไฟล์เดียว (พนักงานมี Work เพิ่ม)
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
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTMeshoptCompression, KHRMeshQuantization } from "@gltf-transform/extensions";
import { dedup, prune, quantize, reorder, resample } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";

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
// หมวดชิ้นส่งออกไปด้วย (attribute "_part" ใน glTF) — ฉากร้านใช้สุ่มสีเสื้อผ้า/ผม/ผิวของลูกค้าแต่ละคน
geometry.setAttribute("part", new THREE.BufferAttribute(Uint8Array.from({ length: position.count }, (_, i) => Math.round(sourcePart.getX(i))), 1));

if (STAFF) {
  // ---- หมวกแก๊ป 6 ชิ้นผ้า: โดมครอบหัวตามเงา HEAD_PROFILE ใน blockout-cafe-customer.py — หน้าสูงเต็ม ท้ายลาดต่ำลงท้ายทอย,
  // ตะเข็บ 6 เส้น + กระดุมบนยอด, ปีกหมวกโค้งทั้งแนวยาวและแนวขวาง หนาขึ้นที่โคน ใต้ปีกสีเข้ม
  const HEAD_DEPTH = 1.18;
  const HEAD_FORWARD = 0.012;
  const CAP_COLOR = new THREE.Color(UNIFORM_COLOR);
  const SEAM_COLOR = CAP_COLOR.clone().multiplyScalar(0.8);
  const UNDER_BRIM_COLOR = CAP_COLOR.clone().multiplyScalar(0.5);
  const crown = [[1.612, 0.086], [1.625, 0.0857], [1.64, 0.084], [1.655, 0.081], [1.672, 0.072], [1.686, 0.058], [1.695, 0.037], [1.7, 0]];
  // ขอบหมวกรัดแนบหัว (ห่างผิว 1.2 ซม. พอทับผมบาง ๆ ตรงขอบ) แล้วค่อยพองขึ้นครอบผมกลางกระหม่อม (~2.2 ซม. — ผมด้านบนพองตามแสก)
  const profile = crown.map(([y, r]) => {
    const t = Math.min(1, Math.max(0, (y - 1.612) / 0.06));
    const offset = 0.012 + 0.01 * t * t * (3 - 2 * t);
    return [r > 0 ? r + offset : 0, y + 0.004 + 0.017 * t];
  });
  const profileAt = (t) => {
    const f = t * (profile.length - 1);
    const i = Math.min(profile.length - 2, Math.floor(f));
    const k = f - i;
    return [profile[i][0] + (profile[i + 1][0] - profile[i][0]) * k, profile[i][1] + (profile[i + 1][1] - profile[i][1]) * k];
  };
  /** จุดบนโดม: θ รอบหัว (0 = หน้า, + = ไปทาง +x), t จากขอบหมวก (0) ถึงยอด (1) */
  const crownPoint = (theta, t, lift = 0) => {
    const [r0, y0] = profileAt(t);
    const back = (1 - Math.cos(theta)) / 2;
    // ชิ้นหน้าพองตั้ง (มีแผ่นรองด้านใน), ขอบหมวกด้านหลังลดลงคลุมท้ายทอย
    const r = r0 * (1 + 0.035 * Math.max(0, Math.cos(theta)) ** 2 * Math.sin(Math.PI * Math.min(1, t * 1.2))) + lift;
    const y = y0 - 0.016 * back * (1 - t) ** 2 + lift * t;
    return new THREE.Vector3(r * Math.sin(theta), y, r * Math.cos(theta) * HEAD_DEPTH + HEAD_FORWARD);
  };
  const colored = (geometry, color) => {
    const count = geometry.getAttribute("position").count;
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(Array.from({ length: count }, () => [color.r, color.g, color.b]).flat(), 3));
    if (geometry.getAttribute("uv")) geometry.deleteAttribute("uv");
    return geometry;
  };
  /** ตาข่ายจาก grid[แถว][คอลัมน์] (คอลัมน์วนรอบถ้า wrap) — ด้านหน้าผิวตามลำดับ (แถว↓, คอลัมน์→) */
  const gridGeometry = (grid, wrap, flip = false) => {
    const rows = grid.length;
    const cols = grid[0].length;
    const positions = grid.flat().flatMap((point) => point.toArray());
    const index = [];
    for (let r = 0; r < rows - 1; r += 1) {
      for (let c = 0; c < (wrap ? cols : cols - 1); c += 1) {
        const a = r * cols + c;
        const b = r * cols + ((c + 1) % cols);
        const d = (r + 1) * cols + c;
        const e = (r + 1) * cols + ((c + 1) % cols);
        index.push(...(flip ? [a, d, b, b, d, e] : [a, b, d, b, e, d]));
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(index);
    geometry.computeVertexNormals();
    return geometry;
  };

  // โดม: วงจากขอบล่างขึ้นยอด (วงสุดท้ายยุบเป็นจุดยอด) + ขอบล่างพับเข้า (หนาแบบผ้า)
  const around = LITE ? 18 : 36;
  const rows = LITE ? 7 : 14;
  const thetas = Array.from({ length: around }, (_, i) => (2 * Math.PI * i) / around);
  const crownGrid = [thetas.map((theta) => crownPoint(theta, 0, -0.004).add(new THREE.Vector3(0, -0.003, 0)))];
  for (let row = 0; row <= rows; row += 1) crownGrid.push(thetas.map((theta) => crownPoint(theta, row / rows)));
  const capParts = [colored(gridGeometry(crownGrid, true), CAP_COLOR)];
  // สายปรับขนาดด้านหลัง: แถบผ้าโค้งตามขอบหมวกเหนือท้ายทอย + หัวเข็มขัดเล็ก ๆ
  const strapRows = [0.015, 0.11].map((t) =>
    Array.from({ length: 9 }, (_, i) => crownPoint(Math.PI - 0.38 + (0.76 * i) / 8, t, 0.0016)));
  capParts.push(colored(gridGeometry(strapRows, false), SEAM_COLOR));
  const buckle = new THREE.BoxGeometry(0.014, 0.011, 0.003);
  buckle.translate(0, 0, -0.0015);
  const buckleAt = crownPoint(Math.PI + 0.14, 0.06, 0.003);
  buckle.lookAt(new THREE.Vector3(buckleAt.x, 0, buckleAt.z - HEAD_FORWARD).normalize().negate());
  buckle.translate(...buckleAt.toArray());
  capParts.push(colored(buckle, new THREE.Color("#b8bcc2")));

  // ตะเข็บ 6 เส้น (หน้ากลาง, ±60°, ±120°, หลังกลาง) + กระดุมยอดหมวก — เห็นตอนซูมใกล้, รุ่นเบาไม่ต้องมี
  if (!LITE) {
    for (let k = 0; k < 6; k += 1) {
      const theta = (k * Math.PI) / 3;
      const path = new THREE.CatmullRomCurve3(Array.from({ length: 9 }, (_, i) => crownPoint(theta, 0.04 + (0.9 * i) / 8, 0.0008)));
      capParts.push(colored(new THREE.TubeGeometry(path, 16, 0.0014, 4, false), SEAM_COLOR));
    }
    const button = new THREE.SphereGeometry(0.0075, 12, 6);
    button.scale(1, 0.45, 1);
    button.translate(...crownPoint(0, 1).toArray());
    capParts.push(colored(button, CAP_COLOR));
  }

  // ปีกหมวก: ขอบในตามแนวขอบหมวกด้านหน้า (±68°), ขอบนอกรูปตัว D ยื่น ~7 ซม.
  // โค้งลงทั้งปลายปีก (~10°) และขอบซ้าย-ขวา (ดัดโค้งแบบแก๊ปที่ใส่จริง), หนา 6 → 4.5 มม.
  const across = LITE ? 8 : 16;
  const along = LITE ? 3 : 6;
  const bandFront = crownPoint(0, 0);
  const brimTop = [];
  const brimBottom = [];
  for (let j = 0; j <= along; j += 1) {
    const v = j / along;
    const topRow = [];
    const bottomRow = [];
    for (let i = 0; i <= across; i += 1) {
      const u = (i / across) * 2 - 1;
      const inner = crownPoint(u * THREE.MathUtils.degToRad(68), 0, 0.001);
      const alpha = u * (Math.PI / 2);
      const outer = new THREE.Vector3(0.093 * Math.sin(alpha), inner.y, bandFront.z - 0.004 + 0.07 * Math.cos(alpha) ** 0.85);
      const top = inner.clone().lerp(outer, v);
      top.y = inner.y - 0.012 * v ** 1.2 - 0.02 * u * u * v ** 0.9;
      topRow.push(top);
      bottomRow.push(top.clone().add(new THREE.Vector3(0, -(0.006 - 0.0015 * v), 0)));
    }
    brimTop.push(topRow);
    brimBottom.push(bottomRow);
  }
  capParts.push(colored(gridGeometry(brimTop, false, true), CAP_COLOR));
  capParts.push(colored(gridGeometry(brimBottom, false), UNDER_BRIM_COLOR));
  // ขอบปีก: ปลายหน้า + สองข้าง (เห็นความหนา)
  const edge = [...brimTop.map((row) => row[0]).reverse(), ...brimTop[along], ...brimTop.map((row) => row[across])];
  const edgeBottom = [...brimBottom.map((row) => row[0]).reverse(), ...brimBottom[along], ...brimBottom.map((row) => row[across])];
  capParts.push(colored(gridGeometry([edge, edgeBottom], false, true), CAP_COLOR));

  const capGeometry = mergeGeometries(capParts);
  // หมวกแข็งทั้งใบ → เป็น mesh ธรรมดาลูกของกระดูก Head ไม่ต้องเก็บน้ำหนักผิวทุกจุด
  capGeometry.translate(...head.getWorldPosition(new THREE.Vector3()).negate().toArray());
  const cap = new THREE.Mesh(capGeometry, new THREE.MeshStandardMaterial({ color: "#ffffff", vertexColors: true, roughness: 0.82, metalness: 0 }));
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

/** track หมุนจากฟังก์ชันมุม [x, y, z] ต่อ phase (0..2π ต่อรอบคลิป) — ทุกเทอมเป็น sin/cos ของ phase จำนวนเต็มเท่า คลิปจึงวนต่อกันเนียน */
const eulerTrack = (name, cycle, angles, order = "XYZ") =>
  new THREE.QuaternionKeyframeTrack(name + ".quaternion", cycle.times,
    cycle.phases.flatMap((phase) => new THREE.Quaternion().setFromEuler(new THREE.Euler(...angles(phase), order)).toArray()));

// ---- Idle: ยืนรอ 6 วิ — หายใจ 2 รอบ (อกพองนิด ไหล่ยกตาม), ถ่ายน้ำหนักซ้าย-ขวา 1 รอบ (สะโพกเลื่อน ขาเอียงให้เท้าอยู่ที่เดิม
// ลำตัวเอียงกลับให้หัวตรง), หันมองรอบ ๆ ช้า ๆ
const IDLE_DURATION = 6;
const idleCycle = sampled(IDLE_DURATION, 72);
const IDLE_SHIFT = 0.014;
const shift = (phase) => IDLE_SHIFT * Math.sin(phase);
const breath = (phase) => 0.5 - 0.5 * Math.cos(phase * 2);
// เท้าอยู่กับที่: สะโพกเลื่อน x → ขาทั้งสองเอียงรอบแกน z ด้วยมุมเท่ากัน แล้วข้อเท้าเอียงกลับ
const relaxedKnee = (phase) => 0.05 * Math.max(0, Math.sin(phase));
const legLean = (phase) => Math.atan2(shift(phase), HIPS_Y - LEG_DROP - ANKLE_Y);
const idle = new THREE.AnimationClip("Idle", IDLE_DURATION, [
  new THREE.VectorKeyframeTrack("Hips.position", idleCycle.times,
    // เชิงกรานเอียง → ข้อสะโพกข้างรับน้ำหนักต่ำลง (0.09 ม. × มุมเอียง) ยกสะโพกชดเชยให้เท้าข้างนั้นไม่จมพื้น
    idleCycle.phases.flatMap((phase) => [shift(phase), HIPS_Y + 0.0026 * Math.abs(Math.sin(phase)), 0])),
  eulerTrack("Hips", idleCycle, (phase) => [0, 0, 0.025 * Math.sin(phase)]),
  eulerTrack("LeftLeg", idleCycle, (phase) => [0, 0, -legLean(phase) - 0.025 * Math.sin(phase)]),
  eulerTrack("RightLeg", idleCycle, (phase) => [0, 0, -legLean(phase) - 0.025 * Math.sin(phase)]),
  // ขาที่รับน้ำหนักน้อยลงงอเข่านิด ข้อเท้างอกลับให้ฝ่าเท้าราบ (ไม่จิกปลายเท้าลงพื้น)
  eulerTrack("LeftFoot", idleCycle, (phase) => [-relaxedKnee(phase), 0, legLean(phase)]),
  eulerTrack("RightFoot", idleCycle, (phase) => [-relaxedKnee(phase + Math.PI), 0, legLean(phase)]),
  eulerTrack("LeftLowerLeg", idleCycle, (phase) => [relaxedKnee(phase), 0, 0]),
  eulerTrack("RightLowerLeg", idleCycle, (phase) => [relaxedKnee(phase + Math.PI), 0, 0]),
  eulerTrack("Spine", idleCycle, (phase) => [-0.012 * breath(phase), 0.02 * Math.sin(phase + 0.8), -0.04 * Math.sin(phase)]),
  eulerTrack("Neck", idleCycle, (phase) => [0.01 * breath(phase), 0.08 * Math.sin(phase) + 0.03 * Math.sin(phase * 3 + 1), 0.015 * Math.sin(phase)]),
  eulerTrack("Head", idleCycle, (phase) => [0.02 * Math.sin(phase * 2 + 0.5), 0.2 * Math.sin(phase) + 0.07 * Math.sin(phase * 3 + 1), 0]),
  // แขนผ่อนคลาย: กางออกจากตัวนิด ศอกงอ ~13° ข้อมือห้อยงอเข้า — ไม่ห้อยตรงแข็งชิดลำตัว
  eulerTrack("LeftArm", idleCycle, (phase) => [-0.04 + 0.015 * Math.sin(phase), 0, -0.07 - 0.01 * breath(phase)]),
  eulerTrack("RightArm", idleCycle, (phase) => [-0.04 - 0.015 * Math.sin(phase), 0, 0.07 + 0.01 * breath(phase)]),
  eulerTrack("LeftForeArm", idleCycle, (phase) => [-0.22 + 0.03 * Math.sin(phase * 2), 0, 0.04]),
  eulerTrack("RightForeArm", idleCycle, (phase) => [-0.22 - 0.03 * Math.sin(phase * 2), 0, -0.04]),
  eulerTrack("LeftHand", idleCycle, () => [-0.06, 0, 0.06]),
  eulerTrack("RightHand", idleCycle, () => [-0.06, 0, -0.06]),
]);

// ---- Work (พนักงาน): ยืนหลังเคาน์เตอร์ มือสองข้างวางทำงานบนเคาน์เตอร์ (ข้อมือสูง ~1 ม. หน้าตัว ~0.3 ม.) ก้มมองมือ
// มือขยับสลับกันเหมือนกดเครื่องคิดเงิน/จัดของ, ราวกลางคลิปเงยหน้ามองไปหน้าร้าน แล้วก้มกลับ, ตัวโยกช้า ๆ
const WORK_DURATION = 8;
const workCycle = sampled(WORK_DURATION, 96);
// 0 → 1 → 0 ช่วงเงยหน้า (กลางคลิป) แบบนุ่ม
const lookUp = (phase) => Math.max(0, Math.cos(phase - Math.PI)) ** 3;
/** ปลายแขน: งอ (x) แล้วหันเข้าหากลางตัว (yaw) โดยบิดรอบแกนท่อนแขนก่อน (roll) */
const pronatedTrack = (name, bendYaw, roll) =>
  new THREE.QuaternionKeyframeTrack(name + ".quaternion", workCycle.times, workCycle.phases.flatMap((phase) => {
    const [bend, yaw] = bendYaw(phase);
    return new THREE.Quaternion().setFromEuler(new THREE.Euler(bend, yaw, 0, "YXZ"))
      .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, roll, 0))).toArray();
  }));
const work = new THREE.AnimationClip("Work", WORK_DURATION, [
  new THREE.VectorKeyframeTrack("Hips.position", workCycle.times,
    workCycle.phases.flatMap((phase) => [0.008 * Math.sin(phase), HIPS_Y - 0.003, 0])),
  eulerTrack("LeftLeg", workCycle, (phase) => [0, 0, -0.01 * Math.sin(phase)]),
  eulerTrack("RightLeg", workCycle, (phase) => [0, 0, -0.01 * Math.sin(phase)]),
  eulerTrack("LeftFoot", workCycle, (phase) => [0, 0, 0.01 * Math.sin(phase)]),
  eulerTrack("RightFoot", workCycle, (phase) => [0, 0, 0.01 * Math.sin(phase)]),
  eulerTrack("Spine", workCycle, (phase) => [0.09 - 0.05 * lookUp(phase) - 0.01 * (0.5 - 0.5 * Math.cos(phase * 4)), 0.03 * Math.sin(phase * 2), -0.012 * Math.sin(phase)]),
  eulerTrack("Neck", workCycle, (phase) => [0.16 - 0.16 * lookUp(phase), 0.04 * Math.sin(phase * 3), 0]),
  eulerTrack("Head", workCycle, (phase) => [0.2 - 0.22 * lookUp(phase), 0.06 * Math.sin(phase * 2 + 0.4) + 0.12 * lookUp(phase), 0]),
  // ต้นแขนยื่นไปหน้า ปลายแขนเกือบขนานพื้นและหมุนเข้าหากลางตัว — มือขยับขึ้นลงสลับกัน (ความถี่สูงกว่าตัวโยก)
  eulerTrack("LeftArm", workCycle, (phase) => [-0.32 + 0.04 * Math.sin(phase * 5), 0, 0.1], "YXZ"),
  eulerTrack("RightArm", workCycle, (phase) => [-0.3 + 0.04 * Math.sin(phase * 5 + 2.2), 0, -0.1], "YXZ"),
  // คว่ำมือลงบนเคาน์เตอร์: บิดรอบแกนท่อนแขน แบ่งครึ่งระหว่างปลายแขนกับข้อมือ (บิดที่เดียวผิวจะเป็นเกลียว)
  pronatedTrack("LeftForeArm", (phase) => [-1.16 - 0.06 * Math.sin(phase * 5 + 0.6) + 0.1 * lookUp(phase), 0.35], 0.75),
  pronatedTrack("RightForeArm", (phase) => [-1.14 - 0.06 * Math.sin(phase * 5 + 2.8) + 0.1 * lookUp(phase), -0.35], -0.8),
  eulerTrack("LeftHand", workCycle, (phase) => [0.12 + 0.08 * Math.sin(phase * 5 + 1.2), 0.75, 0], "YXZ"),
  eulerTrack("RightHand", workCycle, (phase) => [0.12 + 0.08 * Math.sin(phase * 5 + 3.4), -0.8, 0], "YXZ"),
]);

// Solve a two-bone leg toward a planted/swinging ankle instead of swinging
// every joint independently. ก้าวละ 0.45 ม. ราว 126 ก้าว/นาที (~0.95 ม./วิ) เท่าคนเดินในร้าน
const WALK_DURATION = 0.95;
const WALK_DISTANCE = 0.9;
const walkCycle = sampled(WALK_DURATION, 60);
model.userData.walkCycleDistance = WALK_DISTANCE;
// สะโพกต่ำสุดตอนสองขากางสุด (ขาเหยียดถึงพื้นพอดี) สูงสุดตอนขาผ่านกัน — ตอนนั้นขาที่รับน้ำหนักเกือบเหยียดตรง
// (ก้าวละ 0.45 ม.: ขากาง ±0.225 ม. ข้อสะโพกต้องต่ำลง ~3.3 ซม. จากท่ายืน)
const hipHeights = walkCycle.phases.map((phase) => HIPS_Y - 0.034 + 0.015 * (1 - Math.cos(phase * 2)));
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
  // Work ใส่เฉพาะไฟล์พนักงาน
  animations: STAFF ? [idle, walk, sit, work] : [idle, walk, sit],
  onlyVisible: true,
});

// ---- บีบอัด (แอปต้องตั้ง MeshoptDecoder ให้ GLTFLoader — ดู src/components/preview-3d/character-models.ts)
// 1. normal/น้ำหนักผิว/ดัชนีกระดูกเป็นจำนวนเต็มขนาดเล็ก (KHR_mesh_quantization)
//    ไม่บีบตำแหน่งจุด — ฉากร้านสลับผิวรุ่นละเอียด/รุ่นเบาบนโครงกระดูกเดียวกัน ถ้าบีบตำแหน่งแต่ละไฟล์จะมีสเกลถอดรหัสต่างกัน
// 2. ตัด keyframe ที่ซ้ำ/อยู่บนเส้นตรงออก (resample)
// 3. เรียงจุด/หน้าให้บีบได้ดี แล้วเข้ารหัส buffer ด้วย EXT_meshopt_compression (ไม่สูญเสียข้อมูลเพิ่ม)
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder });
const document = await io.readBinary(new Uint8Array(glb));
await document.transform(
  dedup(),
  prune({ keepAttributes: true }),
  resample(),
  quantize({ pattern: /^(NORMAL|JOINTS_0|WEIGHTS_0)$/, quantizeNormal: 8, quantizeWeight: 8 }),
  reorder({ encoder: MeshoptEncoder }),
);
// normal เป็น int8 ต้องประกาศ KHR_mesh_quantization เอง (quantize ไม่ประกาศให้เมื่อไม่ได้บีบตำแหน่งจุด)
document.createExtension(KHRMeshQuantization).setRequired(true);
document.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
const compressed = await io.writeBinary(document);

await mkdir(outputDirectory, { recursive: true });
await writeFile(outputFile, compressed);
console.log(`สร้าง ${outputFile.pathname} (${position.count} จุด, ${geometry.getIndex().count / 3} หน้า)`);
