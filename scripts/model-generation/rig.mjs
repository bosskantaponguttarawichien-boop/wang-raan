import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/** Build one fresh rig. Importing this module performs no I/O. */
export async function createCharacterRig({ role, lite = false }) {
  const STAFF = role === "staff";
  const LITE = lite;
  // สีชุดพนักงาน: เขียวเข้มต่างจากสีเฟอร์นิเจอร์และเสื้อลูกค้า มองจากมุมสูงในฉากร้านก็แยกออก
  const UNIFORM_COLOR = "#2f5e47";
  // สีตามหมวดชิ้น (_part จาก build-cafe-customer-mesh.py): ผิว, เสื้อ, กางเกง, รองเท้า, พื้นรองเท้า, ผม (+ ขอบคอเสื้อ)
  const PALETTE = {
    skin: "#d9ab86",
    shirt: STAFF ? UNIFORM_COLOR : "#c9d2de",
    pants: "#3d5a86",
    shoe: "#eef0f3",
    sole: "#c4c8cf",
    hair: "#33261d",
  };
  // ขอบยางคอเสื้อ: สีเดียวกับเสื้อแต่เข้มลงนิดให้เห็นเป็นขอบ
  const RIB_COLOR = new THREE.Color(PALETTE.shirt).multiplyScalar(0.86);
  const PART_COLORS = [PALETTE.skin, PALETTE.shirt, PALETTE.pants, PALETTE.shoe, PALETTE.sole, PALETTE.hair].map((hex) => new THREE.Color(hex)).concat(RIB_COLOR);
  // สีมาจาก vertex color ทั้งตัว จึงตั้งสีวัสดุเป็นขาว
  const mannequin = new THREE.MeshStandardMaterial({ color: "#ffffff", vertexColors: true, roughness: 0.84, metalness: 0 });

  // ฉากร้านเห็นตัวละครเล็กกว่ามาก แต่มีพร้อมกันหลายสิบตัว (×2 รอบรวมเงา) → ใช้ผิวที่เกลาน้อยกว่า
  const meshFile = new URL(LITE ? "../blender/cafe-customer-mesh-lite.glb" : "../blender/cafe-customer-mesh.glb", import.meta.url);

  function bone(name, position) {
    const part = new THREE.Bone();
    part.name = name;
    part.position.set(...position);
    return part;
  }

  const model = new THREE.Group();
  model.name = "CafeMannequin";

  // Shoulder → elbow → wrist, hip → knee → ankle. ตำแหน่งข้อต่อ (ตำแหน่งจริงในโมเดล) ต้องตรงกับ JOINTS
  // ใน build-cafe-customer-mesh.py — ผิวจาก Blender ผูกน้ำหนักไว้กับข้อต่อชุดนั้น; ศอก ข้อมือ เข่า อยู่ตรงรอยต่อตุ๊กตา
  const ANKLE_Y = 0.08;
  const THIGH = 0.39;
  const SHIN = 0.41;
  // ข้อสะโพกต่ำกว่ากระดูก Hips (กลางเชิงกราน)
  const LEG_DROP = 0.04;
  const HIPS_Y = ANKLE_Y + SHIN + THIGH + LEG_DROP;
  const hips = bone("Hips", [0, HIPS_Y, 0]);
  const spine = bone("Spine", [0, 0.13, 0]);
  const neck = bone("Neck", [0, 0.35, 0]);
  const head = bone("Head", [0, 0.1, 0]);
  const leftArm = bone("LeftArm", [-0.175, 0.305, 0]);
  const rightArm = bone("RightArm", [0.175, 0.305, 0]);
  const leftForeArm = bone("LeftForeArm", [-0.023, -0.29, 0]);
  const rightForeArm = bone("RightForeArm", [0.023, -0.29, 0]);
  const leftHand = bone("LeftHand", [-0.012, -0.25, 0]);
  const rightHand = bone("RightHand", [0.012, -0.25, 0]);
  const leftLeg = bone("LeftLeg", [-0.09, -LEG_DROP, 0]);
  const rightLeg = bone("RightLeg", [0.09, -LEG_DROP, 0]);
  const leftLowerLeg = bone("LeftLowerLeg", [-0.005, -THIGH, 0]);
  const rightLowerLeg = bone("RightLowerLeg", [0.005, -THIGH, 0]);
  const leftFoot = bone("LeftFoot", [0, -SHIN, 0]);
  const rightFoot = bone("RightFoot", [0, -SHIN, 0]);

  model.add(hips);
  hips.add(spine, leftLeg, rightLeg);
  spine.add(neck, leftArm, rightArm);
  neck.add(head);
  leftArm.add(leftForeArm);
  rightArm.add(rightForeArm);
  leftForeArm.add(leftHand);
  rightForeArm.add(rightHand);
  leftLeg.add(leftLowerLeg);
  rightLeg.add(rightLowerLeg);
  leftLowerLeg.add(leftFoot);
  rightLowerLeg.add(rightFoot);
  model.updateMatrixWorld(true);

  const bones = [
    hips, spine, neck, head,
    leftArm, rightArm, leftForeArm, rightForeArm, leftHand, rightHand,
    leftLeg, rightLeg, leftLowerLeg, rightLowerLeg, leftFoot, rightFoot,
  ];
  const boneIndex = new Map(bones.map((part, index) => [part, index]));

  // ---- ผิว: ปั้นใน Blender (scripts/blender/build-cafe-customer-mesh.py) แล้วผูกกับโครงกระดูกชุดนี้ ----
  // ไฟล์จาก Blender มีกระดูกชื่อและตำแหน่งเดียวกัน — ใช้แค่ตำแหน่งผิว normal และน้ำหนักผิว แล้วจับคู่กระดูกตามชื่อ
  const meshBytes = await readFile(meshFile);
  const source = await new GLTFLoader().parseAsync(meshBytes.buffer.slice(meshBytes.byteOffset, meshBytes.byteOffset + meshBytes.byteLength), "");
  let sourceMesh = null;
  source.scene.traverse((object) => {
    if (object.isSkinnedMesh) sourceMesh = object;
  });
  if (!sourceMesh) throw new Error(`ไม่พบผิวที่ผูกกระดูกใน ${meshFile.pathname}`);
  const boneByName = new Map(bones.map((part) => [part.name, part]));
  const remap = sourceMesh.skeleton.bones.map((part) => {
    const target = boneByName.get(part.name);
    if (!target) throw new Error(`กระดูก ${part.name} จาก Blender ไม่มีในโครงกระดูกของ mannequin`);
    return boneIndex.get(target);
  });
  const geometry = new THREE.BufferGeometry();
  for (const name of ["position", "normal"]) geometry.setAttribute(name, sourceMesh.geometry.getAttribute(name).clone());
  geometry.setIndex(sourceMesh.geometry.getIndex().clone());
  const sourceJoints = sourceMesh.geometry.getAttribute("skinIndex");
  const sourceWeights = sourceMesh.geometry.getAttribute("skinWeight");
  const skinIndices = new Uint16Array(sourceJoints.count * 4);
  const skinWeights = new Float32Array(sourceJoints.count * 4);
  for (let i = 0; i < sourceJoints.count; i += 1) {
    let total = 0;
    for (let slot = 0; slot < 4; slot += 1) total += sourceWeights.getComponent(i, slot);
    for (let slot = 0; slot < 4; slot += 1) {
      skinIndices[i * 4 + slot] = remap[sourceJoints.getComponent(i, slot)];
      skinWeights[i * 4 + slot] = total > 0 ? sourceWeights.getComponent(i, slot) / total : slot === 0 ? 1 : 0;
    }
  }
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIndices, 4));
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinWeights, 4));
  const position = geometry.getAttribute("position");

  const body = new THREE.SkinnedMesh(geometry, mannequin);
  body.name = "MannequinBody";
  body.castShadow = true;
  body.receiveShadow = true;
  model.add(body);
  model.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  body.bind(skeleton);

  // ---- สีเสื้อผ้า: แต่ละชิ้นจาก Blender มีหมวดเดียวทั้งชิ้น เส้นแบ่งสีจึงคมตรงชายเสื้อ/ปลายแขนเสื้อ/ปลายขากางเกง
  // สีมีไม่กี่ค่า → เก็บช่องละ 8 บิต (normalized) แทน float 32 บิต ไฟล์เล็กลงโดยสีไม่ต่างกันให้เห็น
  const sourcePart = sourceMesh.geometry.getAttribute("_part");
  if (!sourcePart) throw new Error(`ไม่พบหมวดชิ้น (_part) ใน ${meshFile.pathname} — รัน build-cafe-customer-mesh.py ใหม่`);
  const colors = new Uint8Array(position.count * 3);
  for (let i = 0; i < position.count; i += 1) {
    const color = PART_COLORS[Math.round(sourcePart.getX(i))] ?? PART_COLORS[0];
    colors.set([color.r, color.g, color.b].map((channel) => Math.round(channel * 255)), i * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3, true));
  // หมวดชิ้นส่งออกไปด้วย (attribute "_part" ใน glTF) — ฉากร้านใช้สุ่มสีเสื้อผ้า/ผม/ผิวของลูกค้าแต่ละคน
  geometry.setAttribute("part", new THREE.BufferAttribute(Uint8Array.from({ length: position.count }, (_, i) => Math.round(sourcePart.getX(i))), 1));

  if (STAFF) {
    // ---- หมวกแก๊ป 6 ชิ้นผ้า: โดมครอบหัวตามเงา HEAD_PROFILE ใน blockout-cafe-customer.py — หน้าสูงเต็ม ท้ายลาดต่ำลงท้ายทอย,
    // ตะเข็บ 6 เส้น + กระดุมบนยอด, ปีกหมวกโค้งทั้งแนวยาวและแนวขวาง หนาขึ้นที่โคน ใต้ปีกสีเข้ม
    const HEAD_DEPTH = 1.18;
    const HEAD_FORWARD = 0.012;
    const CAP_COLOR = new THREE.Color(UNIFORM_COLOR);
    const SEAM_COLOR = CAP_COLOR.clone().multiplyScalar(0.8);
    const UNDER_BRIM_COLOR = CAP_COLOR.clone().multiplyScalar(0.5);
    const crown = [[1.612, 0.086], [1.625, 0.0857], [1.64, 0.084], [1.655, 0.081], [1.672, 0.072], [1.686, 0.058], [1.695, 0.037], [1.7, 0]];
    // ขอบหมวกรัดแนบหัว (ห่างผิว 1.2 ซม. พอทับผมบาง ๆ ตรงขอบ) แล้วค่อยพองขึ้นครอบผมกลางกระหม่อม (~2.2 ซม. — ผมด้านบนพองตามแสก)
    const profile = crown.map(([y, r]) => {
      const t = Math.min(1, Math.max(0, (y - 1.612) / 0.06));
      const offset = 0.012 + 0.01 * t * t * (3 - 2 * t);
      return [r > 0 ? r + offset : 0, y + 0.004 + 0.017 * t];
    });
    const profileAt = (t) => {
      const f = t * (profile.length - 1);
      const i = Math.min(profile.length - 2, Math.floor(f));
      const k = f - i;
      return [profile[i][0] + (profile[i + 1][0] - profile[i][0]) * k, profile[i][1] + (profile[i + 1][1] - profile[i][1]) * k];
    };
    /** จุดบนโดม: θ รอบหัว (0 = หน้า, + = ไปทาง +x), t จากขอบหมวก (0) ถึงยอด (1) */
    const crownPoint = (theta, t, lift = 0) => {
      const [r0, y0] = profileAt(t);
      const back = (1 - Math.cos(theta)) / 2;
      // ชิ้นหน้าพองตั้ง (มีแผ่นรองด้านใน), ขอบหมวกด้านหลังลดลงคลุมท้ายทอย
      const r = r0 * (1 + 0.035 * Math.max(0, Math.cos(theta)) ** 2 * Math.sin(Math.PI * Math.min(1, t * 1.2))) + lift;
      const y = y0 - 0.016 * back * (1 - t) ** 2 + lift * t;
      return new THREE.Vector3(r * Math.sin(theta), y, r * Math.cos(theta) * HEAD_DEPTH + HEAD_FORWARD);
    };
    const colored = (geometry, color) => {
      const count = geometry.getAttribute("position").count;
      geometry.setAttribute("color", new THREE.Float32BufferAttribute(Array.from({ length: count }, () => [color.r, color.g, color.b]).flat(), 3));
      if (geometry.getAttribute("uv")) geometry.deleteAttribute("uv");
      return geometry;
    };
    /** ตาข่ายจาก grid[แถว][คอลัมน์] (คอลัมน์วนรอบถ้า wrap) — ด้านหน้าผิวตามลำดับ (แถว↓, คอลัมน์→) */
    const gridGeometry = (grid, wrap, flip = false) => {
      const rows = grid.length;
      const cols = grid[0].length;
      const positions = grid.flat().flatMap((point) => point.toArray());
      const index = [];
      for (let r = 0; r < rows - 1; r += 1) {
        for (let c = 0; c < (wrap ? cols : cols - 1); c += 1) {
          const a = r * cols + c;
          const b = r * cols + ((c + 1) % cols);
          const d = (r + 1) * cols + c;
          const e = (r + 1) * cols + ((c + 1) % cols);
          index.push(...(flip ? [a, d, b, b, d, e] : [a, b, d, b, e, d]));
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geometry.setIndex(index);
      geometry.computeVertexNormals();
      return geometry;
    };

    // โดม: วงจากขอบล่างขึ้นยอด (วงสุดท้ายยุบเป็นจุดยอด) + ขอบล่างพับเข้า (หนาแบบผ้า)
    const around = LITE ? 18 : 36;
    const rows = LITE ? 7 : 14;
    const thetas = Array.from({ length: around }, (_, i) => (2 * Math.PI * i) / around);
    const crownGrid = [thetas.map((theta) => crownPoint(theta, 0, -0.004).add(new THREE.Vector3(0, -0.003, 0)))];
    for (let row = 0; row <= rows; row += 1) crownGrid.push(thetas.map((theta) => crownPoint(theta, row / rows)));
    const capParts = [colored(gridGeometry(crownGrid, true), CAP_COLOR)];
    // สายปรับขนาดด้านหลัง: แถบผ้าโค้งตามขอบหมวกเหนือท้ายทอย + หัวเข็มขัดเล็ก ๆ
    const strapRows = [0.015, 0.11].map((t) =>
      Array.from({ length: 9 }, (_, i) => crownPoint(Math.PI - 0.38 + (0.76 * i) / 8, t, 0.0016)));
    capParts.push(colored(gridGeometry(strapRows, false), SEAM_COLOR));
    const buckle = new THREE.BoxGeometry(0.014, 0.011, 0.003);
    buckle.translate(0, 0, -0.0015);
    const buckleAt = crownPoint(Math.PI + 0.14, 0.06, 0.003);
    buckle.lookAt(new THREE.Vector3(buckleAt.x, 0, buckleAt.z - HEAD_FORWARD).normalize().negate());
    buckle.translate(...buckleAt.toArray());
    capParts.push(colored(buckle, new THREE.Color("#b8bcc2")));

    // ตะเข็บ 6 เส้น (หน้ากลาง, ±60°, ±120°, หลังกลาง) + กระดุมยอดหมวก — เห็นตอนซูมใกล้, รุ่นเบาไม่ต้องมี
    if (!LITE) {
      for (let k = 0; k < 6; k += 1) {
        const theta = (k * Math.PI) / 3;
        const path = new THREE.CatmullRomCurve3(Array.from({ length: 9 }, (_, i) => crownPoint(theta, 0.04 + (0.9 * i) / 8, 0.0008)));
        capParts.push(colored(new THREE.TubeGeometry(path, 16, 0.0014, 4, false), SEAM_COLOR));
      }
      const button = new THREE.SphereGeometry(0.0075, 12, 6);
      button.scale(1, 0.45, 1);
      button.translate(...crownPoint(0, 1).toArray());
      capParts.push(colored(button, CAP_COLOR));
    }

    // ปีกหมวก: ขอบในตามแนวขอบหมวกด้านหน้า (±68°), ขอบนอกรูปตัว D ยื่น ~7 ซม.
    // โค้งลงทั้งปลายปีก (~10°) และขอบซ้าย-ขวา (ดัดโค้งแบบแก๊ปที่ใส่จริง), หนา 6 → 4.5 มม.
    const across = LITE ? 8 : 16;
    const along = LITE ? 3 : 6;
    const bandFront = crownPoint(0, 0);
    const brimTop = [];
    const brimBottom = [];
    for (let j = 0; j <= along; j += 1) {
      const v = j / along;
      const topRow = [];
      const bottomRow = [];
      for (let i = 0; i <= across; i += 1) {
        const u = (i / across) * 2 - 1;
        const inner = crownPoint(u * THREE.MathUtils.degToRad(68), 0, 0.001);
        const alpha = u * (Math.PI / 2);
        const outer = new THREE.Vector3(0.093 * Math.sin(alpha), inner.y, bandFront.z - 0.004 + 0.07 * Math.cos(alpha) ** 0.85);
        const top = inner.clone().lerp(outer, v);
        top.y = inner.y - 0.012 * v ** 1.2 - 0.02 * u * u * v ** 0.9;
        topRow.push(top);
        bottomRow.push(top.clone().add(new THREE.Vector3(0, -(0.006 - 0.0015 * v), 0)));
      }
      brimTop.push(topRow);
      brimBottom.push(bottomRow);
    }
    capParts.push(colored(gridGeometry(brimTop, false, true), CAP_COLOR));
    capParts.push(colored(gridGeometry(brimBottom, false), UNDER_BRIM_COLOR));
    // ขอบปีก: ปลายหน้า + สองข้าง (เห็นความหนา)
    const edge = [...brimTop.map((row) => row[0]).reverse(), ...brimTop[along], ...brimTop.map((row) => row[across])];
    const edgeBottom = [...brimBottom.map((row) => row[0]).reverse(), ...brimBottom[along], ...brimBottom.map((row) => row[across])];
    capParts.push(colored(gridGeometry([edge, edgeBottom], false, true), CAP_COLOR));

    const capGeometry = mergeGeometries(capParts);
    // หมวกแข็งทั้งใบ → เป็น mesh ธรรมดาลูกของกระดูก Head ไม่ต้องเก็บน้ำหนักผิวทุกจุด
    capGeometry.translate(...head.getWorldPosition(new THREE.Vector3()).negate().toArray());
    const cap = new THREE.Mesh(capGeometry, new THREE.MeshStandardMaterial({ color: "#ffffff", vertexColors: true, roughness: 0.82, metalness: 0 }));
    cap.name = "StaffCap";
    cap.castShadow = true;
    head.add(cap);
  }
  return {
    model, bones: boneByName,
    dimensions: { ANKLE_Y, THIGH, SHIN, LEG_DROP, HIPS_Y },
    vertexCount: position.count, triangleCount: geometry.getIndex().count / 3,
  };
}
