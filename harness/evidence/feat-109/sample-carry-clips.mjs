/**
 * feat-109 evidence · sample คลิปถือถาดบน rig จริงแล้วเขียนหลักฐานลงโฟลเดอร์นี้
 *
 *   node harness/evidence/feat-109/sample-carry-clips.mjs
 *
 * ไม่แตะ public/assets/models (GLB ตรวจรับถูกสร้างลง OS temp แล้วลบทิ้งหลังบันทึก hash)
 * ค่าที่วัดได้คือค่าชุดเดียวกับที่ staff-carry-clips.test.ts ยืนยัน แต่เก็บเป็นตารางให้ 117 อ่านต่อ
 */
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import * as THREE from "three";
import { createCharacterRig } from "../../../scripts/model-generation/rig.mjs";
import { createBaseClips } from "../../../scripts/model-generation/base-clips.mjs";
import createStaffCarryClips, { STAFF_CARRY_PROFILE } from "../../../scripts/character-clips/staff-carry.mjs";

const HERE = dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const PROVIDER = "scripts/character-clips/staff-carry.mjs";
const CLIP_NAMES = ["CarryIdle", "CarryWalk", "PickUp", "PutDown"];
const SEGMENTS = [
  ["Hips", "Spine"], ["Spine", "Neck"], ["Neck", "Head"],
  ["Spine", "LeftArm"], ["LeftArm", "LeftForeArm"], ["LeftForeArm", "LeftHand"],
  ["Spine", "RightArm"], ["RightArm", "RightForeArm"], ["RightForeArm", "RightHand"],
  ["Hips", "LeftLeg"], ["LeftLeg", "LeftLowerLeg"], ["LeftLowerLeg", "LeftFoot"],
  ["Hips", "RightLeg"], ["RightLeg", "RightLowerLeg"], ["RightLowerLeg", "RightFoot"],
];
const { tray, grips, receive, place } = STAFF_CARRY_PROFILE;
const palmLocal = (side) => new THREE.Vector3(side * grips.palmLocal[0], grips.palmLocal[1], grips.palmLocal[2]);
const round = (value, digits = 4) => Number(value.toFixed(digits));
const vec = (v) => [round(v.x), round(v.y), round(v.z)];

/** จุดในก้อนถาด (ขอบถาดล่างถึงผิวบนแผ่นถาด) — ของพวกนี้ต้องไม่มีผิวตัวละครแทรก */
const insideTray = (p) =>
  p.y >= tray.bottomY && p.y <= tray.centerY + 0.011 && Math.abs(p.x) <= tray.halfX && Math.abs(p.z - tray.forward) <= tray.halfZ;
/** จุดบนพื้นที่แผ่นถาดที่อาหารวางอยู่ (0.42 × 0.30) */
const overBoard = (p) => Math.abs(p.x) <= 0.21 && Math.abs(p.z - tray.forward) <= 0.15;

function rigSampler(rig, clip) {
  const mesh = rig.model.getObjectByName("MannequinBody");
  const mixer = new THREE.AnimationMixer(rig.model);
  const action = mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.reset().play();
  return {
    at(normalized) {
      mixer.setTime(Math.min(normalized * clip.duration, clip.duration - 1e-6));
      rig.model.updateMatrixWorld(true);
      mesh.skeleton.update();
      const bones = {};
      for (const [name, bone] of rig.bones) bones[name] = bone.getWorldPosition(new THREE.Vector3());
      const palms = {
        left: rig.bones.get("LeftHand").localToWorld(palmLocal(-1).clone()),
        right: rig.bones.get("RightHand").localToWorld(palmLocal(1).clone()),
      };
      return { bones, palms, mesh };
    },
    stop() { mixer.stopAllAction(); },
  };
}

/** วัดระยะสัมผัส/ระยะปลอดภัยของคลิปหนึ่ง จาก vertex ของผิวที่ deform แล้ว */
function measure(rig, clip, frames = 60) {
  const sampler = rigSampler(rig, clip);
  const mesh = rig.model.getObjectByName("MannequinBody");
  const count = mesh.geometry.getAttribute("position").count;
  const point = new THREE.Vector3();
  const result = {
    clip: clip.name, duration: round(clip.duration, 3), frames,
    gripError: 0, trayPenetration: 0, overBoardMaxY: -Infinity,
    handLowestOverCounter: Infinity, bodyLowestOverTable: Infinity,
    ankleSlip: 0, palmYSpread: 0,
  };
  const ankles = {};
  for (let frame = 0; frame <= frames; frame += 1) {
    const { bones, palms } = sampler.at(frame / frames);
    const carrying = clip.name === "CarryIdle" || clip.name === "CarryWalk";
    if (carrying) {
      for (const [side, target] of [["left", grips.left], ["right", grips.right]]) {
        result.gripError = Math.max(result.gripError, palms[side].distanceTo(new THREE.Vector3(...target)));
      }
      result.palmYSpread = Math.max(result.palmYSpread, Math.abs(palms.left.y - palms.right.y));
    }
    for (const name of ["LeftFoot", "RightFoot"]) {
      const planted = bones[name].y <= 0.085;
      if (planted && ankles[name]) {
        result.ankleSlip = Math.max(result.ankleSlip, Math.hypot(bones[name].x - ankles[name].x, bones[name].z - ankles[name].z));
      }
      if (planted) ankles[name] ??= bones[name].clone();
    }
    const handReaching = Math.max(palms.left.z, palms.right.z) > 0.2;
    for (let vertex = 0; vertex < count; vertex += 1) {
      mesh.getVertexPosition(vertex, point);
      if (insideTray(point)) {
        result.trayPenetration = Math.max(result.trayPenetration, Math.min(point.y - tray.bottomY, tray.centerY + 0.011 - point.y));
      }
      if (point.y <= 1.2 && overBoard(point)) result.overBoardMaxY = Math.max(result.overBoardMaxY, point.y);
      // ส่วนของตัวที่ยื่นเหนือโต๊ะ (ไม่รวมขาที่ลอดใต้ขอบโต๊ะได้) ต้องไม่จมผิวโต๊ะ
      if (point.z >= 0.32 && point.y >= 0.5) result.bodyLowestOverTable = Math.min(result.bodyLowestOverTable, point.y);
      if (handReaching && point.z >= 0.22 && point.y >= 0.6) result.handLowestOverCounter = Math.min(result.handLowestOverCounter, point.y);
    }
  }
  sampler.stop();
  for (const key of ["gripError", "trayPenetration", "overBoardMaxY", "handLowestOverCounter", "bodyLowestOverTable", "ankleSlip", "palmYSpread"]) {
    result[key] = Number.isFinite(result[key]) ? round(result[key]) : null;
  }
  return result;
}

/** ตารางตำแหน่งกระดูก/ฝ่ามือที่ phase สำคัญ ให้ 117 เทียบกับถาดจริง */
function samples(rig, clip, markers) {
  const sampler = rigSampler(rig, clip);
  const phases = [...new Set([0, 0.25, 0.5, 0.75, 0.999, ...(markers ?? []).map((marker) => marker.time)])].sort((a, b) => a - b);
  const rows = phases.map((phase) => {
    const { bones, palms } = sampler.at(phase);
    return {
      phase: round(phase, 3),
      marker: (markers ?? []).filter((marker) => marker.time === phase).map((marker) => marker.name),
      palmLeft: vec(palms.left), palmRight: vec(palms.right),
      bones: Object.fromEntries(Object.entries(bones).map(([name, position]) => [name, vec(position)])),
    };
  });
  sampler.stop();
  return rows;
}

// ---- SVG preview: ภาพเส้นโครงกระดูกจาก sample จริง เทียบกับถาด/โต๊ะ/เคาน์เตอร์ที่ความสูงจริง ----
const PANEL = { width: 210, height: 250, scale: 118, originY: 232 };
function projection(view) {
  // side = มองจากด้าน +X (แกนนอน = z หน้าตัว), front = มองจากด้าน −Z (แกนนอน = x)
  return view === "side" ? (p) => [p.z, p.y] : (p) => [p.x, p.y];
}
function panel(title, view, frame, props) {
  const project = projection(view);
  const toScreen = ([h, v]) => [PANEL.width / 2 + h * PANEL.scale, PANEL.originY - v * PANEL.scale];
  const parts = [`<rect x="0.5" y="0.5" width="${PANEL.width - 1}" height="${PANEL.height - 1}" fill="none" stroke="#d8dce6"/>`,
    `<text x="8" y="16" font-family="monospace" font-size="10" fill="#4a5060">${title}</text>`,
    `<line x1="0" y1="${PANEL.originY}" x2="${PANEL.width}" y2="${PANEL.originY}" stroke="#b9c0cf"/>`];
  for (const prop of props) {
    const [left, top] = toScreen(project(new THREE.Vector3(prop.x0, prop.y1, prop.z0)));
    const [right, bottom] = toScreen(project(new THREE.Vector3(prop.x1, prop.y0, prop.z1)));
    parts.push(`<rect x="${Math.min(left, right).toFixed(1)}" y="${top.toFixed(1)}" width="${Math.abs(right - left).toFixed(1)}" height="${Math.abs(bottom - top).toFixed(1)}" fill="${prop.fill}" stroke="${prop.stroke}" stroke-width="0.8"/>`);
  }
  for (const [from, to] of SEGMENTS) {
    const [x1, y1] = toScreen(project(frame.bones[from]));
    const [x2, y2] = toScreen(project(frame.bones[to]));
    parts.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#2f5e47" stroke-width="2.4" stroke-linecap="round"/>`);
  }
  for (const [side, colour] of [["left", "#c4603a"], ["right", "#2f4f8f"]]) {
    const [x, y] = toScreen(project(frame.palms[side]));
    parts.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.2" fill="${colour}"/>`);
  }
  return `<g>${parts.join("")}</g>`;
}
function previewSvg(rig, clips, markers) {
  const props = [
    { x0: -tray.halfX, x1: tray.halfX, z0: tray.forward - tray.halfZ, z1: tray.forward + tray.halfZ, y0: tray.bottomY, y1: tray.centerY + 0.011, fill: "#e0a23a55", stroke: "#a4712a" },
    { x0: -0.45, x1: 0.45, z0: 0.3, z1: 1.0, y0: place.surfaceY - 0.04, y1: place.surfaceY, fill: "#8899bb33", stroke: "#5a6478" },
    { x0: -0.45, x1: 0.45, z0: 0.42, z1: 1.0, y0: 0, y1: receive.surfaceY, fill: "#99a3b522", stroke: "#78808f" },
  ];
  const rows = [];
  let height = 0;
  for (const clip of clips) {
    const sampler = rigSampler(rig, clip);
    const phases = [0, 0.26, 0.5, 0.62, 0.999];
    const cells = [];
    phases.forEach((phase, index) => {
      const frame = sampler.at(phase);
      const label = (markers[clip.name] ?? []).filter((marker) => Math.abs(marker.time - phase) < 0.02).map((marker) => marker.name).join(",");
      for (const [offset, view] of [[0, "side"], [1, "front"]]) {
        const x = (index * 2 + offset) * PANEL.width;
        cells.push(`<g transform="translate(${x},${height})">${panel(`${clip.name} t=${phase} ${view}${label ? ` [${label}]` : ""}`, view, frame, props)}</g>`);
      }
    });
    sampler.stop();
    rows.push(cells.join(""));
    height += PANEL.height;
  }
  const width = PANEL.width * 10;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="sans-serif">
<rect width="${width}" height="${height}" fill="#ffffff"/>
<!-- สี่เหลี่ยมเหลือง = ก้อนถาด, เทาบาง = ผิวโต๊ะ 0.74 ม., เทาทึบ = เคาน์เตอร์ 1.05 ม.; จุดส้ม/น้ำเงิน = ผิวฝ่ามือซ้าย/ขวา -->
${rows.join("\n")}
</svg>`;
}

// ---- 1. วัดผลบน rig จริงทั้ง full และ lite ----
const metrics = {};
const sampleTable = {};
let markers;
for (const lite of [false, true]) {
  const rig = await createCharacterRig({ role: "staff", lite });
  const baseClips = createBaseClips(rig, "staff");
  const bind = new Map([...rig.bones].map(([name, bone]) => [name, { q: bone.quaternion.clone(), p: bone.position.clone() }]));
  const built = createStaffCarryClips({ role: "staff", lite, model: rig.model, bones: new Map(rig.bones), baseClips: Object.freeze(baseClips.map((clip) => clip.clone())) });
  markers = built.markers;
  const mutated = [...bind].filter(([name, rest]) => !rig.bones.get(name).quaternion.equals(rest.q) || !rig.bones.get(name).position.equals(rest.p)).map(([name]) => name);
  const variant = lite ? "lite" : "full";
  metrics[variant] = {
    rigMutatedBones: mutated,
    walkCycleDistance: rig.model.userData.walkCycleDistance,
    triangles: rig.triangleCount,
    clips: built.clips.map((clip) => ({ name: clip.name, duration: round(clip.duration, 3), tracks: clip.tracks.length })),
    baseline: ["Walk", "Work"].map((name) => measure(rig, baseClips.find((clip) => clip.name === name), 36)),
    authored: built.clips.map((clip) => measure(rig, clip, 48)),
  };
  if (lite) {
    for (const clip of built.clips) sampleTable[clip.name] = samples(rig, clip, built.markers[clip.name]);
    writeFileSync(join(HERE, "preview.svg"), previewSvg(rig, built.clips, built.markers));
  }
}

// ---- 2. สร้าง GLB ผ่าน CLI จริงลง OS temp แล้วยืนยันว่า asset กลางไม่ถูกแตะ ----
const assetDirectory = resolve("public/assets/models");
const digest = () => Object.fromEntries(readdirSync(assetDirectory).filter((name) => name.endsWith(".glb")).map((name) =>
  [name, createHash("sha256").update(readFileSync(join(assetDirectory, name))).digest("hex")]));
const before = digest();
const output = mkdtempSync(join(tmpdir(), "wangraan-feat109-"));
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
if (dirname(resolve(output)) !== resolve(tmpdir()) || !basename(output).startsWith("wangraan-feat109-")) throw new Error("โฟลเดอร์ชั่วคราวไม่ตรงที่สคริปต์นี้สร้าง");
rmSync(output, { recursive: true, force: true });
const after = digest();

writeFileSync(join(HERE, "contact-metrics.json"), `${JSON.stringify({
  task: "feat-109",
  generatedAt: new Date().toISOString(),
  provider: PROVIDER,
  clipNames: CLIP_NAMES,
  profile: STAFF_CARRY_PROFILE,
  markers,
  metrics,
  temporaryBuild: build,
  publicAssetsUnchanged: JSON.stringify(before) === JSON.stringify(after),
  publicAssetsSha256: before,
}, null, 2)}\n`);
writeFileSync(join(HERE, "clip-samples.json"), `${JSON.stringify({ task: "feat-109", variant: "lite", units: "meters, model space (+Z = หน้าตัว)", samples: sampleTable }, null, 2)}\n`);
console.log(JSON.stringify({ metrics, publicAssetsUnchanged: JSON.stringify(before) === JSON.stringify(after), build }, null, 1));
