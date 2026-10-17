"use client";

import * as React from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  FURNITURE_COLOR_HEX,
  chairStyleOf,
  objectCenter,
  tableStyleOf,
  type Entrance,
  type FurnitureColor,
  type StoreLayout,
} from "@/core/layout";
import { AGENT_STRIDE } from "@/core/simulation";
import { getSimulationController } from "@/components/simulation/simulation-controller";

export interface ThreeViewProps {
  layout: StoreLayout;
  zoom: number;
  isSim: boolean;
  onUnavailable: () => void;
}

type CustomerAnimation = "Idle" | "Walk" | "Sit";

type AnimatedCustomer = {
  mixer: THREE.AnimationMixer;
  model: THREE.Object3D;
  target: THREE.Vector3;
  animation: CustomerAnimation;
};

/** สถานะของ renderer ที่อยู่ตลอดอายุ component — ผังเปลี่ยนแค่สร้าง `content` ใหม่ ไม่สร้าง WebGL context ใหม่ */
type Stage = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  key: THREE.DirectionalLight;
  content: THREE.Group | null;
  layout: StoreLayout | null;
  invalidate: () => void;
  resize: () => void;
  clearCustomers: () => void;
};

const MODEL_URL = "/assets/models/cafe-customer.glb";
const WALL_HEIGHT = 2.7;
const WALL_THICKNESS = 0.14;
const DOOR_HEIGHT = 2.1;
const CAMERA_TARGET_Y = 0.45;
const CUSTOMER_SCALE = 0.9;
/** state ของ agent ที่นั่งรอ/กิน (ดู AGENT_STRIDE ใน core/simulation) → ใช้ท่านั่งของมาสคอต */
const AGENT_STATE_SEATED = 4;
/** กัน animation กระโดดเมื่อ loop หยุดไปนาน (แท็บถูกซ่อน/หยุดวาดตอนไม่มีอะไรขยับ) */
const MAX_FRAME_DELTA = 1 / 30;

/** คลัง geometry/material ของฉากหนึ่งชุด — ใช้ซ้ำชิ้นที่ขนาดเท่ากัน และคืน GPU memory ได้ในครั้งเดียว */
class SceneAssets {
  private geometries = new Map<string, THREE.BufferGeometry>();
  private materials = new Map<string, THREE.Material>();

  geometry<T extends THREE.BufferGeometry>(key: string, create: () => T): T {
    let geometry = this.geometries.get(key);
    if (!geometry) {
      geometry = create();
      this.geometries.set(key, geometry);
    }
    return geometry as T;
  }

  box(w: number, h: number, d: number) {
    return this.geometry(`box:${w}:${h}:${d}`, () => new THREE.BoxGeometry(w, h, d));
  }

  cylinder(top: number, bottom: number, h: number, segments: number) {
    return this.geometry(`cyl:${top}:${bottom}:${h}:${segments}`, () => new THREE.CylinderGeometry(top, bottom, h, segments));
  }

  material(key: string, params: THREE.MeshStandardMaterialParameters) {
    let material = this.materials.get(key);
    if (!material) {
      material = new THREE.MeshStandardMaterial(params);
      this.materials.set(key, material);
    }
    return material;
  }

  dispose() {
    for (const geometry of this.geometries.values()) geometry.dispose();
    for (const material of this.materials.values()) material.dispose();
    this.geometries.clear();
    this.materials.clear();
  }
}

function placeMesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  x: number,
  y: number,
  z: number,
  { cast = true, receive = false }: { cast?: boolean; receive?: boolean } = {},
) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  return mesh;
}

function createRoom(group: THREE.Group, layout: StoreLayout, assets: SceneAssets) {
  const floor = placeMesh(
    assets.geometry(`plane:${layout.width}:${layout.depth}`, () => new THREE.PlaneGeometry(layout.width, layout.depth)),
    assets.material("floor", { color: "#f7f8fa", roughness: 0.94 }),
    layout.width / 2,
    0,
    layout.depth / 2,
    { cast: false, receive: true },
  );
  floor.rotation.x = -Math.PI / 2;
  group.add(floor);

  const wallMaterial = assets.material("wall", { color: "#ffffff", roughness: 0.88 });
  const entrance = layout.entrance;
  // ผนังเหนือ (z=0) / ตะวันตก (x=0) — ถ้ามีประตูบนผนังนั้น เจาะช่องเป็นผนังซ้าย/ขวา + ทับหลังเหนือประตู
  const addWall = (wall: "north" | "west", length: number) => {
    const piece = (from: number, to: number, y0: number, y1: number) => {
      const along = to - from;
      const height = y1 - y0;
      if (along <= 0.001 || height <= 0.001) return;
      const geometry =
        wall === "north" ? assets.box(along, height, WALL_THICKNESS) : assets.box(WALL_THICKNESS, height, along);
      const mid = (from + to) / 2;
      group.add(
        placeMesh(geometry, wallMaterial, wall === "north" ? mid : 0, (y0 + y1) / 2, wall === "north" ? 0 : mid, {
          cast: false,
          receive: true,
        }),
      );
    };
    if (entrance?.wall === wall) {
      const a = entrance.position;
      const b = Math.min(length, entrance.position + entrance.width);
      piece(0, a, 0, WALL_HEIGHT);
      piece(b, length, 0, WALL_HEIGHT);
      piece(a, b, DOOR_HEIGHT, WALL_HEIGHT);
    } else {
      piece(0, length, 0, WALL_HEIGHT);
    }
  };
  addWall("north", layout.width);
  addWall("west", layout.depth);
  if (entrance) group.add(createDoor(layout, entrance, assets));
}

/**
 * ประตูทางเข้าแบบมินิมอล: ช่องเปิดโล่ง มีแค่วงกบบางสีเทาเข้ม + ธรณีบาง ๆ (ไม่มีบานประตู)
 * ผนังใต้/ตะวันออกไม่ได้วาด (จะบังมุมกล้อง) จึงไม่มีวงกบ — แสดงแค่ธรณีบนพื้นให้รู้ตำแหน่งทางเข้า
 */
function createDoor(layout: StoreLayout, entrance: Entrance, assets: SceneAssets) {
  const frameMaterial = assets.material("metal", { color: "#3f4650", roughness: 0.5, metalness: 0.35 });
  const sillMaterial = assets.material("sill", { color: "#e3e7ee", roughness: 0.9 });

  const wallLength = entrance.wall === "north" || entrance.wall === "south" ? layout.width : layout.depth;
  const a = entrance.position;
  const b = Math.min(wallLength, entrance.position + entrance.width);
  const width = b - a;

  // สร้างในพิกัดท้องถิ่น: แกน x ตามแนวผนัง (0 → width), แกน z ชี้เข้าในห้อง แล้วค่อยหมุน/ย้ายไปวางบนผนังจริง
  const door = new THREE.Group();
  const frameW = 0.04;
  const frameD = WALL_THICKNESS + 0.02;
  const solid = { cast: true, receive: true };
  door.add(placeMesh(assets.box(width, 0.01, frameD), sillMaterial, width / 2, 0.005, 0, solid));
  if (entrance.wall === "north" || entrance.wall === "west") {
    const post = assets.box(frameW, DOOR_HEIGHT, frameD);
    door.add(
      placeMesh(post, frameMaterial, frameW / 2, DOOR_HEIGHT / 2, 0, solid),
      placeMesh(post, frameMaterial, width - frameW / 2, DOOR_HEIGHT / 2, 0, solid),
      placeMesh(assets.box(width, frameW, frameD), frameMaterial, width / 2, DOOR_HEIGHT - frameW / 2, 0, solid),
    );
  }

  // วางบนผนัง: north (z=0, เข้า +z), south (z=depth, เข้า −z), west (x=0, เข้า +x), east (x=width, เข้า −x)
  if (entrance.wall === "north") {
    door.position.set(a, 0, 0);
  } else if (entrance.wall === "south") {
    door.position.set(b, 0, layout.depth);
    door.rotation.y = Math.PI;
  } else if (entrance.wall === "west") {
    door.position.set(0, 0, b);
    door.rotation.y = Math.PI / 2;
  } else {
    door.position.set(layout.width, 0, a);
    door.rotation.y = -Math.PI / 2;
  }
  return door;
}

function createFurniture(group: THREE.Group, layout: StoreLayout, assets: SceneAssets) {
  const metal = assets.material("metal", { color: "#3f4650", roughness: 0.5, metalness: 0.35 });
  const furniture = (color: FurnitureColor) =>
    assets.material(`furniture:${color}`, {
      color: FURNITURE_COLOR_HEX[color],
      roughness: color === "oak" ? 0.62 : 0.72,
    });

  /** ขาสี่ขาที่มุม (กรอบ w × d) หรือขาเดี่ยวกลาง + ฐานกลม */
  const addLegs = (target: THREE.Group, kind: "four-legs" | "pedestal", w: number, d: number, height: number, round: boolean) => {
    if (kind === "pedestal") {
      const base = Math.min(w, d);
      target.add(
        placeMesh(assets.cylinder(0.04, 0.05, height, 16), metal, 0, height / 2, 0),
        placeMesh(assets.cylinder(base * 0.3, base * 0.32, 0.03, 24), metal, 0, 0.015, 0),
      );
      return;
    }
    // โต๊ะกลม: ขาอยู่ในวงกลม (แนวทแยง 45°) ไม่โผล่พ้นหน้าโต๊ะ
    const ox = round ? (w / 2) * 0.62 : w / 2 - 0.06;
    const oz = round ? (d / 2) * 0.62 : d / 2 - 0.06;
    const leg = assets.box(0.035, height, 0.035);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      target.add(placeMesh(leg, metal, sx * ox, height / 2, sz * oz));
    }
  };

  for (const item of layout.objects) {
    const object = new THREE.Group();
    const center = objectCenter(item);
    object.position.set(center.x, 0, center.y);
    object.rotation.y = THREE.MathUtils.degToRad(-item.rotation);

    if (item.type === "table") {
      const style = tableStyleOf(item);
      const round = style.shape === "round";
      const topHeight = 0.74;
      const top = round ? assets.cylinder(item.width / 2, item.width / 2, 0.04, 40) : assets.box(item.width, 0.04, item.depth);
      object.add(placeMesh(top, furniture(style.color), 0, topHeight, 0));
      addLegs(object, style.legStyle, item.width, item.depth, topHeight - 0.02, round);
    } else if (item.type === "chair") {
      const style = chairStyleOf(item);
      const seatHeight = 0.45;
      const seatW = item.width * 0.86;
      const seatD = item.depth * 0.86;
      const round = style.shape === "round";
      const seat = round ? assets.cylinder(seatW / 2, seatW / 2, 0.06, 40) : assets.box(seatW, 0.06, seatD);
      object.add(placeMesh(seat, furniture(style.color), 0, seatHeight, 0));
      addLegs(object, style.legStyle, seatW, seatD, seatHeight - 0.03, round);
      if (style.kind === "chair") {
        // ด้านหน้าของเก้าอี้ rotation 0 คือ −y (เหนือ) → พนักพิงอยู่ฝั่ง +z
        const backTop = seatHeight + 0.03;
        if (round) {
          // เบาะกลม: พนักพิงโค้งตามขอบหลังของเบาะ (แบบเก้าอี้คาเฟ่)
          object.add(placeMesh(curvedBackrest(assets, seatW / 2), furniture(style.color), 0, backTop, 0));
        } else {
          object.add(placeMesh(assets.box(seatW, 0.42, 0.05), furniture(style.color), 0, backTop + 0.21, seatD / 2 - 0.025));
        }
      }
    } else {
      const counter = item.type === "counter";
      const height = counter ? 1.05 : 1.15;
      const material = counter
        ? assets.material("counter", { color: "#f28c45", roughness: 0.72 })
        : assets.material("kitchen", { color: "#ffffff", roughness: 0.75 });
      object.add(placeMesh(assets.box(item.width, height, item.depth), material, 0, height / 2, 0, { cast: true, receive: true }));
    }
    group.add(object);
  }
}

/**
 * พนักพิงโค้งของเก้าอี้เบาะกลม: แผ่นวงแหวนกว้าง 140° หนา 3.5 ซม. สูง 38 ซม. ชิดขอบเบาะฝั่ง +z
 * วาดรูปบนระนาบ XY แล้ว extrude ตามแกน Z → หมุน −90° รอบแกน X ให้ความสูงตั้งขึ้น (shape y → world −z)
 */
function curvedBackrest(assets: SceneAssets, radius: number) {
  return assets.geometry(`backrest:${radius}`, () => {
    const thickness = 0.035;
    const height = 0.38;
    const span = THREE.MathUtils.degToRad(140);
    const start = -Math.PI / 2 - span / 2;
    const shape = new THREE.Shape();
    shape.absarc(0, 0, radius, start, start + span, false);
    shape.absarc(0, 0, radius - thickness, start + span, start, true);
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: height,
      curveSegments: 24,
      bevelEnabled: true,
      bevelThickness: 0.008,
      bevelSize: 0.008,
      bevelSegments: 2,
    });
    geometry.rotateX(-Math.PI / 2);
    return geometry;
  });
}

/** ฉากทั้งหมดที่มาจากผัง (พื้น ผนัง ประตู เฟอร์นิเจอร์) — `dispose` คืน GPU memory ของทุกชิ้น */
function buildLayoutContent(layout: StoreLayout) {
  const assets = new SceneAssets();
  const group = new THREE.Group();
  createRoom(group, layout, assets);
  createFurniture(group, layout, assets);
  group.userData.dispose = () => assets.dispose();
  return group;
}

function disposeContent(group: THREE.Group | null) {
  (group?.userData.dispose as (() => void) | undefined)?.();
}

/**
 * กล้องเงาค่าเริ่มต้นครอบแค่ ±5 ม. รอบ (0,0,0) = มุมร้าน → เงาวัตถุไกลมุมถูกตัดขาด
 * จึงเล็งไฟไปกลางร้าน และขยาย frustum ให้ครอบทั้งร้าน (2–30 ม.) ตามขนาดผัง
 */
function fitKeyLight(key: THREE.DirectionalLight, layout: StoreLayout) {
  const centerX = layout.width / 2;
  const centerZ = layout.depth / 2;
  const span = Math.hypot(layout.width, layout.depth) / 2 + 1;
  const reach = span / 5;
  key.position.set(centerX - 4 * reach, 8 * reach, centerZ + 5 * reach);
  key.target.position.set(centerX, 0, centerZ);
  key.target.updateMatrixWorld();
  const shadowCamera = key.shadow.camera;
  shadowCamera.left = -span;
  shadowCamera.right = span;
  shadowCamera.top = span;
  shadowCamera.bottom = -span;
  shadowCamera.near = 0.1;
  shadowCamera.far = span * 6;
  shadowCamera.updateProjectionMatrix();
}

/**
 * Orthographic isometric: ระยะเยื้องแกน X/Y/Z ต้องเท่ากัน จึงได้ azimuth 45° และ elevation 35.264°
 * แล้วฉายมุมห้อง (พื้น + ยอดผนัง) ลงพิกัดกล้อง ขยายด้านที่ขาดให้ตรงสัดส่วนจอ — เต็มจอทั้งแนวตั้งและแนวนอน
 */
function fitCamera(camera: THREE.OrthographicCamera, layout: StoreLayout, width: number, height: number) {
  const aspect = width / height;
  const targetX = layout.width / 2;
  const targetZ = layout.depth / 2;
  const isoDistance = Math.max(layout.width, layout.depth) * 1.6 + 1;
  camera.position.set(targetX + isoDistance, CAMERA_TARGET_Y + isoDistance, targetZ + isoDistance);
  camera.lookAt(targetX, CAMERA_TARGET_Y, targetZ);
  camera.updateMatrixWorld();

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const corner = new THREE.Vector3();
  for (const x of [0, layout.width]) {
    for (const z of [0, layout.depth]) {
      for (const y of [0, WALL_HEIGHT]) {
        corner.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
        minX = Math.min(minX, corner.x);
        maxX = Math.max(maxX, corner.x);
        minY = Math.min(minY, corner.y);
        maxY = Math.max(maxY, corner.y);
      }
    }
  }
  const pad = 0.06;
  let halfW = ((maxX - minX) / 2) * (1 + pad);
  let halfH = ((maxY - minY) / 2) * (1 + pad);
  if (halfW / halfH > aspect) halfH = halfW / aspect;
  else halfW = halfH * aspect;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  camera.left = cx - halfW;
  camera.right = cx + halfW;
  camera.top = cy + halfH;
  camera.bottom = cy - halfH;
  camera.far = isoDistance * 4;
  camera.updateProjectionMatrix();
}

const animationFor = (state: number): CustomerAnimation => (state === AGENT_STATE_SEATED ? "Sit" : "Walk");

/** มุมมอง WebGL แบบ lazy-loaded สำหรับ Playground เท่านั้น — SVG isometric เป็น fallback อยู่ที่ caller */
export function ThreeView({ layout, zoom, isSim, onUnavailable }: ThreeViewProps) {
  const hostRef = React.useRef<HTMLDivElement>(null);
  const stageRef = React.useRef<Stage | null>(null);
  // อ่านค่าล่าสุดใน render loop โดยไม่ต้องสร้าง renderer ใหม่เมื่อค่าเปลี่ยน
  const zoomRef = React.useRef(zoom);
  const isSimRef = React.useRef(isSim);

  // renderer / scene / loop: สร้างครั้งเดียวต่อการ mount (WebGL context มีจำกัดราว 16 ตัวต่อหน้า)
  React.useEffect(() => {
    const host = hostRef.current;
    if (!host || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      onUnavailable();
      return;
    }

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch {
      onUnavailable();
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.dataset.testid = "three-canvas";
    renderer.domElement.setAttribute("aria-hidden", "true");
    renderer.domElement.className = "h-full w-full";
    host.replaceChildren(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#f5f7fb");
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    const ambient = new THREE.HemisphereLight("#ffffff", "#d4d8df", 2.1);
    const key = new THREE.DirectionalLight("#fff1dc", 2.4);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.02;
    scene.add(ambient, key, key.target);

    const clock = new THREE.Clock(false);
    const customers = new Map<number, AnimatedCustomer>();
    const controller = getSimulationController();
    let modelTemplate: THREE.Object3D | null = null;
    let clips: THREE.AnimationClip[] = [];
    let frame = 0;
    let disposed = false;

    const playClip = (customer: Pick<AnimatedCustomer, "mixer">, name: CustomerAnimation) => {
      const clip = THREE.AnimationClip.findByName(clips, name) ?? clips[0];
      if (!clip) return;
      const action = customer.mixer.clipAction(clip).reset();
      if (name === "Sit") {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      action.play();
    };
    const removeCustomer = (id: number, customer: AnimatedCustomer) => {
      customer.mixer.stopAllAction();
      customer.mixer.uncacheRoot(customer.model);
      scene.remove(customer.model);
      customers.delete(id);
    };
    const clearCustomers = () => {
      for (const [id, customer] of customers) removeCustomer(id, customer);
    };

    const syncCustomers = () => {
      const current = controller.current;
      if (!modelTemplate || !current) return;
      const liveIds = new Set<number>();
      const { agents } = current;
      for (let offset = 0; offset < agents.length; offset += AGENT_STRIDE) {
        const id = agents[offset]!;
        const x = agents[offset + 1]!;
        const z = agents[offset + 2]!;
        const animation = animationFor(agents[offset + 3]!);
        liveIds.add(id);

        let customer = customers.get(id);
        if (!customer) {
          const model = modelTemplate.clone(true);
          model.position.set(x, 0, z);
          model.scale.setScalar(CUSTOMER_SCALE);
          scene.add(model);
          customer = { mixer: new THREE.AnimationMixer(model), model, target: new THREE.Vector3(x, 0, z), animation };
          playClip(customer, animation);
          customers.set(id, customer);
        }
        const dx = x - customer.target.x;
        const dz = z - customer.target.z;
        if (dx * dx + dz * dz > 0.0001) customer.model.rotation.y = Math.atan2(dx, dz);
        customer.target.set(x, 0, z);
        if (animation !== customer.animation) {
          customer.mixer.stopAllAction();
          playClip(customer, animation);
          customer.animation = animation;
        }
      }
      for (const [id, customer] of customers) {
        if (!liveIds.has(id)) removeCustomer(id, customer);
      }
    };

    // วาดตามต้องการ: ฉากนิ่งวาดเฟรมเดียวแล้วหยุด; ระหว่างจำลอง/มีลูกค้าค้างอยู่ loop ต่อเนื่อง
    const tick = () => {
      frame = 0;
      if (disposed) return;
      const delta = Math.min(clock.getDelta(), MAX_FRAME_DELTA);
      const simulating = isSimRef.current;
      if (simulating) syncCustomers();
      const blend = Math.min(1, delta * 14);
      for (const customer of customers.values()) {
        customer.mixer.update(delta);
        if (simulating) customer.model.position.lerp(customer.target, blend);
      }
      renderer.render(scene, camera);
      if (simulating || customers.size > 0) {
        frame = requestAnimationFrame(tick);
      } else {
        clock.stop();
      }
    };
    const invalidate = () => {
      if (disposed || frame) return;
      if (!clock.running) clock.start();
      frame = requestAnimationFrame(tick);
    };

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      renderer.setSize(width, height, false);
      if (stage.layout) fitCamera(camera, stage.layout, width, height);
      camera.zoom = zoomRef.current;
      camera.updateProjectionMatrix();
      // วาดทันที (ไม่รอ rAF) เพื่อไม่ให้ canvas ว่างกระพริบหลังเปลี่ยนขนาด
      renderer.render(scene, camera);
    };
    const stage: Stage = { renderer, scene, camera, key, content: null, layout: null, invalidate, resize, clearCustomers };
    stageRef.current = stage;
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    const loader = new GLTFLoader();
    loader.load(
      MODEL_URL,
      (gltf) => {
        if (disposed) return;
        gltf.scene.traverse((object) => {
          if (object instanceof THREE.Mesh) object.castShadow = true;
        });
        modelTemplate = gltf.scene;
        clips = gltf.animations;
        invalidate();
      },
      undefined,
      () => {
        if (!disposed) onUnavailable();
      },
    );

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      clearCustomers();
      disposeContent(stage.content);
      // geometry/material ของโมเดลถูกแชร์ระหว่าง clone ทุกตัว — คืนครั้งเดียวที่ template
      modelTemplate?.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        for (const material of [object.material].flat()) material.dispose();
      });
      key.shadow.map?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      stageRef.current = null;
    };
  }, [onUnavailable]);

  // ผังเปลี่ยน → สร้างเฉพาะเนื้อหาฉากใหม่ และคืน GPU memory ของชุดเดิม
  React.useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const content = buildLayoutContent(layout);
    if (stage.content) {
      stage.scene.remove(stage.content);
      disposeContent(stage.content);
    }
    stage.scene.add(content);
    stage.content = content;
    const sizeChanged = stage.layout?.width !== layout.width || stage.layout?.depth !== layout.depth;
    stage.layout = layout;
    if (sizeChanged) {
      fitKeyLight(stage.key, layout);
      stage.resize();
    }
    stage.invalidate();
  }, [layout]);

  React.useEffect(() => {
    isSimRef.current = isSim;
    const stage = stageRef.current;
    if (!stage) return;
    if (!isSim) stage.clearCustomers();
    stage.invalidate();
  }, [isSim]);

  // ซูมผ่านกล้อง (ไม่ใช้ CSS scale) เพื่อให้ภาพยังอยู่ในกรอบ Canvas เต็มพื้นที่
  React.useEffect(() => {
    zoomRef.current = zoom;
    const stage = stageRef.current;
    if (!stage) return;
    stage.camera.zoom = zoom;
    stage.camera.updateProjectionMatrix();
    stage.invalidate();
  }, [zoom]);

  return (
    <figure
      className="relative m-0 h-full min-h-[260px] w-full max-[767px]:min-h-[160px] overflow-hidden rounded-[20px]"
      aria-label={`มุมมองร้าน 3 มิติ ขนาด ${layout.width} × ${layout.depth} เมตร`}
      data-testid="three-view"
    >
      <div ref={hostRef} className="absolute inset-0" />
    </figure>
  );
}
