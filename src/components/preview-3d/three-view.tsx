"use client";

import * as React from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  FURNITURE_COLOR_HEX,
  chairStyleOf,
  objectCenter,
  tableStyleOf,
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

type AnimatedCustomer = {
  mixer: THREE.AnimationMixer;
  model: THREE.Object3D;
  target: THREE.Vector3;
  state: number;
  animation: "Idle" | "Walk";
};

const MODEL_URL = "/assets/models/cafe-customer.glb";
const WALL_HEIGHT = 2.7;

function createRoom(scene: THREE.Scene, layout: StoreLayout) {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(layout.width, layout.depth),
    new THREE.MeshStandardMaterial({ color: "#f7f8fa", roughness: 0.94 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(layout.width / 2, 0, layout.depth / 2);
  floor.receiveShadow = true;
  scene.add(floor);

  const wallMaterial = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.88 });
  const northWall = new THREE.Mesh(new THREE.BoxGeometry(layout.width, WALL_HEIGHT, 0.14), wallMaterial);
  northWall.position.set(layout.width / 2, WALL_HEIGHT / 2, 0);
  northWall.receiveShadow = true;
  const westWall = new THREE.Mesh(new THREE.BoxGeometry(0.14, WALL_HEIGHT, layout.depth), wallMaterial);
  westWall.position.set(0, WALL_HEIGHT / 2, layout.depth / 2);
  westWall.receiveShadow = true;
  scene.add(northWall, westWall);
}

function createFurniture(scene: THREE.Scene, layout: StoreLayout) {
  const white = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.75 });
  const orange = new THREE.MeshStandardMaterial({ color: "#f28c45", roughness: 0.72 });
  const metal = new THREE.MeshStandardMaterial({ color: "#3f4650", roughness: 0.5, metalness: 0.35 });
  const materials = new Map<FurnitureColor, THREE.MeshStandardMaterial>();
  const material = (color: FurnitureColor) => {
    let m = materials.get(color);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color: FURNITURE_COLOR_HEX[color], roughness: color === "oak" ? 0.62 : 0.72 });
      materials.set(color, m);
    }
    return m;
  };
  const mesh = (geometry: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geometry, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    return m;
  };
  /** ขาสี่ขาที่มุม (กรอบ w × d) หรือขาเดี่ยวกลาง + ฐานกลม */
  const legs = (group: THREE.Group, kind: "four-legs" | "pedestal", w: number, d: number, height: number, round: boolean) => {
    if (kind === "pedestal") {
      group.add(
        mesh(new THREE.CylinderGeometry(0.04, 0.05, height, 16), metal, 0, height / 2, 0),
        mesh(new THREE.CylinderGeometry(Math.min(w, d) * 0.3, Math.min(w, d) * 0.32, 0.03, 24), metal, 0, 0.015, 0),
      );
      return;
    }
    // โต๊ะกลม: ขาอยู่ในวงกลม (แนวทแยง 45°) ไม่โผล่พ้นหน้าโต๊ะ
    const ox = round ? (w / 2) * 0.62 : w / 2 - 0.06;
    const oz = round ? (d / 2) * 0.62 : d / 2 - 0.06;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      group.add(mesh(new THREE.BoxGeometry(0.035, height, 0.035), metal, sx * ox, height / 2, sz * oz));
    }
  };

  for (const item of layout.objects) {
    const group = new THREE.Group();
    const center = objectCenter(item);
    group.position.set(center.x, 0, center.y);
    group.rotation.y = THREE.MathUtils.degToRad(-item.rotation);

    if (item.type === "table") {
      const style = tableStyleOf(item);
      const round = style.shape === "round";
      const topHeight = 0.74;
      const top = round
        ? new THREE.CylinderGeometry(item.width / 2, item.width / 2, 0.04, 40)
        : new THREE.BoxGeometry(item.width, 0.04, item.depth);
      group.add(mesh(top, material(style.color), 0, topHeight, 0));
      legs(group, style.legStyle, item.width, item.depth, topHeight - 0.02, round);
    } else if (item.type === "chair") {
      const style = chairStyleOf(item);
      const seatHeight = 0.45;
      const seatW = item.width * 0.86;
      const seatD = item.depth * 0.86;
      const seat =
        style.kind === "stool"
          ? new THREE.CylinderGeometry(seatW / 2, seatW / 2, 0.06, 24)
          : new THREE.BoxGeometry(seatW, 0.06, seatD);
      group.add(mesh(seat, material(style.color), 0, seatHeight, 0));
      legs(group, style.legStyle, seatW, seatD, seatHeight - 0.03, style.kind === "stool");
      if (style.kind === "chair") {
        // ด้านหน้าของเก้าอี้ rotation 0 คือ −y (เหนือ) → พนักพิงอยู่ฝั่ง +z
        group.add(mesh(new THREE.BoxGeometry(seatW, 0.42, 0.05), material(style.color), 0, seatHeight + 0.24, seatD / 2 - 0.025));
      }
    } else {
      const color = item.type === "counter" ? orange : white;
      const height = item.type === "counter" ? 1.05 : 1.15;
      const cabinet = new THREE.Mesh(new THREE.BoxGeometry(item.width, height, item.depth), color);
      cabinet.position.y = height / 2;
      cabinet.castShadow = true;
      cabinet.receiveShadow = true;
      group.add(cabinet);
    }
    scene.add(group);
  }
}

function createCamera(layout: StoreLayout, element: HTMLElement) {
  const aspect = Math.max(1, element.clientWidth) / Math.max(1, element.clientHeight);
  // Orthographic isometric: ระยะเยื้องแกน X/Y/Z ต้องเท่ากัน
  // จึงได้ azimuth 45° และ elevation 35.264° ทำให้แกนพื้นทั้งสองย่อเท่ากันบนจอ
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  const targetX = layout.width / 2;
  const targetY = 0.45;
  const targetZ = layout.depth / 2;
  const isoDistance = Math.max(layout.width, layout.depth) * 1.6 + 1;
  camera.position.set(targetX + isoDistance, targetY + isoDistance, targetZ + isoDistance);
  camera.lookAt(targetX, targetY, targetZ);
  camera.updateMatrixWorld();

  // พอดีกรอบ: ฉายมุมห้อง (พื้น + ยอดผนัง) ลงพิกัดกล้อง แล้วขยายด้านที่ขาดให้ตรงสัดส่วนจอ — เต็มจอทั้งแนวตั้งและแนวนอน
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
  camera.updateProjectionMatrix();
  return camera;
}

/** มุมมอง WebGL แบบ lazy-loaded สำหรับ Playground เท่านั้น — SVG isometric เป็น fallback อยู่ที่ caller */
export function ThreeView({ layout, zoom, isSim, onUnavailable }: ThreeViewProps) {
  const hostRef = React.useRef<HTMLDivElement>(null);
  // ซูมผ่านกล้อง (ไม่ใช้ CSS scale) เพื่อให้ภาพยังอยู่ในกรอบ Canvas เต็มพื้นที่
  const zoomRef = React.useRef(zoom);
  const applyZoomRef = React.useRef<(zoom: number) => void>(() => {});

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

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#f5f7fb");
    const camera = createCamera(layout, host);
    const clock = new THREE.Clock();
    const customers = new Map<number, AnimatedCustomer>();
    const controller = getSimulationController();
    let modelTemplate: THREE.Object3D | null = null;
    let clips: THREE.AnimationClip[] = [];
    let frame = 0;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.dataset.testid = "three-canvas";
    renderer.domElement.setAttribute("aria-hidden", "true");
    renderer.domElement.className = "h-full w-full";
    host.replaceChildren(renderer.domElement);

    const ambient = new THREE.HemisphereLight("#ffffff", "#d4d8df", 2.1);
    const key = new THREE.DirectionalLight("#fff1dc", 2.4);
    key.position.set(-4, 8, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    scene.add(ambient, key);
    createRoom(scene, layout);
    createFurniture(scene, layout);
    renderer.setSize(Math.max(1, host.clientWidth), Math.max(1, host.clientHeight), false);
    renderer.render(scene, camera);

    const loader = new GLTFLoader();
    loader.load(
      MODEL_URL,
      (gltf) => {
        modelTemplate = gltf.scene;
        clips = gltf.animations;
      },
      undefined,
      () => onUnavailable(),
    );

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      const next = createCamera(layout, host);
      camera.left = next.left;
      camera.right = next.right;
      camera.top = next.top;
      camera.bottom = next.bottom;
      camera.position.copy(next.position);
      camera.lookAt(layout.width / 2, 0.45, layout.depth / 2);
      camera.zoom = zoomRef.current;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    applyZoomRef.current = (next) => {
      camera.zoom = next;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    // วาดฉากแรกทันที เพื่อไม่ให้พื้นที่ 3D ว่างระหว่างที่ browser ยังไม่ส่ง animation frame แรก
    renderer.render(scene, camera);
    const render = () => {
      const delta = clock.getDelta();
      if (isSim && modelTemplate) {
        const current = controller.current;
        const liveIds = new Set<number>();
        if (current) {
          for (let offset = 0; offset < current.agents.length; offset += AGENT_STRIDE) {
            const id = current.agents[offset]!;
            const x = current.agents[offset + 1]!;
            const z = current.agents[offset + 2]!;
            const state = current.agents[offset + 3]!;
            liveIds.add(id);
            if (!customers.has(id)) {
              const model = modelTemplate.clone(true);
              model.position.set(x, 0, z);
              model.scale.setScalar(0.82);
              model.traverse((object) => {
                if (object instanceof THREE.Mesh) object.castShadow = true;
              });
              scene.add(model);
              const mixer = new THREE.AnimationMixer(model);
              const animationName: AnimatedCustomer["animation"] = state === 4 ? "Idle" : "Walk";
              const clip = clips.find((candidate) => candidate.name === animationName) ?? clips[0];
              if (clip) mixer.clipAction(clip).play();
              customers.set(id, { mixer, model, target: new THREE.Vector3(x, 0, z), state, animation: animationName });
            }
            const customer = customers.get(id)!;
            const dx = x - customer.target.x;
            const dz = z - customer.target.z;
            if (Math.hypot(dx, dz) > 0.01) customer.model.rotation.y = Math.atan2(dx, dz);
            customer.target.set(x, 0, z);
            const nextAnimation: AnimatedCustomer["animation"] = state === 4 ? "Idle" : "Walk";
            if (nextAnimation !== customer.animation) {
              customer.mixer.stopAllAction();
              const clip = clips.find((candidate) => candidate.name === nextAnimation) ?? clips[0];
              if (clip) customer.mixer.clipAction(clip).play();
              customer.animation = nextAnimation;
            }
            customer.state = state;
          }
        }
        for (const [id, customer] of customers) {
          if (!liveIds.has(id)) {
            scene.remove(customer.model);
            customers.delete(id);
          }
        }
      }
      for (const customer of customers.values()) {
        customer.mixer.update(delta);
        if (isSim) customer.model.position.lerp(customer.target, Math.min(1, delta * 14));
      }
      renderer.render(scene, camera);
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(frame);
      applyZoomRef.current = () => {};
      observer.disconnect();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [isSim, layout, onUnavailable]);

  React.useEffect(() => {
    zoomRef.current = zoom;
    applyZoomRef.current(zoom);
  }, [zoom]);

  return (
    <figure
      className="relative m-0 h-full min-h-[260px] w-full overflow-hidden rounded-[20px]"
      aria-label={`มุมมองร้าน 3 มิติ ขนาด ${layout.width} × ${layout.depth} เมตร`}
      data-testid="three-view"
    >
      <div ref={hostRef} className="absolute inset-0" />
    </figure>
  );
}
