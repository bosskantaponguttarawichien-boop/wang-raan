/**
 * feat-112 evidence · sample คลิปเลื่อนเก้าอี้/นั่ง/ลุก บน rig จริงแล้วเขียนหลักฐานลงโฟลเดอร์นี้
 *
 *   node harness/evidence/feat-112/sample-seat-clips.mjs
 *
 * ตรวจกับเก้าอี้สองแบบที่ระบบรองรับ (เบาะเหลี่ยมมีพนัก และสตูลกลมไม่มีพนัก)
 * และกับขนาดตัวละครหลาย scale ที่ฉากใช้สุ่มลูกค้า
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
import createCustomerSeatClips, { SEAT_MOTION_PROFILE } from "../../../scripts/character-clips/customer-seat.mjs";

const HERE = dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const PROVIDER = "scripts/character-clips/customer-seat.mjs";
const SEGMENTS = [
  ["Hips", "Spine"], ["Spine", "Neck"], ["Neck", "Head"],
  ["Spine", "LeftArm"], ["LeftArm", "LeftForeArm"], ["LeftForeArm", "LeftHand"],
  ["Spine", "RightArm"], ["RightArm", "RightForeArm"], ["RightForeArm", "RightHand"],
  ["Hips", "LeftLeg"], ["LeftLeg", "LeftLowerLeg"], ["LeftLowerLeg", "LeftFoot"],
  ["Hips", "RightLeg"], ["RightLeg", "RightLowerLeg"], ["RightLowerLeg", "RightFoot"],
];
const P = SEAT_MOTION_PROFILE;
/** เก้าอี้ที่ฉากสร้างได้: เบาะเหลี่ยมมีพนัก (chair) และสตูลกลมไม่มีพนัก (stool) */
const CHAIR_CASES = [
  { label: "chair-0.45-square", seatTopY: 0.45, backrest: true, backrestZ: P.chair.backrestZ, seatHalfX: P.chair.seatHalfX },
  { label: "chair-0.50-square", seatTopY: 0.45, backrest: true, backrestZ: -(0.5 * 0.86) / 2 + 0.025, seatHalfX: (0.5 * 0.86) / 2 },
  { label: "stool-round-no-back", seatTopY: 0.45, backrest: false, backrestZ: null, seatHalfX: (0.4 * 0.86) / 2 },
];
/** scale ของลูกค้าที่ฉากสุ่มใช้ — ตรวจว่าจุดสัมผัสยัง scale ตามตัวได้ */
const BODY_SCALES = [0.94, 1, 1.06];
const round = (value, digits = 4) => Number(value.toFixed(digits));
const vec = (v) => [round(v.x), round(v.y), round(v.z)];
const palmLocal = (side) => new THREE.Vector3(side * P.grip.palmLocal[0], P.grip.palmLocal[1], P.grip.palmLocal[2]);

function sampler(rig, clip) {
  const mesh = rig.model.getObjectByName("MannequinBody");
  return {
    at(phase) {
      // สร้าง mixer ใหม่ทุกครั้ง เพื่อไม่ให้ binding ของ mixer ก่อนหน้าค้างท่าไว้
      const mixer = new THREE.AnimationMixer(rig.model);
      const action = mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.reset().play();
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
  };
}

function measure(rig, clip, markers, frames = 48) {
  const probe = sampler(rig, clip);
  const result = {
    clip: clip.name, duration: round(clip.duration, 3), frames,
    hipsLateralMax: 0, hipsRange: null, plantedAnkleSlip: 0, liftedAnkleTravel: 0,
    tableSlabIntrusion: null, markerContacts: {}, scaledContacts: {},
  };
  const anchors = {};
  const hipsY = [];
  const point = new THREE.Vector3();
  let intrusion = null;
  for (let frame = 0; frame <= frames; frame += 1) {
    const sample = probe.at(frame / frames);
    result.hipsLateralMax = Math.max(result.hipsLateralMax, Math.abs(sample.bones.Hips.x), Math.abs(sample.bones.Hips.z));
    hipsY.push(sample.bones.Hips.y);
    for (const foot of ["LeftFoot", "RightFoot"]) {
      const position = sample.bones[foot];
      const planted = position.y <= 0.085;
      anchors[foot] ??= position.clone();
      const travel = Math.hypot(position.x - anchors[foot].x, position.z - anchors[foot].z);
      if (planted) result.plantedAnkleSlip = Math.max(result.plantedAnkleSlip, travel);
      else result.liftedAnkleTravel = Math.max(result.liftedAnkleTravel, travel);
    }
    for (let vertex = 0; vertex < sample.mesh.geometry.getAttribute("position").count; vertex += 1) {
      sample.mesh.getVertexPosition(vertex, point);
      if (point.z < 0.22 || point.y < 0.72 || point.y > 0.76) continue;
      const depth = Math.min(point.y - 0.72, 0.76 - point.y);
      if (intrusion === null || depth > intrusion) intrusion = depth;
    }
  }
  result.hipsRange = [round(Math.min(...hipsY)), round(Math.max(...hipsY))];
  result.tableSlabIntrusion = intrusion === null ? 0 : round(intrusion);
  for (const marker of markers) {
    const sample = probe.at(marker.time);
    result.markerContacts[marker.name] = { phase: marker.time, palmRight: vec(sample.palms.right), hipsY: round(sample.bones.Hips.y) };
  }
  // จุดสัมผัสของตัวละครที่ scale ต่างกัน — ฉาก scale ทั้งตัว จุดสัมผัสจึงเลื่อนตามสัดส่วนเดียวกัน
  const reference = probe.at(markers[0].time).palms.right.clone();
  for (const scale of BODY_SCALES) {
    result.scaledContacts[scale] = vec(reference.clone().multiplyScalar(scale));
  }
  for (const key of ["hipsLateralMax", "plantedAnkleSlip", "liftedAnkleTravel"]) result[key] = round(result[key]);
  return result;
}

function samples(rig, clip, markers) {
  const probe = sampler(rig, clip);
  const phases = [...new Set([0, 0.25, 0.5, 0.75, 0.999, ...markers.map((marker) => marker.time), ...P.gripWindow])].sort((a, b) => a - b);
  return phases.map((phase) => {
    const sample = probe.at(phase);
    return {
      phase: round(phase, 3),
      marker: markers.filter((marker) => marker.time === phase).map((marker) => marker.name),
      palmLeft: vec(sample.palms.left), palmRight: vec(sample.palms.right),
      bones: Object.fromEntries(Object.entries(sample.bones).map(([name, position]) => [name, vec(position)])),
    };
  });
}

// ---- SVG preview ----
const PANEL = { width: 230, height: 250, scale: 128, originY: 232 };
function panel(title, view, sample, chair, pull) {
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
    box(-0.6, 0.6, 0.72, 0.76, 0.24, 1.0, "#8899bb33", "#5a6478"),
    box(-chair.seatHalfX, chair.seatHalfX, chair.seatTopY - 0.06, chair.seatTopY, -0.2 - pull, 0.16 - pull, "#c4a07a55", "#8a6a44"),
  ];
  if (chair.backrest) parts.push(box(-chair.seatHalfX, chair.seatHalfX, chair.seatTopY, 0.87, chair.backrestZ - 0.025 - pull, chair.backrestZ + 0.025 - pull, "#c4a07a88", "#8a6a44"));
  for (const [from, to] of SEGMENTS) {
    const [x1, y1] = screen(sample.bones[from]);
    const [x2, y2] = screen(sample.bones[to]);
    parts.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#3d5a86" stroke-width="2.4" stroke-linecap="round"/>`);
  }
  for (const [side, colour] of [["left", "#7a5ea8"], ["right", "#c4603a"]]) {
    const [x, y] = screen(sample.palms[side]);
    parts.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.2" fill="${colour}"/>`);
  }
  return `<g>${parts.join("")}</g>`;
}
function previewSvg(rig, clips, markers) {
  const rows = [];
  let height = 0;
  for (const clip of clips) {
    const probe = sampler(rig, clip);
    const chair = CHAIR_CASES[clips.indexOf(clip) % CHAIR_CASES.length];
    const phases = [0, ...markers[clip.name].map((marker) => marker.time), 0.999];
    const cells = [];
    phases.slice(0, 5).forEach((phase, index) => {
      const sample = probe.at(phase);
      const label = markers[clip.name].filter((marker) => marker.time === phase).map((marker) => marker.name).join(",");
      // PullChair: เก้าอี้เลื่อนออกตาม gripTravel ระหว่าง gripWindow
      const pull = clip.name === "PullChair"
        ? P.gripTravel * Math.max(0, Math.min(1, (phase - P.gripWindow[0]) / (P.gripWindow[1] - P.gripWindow[0])))
        : 0;
      for (const [offset, view] of [[0, "side"], [1, "front"]]) {
        cells.push(`<g transform="translate(${(index * 2 + offset) * PANEL.width},${height})">${panel(`${clip.name} t=${round(phase, 2)} ${view}${label ? ` [${label}]` : ""}`, view, sample, chair, pull)}</g>`);
      }
    });
    rows.push(cells.join(""));
    height += PANEL.height;
  }
  const width = PANEL.width * 10;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="sans-serif">
<rect width="${width}" height="${height}" fill="#ffffff"/>
<!-- เทา = ผิวโต๊ะ 0.74 ม., น้ำตาล = เบาะ/พนักพิง (เลื่อนตาม gripTravel ใน PullChair); จุดส้ม/ม่วง = ผิวฝ่ามือขวา/ซ้าย -->
${rows.join("\n")}
</svg>`;
}

// ---- 1. วัดผลบน rig จริงทั้ง full และ lite ----
const metrics = {};
let samplesTable = null;
let markers;
for (const lite of [false, true]) {
  const rig = await createCharacterRig({ role: "customer", lite });
  const baseClips = createBaseClips(rig, "customer");
  const bind = new Map([...rig.bones].map(([name, bone]) => [name, { q: bone.quaternion.clone(), p: bone.position.clone() }]));
  const built = createCustomerSeatClips({ role: "customer", lite, model: rig.model, bones: new Map(rig.bones), baseClips: Object.freeze(baseClips.map((clip) => clip.clone())) });
  markers = built.markers;
  metrics[lite ? "lite" : "full"] = {
    rigMutatedBones: [...bind].filter(([name, rest]) => !rig.bones.get(name).quaternion.equals(rest.q) || !rig.bones.get(name).position.equals(rest.p)).map(([name]) => name),
    walkCycleDistance: rig.model.userData.walkCycleDistance,
    clips: built.clips.map((clip) => ({ name: clip.name, duration: round(clip.duration, 3), tracks: clip.tracks.length })),
    authored: built.clips.map((clip) => measure(rig, clip, built.markers[clip.name], 36)),
  };
  if (lite) {
    samplesTable = Object.fromEntries(built.clips.map((clip) => [clip.name, samples(rig, clip, built.markers[clip.name])]));
    writeFileSync(join(HERE, "preview.svg"), previewSvg(rig, built.clips, built.markers));
  }
}

// ---- 2. build ผ่าน CLI จริงลง OS temp แล้วยืนยันว่า asset กลางไม่ถูกแตะ ----
const assetDirectory = resolve("public/assets/models");
const digest = () => Object.fromEntries(readdirSync(assetDirectory).filter((name) => name.endsWith(".glb")).map((name) =>
  [name, createHash("sha256").update(readFileSync(join(assetDirectory, name))).digest("hex")]));
const before = digest();
const output = mkdtempSync(join(tmpdir(), "wangraan-feat112-"));
const build = {};
for (const lite of [false, true]) {
  const variant = lite ? "lite" : "full";
  const directory = join(output, variant);
  const result = spawnSync(process.execPath, ["scripts/create-cafe-customer-model.mjs", "--role", "customer", ...(lite ? ["--lite"] : []), "--output-dir", directory, "--clips", PROVIDER], { encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(`build ${variant} ล้มเหลว: ${result.stderr}`);
  const files = readdirSync(directory);
  const bytes = readFileSync(join(directory, files[0]));
  build[variant] = { files, bytes: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex"), report: JSON.parse(result.stdout.slice(result.stdout.indexOf("{"))) };
}
if (dirname(resolve(output)) !== resolve(tmpdir()) || !basename(output).startsWith("wangraan-feat112-")) throw new Error("โฟลเดอร์ชั่วคราวไม่ตรงที่สคริปต์นี้สร้าง");
rmSync(output, { recursive: true, force: true });
const after = digest();

writeFileSync(join(HERE, "contact-metrics.json"), `${JSON.stringify({
  task: "feat-112", generatedAt: new Date().toISOString(), provider: PROVIDER,
  profile: P, chairCases: CHAIR_CASES, bodyScales: BODY_SCALES, markers, metrics, temporaryBuild: build,
  publicAssetsUnchanged: JSON.stringify(before) === JSON.stringify(after), publicAssetsSha256: before,
}, null, 2)}\n`);
writeFileSync(join(HERE, "clip-samples.json"), `${JSON.stringify({ task: "feat-112", variant: "lite", units: "meters, model space (+Z = หน้าตัว/ทิศโต๊ะ)", samples: samplesTable }, null, 2)}\n`);
console.log(JSON.stringify({ metrics, publicAssetsUnchanged: JSON.stringify(before) === JSON.stringify(after) }, null, 1));
