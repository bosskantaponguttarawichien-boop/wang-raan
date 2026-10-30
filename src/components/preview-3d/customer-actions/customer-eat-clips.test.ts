/**
 * feat-110 · ตรวจคลิป Eat ของลูกค้าบน GLB ที่สร้างจาก provider จริง
 *
 * ค่าอ้างอิงเขียนตรงตามสัญญา v1 §3 และของจริงในฉาก: เบาะ 0.45 ม., โต๊ะ 0.74 ม., จานหนา 0.025 ม.
 * ไม่ import ค่าจาก provider เพื่อไม่ให้เทสต์ผ่านเพราะค่าผิดพร้อมกันทั้งสองฝั่ง
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as THREE from "three";
import { createCharacterLoader } from "../character-loader";

const PROVIDER = "scripts/character-clips/customer-eat.mjs";
const BASE_CLIPS = ["Idle", "Walk", "Sit"] as const;
const MARKER_NAMES = ["hand-contact", "food-contact", "seated", "wipe-contact", "clear-complete"];
const CONTRACT_FOODS = ["fried-rice", "noodles", "steak", "salad", "cake"];

// ---- ของจริงในฉาก (ม.) ----
const SEAT_TOP_Y = 0.45;
/**
 * ผิวบนโต๊ะจริงของฉาก: three-view.tsx วางกล่องหนา 0.04 ม. ให้จุดกลางอยู่ที่ 0.74 ม.
 * (placeMesh ตั้ง mesh.position.y) ผิวสัมผัสจึงอยู่ที่ 0.76 ม. เท่ากับที่ table-service (feat-116) ใช้
 */
const TABLE_BOX_CENTER_Y = 0.74;
const TABLE_SURFACE_Y = TABLE_BOX_CENTER_Y + 0.02;
const PLATE_THICKNESS = 0.025;
const FOOD_SURFACE_Y = TABLE_SURFACE_Y + PLATE_THICKNESS;
const PLATE_FORWARD = 0.34;
const PLATE_RADIUS = 0.13;
/** ท่านั่งเดิมวางใต้ต้นขาบนเบาะ: ข้อสะโพกต่ำกว่า Hips 0.04 + ครึ่งความหนาต้นขา 0.09 */
const SEATED_HIPS_Y = SEAT_TOP_Y + 0.04 + 0.09;
const MOUTH_LOCAL = new THREE.Vector3(0, 0.075, 0.115);
const TIP_REACH = 0.135;
const palmLocal = (side: number) => new THREE.Vector3(side * -0.0099, -0.0864, -0.0253);

const directory = mkdtempSync(join(tmpdir(), "wangraan-eat-test-"));
afterAll(() => {
  if (dirname(resolve(directory)) !== resolve(tmpdir()) || !basename(directory).startsWith("wangraan-eat-test-")) throw new Error("Unexpected temporary directory");
  rmSync(directory, { recursive: true, force: true });
});

interface Marker { name: string; time: number }
type Loaded = { scene: THREE.Group; animations: THREE.AnimationClip[]; markers: Record<string, Marker[]> };

async function parse(bytes: Buffer<ArrayBuffer>): Promise<Loaded> {
  const loaded = await createCharacterLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
  return {
    scene: loaded.scene as THREE.Group,
    animations: loaded.animations,
    markers: (loaded.scene.getObjectByName("CafeMannequin")?.userData.animationMarkers ?? {}) as Record<string, Marker[]>,
  };
}

let eating: Loaded;
let shipped: Loaded;

beforeAll(async () => {
  const output = join(directory, "customer-lite");
  const build = spawnSync(process.execPath, ["scripts/create-cafe-customer-model.mjs", "--role", "customer", "--lite", "--output-dir", output, "--clips", PROVIDER], { encoding: "utf8", timeout: 120000, windowsHide: true });
  expect(build.status, build.stderr).toBe(0);
  expect(readdirSync(output)).toEqual(["cafe-customer-lite.glb"]);
  eating = await parse(readFileSync(join(output, "cafe-customer-lite.glb")));
  shipped = await parse(readFileSync(resolve("public/assets/models/cafe-customer-lite.glb")));
}, 180000);

const clipOf = (loaded: Loaded, name: string) => {
  const clip = loaded.animations.find((candidate) => candidate.name === name);
  if (!clip) throw new Error(`ไม่พบคลิป ${name}`);
  return clip;
};

function play(loaded: Loaded, clip: THREE.AnimationClip) {
  const mixer = new THREE.AnimationMixer(loaded.scene);
  const action = mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.reset().play();
  const mesh = loaded.scene.getObjectByName("MannequinBody") as THREE.SkinnedMesh;
  return (phase: number) => {
    mixer.setTime(Math.min(phase * clip.duration, clip.duration - 1e-6));
    loaded.scene.updateMatrixWorld(true);
    mesh.skeleton.update();
    const bone = (name: string) => loaded.scene.getObjectByName(name)!.getWorldPosition(new THREE.Vector3());
    const palm = (side: number) => loaded.scene.getObjectByName(side < 0 ? "LeftHand" : "RightHand")!.localToWorld(palmLocal(side).clone());
    const anchor = loaded.scene.getObjectByName("EatUtensilAnchor")!;
    const tip = anchor.localToWorld(new THREE.Vector3(0, -TIP_REACH, 0));
    return { mesh, bone, palm, tip, mouth: loaded.scene.getObjectByName("Head")!.localToWorld(MOUTH_LOCAL.clone()) };
  };
}

describe("feat-110 customer eat clip", () => {
  it("ships a grip shape that is at rest unless eating activates it", () => {
    const body = eating.scene.getObjectByName("MannequinBody") as THREE.SkinnedMesh;
    const index = body.morphTargetDictionary?.EatGrip;
    expect(index).toBeDefined();
    expect(body.morphTargetInfluences![index!]).toBe(0);
    const grip = body.geometry.morphAttributes.position![index!]!;
    let changed = 0;
    for (let i = 0; i < grip.count; i++) {
      if (Math.abs(grip.getX(i)) + Math.abs(grip.getY(i)) + Math.abs(grip.getZ(i)) > 0.0001) changed++;
    }
    expect(changed).toBeGreaterThan(20);
    expect(changed).toBeLessThan(body.geometry.getAttribute("position").count / 4);
  });

  it("folds the thumb towards the handle as well as curling the fingers", () => {
    const body = eating.scene.getObjectByName("MannequinBody") as THREE.SkinnedMesh;
    const positions = body.geometry.getAttribute("position");
    const grip = body.geometry.morphAttributes.position![body.morphTargetDictionary!.EatGrip!]!;
    const indices = body.geometry.getAttribute("skinIndex");
    const weights = body.geometry.getAttribute("skinWeight");
    const hand = body.skeleton.bones.findIndex(bone => bone.name === "RightHand");
    const anchor = eating.scene.getObjectByName("EatUtensilAnchor")!;
    let folded = 0;
    let nearest = Infinity;
    for (let i = 0; i < positions.count; i++) {
      let weight = 0;
      for (let slot = 0; slot < 4; slot++) if (indices.getComponent(i, slot) === hand) weight += weights.getComponent(i, slot);
      if (weight > 0.99 && positions.getZ(i) > 0.06 && positions.getY(i) > 0.73 && positions.getY(i) < 0.76 && grip.getZ(i) < -0.01) {
        folded++;
        const point = new THREE.Vector3().fromBufferAttribute(positions, i)
          .add(new THREE.Vector3().fromBufferAttribute(grip, i)).applyMatrix4(body.skeleton.boneInverses[hand]!);
        if (Math.abs(point.y - anchor.position.y) < 0.025) nearest = Math.min(nearest, Math.hypot(point.x - anchor.position.x, point.z - anchor.position.z));
      }
    }
    expect(folded).toBeGreaterThan(3);
    // The handle radius is 4.5 mm; the thumb surface must meet it, not float centimetres away.
    expect(nearest).toBeGreaterThan(0.004);
    expect(nearest).toBeLessThan(0.01);
  });

  it("places the utensil shaft within the curled hand rather than outside its edge", () => {
    const body = eating.scene.getObjectByName("MannequinBody") as THREE.SkinnedMesh;
    const anchor = eating.scene.getObjectByName("EatUtensilAnchor")!;
    const index = body.skeleton.bones.findIndex(bone => bone.name === "RightHand");
    const position = body.geometry.getAttribute("position");
    const joints = body.geometry.getAttribute("skinIndex");
    const weights = body.geometry.getAttribute("skinWeight");
    const grip = body.geometry.morphAttributes.position![body.morphTargetDictionary!.EatGrip!]!;
    const nearby: THREE.Vector3[] = [];
    for (let i = 0; i < position.count; i++) {
      let weight = 0;
      for (let slot = 0; slot < 4; slot++) if (joints.getComponent(i, slot) === index) weight += weights.getComponent(i, slot);
      if (weight < 0.99) continue;
      const point = new THREE.Vector3().fromBufferAttribute(position, i)
        .add(new THREE.Vector3().fromBufferAttribute(grip, i)).applyMatrix4(body.skeleton.boneInverses[index]!);
      if (Math.abs(point.y - anchor.position.y) < 0.015) nearby.push(point);
    }
    expect(nearby.length).toBeGreaterThan(20);
    expect(Math.min(...nearby.map(p => p.x))).toBeLessThan(anchor.position.x);
    expect(Math.max(...nearby.map(p => p.x))).toBeGreaterThan(anchor.position.x);
    expect(Math.min(...nearby.map(p => p.z))).toBeLessThan(anchor.position.z);
    expect(Math.max(...nearby.map(p => p.z))).toBeGreaterThan(anchor.position.z);
    expect(Math.min(...nearby.map(p => Math.hypot(p.x - anchor.position.x, p.z - anchor.position.z)))).toBeLessThan(0.02);
  });
  it("เพิ่มคลิป Eat เพียงคลิปเดียวต่อจากคลิปเดิม และไม่มี root translation", () => {
    expect(eating.animations.map((clip) => clip.name)).toEqual([...BASE_CLIPS, "Eat"]);
    expect(clipOf(eating, "Eat").duration).toBeCloseTo(3.2, 5);
    for (const track of clipOf(eating, "Eat").tracks) {
      expect(track.name.startsWith("CafeMannequin")).toBe(false);
      expect(track.name.endsWith(".position") ? track.name : "Hips.position").toBe("Hips.position");
    }
  });

  it("marker ใช้ชื่อในสัญญา ไม่ซ้ำ และบอกว่า Eat ถือท่านั่งครบในตัวเอง", () => {
    expect(Object.keys(eating.markers)).toEqual(["Eat"]);
    const markers = eating.markers.Eat!;
    expect(new Set(markers.map((marker) => marker.name)).size).toBe(markers.length);
    for (const marker of markers) {
      expect(MARKER_NAMES).toContain(marker.name);
      expect(marker.time).toBeGreaterThanOrEqual(0);
      expect(marker.time).toBeLessThanOrEqual(1);
    }
    expect(markers.map((marker) => marker.name)).toEqual(["seated", "food-contact", "hand-contact"]);
    expect(markers[0]!.time).toBe(0);
    expect(markers[1]!.time).toBeLessThan(markers[2]!.time);
  });

  it("ไม่แก้ skeleton, _part, walkCycleDistance หรือคลิป Idle/Walk/Sit เดิม", () => {
    const skeleton = (loaded: Loaded) => (loaded.scene.getObjectByName("MannequinBody") as THREE.SkinnedMesh).skeleton.bones.map((bone) => bone.name);
    expect(skeleton(eating)).toEqual(skeleton(shipped));
    const geometry = (loaded: Loaded) => (loaded.scene.getObjectByName("MannequinBody") as THREE.SkinnedMesh).geometry;
    expect(geometry(eating).getAttribute("position").count).toBe(geometry(shipped).getAttribute("position").count);
    expect(geometry(eating).getAttribute("_part")!.count).toBe(geometry(shipped).getAttribute("_part")!.count);
    expect(eating.scene.getObjectByName("CafeMannequin")!.userData.walkCycleDistance)
      .toBe(shipped.scene.getObjectByName("CafeMannequin")!.userData.walkCycleDistance);
    for (const name of BASE_CLIPS) {
      const after = clipOf(eating, name);
      const before = clipOf(shipped, name);
      expect(after.duration).toBeCloseTo(before.duration, 6);
      expect(after.tracks.map((track) => track.name)).toEqual(before.tracks.map((track) => track.name));
      for (const [index, track] of after.tracks.entries()) {
        const reference = before.tracks[index]!;
        for (let i = 0; i < track.values.length; i += 1) expect(track.values[i]).toBeCloseTo(reference.values[i]!, 5);
      }
    }
  });

  it("วนรอบต่อเนื่อง: คีย์แรกกับคีย์สุดท้ายเท่ากันทุก track จึงเริ่มที่ phase ใดก็ได้", () => {
    for (const track of clipOf(eating, "Eat").tracks) {
      const size = track.getValueSize();
      for (let i = 0; i < size; i += 1) expect(track.values[i]).toBeCloseTo(track.values[track.values.length - size + i]!, 5);
    }
  });

  it("keeps arm and hand rotations continuous between adjacent poses", () => {
    const clip = clipOf(eating, "Eat");
    for (const track of clip.tracks.filter(track => /^(Left|Right)(Arm|ForeArm|Hand)\.quaternion$/.test(track.name))) {
      for (let i = 1; i < track.times.length; i++) {
        const previous = new THREE.Quaternion().fromArray(track.values, (i - 1) * 4);
        const current = new THREE.Quaternion().fromArray(track.values, i * 4);
        expect(previous.angleTo(current), `${track.name} at frame ${i}`).toBeLessThan(THREE.MathUtils.degToRad(40));
      }
    }
  });

  it("keeps the eating hand aligned with the forearm throughout the bite", () => {
    const at = play(eating, clipOf(eating, "Eat"));
    for (let frame = 0; frame <= 96; frame++) {
      const sample = at(frame / 96);
      const forearm = sample.bone("RightHand").sub(sample.bone("RightForeArm"));
      const fingers = new THREE.Vector3(0, -1, 0).applyQuaternion(
        eating.scene.getObjectByName("RightHand")!.getWorldQuaternion(new THREE.Quaternion()),
      );
      expect(forearm.angleTo(fingers), `frame ${frame}`).toBeLessThan(THREE.MathUtils.degToRad(12));
      const localWrist = eating.scene.getObjectByName("RightHand")!.quaternion;
      expect(localWrist.angleTo(new THREE.Quaternion()), `wrist twist at frame ${frame}`).toBeLessThan(THREE.MathUtils.degToRad(5));
      const anchor = eating.scene.getObjectByName("EatUtensilAnchor")!;
      expect(anchor.quaternion.angleTo(new THREE.Quaternion()), `grip slips at frame ${frame}`).toBeLessThan(THREE.MathUtils.degToRad(1));
    }
  });

  it("สะโพกและขาคาท่านั่งบนเบาะ 0.45 ม. ตลอดคลิป ไม่เลื่อนออกจากเบาะ", () => {
    const at = play(eating, clipOf(eating, "Eat"));
    const first = at(0);
    const anchors = ["Hips", "LeftLeg", "RightLeg", "LeftLowerLeg", "RightLowerLeg", "LeftFoot", "RightFoot"].map((name) => [name, first.bone(name)] as const);
    expect(first.bone("Hips").y).toBeCloseTo(SEATED_HIPS_Y, 2);
    expect(first.bone("LeftFoot").y).toBeCloseTo(0.08, 2);
    for (let frame = 0; frame <= 48; frame += 1) {
      const sample = at(frame / 48);
      for (const [name, anchor] of anchors) expect(sample.bone(name).distanceTo(anchor)).toBeLessThan(0.004);
    }
  });

  it("ตักถึงผิวในจานที่ food-contact และถึงปากที่ hand-contact โดยไม่ทะลุใบหน้า", () => {
    const at = play(eating, clipOf(eating, "Eat"));
    const markers = eating.markers.Eat!;
    const scooping = at(markers.find((marker) => marker.name === "food-contact")!.time);
    expect(scooping.tip.y).toBeCloseTo(FOOD_SURFACE_Y, 2);
    expect(Math.hypot(scooping.tip.x, scooping.tip.z - PLATE_FORWARD)).toBeLessThan(PLATE_RADIUS);
    // A shallow utensil angle prevents a sharply bent wrist over the plate.
    expect(scooping.palm(1).y - scooping.tip.y).toBeLessThan(0.04);
    const forearm = scooping.bone("RightHand").sub(scooping.bone("RightForeArm"));
    expect(scooping.bone("RightForeArm").x).toBeGreaterThan(0.2);
    const handDirection = new THREE.Vector3(0, -1, 0).applyQuaternion(
      eating.scene.getObjectByName("RightHand")!.getWorldQuaternion(new THREE.Quaternion()),
    );
    expect(forearm.angleTo(handDirection)).toBeLessThan(THREE.MathUtils.degToRad(40));

    const biting = at(markers.find((marker) => marker.name === "hand-contact")!.time);
    expect(biting.tip.distanceTo(biting.mouth)).toBeLessThan(0.035);
    // The utensil hand and elbow must stay to the diner's right and in front of the torso.
    expect(biting.bone("RightHand").x).toBeGreaterThan(0.10);
    expect(biting.bone("RightHand").z).toBeGreaterThan(biting.mouth.z + 0.015);
    expect(biting.bone("RightForeArm").x).toBeGreaterThan(0.16);
    expect(biting.bone("RightForeArm").z).toBeGreaterThan(0.15);
    // ปลายอุปกรณ์หยุดนอกก้อนหัว (รัศมีหัวจากกระดูก Head ประมาณ 0.10–0.12 ม.)
    expect(biting.tip.distanceTo(biting.bone("Head"))).toBeGreaterThan(0.12);
    expect(biting.tip.z).toBeGreaterThan(biting.mouth.z - 0.005);
  });

  it("ปลายอุปกรณ์อยู่ระหว่างผิวในจานกับระดับปากตลอดคลิป และมือไม่จมผิวโต๊ะ", () => {
    const at = play(eating, clipOf(eating, "Eat"));
    for (let frame = 0; frame <= 48; frame += 1) {
      const sample = at(frame / 48);
      expect(sample.tip.y).toBeGreaterThan(FOOD_SURFACE_Y - 0.006);
      expect(sample.tip.y).toBeLessThan(sample.mouth.y + 0.03);
      for (const name of ["LeftHand", "RightHand", "LeftForeArm", "RightForeArm"]) {
        const joint = sample.bone(name);
        if (joint.z >= 0.22) expect(joint.y).toBeGreaterThan(TABLE_SURFACE_Y - 0.001);
      }
      for (const side of [-1, 1]) {
        const palm = sample.palm(side);
        if (palm.z >= 0.22) expect(palm.y).toBeGreaterThanOrEqual(TABLE_SURFACE_Y - 0.001);
      }
    }
  });

  it("มือซ้ายวางนิ่งบนผิวโต๊ะข้างจาน", () => {
    const at = play(eating, clipOf(eating, "Eat"));
    const anchor = at(0).palm(-1);
    expect(anchor.y).toBeCloseTo(TABLE_SURFACE_Y, 2);
    expect(anchor.x).toBeLessThan(-PLATE_RADIUS);
    for (let frame = 0; frame <= 48; frame += 1) expect(at(frame / 48).palm(-1).distanceTo(anchor)).toBeLessThan(0.02);
  });

  it("มีนโยบายอุปกรณ์ครบทั้ง 5 เมนู และ phase offset กระจายแบบ deterministic", () => {
    const script = `const module = await import(${JSON.stringify(pathToFileURL(resolve(PROVIDER)).href)});
const foods = Object.fromEntries(Object.entries(module.EAT_UTENSILS).map(([food, entry]) => [food, { ...entry, gripOffset: module.utensilGripOffset(food) }]));
const offsets = Array.from({ length: 12 }, (_, i) => module.eatPhaseOffset(7, 1 + (i >> 2), i % 4));
console.log(JSON.stringify({ foods, offsets, repeat: module.eatPhaseOffset(7, 1, 0), tipReach: module.CUSTOMER_EAT_PROFILE.tipReach }));`;
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8", windowsHide: true });
    expect(result.status, result.stderr).toBe(0);
    const { foods, offsets, repeat, tipReach } = JSON.parse(result.stdout) as {
      foods: Record<string, { utensil: string; length: number; gripOffset: number }>;
      offsets: number[]; repeat: number; tipReach: number;
    };
    expect(Object.keys(foods).sort()).toEqual([...CONTRACT_FOODS].sort());
    expect(tipReach).toBeCloseTo(TIP_REACH, 5);
    for (const [food, entry] of Object.entries(foods)) {
      expect(["spoon", "fork", "chopsticks"], food).toContain(entry.utensil);
      // ด้ามถูกเลื่อนเข้าหามือจนปลายอยู่ที่ TIP_REACH และยังมีด้ามเหลือให้จับ ≥ 0.05 ม.
      expect(entry.gripOffset).toBeCloseTo(entry.length - TIP_REACH, 4);
      expect(entry.gripOffset).toBeGreaterThanOrEqual(0);
      expect(entry.length - entry.gripOffset).toBeGreaterThanOrEqual(0.05);
    }
    expect(repeat).toBe(offsets[0]);
    for (const offset of offsets) {
      expect(offset).toBeGreaterThanOrEqual(0);
      expect(offset).toBeLessThan(1);
    }
    // สมาชิกในกลุ่มเดียวกันไม่เคี้ยวพร้อมกัน และค่ากระจายทั่วช่วง ไม่เกาะกลุ่ม
    expect(new Set(offsets.map((offset) => Math.floor(offset * 4))).size).toBeGreaterThanOrEqual(3);
    expect(Math.min(...offsets.slice(0, 4).map((offset, index, all) => (index ? Math.abs(offset - all[index - 1]!) : 1)))).toBeGreaterThan(0.05);
  });

  it("ปฏิเสธ role staff ก่อนเขียนไฟล์", () => {
    const output = join(directory, "wrong-role");
    const result = spawnSync(process.execPath, ["scripts/create-cafe-customer-model.mjs", "--role", "staff", "--output-dir", output, "--clips", PROVIDER], { encoding: "utf8", timeout: 120000, windowsHide: true });
    expect(result.status).toBe(1);
    expect(() => readdirSync(output)).toThrow();
  }, 120000);
});
