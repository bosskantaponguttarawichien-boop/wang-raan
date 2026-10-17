"use client";

import * as React from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const MODEL_URL = "/assets/models/cafe-customer.glb";
const CHARACTER_SCALE = 0.9;
const MAX_ANIMATION_DELTA_SECONDS = 1 / 30;
const WALK_SPEED_METERS_PER_SECOND = 1.15;
const ANIMATION_FADE_SECONDS = 0.22;

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
 * ฉากแยกสำหรับตรวจ mannequin ตัวจริง: ใช้ animation ที่ฝังมากับ GLB
 * เพื่อให้สัดส่วนและการเดินตรงกับมุมมอง 3D ของร้านเสมอ
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
    const camera = new THREE.PerspectiveCamera(31, 1, 0.1, 100);
    camera.position.set(2.4, 1.8, 3.6);
    camera.lookAt(0, 0.55, 0);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.className = "h-full w-full";
    renderer.domElement.setAttribute("aria-hidden", "true");
    host.replaceChildren(renderer.domElement);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(1.85, 64),
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

    const clock = new THREE.Clock();
    const loader = new GLTFLoader();
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    let root: THREE.Group | null = null;
    let mixer: THREE.AnimationMixer | null = null;
    let clips: THREE.AnimationClip[] = [];
    let activeAnimation = "";
    let walkTarget: THREE.Vector3 | null = null;
    let motion: CharacterMotion = "idle";
    let frame = 0;

    const setMotion = (next: CharacterMotion) => {
      if (motion === next) return;
      motion = next;
      motionChangeRef.current(next);
    };
    const play = (name: "Idle" | "Walk") => {
      if (!mixer || activeAnimation === name) return;
      const clip = THREE.AnimationClip.findByName(clips, name);
      if (!clip) return;
      const next = mixer.clipAction(clip).reset().setEffectiveWeight(1).play();
      const previous = activeAnimation ? mixer.existingAction(THREE.AnimationClip.findByName(clips, activeAnimation)!) : null;
      // ค่อย ๆ ผสมท่าเดิมกับท่าใหม่ ข้อต่อจึงไม่กระตุกตอนเริ่ม/หยุดเดิน
      if (previous) next.crossFadeFrom(previous, ANIMATION_FADE_SECONDS, false);
      activeAnimation = name;
    };
    const chooseTarget = (event: PointerEvent) => {
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
      pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      if (!raycaster.ray.intersectPlane(ground, hit) || hit.length() > 1.62) return;
      walkTarget = hit.clone();
      targetMarker.position.set(walkTarget.x, 0.016, walkTarget.z);
      targetMarker.visible = true;
      play("Walk");
      setMotion("walking");
    };

    loader.load(
      MODEL_URL,
      (gltf) => {
        const model = gltf.scene;
        model.scale.setScalar(CHARACTER_SCALE);
        model.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.castShadow = true;
            object.receiveShadow = true;
          }
        });
        root = new THREE.Group();
        root.add(model);
        scene.add(root);
        clips = gltf.animations;
        mixer = new THREE.AnimationMixer(model);
        play(walkTarget ? "Walk" : "Idle");
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
      const delta = Math.min(clock.getDelta(), MAX_ANIMATION_DELTA_SECONDS);
      mixer?.update(delta);
      if (root) {
        if (walkTarget) {
          const dx = walkTarget.x - root.position.x;
          const dz = walkTarget.z - root.position.z;
          const distance = Math.hypot(dx, dz);
          if (distance <= 0.025) {
            root.position.set(walkTarget.x, 0, walkTarget.z);
            walkTarget = null;
            targetMarker.visible = false;
            play("Idle");
            setMotion("idle");
          } else {
            const step = Math.min(distance, WALK_SPEED_METERS_PER_SECOND * delta);
            root.position.x += (dx / distance) * step;
            root.position.z += (dz / distance) * step;
            targetRotationRef.current = Math.atan2(dx, dz);
          }
        }
        root.rotation.y += shortestAngle(root.rotation.y, targetRotationRef.current) * Math.min(1, delta * 8);
      }
      renderer.render(scene, camera);
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", chooseTarget);
      mixer?.stopAllAction();
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

  return <div ref={hostRef} className="h-[min(62vh,620px)] min-h-[360px] overflow-hidden rounded-[18px]" aria-label="Mannequin สีเทาในฉากทดลอง 3 มิติ" role="img" />;
}
