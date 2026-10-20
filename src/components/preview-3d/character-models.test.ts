import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { CHARACTER_MODELS } from "./character-models";

async function load(url: string) {
  const bytes = await readFile(`public${url}`);
  return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
}

function boneNames(scene: THREE.Object3D) {
  const names: string[] = [];
  scene.traverse((object) => {
    if (object instanceof THREE.Bone) names.push(object.name);
  });
  return names.sort();
}

describe("character models", () => {
  it("gives customers and staff separate files", () => {
    const files = Object.values(CHARACTER_MODELS).flatMap((model) => [model.full, model.lite]);
    expect(new Set(files).size).toBe(files.length);
  });

  for (const variant of ["full", "lite"] as const) {
    it(`staff (${variant}) shares the customer skeleton and clips but wears a uniform and cap`, async () => {
      const customer = await load(CHARACTER_MODELS.customer[variant]);
      const staff = await load(CHARACTER_MODELS.staff[variant]);
      expect(boneNames(staff.scene)).toEqual(boneNames(customer.scene));
      expect(staff.animations.map((clip) => clip.name)).toEqual(customer.animations.map((clip) => clip.name));
      expect(staff.scene.getObjectByName("CafeMannequin")?.userData.walkCycleDistance).toBe(
        customer.scene.getObjectByName("CafeMannequin")?.userData.walkCycleDistance,
      );

      const body = staff.scene.getObjectByName("MannequinBody") as THREE.SkinnedMesh;
      const colors = body.geometry.getAttribute("color");
      expect(colors).toBeDefined();
      expect((body.material as THREE.MeshStandardMaterial).vertexColors).toBe(true);
      // ลำตัวเป็นสีชุด ส่วนที่เหลือคงสีหุ่น → มีสองสีบนผิว
      const distinct = new Set<string>();
      for (let i = 0; i < colors.count; i++) distinct.add(`${colors.getX(i).toFixed(3)},${colors.getY(i).toFixed(3)},${colors.getZ(i).toFixed(3)}`);
      expect(distinct.size).toBe(2);
      expect(customer.scene.getObjectByName("MannequinBody")).toBeInstanceOf(THREE.SkinnedMesh);
      expect((customer.scene.getObjectByName("MannequinBody") as THREE.Mesh).geometry.getAttribute("color")).toBeUndefined();

      // สีเก็บช่องละ 8 บิต ไม่ใช่ float
      expect(colors.array).toBeInstanceOf(Uint8Array);
      expect(colors.normalized).toBe(true);
      // หมวกแข็งทั้งใบ: mesh ธรรมดาที่ติดกับกระดูก Head (ไม่มีน้ำหนักผิว)
      const cap = staff.scene.getObjectByName("StaffCap");
      expect(cap).toBeInstanceOf(THREE.Mesh);
      expect(cap).not.toBeInstanceOf(THREE.SkinnedMesh);
      expect(cap?.parent?.name).toBe("Head");
      expect(customer.scene.getObjectByName("StaffCap")).toBeUndefined();
    });
  }

  it("keeps the cap on the head while the staff member sits", async () => {
    const { scene, animations } = await load(CHARACTER_MODELS.staff.full);
    const sit = animations.find((clip) => clip.name === "Sit")!;
    const mixer = new THREE.AnimationMixer(scene);
    const action = mixer.clipAction(sit).setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();
    mixer.setTime(sit.duration);
    scene.updateMatrixWorld(true);
    const cap = scene.getObjectByName("StaffCap")!;
    const head = scene.getObjectByName("Head")!.getWorldPosition(new THREE.Vector3());
    const bounds = new THREE.Box3().setFromObject(cap);
    // หมวกอยู่เหนือข้อต่อหัว (สูงกว่าหู) และปีกยื่นไปหน้า
    expect(bounds.min.y).toBeGreaterThan(head.y + 0.1);
    expect(bounds.max.z).toBeGreaterThan(head.z + 0.15);
  });
});
