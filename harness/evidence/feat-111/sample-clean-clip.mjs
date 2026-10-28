/**
 * feat-111 evidence · sample คลิป WipeTable บน rig จริงแล้วเขียนหลักฐานลงโฟลเดอร์นี้
 *
 *   node harness/evidence/feat-111/sample-clean-clip.mjs
 *
 * ตรวจกับโต๊ะหลายความสูง/ความลึกที่ระบบรองรับ (ผังรองรับ 2–30 ม. โต๊ะจึงมีได้หลายขนาด)
 * ไม่แตะ public/assets/models (GLB ตรวจรับสร้างลง OS temp แล้วลบหลังบันทึก hash)
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import * as THREE from "three";
import { createCharacterRig } from "../../../scripts/model-generation/rig.mjs";
import { createBaseClips } from "../../../scripts/model-generation/base-clips.mjs";
import createStaffCleanClips, { STAFF_CLEAN_PROFILE, WIPE_FOOTPRINT } from "../../../scripts/character-clips/staff-clean.mjs";

const HERE = dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const PROVIDER = "scripts/character-clips/staff-clean.mjs";
const SEGMENTS = [
  ["Hips", "Spine"], ["Spine", "Neck"], ["Neck", "Head"],
  ["Spine", "LeftArm"], ["LeftArm", "LeftForeArm"], ["LeftForeArm", "LeftHand"],
  ["Spine", "RightArm"], ["RightArm", "RightForeArm"], ["RightForeArm", "RightHand"],
  ["Hips", "LeftLeg"], ["LeftLeg", "LeftLowerLeg"], ["LeftLowerLeg", "LeftFoot"],
  ["Hips", "RightLeg"], ["RightLeg", "RightLowerLeg"], ["RightLowerLeg", "RightFoot"],
];
const P = STAFF_CLEAN_PROFILE;
/** โต๊ะที่ตรวจ: ผิวจริงของฉาก 0.76 (กล่อง 0.04 วางจุดกลางที่ 0.74) และขนาดอื่นที่ผังรองรับ */
const TABLE_CASES = [
  { label: "scene-0.76", surfaceY: 0.76, halfDepth: 0.35 },
  { label: "contract-label-0.74", surfaceY: 0.74, halfDepth: 0.35 },
  { label: "low-0.72", surfaceY: 0.72, halfDepth: 0.3 },
  { label: "deep-0.76x0.6", surfaceY: 0.76, halfDepth: 0.6 },
];
const round = (value, digits = 4) => Number(value.toFixed(digits));
const vec = (v) => [round(v.x), round(v.y), round(v.z)];
const palmLocal = (side) => new THREE.Vector3(side * P.palmLocal[0], P.palmLocal[1], P.palmLocal[2]);

function sampler(rig, clip) {
  const mesh = rig.model.getObjectByName("MannequinBody");
  const mixer = new THREE.AnimationMixer(rig.model);
  const action = mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.reset().play();
  return {
    at(phase) {
      mixer.setTime(Math.min(phase * clip.duration, clip.duration - 1e-6));
      rig.model.updateMatrixWorld(true);
      mesh.skeleton.update();
      const bones = {};
      for (const [name, bone] of rig.bones) bones[name] = bone.getWorldPosition(new THREE.Vector3());
      return {
        mesh, bones,
        palms: {
          left: rig.bones.get("LeftHand").localToWorld(palmLocal(-1).clone()),
          right: rig.bones.get("RightHand").localToWorld(palmLocal(1).clone()),
        },
      };
    },
    stop() { mixer.stopAllAction(); },
  };
}

function measure(rig, clip, frames = 96) {
  const probe = sampler(rig, clip);
  const [from, to] = P.stainWindow;
  const result = {
    clip: clip.name, duration: round(clip.duration, 3), frames,
    clothLift: 0, strokeReversals: 0, wipeBand: null, ankleSlip: 0,
    carriedPlateDrift: 0, bodyLowestOverTable: Infinity, standEndHipsY: null,
    tableClearance: {},
  };
  const anchors = {};
  const stroke = [];
  // ช่วงเช็ด: ผ้าต้องแนบผิวโต๊ะและกวาดหลายรอบ
  for (let frame = 0; frame <= frames; frame += 1) {
    const phase = from + ((to - from) * frame) / frames;
    stroke.push(probe.at(phase).palms.right.clone());
  }
  for (const point of stroke) result.clothLift = Math.max(result.clothLift, Math.abs(point.y - P.wipeContactY));
  for (let i = 2; i < stroke.length; i += 1) {
    if ((stroke[i - 1].x - stroke[i - 2].x) * (stroke[i].x - stroke[i - 1].x) < 0) result.strokeReversals += 1;
  }
  result.wipeBand = {
    x: [round(Math.min(...stroke.map((p) => p.x))), round(Math.max(...stroke.map((p) => p.x)))],
    z: [round(Math.min(...stroke.map((p) => p.z))), round(Math.max(...stroke.map((p) => p.z)))],
  };
  const carried = probe.at(from).palms.left.clone();
  const point = new THREE.Vector3();
  const lowestAbove = TABLE_CASES.map(() => Infinity);
  for (let frame = 0; frame <= frames; frame += 1) {
    const sample = probe.at(frame / frames);
    if (frame / frames >= from) result.carriedPlateDrift = Math.max(result.carriedPlateDrift, sample.palms.left.distanceTo(carried));
    for (const foot of ["LeftFoot", "RightFoot"]) {
      anchors[foot] ??= sample.bones[foot].clone();
      result.ankleSlip = Math.max(result.ankleSlip, Math.hypot(sample.bones[foot].x - anchors[foot].x, sample.bones[foot].z - anchors[foot].z));
    }
    for (let vertex = 0; vertex < sample.mesh.geometry.getAttribute("position").count; vertex += 1) {
      sample.mesh.getVertexPosition(vertex, point);
      if (point.y < 0.5) continue;
      if (point.z >= 0.3) result.bodyLowestOverTable = Math.min(result.bodyLowestOverTable, point.y);
      TABLE_CASES.forEach((table, index) => {
        // ขอบโต๊ะใกล้ตัว = ขอบไกลสุดของแถบเช็ดลบความลึกครึ่งโต๊ะ (พนักงานยืนชิดขอบ)
        const edge = Math.max(0.24, WIPE_FOOTPRINT.radiusFar + WIPE_FOOTPRINT.pivot[2] - table.halfDepth * 2);
        if (point.z >= edge) lowestAbove[index] = Math.min(lowestAbove[index], point.y - table.surfaceY);
      });
    }
  }
  TABLE_CASES.forEach((table, index) => {
    result.tableClearance[table.label] = Number.isFinite(lowestAbove[index]) ? round(lowestAbove[index]) : null;
  });
  result.standEndHipsY = round(probe.at(1).bones.Hips.y);
  probe.stop();
  for (const key of ["clothLift", "ankleSlip", "carriedPlateDrift", "bodyLowestOverTable"]) {
    result[key] = Number.isFinite(result[key]) ? round(result[key]) : null;
  }
  return result;
}

function samples(rig, clip, markers) {
  const probe = sampler(rig, clip);
  const phases = [...new Set([0, 0.25, 0.5, 0.75, 0.999, ...markers.map((marker) => marker.time)])].sort((a, b) => a - b);
  const rows = phases.map((phase) => {
    const sample = probe.at(phase);
    return {
      phase: round(phase, 3),
      marker: markers.filter((marker) => marker.time === phase).map((marker) => marker.name),
      clothContact: vec(sample.palms.right), carriedPlate: vec(sample.palms.left),
      bones: Object.fromEntries(Object.entries(sample.bones).map(([name, position]) => [name, vec(position)])),
    };
  });
  probe.stop();
  return rows;
}

// ---- SVG preview: 4 phase × (side/front) + แผนที่ด้านบนของแถบที่ผ้าเช็ดถึง ----
const PANEL = { width: 230, height: 250, scale: 128, originY: 232 };
function panel(title, view, sample, table) {
  const project = view === "side" ? (p) => [p.z, p.y] : (p) => [p.x, p.y];
  const screen = (p) => { const [h, v] = project(p); return [PANEL.width / 2 + h * PANEL.scale, PANEL.originY - v * PANEL.scale]; };
  const box = (x0, x1, y0, y1, z0, z1, fill, stroke) => {
    const [left, top] = screen(new THREE.Vector3(x0, y1, z0));
    const [right, bottom] = screen(new THREE.Vector3(x1, y0, z1));
    return `<rect x="${Math.min(left, right).toFixed(1)}" y="${top.toFixed(1)}" width="${Math.abs(right - left).toFixed(1)}" height="${Math.abs(bottom - top).toFixed(1)}" fill="${fill}" stroke="${stroke}" stroke-width="0.8"/>`;
  };
  const parts = [
    `<rect x="0.5" y="0.5" width="${PANEL.width - 1}" height="${PANEL.height - 1}" fill="none" stroke="#d8dce6"/>`,
    `<text x="8" y="16" font-family="monospace" font-size="10" fill="#4a5060">${title}</text>`,
    `<line x1="0" y1="${PANEL.originY}" x2="${PANEL.width}" y2="${PANEL.originY}" stroke="#b9c0cf"/>`,
    box(-0.6, 0.6, table.surfaceY - 0.04, table.surfaceY, 0.24, 0.24 + table.halfDepth * 2, "#8899bb33", "#5a6478"),
  ];
  for (const [from, to] of SEGMENTS) {
    const [x1, y1] = screen(sample.bones[from]);
    const [x2, y2] = screen(sample.bones[to]);
    parts.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#2f5e47" stroke-width="2.4" stroke-linecap="round"/>`);
  }
  for (const [side, colour] of [["left", "#7a5ea8"], ["right", "#c4603a"]]) {
    const [x, y] = screen(sample.palms[side]);
    parts.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.2" fill="${colour}"/>`);
  }
  return `<g>${parts.join("")}</g>`;
}
function topDownPanel(stroke, table) {
  const scale = 190;
  const screen = (x, z) => [PANEL.width / 2 + x * scale, 36 + (z - 0.1) * scale];
  const [xMin, xMax, zMin, zMax] = WIPE_FOOTPRINT.bounds;
  const [left, top] = screen(xMin, zMin);
  const [right, bottom] = screen(xMax, zMax);
  const path = stroke.map((point, index) => `${index ? "L" : "M"}${screen(point.x, point.z).map((value) => value.toFixed(1)).join(",")}`).join("");
  return `<g><rect x="0.5" y="0.5" width="${PANEL.width - 1}" height="${PANEL.height - 1}" fill="none" stroke="#d8dce6"/>
<text x="8" y="16" font-family="monospace" font-size="10" fill="#4a5060">wipe path (top-down) ${table.label}</text>
<rect x="${Math.min(left, right).toFixed(1)}" y="${Math.min(top, bottom).toFixed(1)}" width="${Math.abs(right - left).toFixed(1)}" height="${Math.abs(bottom - top).toFixed(1)}" fill="#e0a23a33" stroke="#a4712a" stroke-dasharray="3 2"/>
<path d="${path}" fill="none" stroke="#c4603a" stroke-width="1.6"/>
<circle cx="${screen(0, 0)[0].toFixed(1)}" cy="${screen(0, 0)[1].toFixed(1)}" r="3" fill="#2f5e47"/></g>`;
}
function previewSvg(rig, clip, markers) {
  const probe = sampler(rig, clip);
  const phases = [0, markers[0].time, markers[1].time, (markers[1].time + markers[2].time) / 2, markers[2].time, 0.999];
  const cells = [];
  phases.forEach((phase, index) => {
    const sample = probe.at(phase);
    const label = markers.filter((marker) => Math.abs(marker.time - phase) < 0.01).map((marker) => marker.name).join(",");
    const table = TABLE_CASES[index % TABLE_CASES.length];
    for (const [offset, view] of [[0, "side"], [1, "front"]]) {
      cells.push(`<g transform="translate(${((index % 3) * 2 + offset) * PANEL.width},${Math.floor(index / 3) * PANEL.height})">${panel(`t=${round(phase, 2)} ${view} ${table.label}${label ? ` [${label}]` : ""}`, view, sample, table)}</g>`);
    }
  });
  const [from, to] = P.stainWindow;
  const stroke = Array.from({ length: 97 }, (_, i) => probe.at(from + ((to - from) * i) / 96).palms.right.clone());
  cells.push(`<g transform="translate(0,${PANEL.height * 2})">${topDownPanel(stroke, TABLE_CASES[0])}</g>`);
  probe.stop();
  const width = PANEL.width * 6;
  const height = PANEL.height * 3;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="sans-serif">
<rect width="${width}" height="${height}" fill="#ffffff"/>
<!-- เทา = ผิวโต๊ะของเคสนั้น; จุดส้ม = ผ้าในมือขวา, ม่วง = จานที่เก็บในมือซ้าย; กรอบเหลือง = WIPE_FOOTPRINT -->
${cells.join("\n")}
</svg>`;
}

// ---- 1. วัดผลบน rig จริงทั้ง full และ lite ----
const metrics = {};
let samplesTable = null;
let markers;
for (const lite of [false, true]) {
  const rig = await createCharacterRig({ role: "staff", lite });
  const baseClips = createBaseClips(rig, "staff");
  const bind = new Map([...rig.bones].map(([name, bone]) => [name, { q: bone.quaternion.clone(), p: bone.position.clone() }]));
  const built = createStaffCleanClips({ role: "staff", lite, model: rig.model, bones: new Map(rig.bones), baseClips: Object.freeze(baseClips.map((clip) => clip.clone())) });
  markers = built.markers;
  metrics[lite ? "lite" : "full"] = {
    rigMutatedBones: [...bind].filter(([name, rest]) => !rig.bones.get(name).quaternion.equals(rest.q) || !rig.bones.get(name).position.equals(rest.p)).map(([name]) => name),
    walkCycleDistance: rig.model.userData.walkCycleDistance,
    clips: built.clips.map((clip) => ({ name: clip.name, duration: round(clip.duration, 3), tracks: clip.tracks.length })),
    authored: built.clips.map((clip) => measure(rig, clip, 72)),
  };
  if (lite) {
    samplesTable = { WipeTable: samples(rig, built.clips[0], built.markers.WipeTable) };
    writeFileSync(join(HERE, "preview.svg"), previewSvg(rig, built.clips[0], built.markers.WipeTable));
  }
}

// ---- 2. build ผ่าน CLI จริงลง OS temp แล้วยืนยันว่า asset กลางไม่ถูกแตะ ----
const assetDirectory = resolve("public/assets/models");
const digest = () => Object.fromEntries(readdirSync(assetDirectory).filter((name) => name.endsWith(".glb")).map((name) =>
  [name, createHash("sha256").update(readFileSync(join(assetDirectory, name))).digest("hex")]));
const before = digest();
const output = mkdtempSync(join(tmpdir(), "wangraan-feat111-"));
const build = {};
for (const lite of [false, true]) {
  const variant = lite ? "lite" : "full";
  const directory = join(output, variant);
  const result = spawnSync(process.execPath, ["scripts/create-cafe-customer-model.mjs", "--role", "staff", ...(lite ? ["--lite"] : []), "--output-dir", directory, "--clips", PROVIDER], { encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(`build ${variant} ล้มเหลว: ${result.stderr}`);
  const files = readdirSync(directory);
  const bytes = readFileSync(join(directory, files[0]));
  build[variant] = { files, bytes: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex"), report: JSON.parse(result.stdout.slice(result.stdout.indexOf("{"))) };
}
if (dirname(resolve(output)) !== resolve(tmpdir()) || !basename(output).startsWith("wangraan-feat111-")) throw new Error("โฟลเดอร์ชั่วคราวไม่ตรงที่สคริปต์นี้สร้าง");
rmSync(output, { recursive: true, force: true });
const after = digest();

writeFileSync(join(HERE, "contact-metrics.json"), `${JSON.stringify({
  task: "feat-111", generatedAt: new Date().toISOString(), provider: PROVIDER,
  profile: P, footprint: WIPE_FOOTPRINT, tableCases: TABLE_CASES, markers, metrics, temporaryBuild: build,
  publicAssetsUnchanged: JSON.stringify(before) === JSON.stringify(after), publicAssetsSha256: before,
}, null, 2)}\n`);
writeFileSync(join(HERE, "clip-samples.json"), `${JSON.stringify({ task: "feat-111", variant: "lite", units: "meters, model space (+Z = หน้าตัว)", samples: samplesTable }, null, 2)}\n`);
console.log(JSON.stringify({ metrics, publicAssetsUnchanged: JSON.stringify(before) === JSON.stringify(after) }, null, 1));
