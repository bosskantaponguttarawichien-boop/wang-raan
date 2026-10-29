"use client";

import * as React from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import {
  FURNITURE_COLOR_HEX,
  chairStyleOf,
  counterStyleOf,
  objectCenter,
  tableStyleOf,
  type CounterStyle,
  type FurnitureColor,
  type StoreLayout,
  type WallDoor,
} from "@/core/layout";
import { AGENT_STRIDE, STAFF_STATE_CODE, STAFF_STRIDE } from "@/core/simulation";
import { STAFF_KITCHEN_CODE } from "@/components/simulation/staff-pacer";
import { farWalls, vectorFromView, type ViewRotation } from "@/core/preview/view-rotation";
import { staffSpots } from "@/core/preview/staff-spots";
import {
  CHAIR_PULL,
  createChairSlide,
  releaseChair,
  startRise,
  startSeat,
  stepChair,
  stepSeat,
  type ChairSlide,
  type SeatMotion,
} from "./seat-motion";
import { CHARACTER_HEIGHT, CHARACTER_MODELS, CHARACTER_SCALE, customerLook } from "./character-models";
import { AdaptiveQuality, QUALITY_LEVELS } from "./adaptive-quality";
import { createCharacterLoader } from "./character-loader";
import { createLegacyLighting } from "./runtime/legacy-lighting";
import { createLegacyServingProps } from "./runtime/legacy-serving-props";
import { createSceneRuntime, type SceneRuntime } from "./runtime/scene-runtime";
import { FrameClock } from "./runtime/frame-clock";
import { createSceneFeatureFactories, type SceneFeatureHandles } from "./runtime/scene-features";
import type { StaffRig } from "./staff-actions/contracts";
import type { CustomerRig } from "./customer-actions/contracts";
import type { ChairRig as SeatingChairRig } from "./seating/contracts";
import { getSimulationController } from "@/components/simulation/simulation-controller";
import { simulationStore } from "@/store/use-simulation-store";
import { OUTSIDE_DISTANCE, doorFrame } from "@/components/simulation/walk-pacer";

export interface ThreeViewProps {
  layout: StoreLayout;
  zoom: number;
  /** หมุนมุมมองทีละ 90° — กล้องย้ายไปมุมใหม่ และวาดผนังเฉพาะ 2 ด้านที่ไกลกล้อง */
  viewRotation?: ViewRotation;
  isSim: boolean;
  /** จำลองอยู่แต่กดหยุดชั่วคราว — ลูกค้าค้างอยู่ในร้าน วาดช้าลงได้ */
  simPaused?: boolean;
  onUnavailable: () => void;
}

type CustomerAnimation = "Idle" | "Walk" | "Sit";
/** ระยะเลื่อนตัวที่นั่งไปทางหน้าเก้าอี้ — ติดลบ = ถอยข้อสะโพกไปหลังกลางเบาะ ให้หลังชิดพนักพิง (ไม่จม) */
const SEATED_FRONT_OFFSET = -0.04;
/**
 * เลื่อนตัวที่นั่งเข้าหาโต๊ะได้มากสุดเท่านี้ (ม.) เพื่อให้คลิป Eat เอื้อมถึงจานจริง
 * เท่ากับระยะที่เก้าอี้สอดใต้โต๊ะได้ (CLEARANCE.chairTuckMax) จึงไม่ดันตัวทะลุขอบโต๊ะ
 */
const MAX_SEAT_REACH_SHIFT = 0.1;

type AnimatedCustomer = {
  mixer: THREE.AnimationMixer;
  action: THREE.AnimationAction | null;
  /** วินาทีที่เหลือของท่าลุกจากเก้าอี้ — ระหว่างนี้ยืนอยู่ที่เก้าอี้ ยังไม่เดินตามจุดจำลอง */
  standingUp: number;
  model: THREE.Object3D;
  body: THREE.SkinnedMesh | null;
  target: THREE.Vector3;
  animation: CustomerAnimation;
  targetRotation: number;
  /** วินาทีที่ยืนนิ่ง (ต่อคิว/รอ) ต่อเนื่อง — นานพอจะเปลี่ยนจากท่าเดินค้างเป็นท่ายืนรอ */
  still: number;
  /** เหลื่อมจังหวะท่ายืนรอ ไม่ให้ลูกค้าที่ต่อคิวขยับพร้อมกัน (วินาที) */
  idleOffset: number;
  /** กำลังนั่ง/ลุกจากเก้าอี้ (ดึงเก้าอี้ออก–เข้า) — ระหว่างนี้ตำแหน่งตามเก้าอี้ ไม่ตามจุดจำลอง */
  seat: { motion: SeatMotion; chair: ChairRig } | null;
};

/** เก้าอี้ในฉาก 3D ที่เลื่อนออก/เข้าได้ */
type ChairRig = {
  object: THREE.Object3D;
  /** ตำแหน่งในผัง */
  home: THREE.Vector3;
  /** ทิศออกจากโต๊ะ (ฝั่งพนักพิง) ความยาว 1 */
  out: THREE.Vector3;
  slide: ChairSlide;
};

/** สถานะของ renderer ที่อยู่ตลอดอายุ component — ผังเปลี่ยนโดยไม่สร้าง WebGL context ใหม่ */
type Stage = {
  renderer: THREE.WebGLRenderer;
  runtime: SceneRuntime;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  key: THREE.DirectionalLight;
  /** พื้นเป็นชั้นคงที่ ไม่ควรเฟดพร้อมกำแพงระหว่างหมุน */
  floor: THREE.Group | null;
  /** ผนังและวงกบชุดเดียวตลอดอายุฉาก — ปรับเฉพาะความทึบของแต่ละด้านตอนหมุน */
  room: THREE.Group | null;
  /** โต๊ะ เก้าอี้ และเคาน์เตอร์ — คงชุดเดิมไว้ระหว่างหมุนมุมมอง */
  furniture: THREE.Group | null;
  layout: StoreLayout | null;
  viewRotation: ViewRotation;
  invalidate: () => void;
  resize: () => void;
  clearCustomers: () => void;
  /** วางพนักงานหลังเคาน์เตอร์ใหม่ตามผังปัจจุบัน */
  syncStaff: () => void;
  /** เลื่อนกล้องไปยังมุมมองใหม่ โดยเริ่มจากตำแหน่งที่แสดงอยู่จริง (รองรับการกดหมุนซ้ำระหว่างทาง) */
  animateCamera: () => void;
  /** อัปเดต transition ของกล้องหนึ่งเฟรม และบอกว่ายังต้องวาดต่อหรือไม่ */
  updateCamera: (now: number) => boolean;
  /** แทนฉากทั้งชุดเมื่อผังแก้ไขจริง (ขนาด/วัตถุ/ประตูเปลี่ยน) */
  replaceContent: (
    floor: THREE.Group,
    room: THREE.Group,
    furniture: THREE.Group,
  ) => void;
  /** เปลี่ยนความทึบรายผนัง/วงกบไปยังมุมใหม่ โดยไม่สร้าง geometry เพิ่ม */
  animateRoom: (nextView: ViewRotation) => void;
  /** อัปเดต transition ของกำแพงหนึ่งเฟรม และบอกว่ายังต้องวาดต่อหรือไม่ */
  updateRoomTransition: (now: number) => boolean;
};

/** ค่ากล้องที่ต้องเปลี่ยนพร้อมกัน เพื่อไม่ให้ภาพกระโดดเมื่อเปลี่ยนมุม isometric */
type CameraFrame = {
  position: THREE.Vector3;
  left: number;
  right: number;
  top: number;
  bottom: number;
  far: number;
  zoom: number;
};

type CameraMotion = {
  from: CameraFrame;
  to: CameraFrame;
  centerX: number;
  centerZ: number;
  fromAngle: number;
  angleDelta: number;
  fromRadius: number;
  toRadius: number;
  startedAt: number;
};

type RoomOpacity = Map<WallDoor["wall"], number>;

type RoomMotion = {
  from: RoomOpacity;
  to: RoomOpacity;
  startedAt: number;
};

type StandingStaff = {
  /** id ของพนักงานตาม buffer/snapshot (ไม่ใช่ลำดับใน array) */
  staffId: number;
  mixer: THREE.AnimationMixer;
  model: THREE.Object3D;
  body: THREE.SkinnedMesh | null;
  /** ระหว่างจำลอง: ตำแหน่งจาก simulation (null = ยืนประจำหลังเคาน์เตอร์ ไม่ขยับ) */
  target: THREE.Vector3 | null;
  targetRotation: number;
  animation: "Walk" | "Work";
  action: THREE.AnimationAction | null;
  /** ถาดอาหาร (ถาด + จาน) ในมือ — แสดงตอนเดินจากครัวไปเสิร์ฟ */
  tray: THREE.Object3D | null;
};

/**
 * โมเดลหนึ่งบทบาท: template (รุ่นเบา) ไว้ clone + ผิวรุ่นละเอียดที่โหลดทีหลังเมื่อซูมใกล้
 * สองไฟล์ใช้โครงกระดูก/animation ชุดเดียวกัน จึงสลับแค่ geometry ของผิว
 */
type CharacterAsset = {
  urls: { full: string; lite: string };
  template: THREE.Object3D | null;
  liteBody: THREE.BufferGeometry | null;
  fullBody: THREE.BufferGeometry | null;
  fullScene: THREE.Object3D | null;
  fullRequested: boolean;
  clips: THREE.AnimationClip[];
  /** ความเร็วเดินตามท่า Walk (ระยะต่อรอบ / เวลาต่อรอบ) — ใช้เดินเท้าไม่ไถลบนพื้น */
  walkSpeed: number;
  /** ระยะที่เดินได้ต่อหนึ่งรอบคลิป Walk (ม.) หลังคูณ scale — feature ใช้ตั้ง timeScale */
  walkCycleDistance: number;
  /** animationMarkers ที่ฝังมากับ GLB — อ่าน marker เป็น normalized time ไม่ใช้ callback ของ mixer */
  markers: Record<string, { name: string; time: number }[]>;
};

/**
 * เงาของตัวละครวาดจากผิวรุ่นเบาเสมอ (ภาพยังใช้รุ่นละเอียดตอนซูมใกล้) — ตัวแทนเงาใช้โครงกระดูกเดียวกับผิวจริง
 * three วาดเงาด้วย geometry ของ object เอง จึงทำ object แยก: รอบวาดเงา (ก่อนรอบภาพทุกเฟรม) วาดเต็ม,
 * รอบวาดภาพตั้ง drawRange เป็น 0 ใน onBeforeRender แล้วคืนค่าหลังวาด — ไม่ต้องคำนวณจุดซ้ำในรอบภาพ
 * geometry ของตัวแทนเงาใช้ร่วมกันทุกตัวของโมเดลเดียวกัน (shadowGeometry) — attribute/index ชุดเดิมของรุ่นเบา
 * ไม่กินหน่วยความจำ GPU เพิ่ม และห้าม dispose เอง (จะลบ buffer ของรุ่นเบาไปด้วย)
 */
const shadowGeometries = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();
function shadowGeometry(liteGeometry: THREE.BufferGeometry) {
  let geometry = shadowGeometries.get(liteGeometry);
  if (!geometry) {
    geometry = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(liteGeometry.attributes)) geometry.setAttribute(name, attribute);
    geometry.setIndex(liteGeometry.index);
    shadowGeometries.set(liteGeometry, geometry);
  }
  return geometry;
}

function attachShadowProxy(body: THREE.SkinnedMesh, liteGeometry: THREE.BufferGeometry, castShadow: boolean) {
  const geometry = shadowGeometry(liteGeometry);
  const proxy = new THREE.SkinnedMesh(geometry, body.material);
  proxy.name = "ShadowProxy";
  proxy.bind(body.skeleton, body.bindMatrix);
  proxy.castShadow = castShadow;
  proxy.receiveShadow = false;
  // ผิวขยับตามท่า bounding sphere ตอนยืนไม่ครอบท่าเดิน/นั่ง — ไม่ตัดทิ้งเอง (เป็นแค่เงา)
  proxy.frustumCulled = false;
  proxy.onBeforeRender = () => geometry.setDrawRange(0, 0);
  proxy.onAfterRender = () => geometry.setDrawRange(0, Infinity);
  body.castShadow = false;
  body.parent?.add(proxy);
  proxy.position.copy(body.position);
  proxy.quaternion.copy(body.quaternion);
  proxy.scale.copy(body.scale);
  return proxy;
}

const characterAsset = (urls: { full: string; lite: string }): CharacterAsset => ({
  urls, template: null, liteBody: null, fullBody: null, fullScene: null, fullRequested: false, clips: [], walkSpeed: 0.44,
  walkCycleDistance: 0.9 * CHARACTER_SCALE, markers: {},
});

/** พนักงานเคลื่อนเร็วกว่านี้ (ม./วิ) เล่นท่าเดิน ไม่งั้นเล่นท่าทำงาน (รับออร์เดอร์/เก็บโต๊ะ/ที่เคาน์เตอร์) */
const STAFF_WALK_MIN_SPEED = 0.15;
/** ถาดที่พนักงานถือไปเสิร์ฟ: สูงจากพื้นและยื่นออกหน้าตัว (ม.) */
const TRAY_HEIGHT = CHARACTER_HEIGHT * 0.6;
const TRAY_FORWARD = 0.3;
/** เหลื่อมจังหวะท่ายืนของพนักงานแต่ละคน ไม่ให้ขยับพร้อมกันทั้งร้าน (วินาที) */
const STAFF_IDLE_PHASE = 0.83;
/** ลูกค้าเคลื่อนช้ากว่านี้ (ม./วิ) นานกว่า IDLE_AFTER_SECONDS ถือว่ายืนรอ → เล่น Idle; เร็วกว่า IDLE_EXIT_SPEED กลับไปเดิน */
const IDLE_SPEED = 0.05;
const IDLE_EXIT_SPEED = 0.12;
const IDLE_AFTER_SECONDS = 0.5;
const BODY_MESH_NAME = "MannequinBody";
/** หมวกพนักงาน (mesh แข็งลูกกระดูก Head) — ทอดเงาตามการตั้งค่าเงาตัวละคร */
const STAFF_CAP_NAME = "StaffCap";
/**
 * ความสูงตัวละครบนจอ (CSS px) ที่ยังใช้รุ่นเบา (~6.9k สามเหลี่ยม) ได้โดยมองไม่เห็นความต่าง —
 * ซูมใหญ่กว่านี้ค่อยโหลด/ใช้รุ่นละเอียด (~27.6k) — มุมมองปกติของร้าน (ตัวสูง ~60–100 px) จึงใช้รุ่นเบา
 */
const LITE_MAX_SCREEN_HEIGHT = 160;
/**
 * หยุดจำลองแต่ยังมีลูกค้าในร้าน (ท่ายืนรอ/นั่ง ขยับช้า ๆ) วาดแค่ ~30 fps — ภาระการ์ดจอครึ่งหนึ่ง ประหยัดแบต
 * (ลบนิดเผื่อ rAF ของจอ 60 Hz มาเร็วกว่ากำหนดเล็กน้อย ไม่ให้ตกไปเหลือ 20 fps)
 */
const PAUSED_FRAME_MS = 1000 / 30 - 2;
const CUSTOMER_HEIGHT = CHARACTER_HEIGHT / CHARACTER_SCALE;
const WALL_HEIGHT = 2.7;
const WALL_THICKNESS = 0.14;
const DOOR_HEIGHT = 2.1;
const CAMERA_TARGET_Y = 0.45;
const CUSTOMER_SCALE = CHARACTER_SCALE;
/** state ของ agent ที่นั่งรอ/กิน (ดู AGENT_STRIDE ใน core/simulation) → ใช้ท่านั่งของมาสคอต */
const AGENT_STATE_SEATED = 4;
/** รอโต๊ะนอกร้าน (AGENT_STATE_CODE["waiting-entrance"]) — ยืนหันหน้าเข้าประตู */
const AGENT_STATE_WAITING_ENTRANCE = 6;
/** กัน animation กระโดดเมื่อ loop หยุดไปนาน (แท็บถูกซ่อน/หยุดวาดตอนไม่มีอะไรขยับ) */
const MAX_FRAME_DELTA = 1 / 30;
/** ผสมท่าเดิมกับท่าใหม่ (เดิน ↔ นั่ง) แทนการตัดท่าทันที */
const ANIMATION_FADE_SECONDS = 0.2;
/** ลุกขึ้น = เล่นคลิป Sit ย้อนกลับ เร็วกว่าตอนนั่งลงเล็กน้อย */
const STAND_UP_RATE = 1.3;
/** จำลองเร็ว (เช่น 60×) ตัวละครเลื่อนเร็วมาก — จำกัดจังหวะก้าวไม่ให้ขารัวจนดูสั่น */
const MAX_WALK_PLAYBACK_RATE = 1.6;
/** ระยะหมุนที่เห็นเส้นทางชัด แต่ยังตอบสนองทันทีเมื่อกดซ้ำ */
const VIEW_ROTATION_DURATION_MS = 620;

/** smoothstep อันดับ 5: ความเร็วและความเร่งเป็นศูนย์ที่ต้น/ปลายของ transition */
function smootherstep(progress: number) {
  return progress * progress * progress * (progress * (progress * 6 - 15) + 10);
}

function cameraFrame(camera: THREE.OrthographicCamera): CameraFrame {
  return {
    position: camera.position.clone(),
    left: camera.left,
    right: camera.right,
    top: camera.top,
    bottom: camera.bottom,
    far: camera.far,
    zoom: camera.zoom,
  };
}

function applyCameraFrame(camera: THREE.OrthographicCamera, frame: CameraFrame) {
  camera.position.copy(frame.position);
  camera.left = frame.left;
  camera.right = frame.right;
  camera.top = frame.top;
  camera.bottom = frame.bottom;
  camera.far = frame.far;
  camera.zoom = frame.zoom;
  camera.updateProjectionMatrix();
}

/** มุมปลายทางที่ใกล้ที่สุด (-π ถึง π) ให้ปุ่มหมุนซ้าย/ขวาไม่อ้อมสามในสี่รอบ */
function shortestAngleDelta(from: number, to: number) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

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

/** พื้นไม่เปลี่ยนตามมุมกล้อง จึงอยู่ใน layer คงที่และไม่ร่วม transition กับกำแพง */
function createFloor(group: THREE.Group, layout: StoreLayout, assets: SceneAssets) {
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
}

/** กำแพงและวงกบขึ้นกับด้านไกลกล้อง จึงเป็น layer ที่เปลี่ยนตอนหมุน */
function createRoom(group: THREE.Group, layout: StoreLayout, assets: SceneAssets) {
  const entrance = layout.entrance;
  const kitchenDoor = layout.kitchenDoor;
  const materials = new Map<WallDoor["wall"], THREE.Material[]>();
  const materialFor = (wall: WallDoor["wall"]) => {
    const material = assets.material(`wall:${wall}`, { color: "#ffffff", roughness: 0.88 });
    materials.set(wall, [material]);
    return material;
  };
  // สร้างครบ 4 ด้านเพียงครั้งเดียว แล้วเปลี่ยน opacity ของแต่ละด้านตามมุมกล้อง
  // จึงไม่มีผนังหรือวงกบคนละชุดมาซ้อนกันระหว่าง transition
  // north (z=0) / south (z=depth) วางตามแกน x; west (x=0) / east (x=width) วางตามแกน z
  const addWall = (wall: WallDoor["wall"], length: number) => {
    const wallMaterial = materialFor(wall);
    const alongX = wall === "north" || wall === "south";
    const offset = wall === "south" ? layout.depth : wall === "east" ? layout.width : 0;
    const piece = (from: number, to: number, y0: number, y1: number) => {
      const along = to - from;
      const height = y1 - y0;
      if (along <= 0.001 || height <= 0.001) return;
      const geometry = alongX ? assets.box(along, height, WALL_THICKNESS) : assets.box(WALL_THICKNESS, height, along);
      const mid = (from + to) / 2;
      group.add(
        placeMesh(geometry, wallMaterial, alongX ? mid : offset, (y0 + y1) / 2, alongX ? offset : mid, {
          cast: false,
          receive: true,
        }),
      );
    };

    const intervals: Array<{ a: number; b: number }> = [];
    if (entrance?.wall === wall) {
      intervals.push({ a: entrance.position, b: Math.min(length, entrance.position + entrance.width) });
    }
    if (kitchenDoor?.wall === wall) {
      intervals.push({ a: kitchenDoor.position, b: Math.min(length, kitchenDoor.position + kitchenDoor.width) });
    }
    intervals.sort((i1, i2) => i1.a - i2.a);

    const merged: Array<{ a: number; b: number }> = [];
    for (const cur of intervals) {
      const last = merged[merged.length - 1];
      if (!last) {
        merged.push({ ...cur });
      } else if (cur.a <= last.b) {
        last.b = Math.max(last.b, cur.b);
      } else {
        merged.push({ ...cur });
      }
    }

    let cursor = 0;
    for (const { a, b } of merged) {
      const clampA = Math.max(cursor, Math.min(length, a));
      const clampB = Math.max(clampA, Math.min(length, b));
      piece(cursor, clampA, 0, WALL_HEIGHT);
      piece(clampA, clampB, DOOR_HEIGHT, WALL_HEIGHT);
      cursor = clampB;
    }
    piece(cursor, length, 0, WALL_HEIGHT);
  };
  const walls: WallDoor["wall"][] = ["north", "south", "west", "east"];
  for (const wall of walls) addWall(wall, wall === "north" || wall === "south" ? layout.width : layout.depth);
  const addDoor = (door: WallDoor, isKitchen: boolean) => {
    const frame = createDoorFrame(layout, door, assets, isKitchen, door.wall);
    // ทางเข้าเป็นช่องเปิด จึงไม่มีธรณี/พรมที่อาจดูเป็นกรอบลอยบนพื้น
    // ส่วนประตูครัวยังคงมีฐานเพื่อรับบานประตู และใช้ opacity ของผนังด้านเดียวกัน
    const parts = isKitchen ? [createDoorBase(layout, door, assets, true, door.wall), frame] : [frame];
    const doorMaterials = materials.get(door.wall)!;
    for (const part of parts) {
      part.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        doorMaterials.push(...[object.material].flat());
      });
    }
    group.add(...parts);
  };
  if (entrance) addDoor(entrance, false);
  if (kitchenDoor) addDoor(kitchenDoor, true);
  return materials;
}

/**
 * แยกทางเข้ากับประตูครัวด้วยสี: ทางเข้า = วงกบดำ + ช่องเปิดโล่ง,
 * ประตูครัว = วงกบเทาอมฟ้า + บานปิดสีเข้ม + ธรณี/พรมด้านในห้อง
 */
const DOOR_COLORS = {
  entrance: { frame: "#111827", mat: "#ffffff" },
  kitchen: { frame: "#64748b", mat: "#a3afc0", panel: "#252e3b" },
} as const;
const DOOR_MAT_DEPTH = 0.45;

function doorSize(layout: StoreLayout, doorInfo: WallDoor) {
  const wallLength = doorInfo.wall === "north" || doorInfo.wall === "south" ? layout.width : layout.depth;
  const a = doorInfo.position;
  const b = Math.min(wallLength, doorInfo.position + doorInfo.width);
  return { a, b, width: b - a };
}

/** วาง group ที่สร้างในพิกัดท้องถิ่น (แกน x ตามแนวผนัง, z ชี้เข้าในห้อง) ลงบนผนังจริง */
function placeDoorOnWall(door: THREE.Group, layout: StoreLayout, doorInfo: WallDoor, a: number, b: number) {
  // north (z=0, เข้า +z), south (z=depth, เข้า −z), west (x=0, เข้า +x), east (x=width, เข้า −x)
  if (doorInfo.wall === "north") {
    door.position.set(a, 0, 0);
  } else if (doorInfo.wall === "south") {
    door.position.set(b, 0, layout.depth);
    door.rotation.y = Math.PI;
  } else if (doorInfo.wall === "west") {
    door.position.set(0, 0, b);
    door.rotation.y = Math.PI / 2;
  } else {
    door.position.set(layout.width, 0, a);
    door.rotation.y = -Math.PI / 2;
  }
}

/** ธรณีและพรมเป็นส่วนหนึ่งของประตู จึงใช้ opacity เดียวกับผนัง/วงกบด้านนั้น */
function createDoorBase(
  layout: StoreLayout,
  doorInfo: WallDoor,
  assets: SceneAssets,
  isKitchen = false,
  materialSuffix = doorInfo.wall,
) {
  const colors = isKitchen ? DOOR_COLORS.kitchen : DOOR_COLORS.entrance;
  const kind = isKitchen ? "kitchen" : "entrance";
  const matMaterial = assets.material(`door-mat:${kind}:${materialSuffix}`, { color: colors.mat, roughness: 0.95 });
  const sillMaterial = assets.material(`sill:${materialSuffix}`, { color: "#e3e7ee", roughness: 0.9 });
  const { a, b, width } = doorSize(layout, doorInfo);
  const door = new THREE.Group();
  const frameD = WALL_THICKNESS + 0.02;
  const solid = { cast: true, receive: true };
  door.add(
    placeMesh(assets.box(width, 0.01, frameD), sillMaterial, width / 2, 0.005, 0, solid),
    // พรมหน้าประตูด้านในห้อง (บางมาก ไม่บังเฟอร์นิเจอร์)
    placeMesh(assets.box(width, 0.012, DOOR_MAT_DEPTH), matMaterial, width / 2, 0.006, frameD / 2 + DOOR_MAT_DEPTH / 2, {
      cast: false,
      receive: true,
    }),
  );
  placeDoorOnWall(door, layout, doorInfo, a, b);
  return door;
}

/** วงกบและบานประตูใช้ opacity ของผนังด้านเดียวกัน จึงไม่ซ้อนหลายชุดระหว่างหมุน */
function createDoorFrame(
  layout: StoreLayout,
  doorInfo: WallDoor,
  assets: SceneAssets,
  isKitchen = false,
  materialSuffix = doorInfo.wall,
) {
  const colors = isKitchen ? DOOR_COLORS.kitchen : DOOR_COLORS.entrance;
  const kind = isKitchen ? "kitchen" : "entrance";
  const frameMaterial = assets.material(`door-frame:${kind}:${materialSuffix}`, { color: colors.frame, roughness: 0.5, metalness: 0.2 });
  const { a, b, width } = doorSize(layout, doorInfo);
  const door = new THREE.Group();
  const frameW = 0.05;
  const frameD = WALL_THICKNESS + 0.02;
  // วงกบจะถูกสลับตามผนังที่อยู่ไกลกล้อง ขณะที่ shadow map ของทั้งฉากเป็นชุดเดียว
  // หากให้มันทอดเงา เงาของวงกบสูง 2.1 ม. จะพาดพื้นยาวและโผล่/หายตอนเปลี่ยนมุม
  // จึงคง geometry ของประตูไว้ แต่ไม่ให้เป็นต้นกำเนิดเงา (กำแพงเองก็ไม่ทอดเงา)
  const solid = { cast: false, receive: true };
  const post = assets.box(frameW, DOOR_HEIGHT, frameD);
  door.add(
    placeMesh(post, frameMaterial, frameW / 2, DOOR_HEIGHT / 2, 0, solid),
    placeMesh(post, frameMaterial, width - frameW / 2, DOOR_HEIGHT / 2, 0, solid),
    placeMesh(assets.box(width, frameW, frameD), frameMaterial, width / 2, DOOR_HEIGHT - frameW / 2, 0, solid),
  );
  if (isKitchen) {
    const panelMaterial = assets.material(`kitchen-door-panel:${materialSuffix}`, { color: DOOR_COLORS.kitchen.panel, roughness: 0.7 });
    const panelW = Math.max(0.01, width - frameW * 2);
    const panelH = Math.max(0.01, DOOR_HEIGHT - frameW);
    door.add(placeMesh(assets.box(panelW, panelH, 0.03), panelMaterial, width / 2, panelH / 2 + 0.005, 0, solid));
  }
  placeDoorOnWall(door, layout, doorInfo, a, b);
  return door;
}

function createFurniture(group: THREE.Group, layout: StoreLayout, assets: SceneAssets) {
  group.userData.movableGeometries = [];
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

    if (item.type === "table") {
      const style = tableStyleOf(item);
      const round = style.shape === "round";
      const topHeight = 0.74;
      const top = round ? assets.cylinder(item.width / 2, item.width / 2, 0.04, 40) : assets.box(item.width, 0.04, item.depth);
      object.add(placeMesh(top, furniture(style.color), 0, topHeight, 0));
      addLegs(object, style.legStyle, item.width, item.depth, topHeight - 0.02, round);
    } else if (item.type === "chair") {
      const style = chairStyleOf(item);
      // ผิวบนเบาะสูง 0.45 ม. ตามเก้าอี้ทานอาหารมาตรฐาน (ท่า Sit ใน GLB วางต้นขาไว้ที่ระดับนี้)
      const seatHeight = 0.42;
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
    } else if (item.type === "counter") {
      object.add(createCounter(item.width, item.depth, counterStyleOf(item), assets));
    }
    if (item.type === "chair") {
      // เก้าอี้เลื่อนออก/เข้าตอนลูกค้านั่ง/ลุก — รวม mesh เฉพาะในตัวเก้าอี้ (ยังอยู่ที่จุดกำเนิด) ไม่รวมกับเฟอร์นิเจอร์อื่น
      (group.userData.movableGeometries as THREE.BufferGeometry[]).push(...mergeStaticMeshes(object));
      object.userData.chairId = item.id;
    }
    object.position.set(center.x, 0, center.y);
    object.rotation.y = THREE.MathUtils.degToRad(-item.rotation);
    group.add(object);
  }
}

/**
 * เคาน์เตอร์คาเฟ่ สูงท็อป 1.05 ม. — ส่วนร่วมทุกแบบ: ฐานเตะเท้าสีเข้มร่นเข้า, ตู้ตามสีที่เลือก, ท็อปหินครีมยื่นเลยตู้, จอ POS
 * แบบ (`variant`):
 * - fluted: หน้าตู้ระแนงโค้งทั้งสองด้านยาว + เครื่องเอสเปรสโซ
 * - panel: ตู้บานเรียบแบ่งช่องเป็นบาน มีมือจับฝั่ง −z (ฝั่งพนักงาน) + เครื่องเอสเปรสโซ
 * - bar: ฝั่ง +z (ฝั่งลูกค้า) มีขอบยกสูงเป็นที่วางของ + ราวพักเท้าโลหะ
 * - display: ตู้กระจกโชว์ขนมบนท็อปด้านซ้าย มีขนมสองชั้น
 * ที่ rotation 0 ฝั่งลูกค้าคือ +z (ใต้ — หันเข้าห้อง), ฝั่งพนักงานคือ −z
 * จัดตามแกนยาวในพิกัดท้องถิ่น (x = ด้านยาว) แล้วหมุน 90° ถ้าผังวางเคาน์เตอร์ตามแนวลึก
 */
function createCounter(width: number, depth: number, style: CounterStyle, assets: SceneAssets) {
  const counter = new THREE.Group();
  const long = Math.max(width, depth);
  const short = Math.min(width, depth);
  if (depth > width) counter.rotation.y = Math.PI / 2;

  const hex = FURNITURE_COLOR_HEX[style.color];
  const body = assets.material(`counter:${style.color}`, { color: hex, roughness: 0.68 });
  const accent = assets.material(`counter-accent:${style.color}`, {
    color: new THREE.Color(hex).multiplyScalar(style.color === "charcoal" ? 1.25 : 0.88),
    roughness: 0.6,
  });
  const plinth = assets.material("metal", { color: "#3f4650", roughness: 0.5, metalness: 0.35 });
  const stone = assets.material("counter-top", { color: "#f5f1ea", roughness: 0.32 });
  const solid = { cast: true, receive: true };

  const kick = 0.08;
  const topY = 1.005;
  const slab = 0.045;
  const bodyH = topY - kick;
  const bodyD = short - 0.06;
  const surface = topY + slab;

  counter.add(placeMesh(assets.box(long - 0.1, kick, bodyD - 0.08), plinth, 0, kick / 2, 0, solid));
  counter.add(placeMesh(assets.box(long - 0.04, bodyH, bodyD), body, 0, kick + bodyH / 2, 0, solid));
  counter.add(placeMesh(assets.box(long + 0.02, slab, short), stone, 0, topY + slab / 2, 0, solid));

  /** ตำแหน่ง x ของช่อง i จาก n ช่องเท่ากันตามแนวยาวของตู้ */
  const bays = (n: number) => Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * ((long - 0.04) / n));

  if (style.variant === "fluted") {
    // ระแนงโค้งครึ่งวงกลมแปะหน้าตู้สองด้านยาว (ทรงกระบอกบีบแบนตามแกน z)
    const slatH = bodyH - 0.06;
    const pitch = 0.06;
    const count = Math.max(1, Math.floor((long - 0.14) / pitch));
    const slatGeo = assets.cylinder(0.022, 0.022, slatH, 12);
    for (const side of [-1, 1]) {
      for (let i = 0; i < count; i += 1) {
        const mesh = placeMesh(slatGeo, accent, (i - (count - 1) / 2) * pitch, kick + 0.03 + slatH / 2, side * (bodyD / 2), solid);
        mesh.scale.z = 0.45;
        counter.add(mesh);
      }
    }
  } else if (style.variant === "panel") {
    // บานตู้นูนเล็กน้อยสองด้าน + มือจับแนวนอนฝั่งพนักงาน
    const n = Math.max(1, Math.round((long - 0.04) / 0.6));
    const bayW = (long - 0.04) / n;
    const panelH = bodyH - 0.08;
    for (const side of [-1, 1]) {
      for (const x of bays(n)) {
        counter.add(placeMesh(assets.box(bayW - 0.03, panelH, 0.014), accent, x, kick + 0.04 + panelH / 2, side * (bodyD / 2 + 0.005), solid));
        if (side === -1) counter.add(placeMesh(assets.box(Math.min(0.22, bayW * 0.5), 0.016, 0.02), plinth, x, topY - 0.09, -bodyD / 2 - 0.022));
      }
    }
  } else if (style.variant === "bar") {
    // ร่องแนวนอนสองเส้นบนหน้าตู้ฝั่งลูกค้า
    for (const y of [kick + bodyH * 0.36, kick + bodyH * 0.68]) {
      counter.add(placeMesh(assets.box(long - 0.06, 0.018, 0.012), accent, 0, y, bodyD / 2 + 0.004));
    }
    // ขอบยกฝั่ง +z: ผนังกั้นสูง 15 ซม. + แผ่นหินวางของยื่นออกไปฝั่งลูกค้า
    const ledgeD = Math.min(0.26, short * 0.4);
    const ledgeZ = short / 2 - ledgeD / 2 + 0.05;
    counter.add(placeMesh(assets.box(long - 0.04, 0.15, 0.05), body, 0, surface + 0.075, short / 2 - 0.1, solid));
    counter.add(placeMesh(assets.box(long + 0.02, 0.035, ledgeD), stone, 0, surface + 0.1675, ledgeZ, solid));
    // ราวพักเท้าโลหะ + ขายึด
    const railZ = bodyD / 2 + 0.1;
    const rail = placeMesh(assets.cylinder(0.018, 0.018, long - 0.16, 16), plinth, 0, 0.22, railZ);
    rail.rotation.z = Math.PI / 2;
    counter.add(rail);
    for (const x of bays(Math.max(2, Math.round(long / 0.9)))) {
      counter.add(placeMesh(assets.box(0.02, 0.02, 0.1), plinth, x, 0.22, bodyD / 2 + 0.05));
    }
  } else {
    // แถบสีเข้มแนวนอนใต้ท็อป
    for (const side of [-1, 1]) counter.add(placeMesh(assets.box(long - 0.04, 0.05, 0.012), accent, 0, topY - 0.06, side * (bodyD / 2 + 0.004)));
    addPastryCase(counter, assets, -long / 2 + Math.min(1.0, long * 0.45) / 2 + 0.06, Math.min(1.0, long * 0.45), short - 0.12, surface);
  }

  // จอ POS ด้านขวา: ฐาน + ก้าน + จอเอียง
  const dark = assets.material("appliance-dark", { color: "#2b3038", roughness: 0.45, metalness: 0.2 });
  const screen = assets.material("pos-screen", { color: "#3d8fd1", roughness: 0.2, emissive: "#1d5f99", emissiveIntensity: 0.35 });
  const posX = long / 2 - Math.min(0.35, long * 0.2);
  const posZ = style.variant === "bar" ? -0.1 : 0.02;
  counter.add(placeMesh(assets.box(0.16, 0.02, 0.14), dark, posX, surface + 0.01, posZ));
  counter.add(placeMesh(assets.box(0.03, 0.12, 0.03), dark, posX, surface + 0.08, posZ + 0.02));
  const display = placeMesh(assets.box(0.28, 0.19, 0.018), dark, posX, surface + 0.2, posZ + 0.01);
  display.rotation.x = -0.35;
  display.add(placeMesh(assets.box(0.25, 0.16, 0.004), screen, 0, 0, -0.01, { cast: false }));
  counter.add(display);

  // เครื่องชงเอสเปรสโซด้านซ้าย (ไม่มีในแบบตู้โชว์ซึ่งใช้พื้นที่นั้นแล้ว)
  if (style.variant !== "display" && long >= 1.3 && short >= 0.5) {
    addEspressoMachine(counter, assets, -long / 2 + 0.38, style.variant === "bar" ? -0.09 : Math.min(0.06, short * 0.1), surface);
  }
  return counter;
}

function addEspressoMachine(target: THREE.Group, assets: SceneAssets, mx: number, mz: number, surface: number) {
  const steel = assets.material("steel", { color: "#dfe3e8", roughness: 0.35, metalness: 0.25 });
  const dark = assets.material("appliance-dark", { color: "#2b3038", roughness: 0.45, metalness: 0.2 });
  const cup = assets.material("cup", { color: "#ffffff", roughness: 0.4 });
  const solid = { cast: true, receive: true };
  target.add(placeMesh(assets.box(0.5, 0.36, 0.4), steel, mx, surface + 0.18, mz, solid));
  target.add(placeMesh(assets.box(0.52, 0.025, 0.42), steel, mx, surface + 0.372, mz));
  target.add(placeMesh(assets.box(0.46, 0.05, 0.01), dark, mx, surface + 0.3, mz - 0.205));
  target.add(placeMesh(assets.box(0.44, 0.02, 0.16), dark, mx, surface + 0.01, mz - 0.25));
  for (const dx of [-0.12, 0.12]) {
    target.add(placeMesh(assets.cylinder(0.035, 0.03, 0.05, 16), dark, mx + dx, surface + 0.2, mz - 0.22));
    target.add(placeMesh(assets.cylinder(0.03, 0.025, 0.07, 16), cup, mx + dx, surface + 0.055, mz - 0.25));
  }
  for (const [dx, dz] of [[0.42, -0.12], [0.5, -0.04]] as const) {
    target.add(placeMesh(assets.cylinder(0.032, 0.026, 0.09, 16), cup, mx + dx, surface + 0.045, mz + dz));
  }
}

/** ตู้กระจกโชว์ขนมบนท็อป: กรอบโลหะ, กระจกใส, ชั้นกลาง และขนมวางสองชั้น */
function addPastryCase(target: THREE.Group, assets: SceneAssets, cx: number, w: number, d: number, surface: number) {
  const steel = assets.material("steel", { color: "#dfe3e8", roughness: 0.35, metalness: 0.25 });
  const glass = assets.material("glass", { color: "#d9f0ff", roughness: 0.05, transparent: true, opacity: 0.28, depthWrite: false });
  const pastries = [
    assets.material("pastry-croissant", { color: "#d9984a", roughness: 0.7 }),
    assets.material("pastry-cake", { color: "#f3d6c8", roughness: 0.8 }),
    assets.material("pastry-choc", { color: "#6b3f2a", roughness: 0.7 }),
  ];
  const h = 0.34;
  target.add(placeMesh(assets.box(w, 0.03, d), steel, cx, surface + 0.015, 0, { cast: true, receive: true }));
  target.add(placeMesh(assets.box(w, 0.02, d), steel, cx, surface + h, 0));
  const pane = placeMesh(assets.box(w - 0.02, h - 0.04, d - 0.02), glass, cx, surface + h / 2 + 0.01, 0, { cast: false });
  pane.renderOrder = 1;
  target.add(pane);
  target.add(placeMesh(assets.box(w - 0.04, 0.008, d - 0.04), glass, cx, surface + 0.19, 0, { cast: false }));
  const perRow = Math.max(2, Math.floor((w - 0.08) / 0.13));
  for (const [row, y] of [[0, surface + 0.03], [1, surface + 0.194]] as const) {
    for (let i = 0; i < perRow; i += 1) {
      const x = cx + (i - (perRow - 1) / 2) * ((w - 0.1) / perRow);
      const material = pastries[(i + row) % pastries.length]!;
      const piece = placeMesh(assets.cylinder(0.045, 0.05, 0.05, 14), material, x, y + 0.025, 0);
      piece.scale.z = row === 0 ? 0.7 : 1;
      target.add(piece);
    }
  }
}

/**
 * พนักพิงทรงเปลือกหอย (shell) ของเก้าอี้เบาะกลม แบบเก้าอี้คาเฟ่บุผ้า:
 * โอบรอบขอบหลังเบาะ 200° — ตรงกลางสูงสุด 42 ซม. แล้วโค้งมนลาดลงมาจรดเบาะที่ด้านข้าง (ขอบบนเป็นวงรี)
 * เอนไปด้านหลังเล็กน้อย ขอบบนมนเป็นครึ่งวงกลม และห่อขอบเบาะลงมา 5 ซม.
 * สร้างเป็น mesh ปิดสนิท: กวาดหน้าตัด (นอก → ขอบบนมน → ใน) ไปตามมุม θ แล้วปิดหัวท้าย
 * มุม θ = 0 คือแกน +z (ด้านหลังเก้าอี้), y = 0 คือผิวบนของเบาะ
 */
function curvedBackrest(assets: SceneAssets, radius: number) {
  return assets.geometry(`backrest-shell:${radius}`, () => {
    const thickness = 0.04;
    const overlap = 0.05; // ห่อขอบเบาะลงมาใต้ผิวบน
    const peak = 0.42; // ความสูงกลางพนักเหนือเบาะ
    const sideHeight = 0.07; // ความสูงที่ปลายสองข้าง
    const lean = 0.05; // เอนออกด้านหลังที่ระดับยอด
    const halfSpan = THREE.MathUtils.degToRad(100);
    const rOut = radius + 0.012;
    const rIn = rOut - thickness;
    const segments = 48;
    const capSegments = 8;

    const heightAt = (theta: number) => {
      const k = Math.min(1, Math.abs(theta) / halfSpan);
      return sideHeight + (peak - sideHeight) * Math.pow(1 - Math.pow(k, 2.4), 1 / 2.4);
    };
    // หน้าตัด (ระยะรัศมี, y): ขึ้นผิวนอก → ขอบบนครึ่งวงกลม → ลงผิวใน
    const profile = (top: number): Array<[number, number]> => {
      const capY = top - thickness / 2;
      const leanAt = (y: number) => (lean * Math.max(0, y)) / peak;
      const pts: Array<[number, number]> = [
        [rOut + leanAt(-overlap), -overlap],
        [rOut + leanAt(capY * 0.5), capY * 0.5],
      ];
      const mid = (rOut + rIn) / 2 + leanAt(capY);
      for (let k = 0; k <= capSegments; k += 1) {
        const phi = (Math.PI * k) / capSegments;
        pts.push([mid + (thickness / 2) * Math.cos(phi), capY + (thickness / 2) * Math.sin(phi)]);
      }
      pts.push([rIn + leanAt(capY * 0.5), capY * 0.5], [rIn + leanAt(-overlap), -overlap]);
      return pts;
    };

    const positions: number[] = [];
    const indices: number[] = [];
    const ring = (theta: number) =>
      profile(heightAt(theta)).map(([r, y]): [number, number, number] => [r * Math.sin(theta), y, r * Math.cos(theta)]);
    const rings = Array.from({ length: segments + 1 }, (_, i) => ring(-halfSpan + (2 * halfSpan * i) / segments));
    const perRing = profile(peak).length;
    for (const pts of rings) for (const p of pts) positions.push(...p);
    // ผิวรอบตัว (ปิดวงหน้าตัดด้วยขอบล่าง j = perRing-1 → 0)
    for (let i = 0; i < segments; i += 1) {
      for (let j = 0; j < perRing; j += 1) {
        const jn = (j + 1) % perRing;
        const a = i * perRing + j;
        const b = (i + 1) * perRing + j;
        const c = i * perRing + jn;
        const d = (i + 1) * perRing + jn;
        indices.push(a, b, c, b, d, c);
      }
    }
    // ฝาปิดหัวท้าย — ใช้ vertex แยกเพื่อให้ normal คมไม่ไปเกลี่ยกับผิวโค้ง
    const addCap = (pts: Array<[number, number, number]>, flip: boolean) => {
      const base = positions.length / 3;
      const center = pts.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2]], [0, 0, 0]);
      positions.push(center[0] / perRing, center[1] / perRing, center[2] / perRing);
      for (const p of pts) positions.push(...p);
      for (let j = 0; j < perRing; j += 1) {
        const p = base + 1 + j;
        const q = base + 1 + ((j + 1) % perRing);
        if (flip) indices.push(base, q, p);
        else indices.push(base, p, q);
      }
    };
    addCap(ring(-halfSpan), false);
    addCap(ring(halfSpan), true);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  });
}

/**
 * ฉากจากผังไม่ขยับเลย จึงรวมชิ้นที่ใช้ material และการตั้งค่าเงาเดียวกันเป็น mesh เดียว
 * (เก้าอี้ 1 ตัว = 6 ชิ้น × 2 รอบรวมเงา → ร้าน 300 ตัวเคยสั่งวาดหลายพันครั้งต่อเฟรม)
 * ตำแหน่งถูกอบลง vertex ตรง ๆ หน้าตาจึงเหมือนเดิมทุกจุด — เว้นชิ้นโปร่งใส/มี renderOrder ไว้ เพราะลำดับการวาดมีผลกับภาพ
 */
function mergeStaticMeshes(group: THREE.Group) {
  group.updateMatrixWorld(true);
  const buckets = new Map<string, { source: THREE.Mesh; geometries: THREE.BufferGeometry[] }>();
  const merged: THREE.Mesh[] = [];
  const visit = (object: THREE.Object3D) => {
    // เก้าอี้ (มี chairId) ขยับได้ — รวม mesh ของตัวเองไว้แล้ว ห้ามอบเข้ากลุ่มรวม
    if (object !== group && object.userData.chairId !== undefined) return;
    for (const child of object.children) visit(child);
    if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return;
    const material = object.material as THREE.Material;
    if (material.transparent || object.renderOrder !== 0 || object.matrixWorld.determinant() <= 0) return;
    const { geometry } = object;
    const attributes = Object.entries(geometry.attributes)
      .map(([name, attribute]) => `${name}:${(attribute as THREE.BufferAttribute).itemSize}`)
      .sort()
      .join(",");
    const key = `${material.uuid}|${object.castShadow}|${object.receiveShadow}|${geometry.index ? "i" : "n"}|${attributes}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { source: object, geometries: [] };
      buckets.set(key, bucket);
    }
    const baked = geometry.clone().applyMatrix4(object.matrixWorld);
    baked.clearGroups();
    bucket.geometries.push(baked);
    merged.push(object);
  };
  visit(group);

  const created: THREE.BufferGeometry[] = [];
  for (const { source, geometries } of buckets.values()) {
    const geometry = geometries.length === 1 ? geometries[0]! : mergeGeometries(geometries);
    if (geometries.length > 1) for (const part of geometries) part.dispose();
    if (!geometry) continue;
    const mesh = new THREE.Mesh(geometry, source.material);
    mesh.castShadow = source.castShadow;
    mesh.receiveShadow = source.receiveShadow;
    group.add(mesh);
    created.push(geometry);
  }
  for (const object of merged) object.removeFromParent();
  return created;
}

/** สร้างชั้น static หนึ่งชั้นแยกกัน เพื่อคืน geometry/material ได้พร้อมกันเมื่อไม่ใช้แล้ว */
function buildStaticContent(build: (group: THREE.Group, assets: SceneAssets) => void) {
  const assets = new SceneAssets();
  const group = new THREE.Group();
  build(group, assets);
  const merged = mergeStaticMeshes(group);
  const movable = (group.userData.movableGeometries as THREE.BufferGeometry[] | undefined) ?? [];
  group.userData.dispose = () => {
    for (const geometry of [...merged, ...movable]) geometry.dispose();
    assets.dispose();
  };
  return group;
}

/** พื้นคงที่ตลอดการหมุน จึงไม่ถูกนำไป blend กับกำแพง */
function buildFloorContent(layout: StoreLayout) {
  return buildStaticContent((group, assets) => createFloor(group, layout, assets));
}

/** ผนัง/ประตูครบทั้งสี่ด้านใน group เดียว — transition เปลี่ยน material opacity เท่านั้น */
function buildRoomContent(layout: StoreLayout) {
  const assets = new SceneAssets();
  const group = new THREE.Group();
  const wallMaterials = createRoom(group, layout, assets);
  const merged = mergeStaticMeshes(group);
  group.userData.wallMaterials = wallMaterials;
  group.userData.dispose = () => {
    for (const geometry of merged) geometry.dispose();
    assets.dispose();
  };
  prepareRoomForTransition(group);
  return group;
}

/** เฟอร์นิเจอร์ไม่ขึ้นกับมุมกล้อง จึงไม่ควรถอดแล้วสร้างใหม่เวลาหมุน */
function buildFurnitureContent(layout: StoreLayout) {
  return buildStaticContent((group, assets) => createFurniture(group, layout, assets));
}

function disposeModel(root: THREE.Object3D | null) {
  root?.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    for (const material of [object.material].flat()) material.dispose();
  });
}

function disposeContent(group: THREE.Group | null) {
  (group?.userData.dispose as (() => void) | undefined)?.();
}

/**
 * room material อยู่ในโหมด transparent ตั้งแต่สร้าง เพื่อ compile shader แค่ตอนผังเปลี่ยน ไม่ใช่ตอนกดหมุน
 * ตอนนิ่งยัง depth-write ตามปกติ จึงให้ภาพเหมือน opaque แต่พร้อม fade ได้ทันที
 */
function prepareRoomForTransition(group: THREE.Group) {
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    for (const material of [object.material].flat()) {
      material.transparent = true;
      material.depthWrite = true;
      material.opacity = 1;
      material.needsUpdate = true;
    }
  });
}

function roomMaterials(group: THREE.Group) {
  return group.userData.wallMaterials as Map<WallDoor["wall"], THREE.Material[]>;
}

function roomOpacityForView(viewRotation: ViewRotation): RoomOpacity {
  const visible = farWalls(viewRotation);
  return new Map((["north", "south", "west", "east"] as WallDoor["wall"][]).map((wall) => [wall, visible.includes(wall) ? 1 : 0]));
}

function roomOpacitySnapshot(group: THREE.Group): RoomOpacity {
  return new Map([...roomMaterials(group)].map(([wall, materials]) => [wall, materials[0]?.opacity ?? 0]));
}

/** ผนังและวงกบด้านเดียวกันใช้ material ชุดเดียว จึงจางพร้อมกันโดยไม่เกิดกรอบประตูซ้อน */
function setRoomOpacity(group: THREE.Group, opacityByWall: RoomOpacity) {
  for (const [wall, materials] of roomMaterials(group)) {
    const opacity = opacityByWall.get(wall) ?? 0;
    for (const material of materials) {
      material.opacity = opacity;
      material.depthWrite = opacity >= 0.999;
    }
  }
}

/**
 * Orthographic isometric: ระยะเยื้องแกน X/Y/Z ต้องเท่ากัน จึงได้ azimuth 45° และ elevation 35.264°
 * แล้วฉายมุมห้อง (พื้น + ยอดผนัง) ลงพิกัดกล้อง ขยายด้านที่ขาดให้ตรงสัดส่วนจอ — เต็มจอทั้งแนวตั้งและแนวนอน
 * กล้องอยู่มุม "ล่างขวา" ของมุมมองเสมอ (rotation 0 = มุมตะวันออกเฉียงใต้) — หมุนมุมมองแล้วกล้องย้ายมุมตาม
 */
function fitCamera(camera: THREE.OrthographicCamera, layout: StoreLayout, viewRotation: ViewRotation, width: number, height: number) {
  const aspect = width / height;
  const targetX = layout.width / 2;
  const targetZ = layout.depth / 2;
  const isoDistance = Math.max(layout.width, layout.depth) * 1.6 + 1;
  const toward = vectorFromView({ x: 1, y: 1 }, viewRotation);
  camera.position.set(targetX + toward.x * isoDistance, CAMERA_TARGET_Y + isoDistance, targetZ + toward.y * isoDistance);
  camera.lookAt(targetX, CAMERA_TARGET_Y, targetZ);
  camera.updateMatrixWorld();

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const corner = new THREE.Vector3();
  const include = (x: number, y: number, z: number) => {
    corner.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
    minX = Math.min(minX, corner.x);
    maxX = Math.max(maxX, corner.x);
    minY = Math.min(minY, corner.y);
    maxY = Math.max(maxY, corner.y);
  };
  for (const x of [0, layout.width]) {
    for (const z of [0, layout.depth]) {
      for (const y of [0, WALL_HEIGHT]) include(x, y, z);
    }
  }
  // พื้นที่หน้าประตูนอกร้าน (ลูกค้าเดินมา/ยืนต่อแถวรอโต๊ะ) ต้องอยู่ในภาพด้วย
  const door = doorFrame(layout);
  if (door) {
    for (const lateral of [-1, 1]) {
      const side = door.width / 2 + 1;
      const x = door.center.x + door.outward.x * OUTSIDE_DISTANCE + door.along.x * side * lateral;
      const z = door.center.y + door.outward.y * OUTSIDE_DISTANCE + door.along.y * side * lateral;
      for (const y of [0, CHARACTER_HEIGHT]) include(x, y, z);
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

/**
 * วัสดุของลูกค้าหนึ่งคน: แทนสี vertex color ที่อบมากับไฟล์ ด้วยสีตามหมวดชิ้น (_part) ของคนนั้น
 * shader เดียวกันทุกคน (customProgramCacheKey) ต่างกันแค่ uniform — ไม่ต้อง compile ใหม่ต่อคน
 */
function customerMaterial(template: THREE.MeshStandardMaterial, colors: readonly string[]) {
  const material = template.clone();
  material.vertexColors = false;
  const partColors = colors.map((hex) => new THREE.Color(hex));
  material.onBeforeCompile = (shader) => {
    shader.uniforms.partColors = { value: partColors };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float _part;\nvarying float vPart;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvPart = _part;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nuniform vec3 partColors[${partColors.length}];\nvarying float vPart;`)
      .replace("#include <color_fragment>", "diffuseColor.rgb *= partColors[int(vPart + 0.5)];");
  };
  material.customProgramCacheKey = () => "customer-palette";
  return material;
}

const animationFor = (state: number): CustomerAnimation => (state === AGENT_STATE_SEATED ? "Sit" : "Walk");

/** มุมมอง WebGL แบบ lazy-loaded สำหรับ Playground เท่านั้น — SVG isometric เป็น fallback อยู่ที่ caller */
export function ThreeView({ layout, zoom, viewRotation = 0, isSim, simPaused = false, onUnavailable }: ThreeViewProps) {
  const hostRef = React.useRef<HTMLDivElement>(null);
  const stageRef = React.useRef<Stage | null>(null);
  // อ่านค่าล่าสุดใน render loop โดยไม่ต้องสร้าง renderer ใหม่เมื่อค่าเปลี่ยน
  const zoomRef = React.useRef(zoom);
  const isSimRef = React.useRef(isSim);
  const pausedRef = React.useRef(simPaused);

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

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, QUALITY_LEVELS[0]!.maxPixelRatio));
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
    const lighting = createLegacyLighting(scene);
    const { key } = lighting;

    const clock = new THREE.Clock(false);
    const frameClock = new FrameClock();
    const customers = new Map<number, AnimatedCustomer>();
    /** เก้าอี้ของผังปัจจุบันตาม id — สร้างใหม่ทุกครั้งที่เปลี่ยนชุดเฟอร์นิเจอร์ */
    let chairRigs = new Map<string, ChairRig>();
    const collectChairRigs = (furniture: THREE.Group) => {
      chairRigs = new Map();
      for (const object of furniture.children) {
        const id = object.userData.chairId as string | undefined;
        if (id === undefined) continue;
        const out = new THREE.Vector3(0, 0, 1).applyAxisAngle(THREE.Object3D.DEFAULT_UP, object.rotation.y);
        chairRigs.set(id, { object, home: object.position.clone(), out, slide: createChairSlide() });
      }
    };
    /** เก้าอี้ทุกตัวกลับเข้าที่ทันที (จบการจำลอง) */
    const resetChairs = () => {
      for (const rig of chairRigs.values()) {
        rig.slide = createChairSlide();
        rig.object.position.copy(rig.home);
      }
      renderer.shadowMap.needsUpdate = true;
    };
    /** เลื่อนเก้าอี้ที่กำลังถูกดึงออก/ดันเข้าหนึ่งเฟรม */
    const stepChairs = (delta: number) => {
      let moved = false;
      for (const rig of chairRigs.values()) {
        if (!stepChair(rig.slide, delta)) continue;
        rig.object.position.copy(rig.home).addScaledVector(rig.out, rig.slide.pull * CHAIR_PULL);
        moved = true;
      }
      // เงาเฟอร์นิเจอร์อาจไม่อัปเดตเองบนเครื่องช้า (shadowMap.autoUpdate ปิด)
      if (moved) renderer.shadowMap.needsUpdate = true;
    };
    const controller = getSimulationController();
    let templateMaterial: THREE.MeshStandardMaterial | null = null;
    const quality = new AdaptiveQuality();
    const customerAsset = characterAsset(CHARACTER_MODELS.customer);
    const staffAsset = characterAsset(CHARACTER_MODELS.staff);
    const staff: StandingStaff[] = [];
    let frame = 0;
    let disposed = false;
    let cameraMotion: CameraMotion | null = null;
    let roomMotion: RoomMotion | null = null;

    const playClip = (customer: Pick<AnimatedCustomer, "mixer" | "action" | "idleOffset">, name: CustomerAnimation) => {
      const { clips } = customerAsset;
      const clip = THREE.AnimationClip.findByName(clips, name) ?? clips[0];
      if (!clip) return;
      const action = customer.mixer.clipAction(clip).reset().setEffectiveTimeScale(1).setEffectiveWeight(1);
      if (name === "Idle") action.time = customer.idleOffset % clip.duration;
      if (name === "Sit") {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      action.play();
      const previous = customer.action;
      if (previous && previous !== action) action.crossFadeFrom(previous, ANIMATION_FADE_SECONDS, false);
      customer.action = action;
    };
    /** เล่นท่านั่งย้อนจากจุดที่อยู่ตอนนี้ (นั่งไม่ทันสุดก็ลุกจากตรงนั้น) แล้วค้างท่ายืนไว้ที่ต้นคลิป */
    const standUp = (customer: AnimatedCustomer) => {
      const action = customer.action;
      if (!action || action.getClip().name !== "Sit") {
        playClip(customer, customer.animation);
        return;
      }
      action.paused = false;
      action.setEffectiveTimeScale(-STAND_UP_RATE);
      customer.standingUp = action.time / STAND_UP_RATE;
    };
    const removeCustomer = (id: number, customer: AnimatedCustomer) => {
      if (customer.seat) releaseChair(customer.seat.chair.slide);
      customer.mixer.stopAllAction();
      customer.mixer.uncacheRoot(customer.model);
      scene.remove(customer.model);
      // วัสดุสีเฉพาะตัว (customerMaterial) — geometry ใช้ร่วมกับ template จึงไม่คืนที่นี่
      if (customer.body && customer.body.material !== templateMaterial) (customer.body.material as THREE.Material).dispose();
      customers.delete(id);
    };
    const clearCustomers = () => {
      for (const [id, customer] of customers) removeCustomer(id, customer);
      resetChairs();
    };

    const loader = createCharacterLoader();
    /** โหลดรุ่นเบาเป็น template ก่อน (ไฟล์เล็ก ~1/3) — รุ่นเบาโหลดไม่ได้ค่อยใช้รุ่นละเอียดแทน */
    const loadCharacter = (asset: CharacterAsset, onReady: () => void, onError?: () => void) => {
      const accept = (gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] }, isFull: boolean) => {
        if (disposed) {
          disposeModel(gltf.scene);
          return;
        }
        gltf.scene.traverse((object) => {
          if (object instanceof THREE.Mesh) object.castShadow = true;
        });
        asset.template = gltf.scene;
        const body = gltf.scene.getObjectByName(BODY_MESH_NAME);
        const geometry = body instanceof THREE.Mesh ? body.geometry : null;
        if (isFull) {
          asset.fullBody = geometry;
          asset.fullRequested = true;
        } else asset.liteBody = geometry;
        if (asset === customerAsset && body instanceof THREE.Mesh && body.material instanceof THREE.MeshStandardMaterial) {
          templateMaterial = body.material;
        }
        asset.clips = gltf.animations;
        const walkClip = THREE.AnimationClip.findByName(asset.clips, "Walk");
        const mannequin = gltf.scene.getObjectByName("CafeMannequin");
        const stride = mannequin?.userData.walkCycleDistance;
        if (typeof stride === "number" && stride > 0) asset.walkCycleDistance = stride * CUSTOMER_SCALE;
        if (walkClip && typeof stride === "number" && stride > 0) asset.walkSpeed = stride * CUSTOMER_SCALE / walkClip.duration;
        // markers เป็นของ GLB ที่โหลดได้จริง ไฟล์เก่าที่ไม่มีจะได้ {} แล้ว controller ใช้ค่า fallback
        const markers = mannequin?.userData.animationMarkers;
        asset.markers = markers && typeof markers === "object" ? markers as CharacterAsset["markers"] : {};
        onReady();
      };
      loader.load(asset.urls.lite, (gltf) => accept(gltf, false), undefined, () => {
        loader.load(asset.urls.full, (gltf) => accept(gltf, true), undefined, () => onError?.());
      });
    };
    /** ผิวรุ่นละเอียด — โหลดครั้งแรกที่ซูมจนตัวละครใหญ่บนจอ โหลดไม่ได้ก็ใช้รุ่นเบาต่อ */
    const loadFullBody = (asset: CharacterAsset) => {
      asset.fullRequested = true;
      loader.load(asset.urls.full, (gltf) => {
        if (disposed) {
          disposeModel(gltf.scene);
          return;
        }
        asset.fullScene = gltf.scene;
        const body = gltf.scene.getObjectByName(BODY_MESH_NAME);
        asset.fullBody = body instanceof THREE.Mesh ? body.geometry : null;
        invalidate();
      });
    };

    /** พนักงานเป็นของประกอบฉาก — โหลดเฉพาะเมื่อมีเคาน์เตอร์ที่ยืนได้ และโหลดไม่ได้ก็แค่ไม่มีพนักงาน ไม่ต้องถอยไปใช้ SVG */
    let staffRequested = false;
    const loadStaffModels = () => {
      if (staffRequested) return;
      staffRequested = true;
      loadCharacter(staffAsset, () => {
        syncStaff();
        invalidate();
      });
    };

    const removeStaff = () => {
      for (const member of staff) {
        member.mixer.stopAllAction();
        member.mixer.uncacheRoot(member.model);
        scene.remove(member.model);
      }
      staff.length = 0;
    };
    const servingProps = createLegacyServingProps(CUSTOMER_SCALE, TRAY_HEIGHT, TRAY_FORWARD);
    const { createTray } = servingProps;
    /** พนักงานหนึ่งคน (ท่าทำงานที่เคาน์เตอร์) — ระหว่างจำลองจะเดินตาม simulation */
    const addStaffMember = (x: number, z: number, rotation: number, index: number): StandingStaff => {
      const model = cloneSkinned(staffAsset.template!);
      model.position.set(x, 0, z);
      model.rotation.y = rotation;
      model.scale.setScalar(CUSTOMER_SCALE);
      scene.add(model);
      const mixer = new THREE.AnimationMixer(model);
      // พนักงานทำงานบนเคาน์เตอร์ (Work) — ไฟล์เก่าที่ไม่มีคลิปนี้ใช้ท่ายืน
      const work = THREE.AnimationClip.findByName(staffAsset.clips, "Work") ?? THREE.AnimationClip.findByName(staffAsset.clips, "Idle");
      const action = work ? mixer.clipAction(work) : null;
      action?.play();
      // ตั้งท่าทันที — ฉากนิ่งวาดเฟรมเดียว พนักงานจึงต้องอยู่ในท่ายืนตั้งแต่เฟรมแรก
      mixer.update(index * STAFF_IDLE_PHASE);
      const body = model.getObjectByName(BODY_MESH_NAME);
      if (body instanceof THREE.SkinnedMesh && staffAsset.liteBody) attachShadowProxy(body, staffAsset.liteBody, quality.current.characterShadows);
      const cap = model.getObjectByName(STAFF_CAP_NAME);
      if (cap) cap.castShadow = quality.current.characterShadows;
      const member: StandingStaff = {
        staffId: index,
        mixer, model, body: body instanceof THREE.SkinnedMesh ? body : null,
        target: null, targetRotation: rotation, animation: "Work", action, tray: null,
      };
      staff.push(member);
      return member;
    };

    /** พนักงานยืนท่าทำงานหลังเคาน์เตอร์ — แสดงตลอดตอนไม่ได้จำลอง */
    const syncStaff = () => {
      removeStaff();
      const layout = stageRef.current?.layout;
      const spots = layout ? staffSpots(layout) : [];
      if (spots.length === 0) return;
      // โหลดโมเดลพนักงานครั้งแรกที่ผังมีจุดให้ยืน — โหลดเสร็จจะเรียก syncStaff อีกรอบ
      if (!staffAsset.template) {
        loadStaffModels();
        return;
      }
      spots.forEach((spot, index) => addStaffMember(spot.position.x, spot.position.y, Math.atan2(spot.facing.x, spot.facing.y), index));
    };

    const playStaffClip = (member: StandingStaff, name: "Walk" | "Work") => {
      const clip = THREE.AnimationClip.findByName(staffAsset.clips, name) ?? THREE.AnimationClip.findByName(staffAsset.clips, "Idle");
      if (!clip) return;
      const action = member.mixer.clipAction(clip).reset().play();
      if (member.action && member.action !== action) action.crossFadeFrom(member.action, ANIMATION_FADE_SECONDS, false);
      member.action = action;
      member.animation = name;
    };

    /** ระหว่างจำลอง: พนักงานหน้าร้านตามจำนวนที่ตั้งไว้ เดินรับออร์เดอร์ เสิร์ฟ เก็บโต๊ะตาม simulation */
    const syncSimStaff = (modern: boolean) => {
      const current = controller.current;
      if (!current) return;
      if (!staffAsset.template) {
        loadStaffModels();
        return;
      }
      const layout = stageRef.current?.layout;
      const spots = layout ? staffSpots(layout) : [];
      const { staff: frame } = current;
      const count = frame.length / STAFF_STRIDE;
      if (staff.length !== count || staff.some((member) => !member.target)) {
        removeStaff();
        for (let i = 0; i < count; i++) {
          const member = addStaffMember(frame[i * STAFF_STRIDE + 1]!, frame[i * STAFF_STRIDE + 2]!, 0, i);
          // Snapshot และ buffer ใช้ id ตัวแรกของแต่ละ stride ไม่ใช่ลำดับใน array
          member.staffId = frame[i * STAFF_STRIDE]!;
          member.target = member.model.position.clone();
          const tray = createTray();
          member.model.add(tray);
          member.tray = tray;
        }
      }
      const tables = layout?.objects.filter((o) => o.type === "table") ?? [];
      staff.forEach((member, i) => {
        const x = frame[i * STAFF_STRIDE + 1]!;
        const z = frame[i * STAFF_STRIDE + 2]!;
        const code = frame[i * STAFF_STRIDE + 3]!;
        const target = member.target!;
        const dx = x - target.x;
        const dz = z - target.z;
        if (dx * dx + dz * dz > 0.0001) member.targetRotation = Math.atan2(dx, dz);
        else if (code === STAFF_STATE_CODE["taking-order"] || code === STAFF_STATE_CODE.cleaning) {
          // ยืนทำงานที่โต๊ะ: หันหน้าเข้าโต๊ะที่ใกล้ที่สุด
          const table = tables.reduce<(typeof tables)[number] | null>((best, t) => {
            const c = objectCenter(t);
            return !best || (c.x - x) ** 2 + (c.y - z) ** 2 < (objectCenter(best).x - x) ** 2 + (objectCenter(best).y - z) ** 2 ? t : best;
          }, null);
          if (table) {
            const c = objectCenter(table);
            member.targetRotation = Math.atan2(c.x - x, c.y - z);
          }
        } else if (code === STAFF_STATE_CODE.counter && spots[i]) {
          const spot = spots[i]!;
          if (Math.hypot(spot.position.x - x, spot.position.y - z) < 0.05) member.targetRotation = Math.atan2(spot.facing.x, spot.facing.y);
        }
        target.set(x, 0, z);
        // staff-actions เป็นเจ้าของถาดและคลิปเมื่อมี metadata จึงไม่สลับทับกัน
        if (member.tray && !modern) member.tray.visible = code === STAFF_STATE_CODE.serving;
        // อยู่ในครัว (หลังผนัง) — ไม่ต้องวาดจนกว่าจะเดินออกมา
        member.model.visible = code !== STAFF_KITCHEN_CODE;
      });
    };

    const syncCustomers = (modern: boolean) => {
      const current = controller.current;
      if (!customerAsset.template || !current) return;
      const liveIds = new Set<number>();
      const { agents } = current;
      const chairs = stageRef.current?.layout?.objects.filter((item) => item.type === "chair") ?? [];
      const door = stageRef.current?.layout ? doorFrame(stageRef.current.layout) : null;
      for (let offset = 0; offset < agents.length; offset += AGENT_STRIDE) {
        const id = agents[offset]!;
        const x = agents[offset + 1]!;
        const z = agents[offset + 2]!;
        const state = agents[offset + 3]!;
        const animation = animationFor(state);
        // โหมดใหม่: เก้าอี้ของแต่ละคนมาจาก party.chairIds ผ่านสาย seating ไม่ใช่เก้าอี้ที่ใกล้ที่สุด
        const seatedChair = !modern && state === AGENT_STATE_SEATED
          ? chairs.reduce<(typeof chairs)[number] | null>((nearest, chair) => {
              const center = objectCenter(chair);
              const currentDistance = (center.x - x) ** 2 + (center.y - z) ** 2;
              if (!nearest) return chair;
              const nearestCenter = objectCenter(nearest);
              const nearestDistance = (nearestCenter.x - x) ** 2 + (nearestCenter.y - z) ** 2;
              return currentDistance < nearestDistance ? chair : nearest;
            }, null)
          : null;
        const chairRotation = seatedChair ? THREE.MathUtils.degToRad(seatedChair.rotation) : 0;
        const targetX = x + (seatedChair ? Math.sin(chairRotation) * SEATED_FRONT_OFFSET : 0);
        const targetZ = z - (seatedChair ? Math.cos(chairRotation) * SEATED_FRONT_OFFSET : 0);
        liveIds.add(id);

        let customer = customers.get(id);
        if (!customer) {
          // SkinnedMesh ต้อง clone ผ่าน SkeletonUtils ให้แต่ละตัวมีโครงกระดูกของตัวเอง
          const model = cloneSkinned(customerAsset.template);
          const look = customerLook(id);
          model.position.set(targetX, 0, targetZ);
          model.scale.setScalar(CUSTOMER_SCALE * look.scale);
          scene.add(model);
          const body = model.getObjectByName(BODY_MESH_NAME);
          if (body instanceof THREE.SkinnedMesh && templateMaterial) body.material = customerMaterial(templateMaterial, look.colors);
          if (body instanceof THREE.SkinnedMesh && customerAsset.liteBody) attachShadowProxy(body, customerAsset.liteBody, quality.current.characterShadows);
          customer = {
            mixer: new THREE.AnimationMixer(model),
            action: null,
            standingUp: 0,
            model,
            body: body instanceof THREE.SkinnedMesh ? body : null,
            target: new THREE.Vector3(targetX, 0, targetZ),
            animation,
            targetRotation: 0,
            still: 0,
            idleOffset: (id * 1.37) % 6,
            seat: null,
          };
          if (!modern) playClip(customer, animation);
          customers.set(id, customer);
        }
        const dx = targetX - customer.target.x;
        const dz = targetZ - customer.target.z;
        if (dx * dx + dz * dz > 0.0001) customer.targetRotation = Math.atan2(dx, dz);
        if (seatedChair) customer.targetRotation = THREE.MathUtils.degToRad(180 - seatedChair.rotation);
        if (state === AGENT_STATE_WAITING_ENTRANCE && door) {
          // ยืนต่อแถวนอกร้าน: หันหน้าเข้าประตูเสมอ (ไม่ใช่ทิศที่เดินมาล่าสุด)
          customer.targetRotation = Math.atan2(door.center.x - targetX, door.center.y - targetZ);
        }
        customer.target.set(targetX, 0, targetZ);
        // ท่ายืนรอ (Idle) สลับกับ Walk ตามความเร็วใน tick — simulation บอกแค่ว่าไม่ได้นั่ง
        const standing = animation === "Walk" && customer.animation === "Idle";
        // โหมดใหม่: customer-actions/seating เป็นเจ้าของคลิปและจังหวะเก้าอี้ทั้งหมด
        if (!modern && animation !== customer.animation && !standing) {
          const rig = animation === "Sit" && seatedChair ? chairRigs.get(seatedChair.id) : undefined;
          if (customer.seat) {
            // ลุก: เลื่อนเก้าอี้ออกก่อน (ท่าลุกเริ่มใน stepSeat) — ยังไม่ทันนั่งก็เดินต่อได้เลย
            if (!startRise(customer.seat.motion, customer.seat.chair.slide)) {
              customer.seat = null;
              playClip(customer, animation);
            }
          } else if (rig && rig.slide.occupant === null) {
            // นั่ง: ยืนรอให้ดึงเก้าอี้ออกก่อน แล้วค่อยนั่ง (ท่านั่งเริ่มใน stepSeat)
            const sitSeconds = THREE.AnimationClip.findByName(customerAsset.clips, "Sit")?.duration ?? 1;
            customer.seat = { motion: startSeat(rig.slide, id, sitSeconds, sitSeconds / STAND_UP_RATE), chair: rig };
            customer.standingUp = 0;
            playClip(customer, "Idle");
          } else if (customer.animation === "Sit") standUp(customer);
          else {
            customer.standingUp = 0;
            playClip(customer, animation);
          }
          customer.animation = animation;
        }
      }
      for (const [id, customer] of customers) {
        if (!liveIds.has(id)) removeCustomer(id, customer);
      }
    };

    /** ตำแหน่ง/ท่าของลูกค้าระหว่างดึงเก้าอี้ นั่ง ดันเก้าอี้ และลุก — ตามเก้าอี้แทนจุดจำลอง */
    const updateSeat = (customer: AnimatedCustomer, seat: NonNullable<AnimatedCustomer["seat"]>, delta: number) => {
      const { chair, motion } = seat;
      const { offset, seated, event } = stepSeat(motion, chair.slide, delta);
      if (event === "sit") playClip(customer, "Sit");
      else if (event === "rise") {
        standUp(customer);
        motion.riseSeconds = Math.max(customer.standingUp, 1e-3);
        customer.standingUp = 0;
      }
      // บนเก้าอี้: ถอยสะโพกชิดพนักพิง (SEATED_FRONT_OFFSET วัดไปทางหน้าเก้าอี้ = ตรงข้ามกับ out)
      const back = offset - (seated ? SEATED_FRONT_OFFSET : 0);
      const spot = new THREE.Vector3().copy(chair.home).addScaledVector(chair.out, back);
      if (motion.phase === "pull") customer.model.position.lerp(spot, Math.min(1, delta * 14));
      else customer.model.position.copy(spot);
      const turn = customer.targetRotation - customer.model.rotation.y;
      customer.model.rotation.y += Math.atan2(Math.sin(turn), Math.cos(turn)) * Math.min(1, delta * 8);
      customer.mixer.update(delta);
      if (event === "done") {
        customer.seat = null;
        customer.still = 0;
        playClip(customer, customer.animation);
      }
    };

    /**
     * โหมดใหม่: ขยับตำแหน่ง/ทิศของทุกตัวก่อนที่ feature จะอ่าน แล้ว feature จึงตั้งคลิปเองทั้งหมด
     * - พนักงานและลูกค้าที่ยังเดินใช้เป้าหมายจาก pacer ของ feat-115 เหมือนเดิม
     * - ลูกค้าที่นั่งใช้ตำแหน่งจากสาย seating (เก้าอี้จริงของคนนั้น) ไม่ใช่เก้าอี้ที่ใกล้ที่สุด
     */
    const moveModernCharacters = (
      delta: number,
      blend: number,
      body: THREE.BufferGeometry | null,
      staffBody: THREE.BufferGeometry | null,
    ) => {
      const turnTowards = (object: THREE.Object3D, target: number) => {
        const turn = target - object.rotation.y;
        object.rotation.y += Math.atan2(Math.sin(turn), Math.cos(turn)) * Math.min(1, delta * 8);
      };
      for (const member of staff) {
        if (staffBody && member.body && member.body.geometry !== staffBody) member.body.geometry = staffBody;
        if (!member.target) continue;
        member.model.position.lerp(member.target, blend);
        turnTowards(member.model, member.targetRotation);
      }
      const seats = new Map((features.seating?.getBodyPlacements() ?? []).map((seat) => [seat.renderAgentId, seat]));
      const eating = new Map((features.customerActions?.getReports() ?? []).map((report) => [report.renderAgentId, report]));
      for (const [id, customer] of customers) {
        if (body && customer.body && customer.body.geometry !== body) customer.body.geometry = body;
        const seat = seats.get(id);
        const rig = seat ? chairRigs.get(seat.chairId) : undefined;
        if (!seat || !rig) {
          customer.model.position.lerp(customer.target, blend);
          turnTowards(customer.model, customer.targetRotation);
          continue;
        }
        // สะโพกถอยชิดพนักพิงเมื่อนั่งแล้ว และขยับเข้าหาโต๊ะเท่าที่คลิป Eat ต้องการ (ไม่เกินระยะที่เก้าอี้สอดใต้โต๊ะ)
        const report = eating.get(id);
        const reach = report?.eating ? Math.min(Math.max(report.plateForwardCorrection, 0), MAX_SEAT_REACH_SHIFT) : 0;
        const along = seat.outwardOffset - (seat.seated ? SEATED_FRONT_OFFSET : 0) - reach;
        customer.model.position.copy(rig.home).addScaledVector(rig.out, along);
        turnTowards(customer.model, Math.atan2(seat.facing.x, seat.facing.y));
      }
    };

    /** ลูกค้าหลายสิบตัว × 2 รอบ (ภาพ + เงา) — ตอนตัวเล็กบนจอใช้ผิวรุ่นเบา ซูมเข้าใกล้ค่อยใช้รุ่นละเอียด */
    const wantsLiteBody = () => {
      const pixelsPerMeter = (renderer.domElement.clientHeight * camera.zoom) / (camera.top - camera.bottom);
      return pixelsPerMeter * CUSTOMER_HEIGHT * CUSTOMER_SCALE < LITE_MAX_SCREEN_HEIGHT;
    };
    /** ผิวที่ควรใช้ตอนนี้ — ซูมใกล้ครั้งแรกค่อยโหลดรุ่นละเอียด (ระหว่างโหลดใช้รุ่นเบาไปก่อน) */
    const bodyForZoom = (asset: CharacterAsset) => {
      if (wantsLiteBody()) return asset.liteBody;
      if (!asset.fullRequested) loadFullBody(asset);
      return asset.fullBody ?? asset.liteBody;
    };

    /** ลดคุณภาพตามขั้นของ AdaptiveQuality: ความละเอียด canvas → เงาตัวละคร + shadow map เล็กลง */
    const applyQuality = () => {
      const level = quality.current;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, level.maxPixelRatio));
      scene.traverse((object) => {
        if (object.name === "ShadowProxy" || object.name === STAFF_CAP_NAME) object.castShadow = level.characterShadows;
      });
      if (key.shadow.mapSize.x !== level.shadowMapSize) {
        key.shadow.mapSize.set(level.shadowMapSize, level.shadowMapSize);
        key.shadow.map?.dispose();
        key.shadow.map = null;
      }
      // ไม่มีเงาตัวละคร = เงาในฉากไม่ขยับ วาด shadow map ใหม่เฉพาะตอนผังเปลี่ยน (effect ที่สร้าง content ตั้ง needsUpdate)
      renderer.shadowMap.autoUpdate = level.characterShadows;
      renderer.shadowMap.needsUpdate = true;
    };

    // วาดตามต้องการ: ฉากนิ่งวาดเฟรมเดียวแล้วหยุด; ระหว่างจำลอง loop ต่อเนื่อง; หยุดจำลองแต่มีลูกค้าค้างอยู่ ~30 fps
    let lastRenderAt = 0;
    const tick = () => {
      frame = 0;
      if (disposed) return;
      const now = performance.now();
      const simulating = isSimRef.current;
      const running = simulating && !pausedRef.current;
      if (!running && customers.size > 0 && lastRenderAt && now - lastRenderAt < PAUSED_FRAME_MS) {
        frame = requestAnimationFrame(tick);
        return;
      }
      // วัดความเร็วเครื่องเฉพาะระหว่างจำลองที่เดินอยู่ (loop เต็มความเร็ว) — ช้าต่อเนื่องก็ลดคุณภาพ
      if (running && lastRenderAt) {
        if (quality.sample(now - lastRenderAt) !== null) applyQuality();
      } else quality.reset();
      lastRenderAt = now;
      const realDelta = clock.getDelta();
      // เฟรมช้าไม่ทิ้งเวลา: ส่วนที่เกินเพดานถูกเก็บเป็นหนี้แล้วทยอยคืน (runtime/frame-clock.ts)
      const step = frameClock.step(realDelta, running);
      const delta = running ? step.seconds : Math.min(realDelta, MAX_FRAME_DELTA);
      const cameraAnimating = stage.updateCamera(now);
      const roomAnimating = stage.updateRoomTransition(now);
      const modernFrame = simulating && controller.current?.presentation !== undefined;
      if (simulating) {
        syncCustomers(modernFrame);
        syncSimStaff(modernFrame);
      }
      const blend = Math.min(1, delta * 14);
      const body = bodyForZoom(customerAsset);
      const staffBody = staff.length > 0 ? bodyForZoom(staffAsset) : null;
      const presentation = simulating ? controller.current?.presentation : undefined;
      // worker รุ่นเก่าหรือยังไม่มี metadata → เดินเส้นทางเดิมทั้งหมด ไม่เดาสถานะอาหาร/คราบ/ที่นั่ง
      const modern = presentation !== undefined;
      const frameInput = {
        nowMs: now, realDeltaSeconds: running ? step.seconds : 0,
        playbackRate: simulationStore.getState().config.speed,
        simulating, paused: pausedRef.current, presentation,
      };
      if (modern) {
        moveModernCharacters(delta, blend, body, staffBody);
        // feature อ่านตำแหน่งที่วาดจริงของเฟรมนี้ แล้วตั้งคลิป/ถาด/เก้าอี้
        runtime.update(frameInput);
        for (const member of staff) member.mixer.update(delta);
        for (const customer of customers.values()) customer.mixer.update(delta);
        renderer.render(scene, camera);
        if (simulating || customers.size > 0 || cameraAnimating || roomAnimating) {
          frame = requestAnimationFrame(tick);
        } else {
          clock.stop();
          lastRenderAt = 0;
        }
        return;
      }
      for (const member of staff) {
        if (staffBody && member.body && member.body.geometry !== staffBody) member.body.geometry = staffBody;
        if (!member.target) {
          member.mixer.update(delta);
          continue;
        }
        const beforeX = member.model.position.x;
        const beforeZ = member.model.position.z;
        member.model.position.lerp(member.target, blend);
        const distance = Math.hypot(member.model.position.x - beforeX, member.model.position.z - beforeZ);
        const turn = member.targetRotation - member.model.rotation.y;
        member.model.rotation.y += Math.atan2(Math.sin(turn), Math.cos(turn)) * Math.min(1, delta * 8);
        const moving = delta > 0 && distance / delta > STAFF_WALK_MIN_SPEED;
        if (moving && member.animation !== "Walk") playStaffClip(member, "Walk");
        else if (!moving && member.animation === "Walk" && member.model.position.distanceToSquared(member.target) < 0.0004) playStaffClip(member, "Work");
        member.mixer.update(
          member.animation === "Walk" ? Math.min(distance / staffAsset.walkSpeed, delta * MAX_WALK_PLAYBACK_RATE) : delta,
        );
      }
      stepChairs(delta);
      runtime.update(frameInput);
      for (const customer of customers.values()) {
        if (body && customer.body && customer.body.geometry !== body) customer.body.geometry = body;
        if (customer.seat) {
          updateSeat(customer, customer.seat, delta);
          continue;
        }
        if (customer.standingUp > 0) {
          // ลุกให้เสร็จที่เก้าอี้ก่อน แล้วค่อยผสมเข้าท่าเดินไปหาจุดจำลอง
          customer.mixer.update(delta);
          customer.standingUp -= delta;
          if (customer.standingUp <= 0) playClip(customer, customer.animation);
          continue;
        }
        const beforeX = customer.model.position.x;
        const beforeZ = customer.model.position.z;
        if (simulating) customer.model.position.lerp(customer.target, blend);
        const distance = Math.hypot(customer.model.position.x - beforeX, customer.model.position.z - beforeZ);
        const turn = customer.targetRotation - customer.model.rotation.y;
        customer.model.rotation.y += Math.atan2(Math.sin(turn), Math.cos(turn)) * Math.min(1, delta * 8);
        if (customer.animation === "Walk" || customer.animation === "Idle") {
          const speed = delta > 0 ? distance / delta : 0;
          customer.still = speed < IDLE_SPEED ? customer.still + delta : 0;
          if (customer.animation === "Walk" && customer.still > IDLE_AFTER_SECONDS) {
            customer.animation = "Idle";
            playClip(customer, "Idle");
          } else if (customer.animation === "Idle" && speed > IDLE_EXIT_SPEED) {
            customer.animation = "Walk";
            playClip(customer, "Walk");
          }
        }
        // Advance the walk by distance travelled, including simulation speed changes.
        customer.mixer.update(
          customer.animation === "Walk" ? Math.min(distance / customerAsset.walkSpeed, delta * MAX_WALK_PLAYBACK_RATE) : delta,
        );
      }
      renderer.render(scene, camera);
      if (simulating || customers.size > 0 || cameraAnimating || roomAnimating) {
        frame = requestAnimationFrame(tick);
      } else {
        clock.stop();
        lastRenderAt = 0;
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
      if (stage.layout) fitCamera(camera, stage.layout, stage.viewRotation, width, height);
      camera.zoom = zoomRef.current;
      camera.updateProjectionMatrix();
      // วาดทันที (ไม่รอ rAF) เพื่อไม่ให้ canvas ว่างกระพริบหลังเปลี่ยนขนาด
      renderer.render(scene, camera);
    };
    const updateCamera = (now: number) => {
      if (!cameraMotion || !stage.layout) return false;
      const progress = Math.min(1, (now - cameraMotion.startedAt) / VIEW_ROTATION_DURATION_MS);
      // smootherstep: ความเร็วและความเร่งเป็นศูนย์ทั้งต้น/ปลาย จึงไม่เห็นจังหวะสะดุด
      const eased = smootherstep(progress);
      const motion = cameraMotion;
      const angle = motion.fromAngle + motion.angleDelta * eased;
      const radius = THREE.MathUtils.lerp(motion.fromRadius, motion.toRadius, eased);
      // เดินตาม arc รอบกึ่งกลางร้าน ไม่ตัดเป็นเส้นตรงผ่านกลางฉาก
      camera.position.set(
        motion.centerX + Math.cos(angle) * radius,
        THREE.MathUtils.lerp(motion.from.position.y, motion.to.position.y, eased),
        motion.centerZ + Math.sin(angle) * radius,
      );
      // กรอบ orthographic ต้องไหลพร้อมตำแหน่งกล้อง มิฉะนั้นภาพจะสะบัดในเฟรมแรก
      camera.left = THREE.MathUtils.lerp(motion.from.left, motion.to.left, eased);
      camera.right = THREE.MathUtils.lerp(motion.from.right, motion.to.right, eased);
      camera.top = THREE.MathUtils.lerp(motion.from.top, motion.to.top, eased);
      camera.bottom = THREE.MathUtils.lerp(motion.from.bottom, motion.to.bottom, eased);
      camera.far = THREE.MathUtils.lerp(motion.from.far, motion.to.far, eased);
      camera.zoom = THREE.MathUtils.lerp(motion.from.zoom, motion.to.zoom, eased);
      camera.lookAt(stage.layout.width / 2, CAMERA_TARGET_Y, stage.layout.depth / 2);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      if (progress === 1) cameraMotion = null;
      return cameraMotion !== null;
    };
    const replaceContent = (
      floor: THREE.Group,
      room: THREE.Group,
      furniture: THREE.Group,
    ) => {
      roomMotion = null;
      if (stage.room) scene.remove(stage.room);
      disposeContent(stage.room);
      if (stage.floor) {
        scene.remove(stage.floor);
        disposeContent(stage.floor);
      }
      if (stage.furniture) {
        scene.remove(stage.furniture);
        disposeContent(stage.furniture);
      }
      scene.add(floor, room, furniture);
      // ลูกค้าที่จองเก้าอี้ชุดเดิมไว้ — ปล่อยให้เดินตามจุดจำลองต่อ
      for (const customer of customers.values()) customer.seat = null;
      collectChairRigs(furniture);
      stage.floor = floor;
      stage.room = room;
      stage.furniture = furniture;
    };
    const updateRoomTransition = (now: number) => {
      if (!roomMotion) return false;
      const progress = Math.min(1, (now - roomMotion.startedAt) / VIEW_ROTATION_DURATION_MS);
      const eased = smootherstep(progress);
      const opacity = new Map<WallDoor["wall"], number>();
      for (const wall of ["north", "south", "west", "east"] as WallDoor["wall"][]) {
        opacity.set(wall, THREE.MathUtils.lerp(roomMotion.from.get(wall) ?? 0, roomMotion.to.get(wall) ?? 0, eased));
      }
      if (stage.room) setRoomOpacity(stage.room, opacity);
      if (progress < 1) return true;
      roomMotion = null;
      return false;
    };
    const animateRoom = (nextView: ViewRotation) => {
      if (!stage.room) return;
      // กดหมุนซ้ำกลางทางได้: เริ่มจาก opacity จริงของเฟรมปัจจุบัน ไม่ย้อนกลับหรือกระโดด
      roomMotion = { from: roomOpacitySnapshot(stage.room), to: roomOpacityForView(nextView), startedAt: performance.now() };
      invalidate();
    };
    const animateCamera = () => {
      if (!stage.layout) return;
      const from = cameraFrame(camera);
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      // fitCamera คำนวณ camera frame ของมุมใหม่ แล้วคืน frame ที่เห็นอยู่ก่อนรอเฟรมถัดไป
      fitCamera(camera, stage.layout, stage.viewRotation, width, height);
      camera.zoom = zoomRef.current;
      camera.updateProjectionMatrix();
      const to = cameraFrame(camera);
      applyCameraFrame(camera, from);
      camera.lookAt(stage.layout.width / 2, CAMERA_TARGET_Y, stage.layout.depth / 2);
      camera.updateMatrixWorld();
      const centerX = stage.layout.width / 2;
      const centerZ = stage.layout.depth / 2;
      const fromX = from.position.x - centerX;
      const fromZ = from.position.z - centerZ;
      const toX = to.position.x - centerX;
      const toZ = to.position.z - centerZ;
      cameraMotion = {
        from,
        to,
        centerX,
        centerZ,
        fromAngle: Math.atan2(fromZ, fromX),
        angleDelta: shortestAngleDelta(Math.atan2(fromZ, fromX), Math.atan2(toZ, toX)),
        fromRadius: Math.hypot(fromX, fromZ),
        toRadius: Math.hypot(toX, toZ),
        startedAt: performance.now(),
      };
      invalidate();
    };
    /**
     * พอร์ตที่ host ส่งให้ feature: feature อ่าน rig แล้วคุมคลิป/ถาด/เก้าอี้ แต่ตำแหน่งตัวละคร
     * ยังมาจาก pacer ของ feat-115 ที่ host เป็นเจ้าของ และ host เป็นผู้เดินเวลา mixer เอง
     */
    const reducedMotionActive = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    const staffRigOf = (member: StandingStaff): StaffRig => ({
      staffId: member.staffId,
      model: member.model,
      mixer: member.mixer,
      clips: staffAsset.clips,
      markers: staffAsset.markers,
      walkCycleDistance: staffAsset.walkCycleDistance,
      tray: member.tray,
      getObject: (name: string) => member.model.getObjectByName(name) ?? null,
    });
    const customerRigOf = (id: number, customer: AnimatedCustomer): CustomerRig => ({
      renderAgentId: id,
      model: customer.model,
      mixer: customer.mixer,
      clips: customerAsset.clips,
      markers: customerAsset.markers,
      walkCycleDistance: customerAsset.walkCycleDistance,
      modelScale: CUSTOMER_SCALE,
      getObject: (name: string) => customer.model.getObjectByName(name) ?? null,
    });
    const features: SceneFeatureHandles = createSceneFeatureFactories({
      staffRigs: { listRigs: () => staff.map(staffRigOf) },
      customerRigs: { listRigs: () => [...customers].map(([id, customer]) => customerRigOf(id, customer)) },
      chairRigs: {
        listChairs: (): readonly SeatingChairRig[] =>
          [...chairRigs].map(([chairId, rig]) => ({ chairId, object: rig.object, home: rig.home })),
      },
      reducedMotion: reducedMotionActive,
      // แสงจริงรับไฟเดิมของฉากไปใช้ ไม่สร้างดวงที่สองทับ
      lighting: { existingLights: { sunLight: lighting.key, skyGroundLight: lighting.ambient } },
    });
    const runtime = createSceneRuntime({
      scene, camera,
      getLayout: () => stageRef.current?.layout ?? null,
      getQuality: () => quality.current,
      invalidate,
      invalidateShadows: () => { renderer.shadowMap.needsUpdate = true; invalidate(); },
    }, features.factories);
    const stage: Stage = {
      renderer,
      runtime,
      scene,
      camera,
      key,
      floor: null,
      room: null,
      furniture: null,
      layout: null,
      viewRotation: 0,
      invalidate,
      resize,
      clearCustomers,
      syncStaff,
      animateCamera,
      updateCamera,
      replaceContent,
      animateRoom,
      updateRoomTransition,
    };
    stageRef.current = stage;
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    loadCharacter(customerAsset, invalidate, () => {
      if (!disposed) onUnavailable();
    });
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      try {
        runtime.dispose();
      } finally {
        clearCustomers();
        disposeContent(stage.room);
        disposeContent(stage.floor);
        disposeContent(stage.furniture);
        // geometry/material ของโมเดลถูกแชร์ระหว่าง clone ทุกตัว — คืนครั้งเดียวที่ template
        for (const member of staff) member.mixer.stopAllAction();
        servingProps.dispose();
        for (const asset of [customerAsset, staffAsset]) {
          disposeModel(asset.template);
          disposeModel(asset.fullScene);
        }
        lighting.dispose();
        renderer.dispose();
        renderer.domElement.remove();
        stageRef.current = null;
      }
    };
  }, [onUnavailable]);

  // ผังเปลี่ยนจริงจึงสร้างฉากใหม่ทั้งชุด; การหมุนเปลี่ยนเพียง opacity ของผนัง/วงกบชุดเดิม
  React.useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const layoutChanged = stage.layout !== layout;
    const layoutSizeChanged = stage.layout?.width !== layout.width || stage.layout?.depth !== layout.depth;
    const viewChanged = stage.layout !== null && stage.viewRotation !== viewRotation;
    stage.layout = layout;
    stage.viewRotation = viewRotation;
    if (layoutChanged || !stage.room || !stage.furniture) {
      const room = buildRoomContent(layout);
      setRoomOpacity(room, roomOpacityForView(viewRotation));
      stage.replaceContent(buildFloorContent(layout), room, buildFurnitureContent(layout));
      stage.syncStaff();
      stage.runtime.syncLayout(layout);
      // เงาฉากนิ่งอาจปิด autoUpdate ไว้ (เครื่องช้า) — แก้ผังจริงจึงต้องวาด shadow map ใหม่
      stage.renderer.shadowMap.needsUpdate = true;
    } else if (viewChanged) {
      stage.animateRoom(viewRotation);
    }
    // การหมุนมุมมองไม่ใช่การเปลี่ยนขนาดร้าน จึงไม่แตะตำแหน่งไฟหรือ shadow camera
    // ตำแหน่งแดดและ shadow camera เป็นของ feature แสง (feat-121) ซึ่ง fit เองใน syncLayout
    if (layoutSizeChanged) stage.resize();
    else if (viewChanged) stage.animateCamera();
    stage.invalidate();
  }, [layout, viewRotation]);

  React.useEffect(() => {
    pausedRef.current = simPaused;
  }, [simPaused]);

  React.useEffect(() => {
    isSimRef.current = isSim;
    const stage = stageRef.current;
    if (!stage) return;
    if (!isSim) {
      stage.runtime.reset();
      stage.clearCustomers();
      // กลับมายืนประจำหลังเคาน์เตอร์
      stage.syncStaff();
    }
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
