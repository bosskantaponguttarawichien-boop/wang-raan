/**
 * feat-110 evidence · sample คลิป Eat บน rig จริงแล้วเขียนหลักฐานลงโฟลเดอร์นี้
 *
 *   node harness/evidence/feat-110/sample-eat-clip.mjs
 *
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
import createCustomerEatClips, { CUSTOMER_EAT_PROFILE, EAT_UTENSILS, eatPhaseOffset, utensilGripOffset } from "../../../scripts/character-clips/customer-eat.mjs";

const HERE = dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const PROVIDER = "scripts/character-clips/customer-eat.mjs";
const SEGMENTS = [
  ["Hips", "Spine"], ["Spine", "Neck"], ["Neck", "Head"],
  ["Spine", "LeftArm"], ["LeftArm", "LeftForeArm"], ["LeftForeArm", "LeftHand"],
  ["Spine", "RightArm"], ["RightArm", "RightForeArm"], ["RightForeArm", "RightHand"],
  ["Hips", "LeftLeg"], ["LeftLeg", "LeftLowerLeg"], ["LeftLowerLeg", "LeftFoot"],
  ["Hips", "RightLeg"], ["RightLeg", "RightLowerLeg"], ["RightLowerLeg", "RightFoot"],
];
const P = CUSTOMER_EAT_PROFILE;
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
      const hand = rig.bones.get("RightHand");
      const palm = hand.localToWorld(palmLocal(1).clone());
      const fingers = new THREE.Vector3(0, -1, 0).applyQuaternion(hand.getWorldQuaternion(new THREE.Quaternion()));
      const bones = {};
      for (const [name, bone] of rig.bones) bones[name] = bone.getWorldPosition(new THREE.Vector3());
      return {
        mesh, bones, palms: { left: rig.bones.get("LeftHand").localToWorld(palmLocal(-1).clone()), right: palm },
        tip: palm.clone().addScaledVector(fingers, P.tipReach),
        mouth: rig.bones.get("Head").localToWorld(new THREE.Vector3(...P.mouthLocal)),
      };
    },
    stop() { mixer.stopAllAction(); },
  };
}

/** วัดระยะสัมผัส/ระยะปลอดภัยของคลิป Eat */
function measure(rig, clip, markers, frames = 60) {
  const probe = sampler(rig, clip);
  const seat = probe.at(0);
  const result = {
    clip: clip.name, duration: round(clip.duration, 3), frames,
    seatedAnchorDrift: 0, tipLowest: Infinity, tipHighestAboveMouth: -Infinity,
    handLowestOverTable: Infinity, leftHandDrift: 0, mouthReachError: null, plateReachError: null, headClearanceAtBite: null,
  };
  const anchors = ["Hips", "LeftLeg", "RightLeg", "LeftLowerLeg", "RightLowerLeg", "LeftFoot", "RightFoot"]
    .map((name) => [name, seat.bones[name].clone()]);
  const leftAnchor = seat.palms.left.clone();
  for (let frame = 0; frame <= frames; frame += 1) {
    const sample = probe.at(frame / frames);
    for (const [name, anchor] of anchors) result.seatedAnchorDrift = Math.max(result.seatedAnchorDrift, sample.bones[name].distanceTo(anchor));
    result.leftHandDrift = Math.max(result.leftHandDrift, sample.palms.left.distanceTo(leftAnchor));
    result.tipLowest = Math.min(result.tipLowest, sample.tip.y);
    result.tipHighestAboveMouth = Math.max(result.tipHighestAboveMouth, sample.tip.y - sample.mouth.y);
    for (const name of ["LeftHand", "RightHand", "LeftForeArm", "RightForeArm"]) {
      if (sample.bones[name].z >= 0.22) result.handLowestOverTable = Math.min(result.handLowestOverTable, sample.bones[name].y);
    }
  }
  const scoop = markers.find((marker) => marker.name === "food-contact");
  if (scoop) {
    const sample = probe.at(scoop.time);
    result.plateReachError = round(Math.abs(sample.tip.y - P.foodSurfaceY));
    result.plateRadialDistance = round(Math.hypot(sample.tip.x, sample.tip.z - P.plateForward));
  }
  const bite = markers.find((marker) => marker.name === "hand-contact");
  if (bite) {
    const sample = probe.at(bite.time);
    result.mouthReachError = round(sample.tip.distanceTo(sample.mouth));
    result.headClearanceAtBite = round(sample.tip.distanceTo(sample.bones.Head));
  }
  probe.stop();
  for (const key of ["seatedAnchorDrift", "tipLowest", "tipHighestAboveMouth", "handLowestOverTable", "leftHandDrift"]) {
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
      utensilTip: vec(sample.tip), mouth: vec(sample.mouth),
      palmLeft: vec(sample.palms.left), palmRight: vec(sample.palms.right),
      bones: Object.fromEntries(Object.entries(sample.bones).map(([name, position]) => [name, vec(position)])),
    };
  });
  probe.stop();
  return rows;
}

// ---- SVG preview: โครงกระดูกท่านั่งเทียบโต๊ะ/เบาะ/จาน พร้อมปลายอุปกรณ์และจุดปาก ----
const PANEL = { width: 230, height: 250, scale: 128, originY: 232 };
function panel(title, view, sample) {
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
    box(-0.5, 0.5, P.tableSurfaceY - 0.04, P.tableSurfaceY, 0.22, 0.95, "#8899bb33", "#5a6478"),
    box(-0.22, 0.22, P.seatTopY - 0.06, P.seatTopY, -0.25, 0.05, "#c4a07a44", "#8a6a44"),
    box(-0.13, 0.13, P.tableSurfaceY, P.foodSurfaceY, P.plateForward - 0.13, P.plateForward + 0.13, "#faf7f0cc", "#b5ab98"),
  ];
  for (const [from, to] of SEGMENTS) {
    const [x1, y1] = screen(sample.bones[from]);
    const [x2, y2] = screen(sample.bones[to]);
    parts.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#3d5a86" stroke-width="2.4" stroke-linecap="round"/>`);
  }
  const [px, py] = screen(sample.palms.right);
  const [tx, ty] = screen(sample.tip);
  const [mx, my] = screen(sample.mouth);
  const [lx, ly] = screen(sample.palms.left);
  parts.push(`<line x1="${px.toFixed(1)}" y1="${py.toFixed(1)}" x2="${tx.toFixed(1)}" y2="${ty.toFixed(1)}" stroke="#8a8f9c" stroke-width="2"/>`);
  parts.push(`<circle cx="${tx.toFixed(1)}" cy="${ty.toFixed(1)}" r="3" fill="#c4603a"/>`);
  parts.push(`<circle cx="${mx.toFixed(1)}" cy="${my.toFixed(1)}" r="2.4" fill="#2f5e47"/>`);
  parts.push(`<circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="2.4" fill="#7a5ea8"/>`);
  return `<g>${parts.join("")}</g>`;
}
function previewSvg(rig, clip, markers) {
  const probe = sampler(rig, clip);
  const phases = [0, 0.14, 0.3, 0.45, 0.6, 0.999];
  const cells = [];
  phases.forEach((phase, index) => {
    const sample = probe.at(phase);
    const label = markers.filter((marker) => Math.abs(marker.time - phase) < 0.02).map((marker) => marker.name).join(",");
    for (const [offset, view] of [[0, "side"], [1, "front"]]) {
      cells.push(`<g transform="translate(${((index % 3) * 2 + offset) * PANEL.width},${Math.floor(index / 3) * PANEL.height})">${panel(`Eat t=${phase} ${view}${label ? ` [${label}]` : ""}`, view, sample)}</g>`);
    }
  });
  probe.stop();
  const width = PANEL.width * 6;
  const height = PANEL.height * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="sans-serif">
<rect width="${width}" height="${height}" fill="#ffffff"/>
<!-- เทา = ผิวโต๊ะ 0.74 ม., น้ำตาล = เบาะ 0.45 ม., ขาว = จาน; จุดส้ม = ปลายอุปกรณ์, เขียว = ปาก, ม่วง = ฝ่ามือซ้าย -->
${cells.join("\n")}
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
  const built = createCustomerEatClips({ role: "customer", lite, model: rig.model, bones: new Map(rig.bones), baseClips: Object.freeze(baseClips.map((clip) => clip.clone())) });
  markers = built.markers;
  metrics[lite ? "lite" : "full"] = {
    rigMutatedBones: [...bind].filter(([name, rest]) => !rig.bones.get(name).quaternion.equals(rest.q) || !rig.bones.get(name).position.equals(rest.p)).map(([name]) => name),
    walkCycleDistance: rig.model.userData.walkCycleDistance,
    clips: built.clips.map((clip) => ({ name: clip.name, duration: round(clip.duration, 3), tracks: clip.tracks.length })),
    authored: built.clips.map((clip) => measure(rig, clip, built.markers[clip.name], 48)),
  };
  if (lite) {
    samplesTable = { Eat: samples(rig, built.clips[0], built.markers.Eat) };
    writeFileSync(join(HERE, "preview.svg"), previewSvg(rig, built.clips[0], built.markers.Eat));
  }
}

// ---- 2. build ผ่าน CLI จริงลง OS temp แล้วยืนยันว่า asset กลางไม่ถูกแตะ ----
const assetDirectory = resolve("public/assets/models");
const digest = () => Object.fromEntries(readdirSync(assetDirectory).filter((name) => name.endsWith(".glb")).map((name) =>
  [name, createHash("sha256").update(readFileSync(join(assetDirectory, name))).digest("hex")]));
const before = digest();
const output = mkdtempSync(join(tmpdir(), "wangraan-feat110-"));
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
if (dirname(resolve(output)) !== resolve(tmpdir()) || !basename(output).startsWith("wangraan-feat110-")) throw new Error("โฟลเดอร์ชั่วคราวไม่ตรงที่สคริปต์นี้สร้าง");
rmSync(output, { recursive: true, force: true });
const after = digest();

const utensils = Object.fromEntries(Object.entries(EAT_UTENSILS).map(([food, entry]) => [food, { ...entry, gripOffset: utensilGripOffset(food) }]));
const phaseOffsets = Array.from({ length: 12 }, (_, index) => ({ party: 1 + (index >> 2), member: index % 4, offset: round(eatPhaseOffset(7, 1 + (index >> 2), index % 4), 5) }));

writeFileSync(join(HERE, "contact-metrics.json"), `${JSON.stringify({
  task: "feat-110", generatedAt: new Date().toISOString(), provider: PROVIDER,
  profile: P, markers, utensils, phaseOffsets, metrics, temporaryBuild: build,
  publicAssetsUnchanged: JSON.stringify(before) === JSON.stringify(after), publicAssetsSha256: before,
}, null, 2)}\n`);
writeFileSync(join(HERE, "clip-samples.json"), `${JSON.stringify({ task: "feat-110", variant: "lite", units: "meters, model space (+Z = หน้าตัว)", samples: samplesTable }, null, 2)}\n`);
console.log(JSON.stringify({ metrics, utensils, publicAssetsUnchanged: JSON.stringify(before) === JSON.stringify(after) }, null, 1));
