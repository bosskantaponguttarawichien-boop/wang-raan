/**
 * สร้าง GLB แบบ self-contained สำหรับตัวละครลูกค้าของมุมมอง 3D
 *
 * โมเดลเป็นชิ้นส่วนทรงกลม/ทรงแคปซูลที่ผูกกับ bone hierarchy เพื่อให้
 * เบา โหลดเร็ว และมีคลิป Idle / Walk ในไฟล์เดียว โดยไม่พึ่ง asset ภายนอก
 * รัน: node scripts/create-cafe-customer-model.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";

// GLTFExporter ใช้ FileReader แบบ browser; polyfill เล็กน้อยเพื่อให้ script นี้รันใน Node ได้
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

const matte = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0 });
const skin = matte("#d98d5a");
const hair = matte("#382826");
const cream = matte("#f7e8cf");
const blue = matte("#3569d7");
const blueDark = matte("#2955ad");
const white = matte("#faf8f3");
const bag = matte("#292b35");
const eye = matte("#26212a");
const blush = matte("#ec8061");
const mouth = matte("#8f392f");
const tongue = matte("#ed6b5d");

const quaternionFrames = (angles) =>
  angles.flatMap((angle) => new THREE.Quaternion().setFromEuler(new THREE.Euler(angle, 0, 0)).toArray());

function mesh(geometry, material, position, scale) {
  const part = new THREE.Mesh(geometry, material);
  part.position.set(...position);
  if (scale) part.scale.set(...scale);
  part.castShadow = true;
  part.receiveShadow = true;
  return part;
}

function bone(name, position) {
  const part = new THREE.Bone();
  part.name = name;
  part.position.set(...position);
  return part;
}

function addCurls(parent, positions) {
  for (const [x, y, z, size = 1] of positions) {
    parent.add(mesh(new THREE.SphereGeometry(0.115, 16, 12), hair, [x, y, z], [size, size * 0.9, size * 0.82]));
  }
}

const model = new THREE.Group();
model.name = "CafeCustomer";

const hips = bone("Hips", [0, 0.82, 0]);
const torso = bone("Spine", [0, 0.38, 0]);
const head = bone("Head", [0, 0.63, 0]);
const leftArm = bone("LeftArm", [-0.3, 0.36, 0]);
const rightArm = bone("RightArm", [0.3, 0.36, 0]);
const leftLeg = bone("LeftLeg", [-0.15, -0.12, 0]);
const rightLeg = bone("RightLeg", [0.15, -0.12, 0]);

model.add(hips);
hips.add(torso, leftLeg, rightLeg);
torso.add(head, leftArm, rightArm);

// ลำตัวและศีรษะ: soft-toy chibi ตามภาพอ้างอิง — หัวโต มุมมน และผิว matte
torso.add(mesh(new THREE.CapsuleGeometry(0.37, 0.42, 10, 20), cream, [0, 0.22, 0], [1, 1, 0.9]));
torso.add(mesh(new THREE.TorusGeometry(0.31, 0.105, 10, 20), cream, [0, 0.51, -0.02], [1, 0.56, 0.9]));
torso.add(mesh(new THREE.BoxGeometry(0.39, 0.17, 0.08), cream, [0, -0.01, 0.34], [1, 1, 1]));

head.add(mesh(new THREE.SphereGeometry(0.45, 28, 22), skin, [0, 0.25, 0.02], [1, 1.04, 0.94]));
head.add(mesh(new THREE.SphereGeometry(0.1, 16, 12), skin, [-0.43, 0.19, 0.02], [0.78, 1, 0.7]));
head.add(mesh(new THREE.SphereGeometry(0.1, 16, 12), skin, [0.43, 0.19, 0.02], [0.78, 1, 0.7]));

// หมวกแก๊ป: crown ครึ่งทรงกลม + กระบังหน้านูนแยกชิ้น
head.add(mesh(new THREE.SphereGeometry(0.474, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2.05), blue, [0, 0.51, 0.0], [1, 0.92, 0.97]));
head.add(mesh(new THREE.SphereGeometry(0.25, 22, 12), blue, [0, 0.43, 0.39], [1.48, 0.31, 0.66]));
head.add(mesh(new THREE.SphereGeometry(0.06, 14, 10), blueDark, [0, 0.89, -0.08], [1, 0.55, 1]));

// ผมหยิกโผล่ใต้หมวกและไล่รอบกรอบหน้า
addCurls(head, [
  [-0.29, 0.48, 0.29], [-0.19, 0.55, 0.34], [0.19, 0.55, 0.34], [0.3, 0.48, 0.29],
  [-0.42, 0.32, 0.1], [-0.43, 0.18, -0.07], [-0.36, 0.04, -0.18],
  [0.42, 0.32, 0.1], [0.43, 0.18, -0.07], [0.36, 0.04, -0.18],
  [-0.22, -0.04, -0.27], [0.22, -0.04, -0.27],
]);

// ใบหน้าเรียบง่ายแบบของเล่น: คิ้ว ดวงตารี แก้ม จมูก และรอยยิ้ม
head.add(mesh(new THREE.CapsuleGeometry(0.026, 0.11, 6, 10), eye, [-0.145, 0.43, 0.385], [1, 1, 0.7]));
head.add(mesh(new THREE.CapsuleGeometry(0.026, 0.11, 6, 10), eye, [0.145, 0.43, 0.385], [1, 1, 0.7]));
head.children.at(-2).rotation.z = Math.PI / 2.25;
head.children.at(-1).rotation.z = -Math.PI / 2.25;
head.add(mesh(new THREE.SphereGeometry(0.062, 14, 12), eye, [-0.14, 0.24, 0.414], [0.72, 1.35, 0.44]));
head.add(mesh(new THREE.SphereGeometry(0.062, 14, 12), eye, [0.14, 0.24, 0.414], [0.72, 1.35, 0.44]));
head.add(mesh(new THREE.SphereGeometry(0.055, 12, 10), skin, [0, 0.17, 0.45], [0.9, 0.72, 0.65]));
head.add(mesh(new THREE.SphereGeometry(0.078, 14, 10), blush, [-0.27, 0.13, 0.39], [1.25, 0.62, 0.22]));
head.add(mesh(new THREE.SphereGeometry(0.078, 14, 10), blush, [0.27, 0.13, 0.39], [1.25, 0.62, 0.22]));
head.add(mesh(new THREE.SphereGeometry(0.09, 14, 10), mouth, [0, 0.035, 0.412], [0.8, 0.58, 0.2]));
head.add(mesh(new THREE.SphereGeometry(0.047, 12, 8), tongue, [0, 0.002, 0.434], [1.15, 0.38, 0.18]));

// แขน ขา รองเท้า และกระเป๋าคาดอก
for (const [arm, x] of [[leftArm, -1], [rightArm, 1]]) {
  arm.add(mesh(new THREE.CapsuleGeometry(0.13, 0.34, 8, 14), cream, [0, -0.22, 0], [1, 1, 0.96]));
  arm.add(mesh(new THREE.SphereGeometry(0.13, 16, 12), skin, [0, -0.46, 0.02], [0.9, 1, 0.8]));
  arm.rotation.z = x * 0.11;
}
for (const [leg, x] of [[leftLeg, -1], [rightLeg, 1]]) {
  leg.add(mesh(new THREE.CapsuleGeometry(0.145, 0.39, 8, 14), blue, [0, -0.31, 0], [1, 1, 0.96]));
  leg.add(mesh(new THREE.TorusGeometry(0.145, 0.035, 8, 16), blue, [0, -0.54, 0], [1, 0.56, 0.95]));
  leg.add(mesh(new THREE.SphereGeometry(0.17, 16, 12), white, [x * 0.035, -0.64, 0.12], [1.14, 0.68, 1.55]));
  leg.add(mesh(new THREE.SphereGeometry(0.13, 14, 10), matte("#cbc7c3"), [x * 0.035, -0.675, 0.1], [1.02, 0.2, 1.34]));
}
torso.add(mesh(new THREE.BoxGeometry(0.43, 0.31, 0.14), bag, [0.22, 0.03, 0.4], [1, 1, 1]));
torso.add(mesh(new THREE.BoxGeometry(0.47, 0.075, 0.07), bag, [0.22, 0.07, 0.49], [1, 1, 1]));
torso.add(mesh(new THREE.BoxGeometry(0.05, 0.11, 0.05), blueDark, [0.22, 0.1, 0.53], [1, 1, 1]));
const strap = mesh(new THREE.BoxGeometry(0.07, 0.8, 0.055), bag, [0.0, 0.3, 0.37], [1, 1, 1]);
strap.rotation.z = 0.48;
torso.add(strap);

// เชือกฮู้ดและปลายเชือก ช่วยให้แยกรูปทรงเสื้อออกจากลำตัวได้ชัดเจน
for (const x of [-0.1, 0.1]) {
  torso.add(mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.18, 8), cream, [x, 0.38, 0.36]));
  torso.add(mesh(new THREE.SphereGeometry(0.032, 10, 8), cream, [x, 0.28, 0.36]));
}

const idle = new THREE.AnimationClip("Idle", 2, [
  new THREE.QuaternionKeyframeTrack("Head.quaternion", [0, 1, 2], quaternionFrames([0.02, -0.025, 0.02])),
  new THREE.NumberKeyframeTrack("Spine.position[y]", [0, 1, 2], [0.38, 0.4, 0.38]),
]);

const walk = new THREE.AnimationClip("Walk", 0.8, [
  new THREE.QuaternionKeyframeTrack("LeftLeg.quaternion", [0, 0.2, 0.4, 0.6, 0.8], quaternionFrames([0.56, 0, -0.56, 0, 0.56])),
  new THREE.QuaternionKeyframeTrack("RightLeg.quaternion", [0, 0.2, 0.4, 0.6, 0.8], quaternionFrames([-0.56, 0, 0.56, 0, -0.56])),
  new THREE.QuaternionKeyframeTrack("LeftArm.quaternion", [0, 0.2, 0.4, 0.6, 0.8], quaternionFrames([-0.42, 0, 0.42, 0, -0.42])),
  new THREE.QuaternionKeyframeTrack("RightArm.quaternion", [0, 0.2, 0.4, 0.6, 0.8], quaternionFrames([0.42, 0, -0.42, 0, 0.42])),
  new THREE.NumberKeyframeTrack("Hips.position[y]", [0, 0.2, 0.4, 0.6, 0.8], [0.82, 0.85, 0.82, 0.85, 0.82]),
]);

const exporter = new GLTFExporter();
const glb = await exporter.parseAsync(model, {
  binary: true,
  animations: [idle, walk],
  onlyVisible: true,
});

await mkdir(outputDirectory, { recursive: true });
await writeFile(outputFile, new Uint8Array(glb));
console.log(`สร้าง ${outputFile.pathname}`);
