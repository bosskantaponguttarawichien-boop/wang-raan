/**
 * feat-112 · ตรวจคลิปเลื่อนเก้าอี้/นั่ง/ลุกของลูกค้าบน GLB ที่สร้างจาก provider จริง
 *
 * ค่าอ้างอิงเขียนตรงตามของจริงในฉาก: เบาะ 0.45 ม., พนักพิงสูง 0.87 ม., CHAIR_PULL 0.30 ม.
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

const PROVIDER = "scripts/character-clips/customer-seat.mjs";
const BASE_CLIPS = ["Idle", "Walk", "Sit"] as const;
const NEW_CLIPS = ["PullChair", "SitDown", "PushChair", "StandUp"] as const;
const MARKER_NAMES = ["hand-contact", "food-contact", "seated", "wipe-contact", "clear-complete"];

// ---- เก้าอี้ของฉาก (ม.) ----
const SEAT_TOP_Y = 0.45;
const BACKREST_TOP_Y = 0.87;
/** ระนาบพนักพิงของเก้าอี้มาตรฐาน (seatD = 0.45 × 0.86 → z = seatD/2 − 0.025) ฝั่งตรงข้ามโต๊ะ */
const BACKREST_Z = -0.1685;
/** CHAIR_PULL ใน seat-motion.ts */
const NOMINAL_PULL = 0.3;
/**
 * ผิวบนโต๊ะจริงของฉาก: three-view.tsx วางกล่องหนา 0.04 ม. ให้จุดกลางอยู่ที่ 0.74 ม.
 * (placeMesh ตั้ง mesh.position.y) ผิวสัมผัสจึงอยู่ที่ 0.76 ม. เท่ากับที่ table-service (feat-116) ใช้
 */
const TABLE_BOX_CENTER_Y = 0.74;
const TABLE_SURFACE_Y = TABLE_BOX_CENTER_Y + 0.02;
const STANDING_HIPS_Y = 0.92;
const SEATED_HIPS_Y = SEAT_TOP_Y + 0.04 + 0.09;
const palmLocal = (side: number) => new THREE.Vector3(side * -0.0099, -0.0864, -0.0253);

const directory = mkdtempSync(join(tmpdir(), "wangraan-seat-test-"));
afterAll(() => {
  if (dirname(resolve(directory)) !== resolve(tmpdir()) || !basename(directory).startsWith("wangraan-seat-test-")) throw new Error("Unexpected temporary directory");
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

let seating: Loaded;
let shipped: Loaded;
let profile: {
  gripWindow: [number, number]; gripTravel: number; nominalPullDistance: number; minimumPullDistance: number;
  fallback: string; rootMotion: { clipTranslatesRoot: boolean; clipHipsLateralLimit: number };
};

beforeAll(async () => {
  const output = join(directory, "customer-lite");
  const build = spawnSync(process.execPath, ["scripts/create-cafe-customer-model.mjs", "--role", "customer", "--lite", "--output-dir", output, "--clips", PROVIDER], { encoding: "utf8", timeout: 120000, windowsHide: true });
  expect(build.status, build.stderr).toBe(0);
  expect(readdirSync(output)).toEqual(["cafe-customer-lite.glb"]);
  seating = await parse(readFileSync(join(output, "cafe-customer-lite.glb")));
  shipped = await parse(readFileSync(resolve("public/assets/models/cafe-customer-lite.glb")));
  const script = `const module = await import(${JSON.stringify(pathToFileURL(resolve(PROVIDER)).href)});
console.log(JSON.stringify(module.SEAT_MOTION_PROFILE));`;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8", windowsHide: true });
  expect(result.status, result.stderr).toBe(0);
  profile = JSON.parse(result.stdout);
}, 180000);

const clipOf = (loaded: Loaded, name: string) => {
  const clip = loaded.animations.find((candidate) => candidate.name === name);
  if (!clip) throw new Error(`ไม่พบคลิป ${name}`);
  return clip;
};

/**
 * คลิปสองตัวในเทสต์เดียวแชร์ scene เดียวกัน จึงสร้าง mixer ใหม่ทุกครั้งที่ sample
 * ไม่ให้ binding ของ mixer ตัวก่อนค้างค่าท่าไว้ข้ามการเรียก
 */
function play(loaded: Loaded, clip: THREE.AnimationClip) {
  const mesh = loaded.scene.getObjectByName("MannequinBody") as THREE.SkinnedMesh;
  return (phase: number) => {
    const mixer = new THREE.AnimationMixer(loaded.scene);
    const action = mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.reset().play();
    mixer.setTime(Math.min(phase * clip.duration, clip.duration - 1e-6));
    loaded.scene.updateMatrixWorld(true);
    mesh.skeleton.update();
    return {
      mesh,
      bone: (name: string) => loaded.scene.getObjectByName(name)!.getWorldPosition(new THREE.Vector3()),
      palm: (side: number) => loaded.scene.getObjectByName(side < 0 ? "LeftHand" : "RightHand")!.localToWorld(palmLocal(side).clone()),
    };
  };
}

const markerTime = (clipName: string, name: string) => {
  const marker = seating.markers[clipName]!.find((candidate) => candidate.name === name);
  if (!marker) throw new Error(`ไม่พบ marker ${name} ใน ${clipName}`);
  return marker.time;
};

describe("feat-112 customer seat clips", () => {
  it("เพิ่มคลิปสี่ phase ตามสัญญา โดยคลิปเดิมอยู่ครบและมาก่อน", () => {
    expect(seating.animations.map((clip) => clip.name)).toEqual([...BASE_CLIPS, ...NEW_CLIPS]);
    expect(clipOf(seating, "PullChair").duration).toBeCloseTo(1.1, 5);
    expect(clipOf(seating, "PushChair").duration).toBeCloseTo(0.9, 5);
    // นั่งลง/ลุกขึ้นใช้ความยาวเท่าคลิป Sit เดิม จังหวะเดิมจึงไม่เปลี่ยน
    for (const name of ["SitDown", "StandUp"]) expect(clipOf(seating, name).duration).toBeCloseTo(clipOf(seating, "Sit").duration, 5);
  });

  it("marker ครบทุกคลิป ใช้ชื่อในสัญญา ไม่ซ้ำต่อคลิป และอยู่ในช่วง [0,1]", () => {
    expect(Object.keys(seating.markers).sort()).toEqual([...NEW_CLIPS].sort());
    for (const [clipName, markers] of Object.entries(seating.markers)) {
      expect(markers.length, clipName).toBeGreaterThan(0);
      expect(new Set(markers.map((marker) => marker.name)).size).toBe(markers.length);
      for (const marker of markers) {
        expect(MARKER_NAMES).toContain(marker.name);
        expect(marker.time).toBeGreaterThanOrEqual(0);
        expect(marker.time).toBeLessThanOrEqual(1);
      }
    }
    expect(markerTime("PullChair", "hand-contact")).toBeGreaterThan(0);
    expect(markerTime("SitDown", "seated")).toBeGreaterThan(markerTime("SitDown", "hand-contact"));
    expect(markerTime("StandUp", "seated")).toBe(0);
  });

  it("ไม่แก้ skeleton, _part, walkCycleDistance หรือคลิป Idle/Walk/Sit เดิม", () => {
    const skeleton = (loaded: Loaded) => (loaded.scene.getObjectByName("MannequinBody") as THREE.SkinnedMesh).skeleton.bones.map((bone) => bone.name);
    expect(skeleton(seating)).toEqual(skeleton(shipped));
    const geometry = (loaded: Loaded) => (loaded.scene.getObjectByName("MannequinBody") as THREE.SkinnedMesh).geometry;
    expect(geometry(seating).getAttribute("_part")!.count).toBe(geometry(shipped).getAttribute("_part")!.count);
    expect(seating.scene.getObjectByName("CafeMannequin")!.userData.walkCycleDistance)
      .toBe(shipped.scene.getObjectByName("CafeMannequin")!.userData.walkCycleDistance);
    for (const name of BASE_CLIPS) {
      const after = clipOf(seating, name);
      const before = clipOf(shipped, name);
      expect(after.tracks.map((track) => track.name)).toEqual(before.tracks.map((track) => track.name));
      for (const [index, track] of after.tracks.entries()) {
        const reference = before.tracks[index]!;
        for (let i = 0; i < track.values.length; i += 1) expect(track.values[i]).toBeCloseTo(reference.values[i]!, 5);
      }
    }
  });

  it("SitDown/StandUp ใช้ track ท่อนล่างของ Sit เดิมทุกค่า (StandUp = ย้อนเวลา)", () => {
    const lower = ["LeftLeg.quaternion", "RightLeg.quaternion", "LeftLowerLeg.quaternion", "RightLowerLeg.quaternion", "LeftFoot.quaternion", "RightFoot.quaternion", "Hips.position"];
    const sit = clipOf(seating, "Sit");
    for (const [name, reversed] of [["SitDown", false], ["StandUp", true]] as const) {
      const clip = clipOf(seating, name);
      for (const trackName of lower) {
        const authored = clip.tracks.find((track) => track.name === trackName)!;
        const original = sit.tracks.find((track) => track.name === trackName)!;
        const size = original.getValueSize();
        const count = original.times.length;
        expect(authored.times.length).toBe(count);
        for (let index = 0; index < count; index += 1) {
          const source = reversed ? count - 1 - index : index;
          for (let k = 0; k < size; k += 1) {
            expect(authored.values[index * size + k]).toBeCloseTo(original.values[source * size + k]!, 5);
          }
        }
      }
    }
  });

  it("ไม่มี root translation ซ้ำกับ controller: สะโพกไม่เลื่อนข้างหรือถอยหลังเป็นระยะดึงเก้าอี้", () => {
    expect(profile.rootMotion.clipTranslatesRoot).toBe(false);
    expect(profile.nominalPullDistance).toBeCloseTo(NOMINAL_PULL, 5);
    for (const name of NEW_CLIPS) {
      for (const track of clipOf(seating, name).tracks) {
        expect(track.name.startsWith("CafeMannequin")).toBe(false);
        expect(track.name.endsWith(".position") ? track.name : "Hips.position").toBe("Hips.position");
      }
      const at = play(seating, clipOf(seating, name));
      for (let frame = 0; frame <= 24; frame += 1) {
        const hips = at(frame / 24).bone("Hips");
        expect(Math.abs(hips.x), name).toBeLessThanOrEqual(profile.rootMotion.clipHipsLateralLimit);
        expect(Math.abs(hips.z), name).toBeLessThanOrEqual(profile.rootMotion.clipHipsLateralLimit);
      }
    }
  });

  it("PullChair เกาะพนักพิงแล้วดึงเก้าอี้ออกเท่า gripTravel โดยเท้าไม่ยกและไม่ไถล", () => {
    const at = play(seating, clipOf(seating, "PullChair"));
    const [from, to] = profile.gripWindow;
    expect(from).toBeCloseTo(markerTime("PullChair", "hand-contact"), 5);
    const grabbing = at(from).palm(1);
    // ฝ่ามือคว่ำเกาะขอบบนพนักพิงที่ตำแหน่งเก้าอี้ก่อนถูกดึง
    expect(grabbing.y).toBeCloseTo(BACKREST_TOP_Y - 0.03, 2);
    expect(grabbing.z).toBeCloseTo(BACKREST_Z, 2);
    expect(grabbing.x).toBeGreaterThan(0.1);
    const releasing = at(to).palm(1);
    // มือเดินทางไปกับพนักพิงเท่า gripTravel แล้วปล่อย (เก้าอี้ที่เหลือเลื่อนเอง)
    expect(grabbing.z - releasing.z).toBeCloseTo(profile.gripTravel, 2);
    expect(Math.abs(releasing.y - grabbing.y)).toBeLessThan(0.02);
    expect(profile.gripTravel).toBeLessThanOrEqual(NOMINAL_PULL);
    expect(profile.minimumPullDistance).toBeLessThanOrEqual(profile.gripTravel + 1e-9);
    // ปล่อยมือแล้วกลับมาอยู่ข้างตัวตอนจบคลิป พร้อมเข้าท่า SitDown
    const end = at(1).palm(1);
    expect(end.z).toBeGreaterThan(-0.05);
    const anchors: Record<string, THREE.Vector3> = {};
    for (let frame = 0; frame <= 36; frame += 1) {
      const sample = at(frame / 36);
      for (const foot of ["LeftFoot", "RightFoot"]) {
        const position = sample.bone(foot);
        expect(position.y).toBeCloseTo(0.08, 2);
        anchors[foot] ??= position.clone();
        expect(Math.hypot(position.x - anchors[foot]!.x, position.z - anchors[foot]!.z)).toBeLessThan(0.003);
      }
    }
  });

  it("PushChair ยันขอบเบาะขณะนั่งโดยสะโพกและขาคาที่เดิม", () => {
    const at = play(seating, clipOf(seating, "PushChair"));
    const pushing = at(markerTime("PushChair", "hand-contact")).palm(1);
    expect(pushing.y).toBeCloseTo(SEAT_TOP_Y, 2);
    expect(pushing.x).toBeGreaterThan(0.15);
    expect(pushing.z).toBeLessThan(0.05);
    const first = at(0);
    const anchors = ["Hips", "LeftLeg", "RightLeg", "LeftLowerLeg", "RightLowerLeg", "LeftFoot", "RightFoot"].map((name) => [name, first.bone(name)] as const);
    expect(first.bone("Hips").y).toBeCloseTo(SEATED_HIPS_Y, 2);
    for (let frame = 0; frame <= 24; frame += 1) {
      const sample = at(frame / 24);
      for (const [name, anchor] of anchors) expect(sample.bone(name).distanceTo(anchor)).toBeLessThan(0.004);
    }
  });

  it("SitDown เริ่มจากท่ายืนจบที่ท่านั่งเดิม และ StandUp ต่อกลับได้สนิท", () => {
    const sitDown = play(seating, clipOf(seating, "SitDown"));
    const standUp = play(seating, clipOf(seating, "StandUp"));
    expect(sitDown(0).bone("Hips").y).toBeCloseTo(STANDING_HIPS_Y, 2);
    expect(sitDown(1).bone("Hips").y).toBeCloseTo(SEATED_HIPS_Y, 2);
    expect(standUp(0).bone("Hips").y).toBeCloseTo(SEATED_HIPS_Y, 2);
    expect(standUp(1).bone("Hips").y).toBeCloseTo(STANDING_HIPS_Y, 2);
    // ท่าสุดท้ายของ SitDown = ท่าแรกของ StandUp และกลับกัน (ทั้งโครงร่างและมือ)
    for (const name of ["Hips", "Spine", "Head", "LeftHand", "RightHand", "LeftLowerLeg", "RightLowerLeg"]) {
      expect(sitDown(1).bone(name).distanceTo(standUp(0).bone(name)), name).toBeLessThan(0.01);
      expect(sitDown(0).bone(name).distanceTo(standUp(1).bone(name)), name).toBeLessThan(0.01);
    }
    // มือเกาะพนักพิงช่วงหย่อนตัว/ดันตัวขึ้น
    for (const [frames, clipName] of [[sitDown, "SitDown"], [standUp, "StandUp"]] as const) {
      const support = frames(markerTime(clipName, "hand-contact")).palm(1);
      expect(support.y, clipName).toBeCloseTo(BACKREST_TOP_Y - 0.03, 1);
      expect(support.z, clipName).toBeLessThan(BACKREST_Z + 0.04);
    }
  });

  it("ไม่มีส่วนใดของตัวแทรกแผ่นโต๊ะขณะนั่ง/ลุก (เข่าลอดใต้ขอบโต๊ะได้แต่ไม่ทะลุผิว)", () => {
    const point = new THREE.Vector3();
    for (const name of NEW_CLIPS) {
      const at = play(seating, clipOf(seating, name));
      for (let frame = 0; frame <= 18; frame += 1) {
        const sample = at(frame / 18);
        for (let vertex = 0; vertex < sample.mesh.geometry.getAttribute("position").count; vertex += 1) {
          sample.mesh.getVertexPosition(vertex, point);
          if (point.z < 0.22) continue;
          // แผ่นโต๊ะกินช่วง 0.72–0.76 ม. — ห้ามมีผิวตัวละครอยู่ในช่วงนี้ในพื้นที่เหนือ/ใต้โต๊ะ
          expect(point.y < TABLE_SURFACE_Y - 0.04 || point.y > TABLE_SURFACE_Y, `${name} @${point.y.toFixed(3)}`).toBe(true);
        }
      }
    }
  }, 120000);

  it("ประกาศระยะดึงที่รองรับพร้อมท่าสำรองเมื่อพื้นที่แคบ", () => {
    expect(profile.minimumPullDistance).toBeGreaterThan(0);
    expect(profile.minimumPullDistance).toBeLessThan(profile.nominalPullDistance);
    expect(profile.fallback).toMatch(/SitDown/);
    expect(profile.fallback).toMatch(/StandUp/);
    expect(profile.gripWindow[1]).toBeGreaterThan(profile.gripWindow[0]);
  });

  it("ปฏิเสธ role staff ก่อนเขียนไฟล์", () => {
    const output = join(directory, "wrong-role");
    const result = spawnSync(process.execPath, ["scripts/create-cafe-customer-model.mjs", "--role", "staff", "--output-dir", output, "--clips", PROVIDER], { encoding: "utf8", timeout: 120000, windowsHide: true });
    expect(result.status).toBe(1);
    expect(() => readdirSync(output)).toThrow();
  }, 120000);
});
