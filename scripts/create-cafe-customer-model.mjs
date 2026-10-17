/**
 * สร้าง GLB mannequin สีเทาแบบ low-poly สำหรับ Character Lab และฉาก 3D
 *
 * ตัวละครมีความสูง native 1.13 ม. (แสดงผลที่ scale 0.9 = ราว 1.02 ม.)
 * และมีคลิป Idle, Walk, Sit อยู่ในไฟล์เดียว
 * รัน: node scripts/create-cafe-customer-model.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";

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
const material = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.84, metalness: 0 });
const mannequin = material("#9da4af");

const quaternionFrames = (angles) =>
  angles.flatMap((angle) => new THREE.Quaternion().setFromEuler(new THREE.Euler(angle, 0, 0)).toArray());

function mesh(geometry, surface, position, scale) {
  const part = new THREE.Mesh(geometry, surface);
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

const model = new THREE.Group();
model.name = "CafeMannequin";

// Chibi ตามภาพอ้างอิง: หัวกลมใหญ่ คอสั้น ลำตัวอวบ และแขนขาเป็นก้อนนุ่มไม่เห็นข้อต่อ.
const hips = bone("Hips", [0, 0.43, 0]);
const spine = bone("Spine", [0, 0.1, 0]);
const head = bone("Head", [0, 0.42, 0]);
const leftArm = bone("LeftArm", [-0.13, 0.15, 0]);
const rightArm = bone("RightArm", [0.13, 0.15, 0]);
const leftLeg = bone("LeftLeg", [-0.105, -0.06, 0]);
const rightLeg = bone("RightLeg", [0.105, -0.06, 0]);
const leftLowerLeg = bone("LeftLowerLeg", [0, -0.18, 0]);
const rightLowerLeg = bone("RightLowerLeg", [0, -0.18, 0]);

model.add(hips);
hips.add(spine, leftLeg, rightLeg);
spine.add(head, leftArm, rightArm);
leftLeg.add(leftLowerLeg);
rightLeg.add(rightLowerLeg);

// ผิวชั้นนอกเป็นทรง capsule เดียว; สะโพกและคอถูกฝังเข้าไป จึงไม่มีรอยวงที่เอวหรือคอ.
spine.add(mesh(new THREE.CapsuleGeometry(0.18, 0.08, 10, 18), mannequin, [0, -0.02, 0], [1, 1, 0.68]));
hips.add(mesh(new THREE.SphereGeometry(0.17, 16, 12), mannequin, [0, 0, 0], [0.92, 0.42, 0.62]));
spine.add(mesh(new THREE.CapsuleGeometry(0.068, 0.035, 10, 16), mannequin, [0, 0.19, 0], [1, 1, 0.92]));
head.add(mesh(new THREE.SphereGeometry(0.185, 20, 16), mannequin, [0, 0.015, 0], [1.03, 1.06, 0.96]));

for (const [side, direction] of [[-1, -1], [1, 1]]) {
  // หูเรียบและก้อนแขนป้อมยื่นจากหัวไหล่ คล้าย reference โดยไม่มีรายละเอียดใบหน้า/เสื้อผ้า.
  head.add(mesh(new THREE.SphereGeometry(0.058, 12, 10), mannequin, [side * 0.2, -0.03, 0], [0.78, 1, 0.56]));
  const arm = side < 0 ? leftArm : rightArm;
  const armPart = mesh(new THREE.CapsuleGeometry(0.075, 0.14, 10, 18), mannequin, [0, -0.03, 0], [1, 1, 0.88]);
  armPart.rotation.z = direction * 0.95;
  arm.add(armPart);
}

for (const upperLeg of [leftLeg, rightLeg]) {
  // ต้นขาเป็นเปลือกนอกยาวทับน่อง; รอยต่อหัวเข่าจึงหายไปในท่ายืน/เดิน.
  upperLeg.add(mesh(new THREE.CapsuleGeometry(0.1, 0.18, 10, 16), mannequin, [0, -0.1, 0], [1, 1, 0.9]));
}
for (const lowerLeg of [leftLowerLeg, rightLowerLeg]) {
  // น่องเกือบกว้างเท่าต้นขาและซ้อนเข้าไปลึก ลดเส้นคาดตรงหัวเข่าให้เป็น transition โค้ง.
  lowerLeg.add(mesh(new THREE.CapsuleGeometry(0.095, 0.13, 10, 18), mannequin, [0, -0.02, 0], [1, 1, 0.9]));
}

const idle = new THREE.AnimationClip("Idle", 2, [
  new THREE.QuaternionKeyframeTrack("Head.quaternion", [0, 1, 2], quaternionFrames([0.025, -0.025, 0.025])),
]);

const walkTimes = [0, 0.2, 0.4, 0.6, 0.8];
const walk = new THREE.AnimationClip("Walk", 0.8, [
  new THREE.QuaternionKeyframeTrack("LeftLeg.quaternion", walkTimes, quaternionFrames([0.32, 0, -0.32, 0, 0.32])),
  new THREE.QuaternionKeyframeTrack("RightLeg.quaternion", walkTimes, quaternionFrames([-0.32, 0, 0.32, 0, -0.32])),
  new THREE.QuaternionKeyframeTrack("LeftArm.quaternion", walkTimes, quaternionFrames([-0.26, 0, 0.26, 0, -0.26])),
  new THREE.QuaternionKeyframeTrack("RightArm.quaternion", walkTimes, quaternionFrames([0.26, 0, -0.26, 0, 0.26])),
]);

const sit = new THREE.AnimationClip("Sit", 1, [
  new THREE.QuaternionKeyframeTrack("LeftLeg.quaternion", [0, 1], quaternionFrames([0, -1.32])),
  new THREE.QuaternionKeyframeTrack("RightLeg.quaternion", [0, 1], quaternionFrames([0, -1.32])),
  new THREE.QuaternionKeyframeTrack("LeftLowerLeg.quaternion", [0, 1], quaternionFrames([0, 1.24])),
  new THREE.QuaternionKeyframeTrack("RightLowerLeg.quaternion", [0, 1], quaternionFrames([0, 1.24])),
  new THREE.QuaternionKeyframeTrack("LeftArm.quaternion", [0, 1], quaternionFrames([0, -0.36])),
  new THREE.QuaternionKeyframeTrack("RightArm.quaternion", [0, 1], quaternionFrames([0, -0.36])),
]);

const exporter = new GLTFExporter();
const glb = await exporter.parseAsync(model, {
  binary: true,
  animations: [idle, walk, sit],
  onlyVisible: true,
});

await mkdir(outputDirectory, { recursive: true });
await writeFile(outputFile, new Uint8Array(glb));
console.log(`สร้าง ${outputFile.pathname}`);
