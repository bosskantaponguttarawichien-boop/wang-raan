import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

async function loadCustomer() {
  const bytes = await readFile("public/assets/models/cafe-customer.glb");
  return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
}

describe("customer walk asset", () => {
  it("settles the hips at chair-seat height and folds the knees toward the chair front", async () => {
    const { scene, animations } = await loadCustomer();
    const sit = animations.find((clip) => clip.name === "Sit")!;
    const mixer = new THREE.AnimationMixer(scene);
    const action = mixer.clipAction(sit).setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();
    mixer.setTime(sit.duration);
    scene.updateMatrixWorld(true);

    const hips = scene.getObjectByName("Hips")!.getWorldPosition(new THREE.Vector3());
    const knee = scene.getObjectByName("LeftLowerLeg")!.getWorldPosition(new THREE.Vector3());
    const ankle = scene.getObjectByName("LeftFoot")!.getWorldPosition(new THREE.Vector3());
    const leftHand = scene.getObjectByName("LeftHand")!.getWorldPosition(new THREE.Vector3());
    const rightHand = scene.getObjectByName("RightHand")!.getWorldPosition(new THREE.Vector3());
    expect(hips.y).toBeCloseTo(0.628, 3);
    expect(knee.y).toBeGreaterThan(0.57);
    // ต้นขายาว .129 พับไปหน้าเกือบขนานพื้น
    expect(knee.z).toBeGreaterThan(0.12);
    expect(ankle.y).toBeLessThan(knee.y);
    expect(leftHand.x).toBeLessThan(0);
    expect(rightHand.x).toBeGreaterThan(0);
    expect(leftHand.x).toBeCloseTo(-rightHand.x, 3);
    expect(Math.abs(leftHand.x)).toBeLessThan(0.16);
    expect(leftHand.z).toBeGreaterThan(0.05);
  });

  it("loops without a pose jump and plants each support foot at the authored travel speed", async () => {
    const { scene, animations } = await loadCustomer();
    const walk = animations.find((clip) => clip.name === "Walk")!;
    const stride = scene.getObjectByName("CafeMannequin")!.userData.walkCycleDistance as number;
    expect(stride).toBeGreaterThan(0);
    for (const track of walk.tracks) {
      const size = track.getValueSize();
      for (let i = 0; i < size; i++) expect(track.values[i]).toBeCloseTo(track.values[track.values.length - size + i]!, 5);
    }
    const mixer = new THREE.AnimationMixer(scene);
    mixer.clipAction(walk).play();
    for (const [name, start] of [["LeftFoot", 0], ["RightFoot", 0.5]] as const) {
      let contactZ: number | undefined;
      for (let i = 0; i <= 20; i++) {
        const time = (start + i / 40) * walk.duration;
        mixer.setTime(time);
        scene.updateMatrixWorld(true);
        const foot = scene.getObjectByName(name)!.getWorldPosition(new THREE.Vector3());
        const worldZ = foot.z + stride / walk.duration * time;
        contactZ ??= worldZ;
        expect(Math.abs(worldZ - contactZ)).toBeLessThan(0.001);
        expect(foot.y).toBeCloseTo(0.065, 3);
      }
    }
  });

  it.each(["Idle", "Walk", "Sit"])("keeps the deformed skin finite and above the floor throughout %s", async (name) => {
    const { scene, animations } = await loadCustomer();
    const walk = animations.find((clip) => clip.name === name)!;
    const mesh = scene.getObjectByName("MannequinBody") as THREE.SkinnedMesh;
    const mixer = new THREE.AnimationMixer(scene);
    mixer.clipAction(walk).play();
    const point = new THREE.Vector3();
    let minimum = Infinity;
    for (let frame = 0; frame <= 120; frame++) {
      mixer.setTime(walk.duration * frame / 120);
      scene.updateMatrixWorld(true);
      mesh.skeleton.update();
      for (let vertex = 0; vertex < mesh.geometry.getAttribute("position").count; vertex++) {
        mesh.getVertexPosition(vertex, point);
        if (!Number.isFinite(point.lengthSq())) throw new Error("Non-finite skinned vertex");
        minimum = Math.min(minimum, point.y);
      }
    }
    expect(minimum).toBeGreaterThanOrEqual(0);
    expect(minimum).toBeLessThan(0.005);
  });
});
