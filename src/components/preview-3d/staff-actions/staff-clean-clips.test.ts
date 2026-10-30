/**
 * feat-111 · ตรวจคลิป WipeTable ของพนักงานบน GLB ที่สร้างจาก provider จริง
 *
 * ค่าอ้างอิงเขียนตรงตามสัญญา v1 §3 และของจริงในฉาก: โต๊ะ 0.74 ม., จานหนา 0.025 ม.
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

const PROVIDER = "scripts/character-clips/staff-clean.mjs";
const BASE_CLIPS = ["Idle", "Walk", "Sit", "Work"] as const;
const MARKER_NAMES = ["hand-contact", "food-contact", "seated", "wipe-contact", "clear-complete"];

/**
 * ผิวบนโต๊ะจริงของฉาก: three-view.tsx วางกล่องหนา 0.04 ม. ให้จุดกลางอยู่ที่ 0.74 ม.
 * (placeMesh ตั้ง mesh.position.y) ผิวสัมผัสจึงอยู่ที่ 0.76 ม. เท่ากับที่ table-service (feat-116) ใช้
 */
const TABLE_BOX_CENTER_Y = 0.74;
const TABLE_SURFACE_Y = TABLE_BOX_CENTER_Y + 0.02;
const PLATE_THICKNESS = 0.025;
/** ความหนาผ้าเช็ด — ผิวฝ่ามือกดผ้าอยู่สูงกว่าผิวโต๊ะเท่านี้ */
const CLOTH_THICKNESS = 0.03;
const palmLocal = (side: number) => new THREE.Vector3(side * -0.014, -0.065, 0.008);

const directory = mkdtempSync(join(tmpdir(), "wangraan-clean-test-"));
afterAll(() => {
  if (dirname(resolve(directory)) !== resolve(tmpdir()) || !basename(directory).startsWith("wangraan-clean-test-")) throw new Error("Unexpected temporary directory");
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

let cleaning: Loaded;
let shipped: Loaded;

beforeAll(async () => {
  const output = join(directory, "staff-lite");
  const build = spawnSync(process.execPath, ["scripts/create-cafe-customer-model.mjs", "--role", "staff", "--lite", "--output-dir", output, "--clips", PROVIDER], { encoding: "utf8", timeout: 120000, windowsHide: true });
  expect(build.status, build.stderr).toBe(0);
  expect(readdirSync(output)).toEqual(["cafe-staff-lite.glb"]);
  cleaning = await parse(readFileSync(join(output, "cafe-staff-lite.glb")));
  shipped = await parse(readFileSync(resolve("public/assets/models/cafe-staff-lite.glb")));
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
    return {
      mesh,
      bone: (name: string) => loaded.scene.getObjectByName(name)!.getWorldPosition(new THREE.Vector3()),
      palm: (side: number) => loaded.scene.getObjectByName(side < 0 ? "LeftHand" : "RightHand")!.localToWorld(palmLocal(side).clone()),
    };
  };
}

const markerTime = (loaded: Loaded, name: string) => {
  const marker = loaded.markers.WipeTable!.find((candidate) => candidate.name === name);
  if (!marker) throw new Error(`ไม่พบ marker ${name}`);
  return marker.time;
};

describe("feat-111 staff clean clip", () => {
  it("เพิ่มคลิป WipeTable เพียงคลิปเดียว ไม่แตะคลิปเดิมและไม่มี root translation", () => {
    expect(cleaning.animations.map((clip) => clip.name)).toEqual([...BASE_CLIPS, "WipeTable"]);
    expect(clipOf(cleaning, "WipeTable").duration).toBeCloseTo(4, 5);
    for (const track of clipOf(cleaning, "WipeTable").tracks) {
      expect(track.name.startsWith("CafeMannequin")).toBe(false);
      expect(track.name.endsWith(".position") ? track.name : "Hips.position").toBe("Hips.position");
    }
    const skeleton = (loaded: Loaded) => (loaded.scene.getObjectByName("MannequinBody") as THREE.SkinnedMesh).skeleton.bones.map((bone) => bone.name);
    expect(skeleton(cleaning)).toEqual(skeleton(shipped));
    const geometry = (loaded: Loaded) => (loaded.scene.getObjectByName("MannequinBody") as THREE.SkinnedMesh).geometry;
    expect(geometry(cleaning).getAttribute("_part")!.count).toBe(geometry(shipped).getAttribute("_part")!.count);
    expect(cleaning.scene.getObjectByName("CafeMannequin")!.userData.walkCycleDistance)
      .toBe(shipped.scene.getObjectByName("CafeMannequin")!.userData.walkCycleDistance);
    for (const name of BASE_CLIPS) {
      const after = clipOf(cleaning, name);
      const before = clipOf(shipped, name);
      expect(after.tracks.map((track) => track.name)).toEqual(before.tracks.map((track) => track.name));
      for (const [index, track] of after.tracks.entries()) {
        const reference = before.tracks[index]!;
        for (let i = 0; i < track.values.length; i += 1) expect(track.values[i]).toBeCloseTo(reference.values[i]!, 5);
      }
    }
  });

  it("มี marker สามช่วงเรียงตามลำดับงาน: เก็บจาน → ลงผ้า → เช็ดเสร็จ", () => {
    expect(Object.keys(cleaning.markers)).toEqual(["WipeTable"]);
    const markers = cleaning.markers.WipeTable!;
    expect(markers.map((marker) => marker.name)).toEqual(["hand-contact", "wipe-contact", "clear-complete"]);
    expect(new Set(markers.map((marker) => marker.name)).size).toBe(markers.length);
    for (const marker of markers) {
      expect(MARKER_NAMES).toContain(marker.name);
      expect(marker.time).toBeGreaterThanOrEqual(0);
      expect(marker.time).toBeLessThanOrEqual(1);
    }
    // ช่วงเช็ดต้องกินเวลาจริงพอให้ลดคราบได้ ไม่ใช่ marker ติดกัน
    expect(markerTime(cleaning, "wipe-contact")).toBeGreaterThan(markerTime(cleaning, "hand-contact"));
    expect(markerTime(cleaning, "clear-complete") - markerTime(cleaning, "wipe-contact")).toBeGreaterThan(0.3);
    expect(markerTime(cleaning, "clear-complete")).toBeLessThan(1);
  });

  it("ผ้าในมือแนบผิวโต๊ะตลอดช่วง wipe-contact → clear-complete และกวาดหลายรอบ", () => {
    const at = play(cleaning, clipOf(cleaning, "WipeTable"));
    const from = markerTime(cleaning, "wipe-contact");
    const to = markerTime(cleaning, "clear-complete");
    const samples: THREE.Vector3[] = [];
    for (let frame = 0; frame <= 60; frame += 1) {
      const phase = from + ((to - from) * frame) / 60;
      const palm = at(phase).palm(1);
      const hand = cleaning.scene.getObjectByName("RightHand")!;
      const normal = new THREE.Vector3(-1, 0, 0).applyQuaternion(hand.getWorldQuaternion(new THREE.Quaternion()));
      expect(normal.dot(new THREE.Vector3(0, -1, 0))).toBeGreaterThan(0.99);
      // ผิวฝ่ามือกดผ้าอยู่บนโต๊ะพอดี — ไม่ลอยและไม่จมผิวโต๊ะ (เผื่อ slerp ระหว่างคีย์ 2 มม.)
      expect(Math.abs(palm.y - (TABLE_SURFACE_Y + CLOTH_THICKNESS))).toBeLessThan(0.002);
      samples.push(palm);
    }
    // กวาดซ้าย-ขวาอย่างน้อย 2 รอบ (นับครั้งที่ทิศ x กลับทาง) และรูดเข้าหาตัว
    let reversals = 0;
    for (let i = 2; i < samples.length; i += 1) {
      const previous = samples[i - 1]!.x - samples[i - 2]!.x;
      const current = samples[i]!.x - samples[i - 1]!.x;
      if (previous * current < 0) reversals += 1;
    }
    expect(reversals).toBeGreaterThanOrEqual(4);
    expect(samples[0]!.z).toBeGreaterThan(samples[samples.length - 1]!.z + 0.15);
    const span = Math.max(...samples.map((point) => point.x)) - Math.min(...samples.map((point) => point.x));
    expect(span).toBeGreaterThan(0.3);
  });

  it("เก็บจานที่ hand-contact แล้วถือไว้จนจบคลิป — จานไม่หายก่อนเช็ดเสร็จ", () => {
    const at = play(cleaning, clipOf(cleaning, "WipeTable"));
    const picking = at(markerTime(cleaning, "hand-contact")).palm(-1);
    // ฝ่ามือคว่ำกดบนขอบจานที่ยังวางบนโต๊ะ
    expect(picking.y).toBeCloseTo(TABLE_SURFACE_Y + PLATE_THICKNESS, 2);
    expect(picking.z).toBeGreaterThan(0.3);
    const carried = at(markerTime(cleaning, "wipe-contact")).palm(-1);
    expect(carried.y).toBeGreaterThan(TABLE_SURFACE_Y + 0.2);
    for (let frame = 0; frame <= 24; frame += 1) {
      const phase = markerTime(cleaning, "wipe-contact") + ((1 - markerTime(cleaning, "wipe-contact")) * frame) / 24;
      expect(at(phase).palm(-1).distanceTo(carried)).toBeLessThan(0.005);
    }
  });

  it("ไม่มีลำตัวหรือแขนจมผิวโต๊ะ และยืนอยู่กับที่โดยเท้าไม่ไถล", () => {
    const at = play(cleaning, clipOf(cleaning, "WipeTable"));
    const point = new THREE.Vector3();
    const anchors: Record<string, THREE.Vector3> = {};
    for (let frame = 0; frame <= 30; frame += 1) {
      const sample = at(frame / 30);
      for (const foot of ["LeftFoot", "RightFoot"]) {
        const position = sample.bone(foot);
        expect(position.y).toBeCloseTo(0.08, 2);
        anchors[foot] ??= position.clone();
        expect(Math.hypot(position.x - anchors[foot]!.x, position.z - anchors[foot]!.z)).toBeLessThan(0.003);
      }
      // ส่วนที่ยื่นเหนือโต๊ะ (ไม่รวมขาที่ลอดใต้ขอบโต๊ะได้) ต้องไม่ต่ำกว่าผิวโต๊ะ
      for (let vertex = 0; vertex < sample.mesh.geometry.getAttribute("position").count; vertex += 1) {
        sample.mesh.getVertexPosition(vertex, point);
        if (point.z >= 0.3 && point.y >= 0.5) expect(point.y, `frame ${frame}, vertex ${vertex}`).toBeGreaterThanOrEqual(TABLE_SURFACE_Y);
      }
    }
  }, 60000);

  it("เริ่มและจบด้วยท่ายืน จึง cross-fade กับ Idle/Work เดิมได้", () => {
    const at = play(cleaning, clipOf(cleaning, "WipeTable"));
    for (const phase of [0, 1]) {
      const sample = at(phase);
      expect(sample.bone("Hips").y).toBeCloseTo(0.92, 2);
      expect(sample.bone("Hips").z).toBeCloseTo(0, 2);
      expect(sample.bone("Head").y).toBeGreaterThan(1.45);
    }
    // มือขวาปล่อยลงข้างตัวทั้งหัวและท้ายคลิป ส่วนมือซ้ายยังถือจานที่เก็บได้ตอนจบ
    expect(at(0).palm(1).y).toBeLessThan(0.8);
    expect(at(1).palm(1).y).toBeLessThan(0.8);
  });

  it("ประกาศขอบเขตที่เช็ดถึงจริงพร้อมท่าสำรอง และเส้นทางผ้าอยู่ในขอบเขตนั้น", () => {
    const script = `const module = await import(${JSON.stringify(pathToFileURL(resolve(PROVIDER)).href)});
console.log(JSON.stringify({ footprint: module.WIPE_FOOTPRINT, profile: module.STAFF_CLEAN_PROFILE }));`;
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8", windowsHide: true });
    expect(result.status, result.stderr).toBe(0);
    const { footprint, profile } = JSON.parse(result.stdout) as {
      footprint: { bounds: number[]; fallback: string; strokes: number };
      profile: { stainWindow: number[]; wipeContactY: number; tableSurfaceY: number };
    };
    expect(footprint.fallback.length).toBeGreaterThan(10);
    expect(footprint.strokes).toBeGreaterThanOrEqual(2);
    expect(profile.tableSurfaceY).toBeCloseTo(TABLE_SURFACE_Y, 5);
    expect(profile.wipeContactY).toBeCloseTo(TABLE_SURFACE_Y + CLOTH_THICKNESS, 5);
    expect(profile.stainWindow).toEqual([markerTime(cleaning, "wipe-contact"), markerTime(cleaning, "clear-complete")]);
    const [xMin, xMax, zMin, zMax] = footprint.bounds as [number, number, number, number];
    expect(xMax - xMin).toBeGreaterThan(0.3);
    expect(zMax - zMin).toBeGreaterThan(0.2);
    const at = play(cleaning, clipOf(cleaning, "WipeTable"));
    const from = markerTime(cleaning, "wipe-contact");
    const to = markerTime(cleaning, "clear-complete");
    for (let frame = 0; frame <= 40; frame += 1) {
      const palm = at(from + ((to - from) * frame) / 40).palm(1);
      expect(palm.x).toBeGreaterThanOrEqual(xMin - 0.01);
      expect(palm.x).toBeLessThanOrEqual(xMax + 0.01);
      expect(palm.z).toBeGreaterThanOrEqual(zMin - 0.01);
      expect(palm.z).toBeLessThanOrEqual(zMax + 0.01);
    }
  });

  it("ปฏิเสธ role customer ก่อนเขียนไฟล์", () => {
    const output = join(directory, "wrong-role");
    const result = spawnSync(process.execPath, ["scripts/create-cafe-customer-model.mjs", "--role", "customer", "--output-dir", output, "--clips", PROVIDER], { encoding: "utf8", timeout: 120000, windowsHide: true });
    expect(result.status).toBe(1);
    expect(() => readdirSync(output)).toThrow();
  }, 120000);
});
