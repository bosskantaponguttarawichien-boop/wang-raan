"use client";

import * as React from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const MODEL_URL = "/assets/models/cafe-customer.glb";

export type CharacterFacing = "front" | "right" | "back" | "left";
export type CharacterMotion = "idle" | "walking";

const FACING_RADIANS: Record<CharacterFacing, number> = {
  front: 0,
  right: -Math.PI / 2,
  back: Math.PI,
  left: Math.PI / 2,
};

function shortestAngle(from: number, to: number) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

/**
 * WebGL scene สำหรับทดสอบ asset โดยเฉพาะ
 * ไม่เชื่อม state ของ simulation เพื่อให้ผลการทดลองยืนแยกจากผังและ Worker อย่างเด็ดขาด
 */
export function CharacterLabScene({
  facing,
  onMotionChange,
}: {
  facing: CharacterFacing;
  onMotionChange: (motion: CharacterMotion) => void;
}) {
  const hostRef = React.useRef<HTMLDivElement>(null);
  const targetRotationRef = React.useRef(FACING_RADIANS[facing]);
  const motionChangeRef = React.useRef(onMotionChange);
  const [unavailable, setUnavailable] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    targetRotationRef.current = FACING_RADIANS[facing];
  }, [facing]);

  React.useEffect(() => {
    motionChangeRef.current = onMotionChange;
  }, [onMotionChange]);

  React.useEffect(() => {
    const host = hostRef.current;
    if (!host || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setUnavailable(true);
      return;
    }

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch {
      setUnavailable(true);
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#f4f7fc");
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(3.4, 2.5, 5.2);
    camera.lookAt(0, 0.95, 0);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.className = "h-full w-full";
    renderer.domElement.setAttribute("aria-hidden", "true");
    host.replaceChildren(renderer.domElement);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(2.25, 64),
      new THREE.MeshStandardMaterial({ color: "#e5edf9", roughness: 0.94 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const ambient = new THREE.HemisphereLight("#ffffff", "#aab9d0", 2.4);
    const key = new THREE.DirectionalLight("#fff3e5", 3.1);
    key.position.set(-3, 5, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    const rim = new THREE.DirectionalLight("#bfd5ff", 1.35);
    rim.position.set(3, 2, -3);
    scene.add(ambient, key, rim);

    const grid = new THREE.GridHelper(4, 8, "#c9d6e8", "#dce6f3");
    grid.position.y = 0.003;
    scene.add(grid);

    const targetMarker = new THREE.Mesh(
      new THREE.RingGeometry(0.12, 0.19, 32),
      new THREE.MeshBasicMaterial({ color: "#2f6fec", side: THREE.DoubleSide }),
    );
    targetMarker.rotation.x = -Math.PI / 2;
    targetMarker.position.y = 0.016;
    targetMarker.visible = false;
    scene.add(targetMarker);

    const loader = new GLTFLoader();
    const clock = new THREE.Clock();
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    let mixer: THREE.AnimationMixer | null = null;
    let model: THREE.Object3D | null = null;
    let clips: THREE.AnimationClip[] = [];
    let walkTarget: THREE.Vector3 | null = null;
    let activeAnimation: "Idle" | "Walk" | null = null;
    let motion: CharacterMotion = "idle";
    let frame = 0;

    const setMotion = (next: CharacterMotion) => {
      if (motion === next) return;
      motion = next;
      motionChangeRef.current(next);
    };
    const playAnimation = (name: "Idle" | "Walk", clips: THREE.AnimationClip[]) => {
      if (!mixer || activeAnimation === name) return;
      const clip = clips.find((candidate) => candidate.name === name);
      if (!clip) return;
      mixer.stopAllAction();
      mixer.clipAction(clip).reset().play();
      activeAnimation = name;
    };
    const chooseTarget = (event: PointerEvent) => {
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
      pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      if (!raycaster.ray.intersectPlane(ground, hit) || hit.length() > 2) return;
      walkTarget = hit.clone();
      walkTarget.y = 0;
      targetMarker.position.set(walkTarget.x, 0.016, walkTarget.z);
      targetMarker.visible = true;
      setMotion("walking");
    };

    loader.load(
      MODEL_URL,
      (gltf) => {
        model = gltf.scene;
        clips = gltf.animations;
        model.scale.setScalar(1.18);
        model.position.y = 0;
        model.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.castShadow = true;
            object.receiveShadow = true;
          }
        });
        scene.add(model);

        const idle = gltf.animations.find((clip) => clip.name === "Idle");
        if (idle) {
          mixer = new THREE.AnimationMixer(model);
          mixer.clipAction(idle).play();
          activeAnimation = "Idle";
        }
      },
      undefined,
      () => setFailed(true),
    );

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    renderer.domElement.addEventListener("pointerdown", chooseTarget);
    resize();

    const render = () => {
      const delta = clock.getDelta();
      mixer?.update(delta);
      if (model) {
        if (walkTarget) {
          const dx = walkTarget.x - model.position.x;
          const dz = walkTarget.z - model.position.z;
          const distance = Math.hypot(dx, dz);
          if (distance <= 0.025) {
            model.position.set(walkTarget.x, 0, walkTarget.z);
            walkTarget = null;
            targetMarker.visible = false;
            setMotion("idle");
            playAnimation("Idle", clips);
          } else {
            const step = Math.min(distance, 1.15 * delta);
            model.position.x += (dx / distance) * step;
            model.position.z += (dz / distance) * step;
            targetRotationRef.current = Math.atan2(dx, dz);
            playAnimation("Walk", clips);
          }
        }
        const difference = shortestAngle(model.rotation.y, targetRotationRef.current);
        model.rotation.y += difference * Math.min(1, delta * 8);
      }
      renderer.render(scene, camera);
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", chooseTarget);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  if (unavailable || failed) {
    return (
      <div className="grid min-h-[360px] place-items-center rounded-[18px] border border-dashed border-line bg-surface px-6 text-center">
        <div>
          <p className="m-0 text-base font-semibold text-ink">ยังเปิดฉาก 3D ไม่ได้</p>
          <p className="m-0 mt-2 max-w-sm text-sm leading-6 text-secondary">
            {failed ? "ไม่สามารถโหลดไฟล์โมเดลตัวละครได้" : "อุปกรณ์นี้ปิดการเคลื่อนไหวไว้หรือไม่รองรับ WebGL"}
          </p>
        </div>
      </div>
    );
  }

  return <div ref={hostRef} className="h-[min(62vh,620px)] min-h-[360px] overflow-hidden rounded-[18px]" aria-label="ตัวละครยืนในฉากทดลอง 3 มิติ" role="img" />;
}
