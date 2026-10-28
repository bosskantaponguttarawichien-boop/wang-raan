/**
 * feat-109 · ตรวจคลิปถือถาดของพนักงานบน GLB ที่สร้างจาก provider จริง
 *
 * ทดสอบที่ปลายทาง (GLB ที่ 117 จะ export) ไม่ใช่ที่ค่าในสคริปต์ ตัวเลขอ้างอิงจึงเขียนตรง ๆ
 * ตามสัญญา v1 §3 และของจริงในฉาก: ถาด TRAY_HEIGHT = 1.70 × 0.6 ยื่นหน้า 0.30 ม., โต๊ะ 0.74 ม.,
 * เคาน์เตอร์ 1.05 ม. — ไม่ import ค่าจาก provider เพื่อไม่ให้เทสต์ผ่านเพราะค่าผิดพร้อมกันทั้งคู่
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as THREE from "three";
import { createCharacterLoader } from "../character-loader";

const PROVIDER = "scripts/character-clips/staff-carry.mjs";
const NEW_CLIPS = ["CarryIdle", "CarryWalk", "PickUp", "PutDown"] as const;
const BASE_CLIPS = ["Idle", "Walk", "Sit", "Work"] as const;
/** ชื่อ marker ที่สัญญา v1 §3 อนุญาต */
const MARKER_NAMES = ["hand-contact", "food-contact", "seated", "wipe-contact", "clear-complete"];

// ---- ของจริงในฉาก (ม., พื้นที่โมเดล: โมเดลสูง 1.70 หันหน้า +Z) ----
const TRAY_CENTER_Y = 1.7 * 0.6;
const TRAY_FORWARD = 0.3;
const TRAY_BOTTOM_Y = TRAY_CENTER_Y - 0.02;
const BOARD_BOTTOM_Y = TRAY_CENTER_Y - 0.011;
/**
 * ผิวบนโต๊ะจริงของฉาก: three-view.tsx วางกล่องหนา 0.04 ม. ให้จุดกลางอยู่ที่ 0.74 ม.
 * (placeMesh ตั้ง mesh.position.y) ผิวสัมผัสจึงอยู่ที่ 0.76 ม. เท่ากับที่ table-service (feat-116) ใช้
 */
const TABLE_BOX_CENTER_Y = 0.74;
const TABLE_SURFACE_Y = TABLE_BOX_CENTER_Y + 0.02;
const PLATE_THICKNESS = 0.025;
const COUNTER_SURFACE_Y = 1.05;
/** จุดกลางผิวฝ่ามือใน local ของกระดูก Hand (หน้า local −Z ของก้อนมือ) */
const palmLocal = (side: number) => new THREE.Vector3(side * -0.0099, -0.0864, -0.0253);
const grip = (side: number) => new THREE.Vector3(side * 0.155, TRAY_BOTTOM_Y, TRAY_FORWARD - 0.038);

const directory = mkdtempSync(join(tmpdir(), "wangraan-carry-test-"));
afterAll(() => {
  if (dirname(resolve(directory)) !== resolve(tmpdir()) || !basename(directory).startsWith("wangraan-carry-test-")) throw new Error("Unexpected temporary directory");
  rmSync(directory, { recursive: true, force: true });
});

interface Marker { name: string; time: number }
type Loaded = { scene: THREE.Group; animations: THREE.AnimationClip[]; markers: Record<string, Marker[]> };

async function parse(bytes: Buffer<ArrayBuffer>) {
  const loaded = await createCharacterLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
  return {
    scene: loaded.scene as THREE.Group,
    animations: loaded.animations,
    markers: (loaded.scene.getObjectByName("CafeMannequin")?.userData.animationMarkers ?? {}) as Record<string, Marker[]>,
  };
}

let carry: Loaded;
let shipped: Loaded;

beforeAll(async () => {
  const output = join(directory, "staff-lite");
  const build = spawnSync(process.execPath, ["scripts/create-cafe-customer-model.mjs", "--role", "staff", "--lite", "--output-dir", output, "--clips", PROVIDER], { encoding: "utf8", timeout: 120000, windowsHide: true });
  expect(build.status, build.stderr).toBe(0);
  expect(readdirSync(output)).toEqual(["cafe-staff-lite.glb"]);
  carry = await parse(readFileSync(join(output, "cafe-staff-lite.glb")));
  shipped = await parse(readFileSync(resolve("public/assets/models/cafe-staff-lite.glb")));
}, 180000);

const clipOf = (loaded: Loaded, name: string) => {
  const clip = loaded.animations.find((candidate) => candidate.name === name);
  if (!clip) throw new Error(`ไม่พบคลิป ${name}`);
  return clip;
};

/** เล่นคลิปบนโมเดลที่โหลดแล้วอ่านค่าทีละเฟรม (เฟรมท้ายหยิบก่อนจบ 1 µs กัน loop วนกลับ) */
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
    return {
      mesh,
      bone,
      palm: (side: number) => loaded.scene.getObjectByName(side < 0 ? "LeftHand" : "RightHand")!.localToWorld(palmLocal(side).clone()),
    };
  };
}

/** ค่าสูงสุดของผิวที่ deform แล้วในพื้นที่แผ่นถาด (0.42 × 0.30) — ของที่วางบนถาดต้องไม่มีอะไรมาแทรก */
function maxSkinYOverBoard(loaded: Loaded, clip: THREE.AnimationClip, frames = 36) {
  const at = play(loaded, clip);
  const point = new THREE.Vector3();
  let highest = -Infinity;
  for (let frame = 0; frame <= frames; frame += 1) {
    const { mesh } = at(frame / frames);
    for (let vertex = 0; vertex < mesh.geometry.getAttribute("position").count; vertex += 1) {
      mesh.getVertexPosition(vertex, point);
      if (point.y <= 1.2 && Math.abs(point.x) <= 0.21 && Math.abs(point.z - TRAY_FORWARD) <= 0.15) highest = Math.max(highest, point.y);
    }
  }
  return highest;
}

describe("feat-109 staff carry clips", () => {
  it("เพิ่มคลิปสี่ชื่อตามสัญญาโดยคลิปเดิมอยู่ครบและมาก่อน", () => {
    expect(carry.animations.map((clip) => clip.name)).toEqual([...BASE_CLIPS, ...NEW_CLIPS]);
    expect(clipOf(carry, "CarryIdle").duration).toBeCloseTo(clipOf(carry, "Idle").duration, 5);
    expect(clipOf(carry, "CarryWalk").duration).toBeCloseTo(clipOf(carry, "Walk").duration, 5);
    expect(clipOf(carry, "PickUp").duration).toBeCloseTo(1.2, 5);
    expect(clipOf(carry, "PutDown").duration).toBeCloseTo(1.4, 5);
    // ทุกคลิปใหม่ต้องไม่มี track ของ root โมเดล — controller เป็นเจ้าของตำแหน่งเดียว
    for (const name of NEW_CLIPS) {
      for (const track of clipOf(carry, name).tracks) {
        expect(track.name.startsWith("CafeMannequin")).toBe(false);
        expect(track.name.endsWith(".position") ? track.name : "Hips.position").toBe("Hips.position");
      }
    }
  });

  it("marker ครบทุกคลิปใหม่ ใช้ชื่อในสัญญา และอยู่ในช่วง [0,1] โดยไม่ซ้ำต่อคลิป", () => {
    expect(Object.keys(carry.markers).sort()).toEqual([...NEW_CLIPS].sort());
    for (const [clipName, markers] of Object.entries(carry.markers)) {
      expect(markers.length).toBeGreaterThan(0);
      expect(new Set(markers.map((marker) => marker.name)).size).toBe(markers.length);
      for (const marker of markers) {
        expect(MARKER_NAMES).toContain(marker.name);
        expect(marker.time).toBeGreaterThanOrEqual(0);
        expect(marker.time).toBeLessThanOrEqual(1);
      }
      expect(carry.animations.some((clip) => clip.name === clipName)).toBe(true);
    }
    expect(carry.markers.PickUp!.map((marker) => marker.name)).toEqual(["hand-contact", "food-contact"]);
    expect(carry.markers.PutDown!.map((marker) => marker.name)).toEqual(["hand-contact", "food-contact"]);
  });

  it("ไม่แก้ skeleton, _part, walkCycleDistance หรือคลิป Idle/Walk/Sit/Work เดิม", () => {
    const bones = (loaded: Loaded) => (loaded.scene.getObjectByName("MannequinBody") as THREE.SkinnedMesh).skeleton.bones.map((bone) => bone.name);
    expect(bones(carry)).toEqual(bones(shipped));
    const geometry = (loaded: Loaded) => (loaded.scene.getObjectByName("MannequinBody") as THREE.SkinnedMesh).geometry;
    expect(geometry(carry).getAttribute("position").count).toBe(geometry(shipped).getAttribute("position").count);
    expect(geometry(carry).getAttribute("_part")).toBeDefined();
    expect(geometry(carry).getAttribute("_part")!.count).toBe(geometry(shipped).getAttribute("_part")!.count);
    expect(carry.scene.getObjectByName("CafeMannequin")!.userData.walkCycleDistance)
      .toBe(shipped.scene.getObjectByName("CafeMannequin")!.userData.walkCycleDistance);
    for (const name of BASE_CLIPS) {
      const after = clipOf(carry, name);
      const before = clipOf(shipped, name);
      expect(after.duration).toBeCloseTo(before.duration, 6);
      expect(after.tracks.map((track) => track.name)).toEqual(before.tracks.map((track) => track.name));
      for (const [index, track] of after.tracks.entries()) {
        const reference = before.tracks[index]!;
        expect(track.values.length).toBe(reference.values.length);
        for (let i = 0; i < track.values.length; i += 1) expect(track.values[i]).toBeCloseTo(reference.values[i]!, 5);
      }
    }
  });

  it("CarryWalk ใช้ track ท่อนล่างของ Walk เดิมทุกค่า จังหวะและระยะก้าวจึงไม่เปลี่ยน", () => {
    const lower = ["LeftLeg.quaternion", "RightLeg.quaternion", "LeftLowerLeg.quaternion", "RightLowerLeg.quaternion", "LeftFoot.quaternion", "RightFoot.quaternion", "Hips.position"];
    const walk = clipOf(carry, "Walk");
    const carryWalk = clipOf(carry, "CarryWalk");
    for (const name of lower) {
      const authored = carryWalk.tracks.find((track) => track.name === name)!;
      const original = walk.tracks.find((track) => track.name === name)!;
      expect(authored.times.length).toBe(original.times.length);
      for (let i = 0; i < original.values.length; i += 1) expect(authored.values[i]).toBeCloseTo(original.values[i]!, 5);
    }
    // ฝ่าเท้าที่รับน้ำหนักอยู่กับพื้นจุดเดิมตามระยะก้าวที่ประกาศไว้ (เหมือนเทสต์ของ Walk เดิม)
    const stride = carry.scene.getObjectByName("CafeMannequin")!.userData.walkCycleDistance as number;
    const at = play(carry, carryWalk);
    for (const [name, start] of [["LeftFoot", 0], ["RightFoot", 0.5]] as const) {
      let contact: number | undefined;
      for (let i = 0; i <= 20; i += 1) {
        const phase = start + i / 40;
        const foot = at(phase).bone(name);
        const travelled = foot.z + stride * phase;
        contact ??= travelled;
        expect(Math.abs(travelled - contact)).toBeLessThan
          (0.002);
        expect(foot.y).toBeCloseTo(0.08, 2);
      }
    }
  });

  it.each(["CarryIdle", "CarryWalk"])("%s ตรึงผิวฝ่ามือสองข้างไว้ใต้ขอบถาด ถาดจึงได้ระดับและของไม่ลอย", (name) => {
    const at = play(carry, clipOf(carry, name));
    for (let frame = 0; frame <= 48; frame += 1) {
      const sample = at(frame / 48);
      const left = sample.palm(-1);
      const right = sample.palm(1);
      expect(left.distanceTo(grip(-1))).toBeLessThan(0.003);
      expect(right.distanceTo(grip(1))).toBeLessThan(0.003);
      // ระดับถาด: ฝ่ามือสองข้างอยู่ระนาบเดียวกันและแนบใต้ขอบถาดพอดี
      expect(Math.abs(left.y - right.y)).toBeLessThan(0.002);
      expect(left.y).toBeCloseTo(TRAY_BOTTOM_Y, 2);
    }
  });

  it.each(["CarryIdle", "CarryWalk"])("%s ไม่มีแขนกวาดขึ้นเหนือแผ่นถาดอย่างที่ท่าเดินเดิมทำ", (name) => {
    const authored = maxSkinYOverBoard(carry, clipOf(carry, name));
    expect(authored).toBeLessThan(maxSkinYOverBoard(carry, clipOf(carry, "Walk")));
    expect(authored).toBeLessThan(BOARD_BOTTOM_Y + 0.005);
  }, 60000);

  it("PickUp แบฝ่ามือรับถาดเหนือผิวเคาน์เตอร์แล้วจบที่ grip เดียวกับเฟรมแรกของ CarryIdle", () => {
    const pickUp = clipOf(carry, "PickUp");
    const at = play(carry, pickUp);
    const handContact = carry.markers.PickUp!.find((marker) => marker.name === "hand-contact")!.time;
    const foodContact = carry.markers.PickUp!.find((marker) => marker.name === "food-contact")!.time;
    expect(foodContact).toBeGreaterThan(handContact);
    for (const phase of [handContact, foodContact]) {
      const sample = at(phase);
      for (const side of [-1, 1]) {
        const palm = sample.palm(side);
        // ฝ่ามือหงายรับอยู่เหนือผิวเคาน์เตอร์ และก้อนมือ (หนา 0.075 ใต้ผิวฝ่ามือ) ยังไม่จมเคาน์เตอร์
        expect(palm.y - 0.0753).toBeGreaterThan(COUNTER_SURFACE_Y);
        expect(palm.z).toBeGreaterThan(0.25);
      }
    }
    const end = at(1);
    expect(end.palm(-1).distanceTo(grip(-1))).toBeLessThan(0.004);
    expect(end.palm(1).distanceTo(grip(1))).toBeLessThan(0.004);
    const start = at(0);
    // เฟรมแรกยังเป็นท่ายืนปล่อยมือ จึง cross-fade จาก Idle/Work ได้
    expect(start.palm(1).y).toBeLessThan(0.8);
    expect(start.palm(1).z).toBeLessThan(0.1);
  });

  it("PutDown วางก้นจานแตะผิวโต๊ะ 0.74 ม. โดยมือซ้ายคาถาดไว้และไม่มีลำตัวจมผิวโต๊ะ", () => {
    const putDown = clipOf(carry, "PutDown");
    const at = play(carry, putDown);
    const foodContact = carry.markers.PutDown!.find((marker) => marker.name === "food-contact")!.time;
    const handContact = carry.markers.PutDown!.find((marker) => marker.name === "hand-contact")!.time;
    expect(handContact).toBeLessThan(foodContact);
    // ที่ food-contact ผิวฝ่ามือคว่ำกดอยู่บนขอบจานที่ก้นจานแตะโต๊ะพอดี → อาหารไม่ลอย
    const placing = at(foodContact);
    expect(placing.palm(1).y).toBeCloseTo(TABLE_SURFACE_Y + PLATE_THICKNESS, 2);
    expect(placing.palm(1).z).toBeGreaterThan(0.33);
    const point = new THREE.Vector3();
    for (let frame = 0; frame <= 36; frame += 1) {
      const sample = at(frame / 36);
      // มือซ้ายรองถาดทั้งคลิป
      expect(sample.palm(-1).distanceTo(grip(-1))).toBeLessThan(0.003);
      // ไม่มีส่วนของตัวที่ยื่นเหนือโต๊ะจมลงใต้ผิวโต๊ะ (ขาที่ลอดใต้ขอบโต๊ะไม่นับ จึงดูเฉพาะ y ≥ 0.5)
      for (let vertex = 0; vertex < sample.mesh.geometry.getAttribute("position").count; vertex += 1) {
        sample.mesh.getVertexPosition(vertex, point);
        if (point.z >= 0.32 && point.y >= 0.5) expect(point.y).toBeGreaterThan(TABLE_SURFACE_Y);
      }
    }
  }, 60000);

  it.each(["PickUp", "PutDown"])("%s ยืนอยู่กับที่: ข้อเท้าไม่ไถลและไม่มี root translation", (name) => {
    const at = play(carry, clipOf(carry, name));
    const anchors: Record<string, THREE.Vector3> = {};
    for (let frame = 0; frame <= 36; frame += 1) {
      const sample = at(frame / 36);
      for (const foot of ["LeftFoot", "RightFoot"]) {
        const position = sample.bone(foot);
        expect(position.y).toBeCloseTo(0.08, 2);
        anchors[foot] ??= position.clone();
        expect(Math.hypot(position.x - anchors[foot]!.x, position.z - anchors[foot]!.z)).toBeLessThan(0.003);
      }
      // สะโพกขยับได้ในคลิป (ย่อ/โน้ม) แต่ไม่เลื่อนข้างหรือถอยหลังเป็นการเดิน
      const hips = sample.bone("Hips");
      expect(Math.abs(hips.x)).toBeLessThan(0.02);
      expect(hips.z).toBeGreaterThanOrEqual(-0.01);
      expect(hips.z).toBeLessThan(0.12);
    }
  });

  it("ปฏิเสธ role customer ก่อนเขียนไฟล์", () => {
    const output = join(directory, "wrong-role");
    const result = spawnSync(process.execPath, ["scripts/create-cafe-customer-model.mjs", "--role", "customer", "--output-dir", output, "--clips", PROVIDER], { encoding: "utf8", timeout: 120000, windowsHide: true });
    expect(result.status).toBe(1);
    expect(() => readdirSync(output)).toThrow();
  }, 120000);
});
