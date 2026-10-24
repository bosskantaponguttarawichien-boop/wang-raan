"use client";

import * as React from "react";
import * as THREE from "three";
import { CHARACTER_MODELS, CHARACTER_SCALE, type CharacterRole } from "@/components/preview-3d/character-models";
import { createCharacterLoader } from "@/components/preview-3d/character-loader";

const MAX_ANIMATION_DELTA_SECONDS = 1 / 30;
const WALK_ACCELERATION = 1.4;
const ANIMATION_FADE_SECONDS = 0.22;
/** ลุกขึ้น = เล่นคลิป Sit ย้อนกลับ เร็วกว่าตอนนั่งลงเล็กน้อย (เท่ากับฉากร้าน) */
const STAND_UP_RATE = 1.3;

export type CharacterFacing = "front" | "right" | "back" | "left";
export type CharacterMotion = "idle" | "walking" | "seated";

const FACING_RADIANS: Record<CharacterFacing, number> = {
  front: 0,
  right: -Math.PI / 2,
  back: Math.PI,
  left: Math.PI / 2,
};

function disposeModel(model: THREE.Object3D) {
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    for (const material of [object.material].flat()) material.dispose();
  });
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const media = window.matchMedia?.(REDUCED_MOTION);
  media?.addEventListener?.("change", onChange);
  return () => media?.removeEventListener?.("change", onChange);
}

function prefersReducedMotion() {
  return window.matchMedia?.(REDUCED_MOTION).matches ?? false;
}

function shortestAngle(from: number, to: number) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

/**
 * ฉากแยกสำหรับตรวจ mannequin ตัวจริง: ใช้ animation ที่ฝังมากับ GLB
 * เพื่อให้สัดส่วนและการเดินตรงกับมุมมอง 3D ของร้านเสมอ
 */
export function CharacterLabScene({
  role,
  facing,
  seated,
  onMotionChange,
}: {
  role: CharacterRole;
  facing: CharacterFacing;
  seated: boolean;
  onMotionChange: (motion: CharacterMotion) => void;
}) {
  const hostRef = React.useRef<HTMLDivElement>(null);
  const targetRotationRef = React.useRef(FACING_RADIANS[facing]);
  const seatedRef = React.useRef(seated);
  const motionChangeRef = React.useRef(onMotionChange);
  const reducedMotion = React.useSyncExternalStore(subscribeReducedMotion, prefersReducedMotion, () => false);
  const [noWebGL, setNoWebGL] = React.useState(false);
  const unavailable = reducedMotion || noWebGL;
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    targetRotationRef.current = FACING_RADIANS[facing];
  }, [facing]);

  React.useEffect(() => {
    seatedRef.current = seated;
  }, [seated]);

  React.useEffect(() => {
    motionChangeRef.current = onMotionChange;
  }, [onMotionChange]);

  React.useEffect(() => {
    const host = hostRef.current;
    if (!host || reducedMotion) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch {
      // สร้าง WebGL context ไม่ได้ (ระบบภายนอก) — รู้ได้ตอนสร้างจริงเท่านั้น จึงต้องตั้ง state ใน effect
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNoWebGL(true);
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#f4f7fc");
    const camera = new THREE.PerspectiveCamera(31, 1, 0.1, 100);
    camera.position.set(1.7, 2.5, 5.4);
    camera.lookAt(0, 0.8, 0);

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

    // พนักพิงอยู่ด้านหลัง (−Z) เพื่อให้ mannequin หันหน้า +Z เข้าหากล้อง.
    const chair = new THREE.Group();
    const chairMaterial = new THREE.MeshStandardMaterial({ color: "#bd966d", roughness: 0.78 });
    const addChairPart = (width: number, height: number, depth: number, x: number, y: number, z: number) => {
      const part = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), chairMaterial);
      part.position.set(x, y, z);
      part.castShadow = true;
      part.receiveShadow = true;
      chair.add(part);
    };
    // ผิวบนเบาะ 0.45 ม. เท่าเก้าอี้ในฉากร้าน
    addChairPart(0.44, 0.06, 0.42, 0, 0.42, 0);
    for (const x of [-0.17, 0.17]) {
      for (const z of [-0.15, 0.15]) addChairPart(0.045, 0.39, 0.045, x, 0.195, z);
    }
    addChairPart(0.44, 0.42, 0.05, 0, 0.67, -0.18);
    chair.visible = false;
    scene.add(chair);

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
    const loader = createCharacterLoader();
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
    let walkSpeed = 0.44;
    let currentSpeed = 0;
    /** วินาทีที่เหลือของท่าลุกจากเก้าอี้ */
    let standingUp = 0;
    let frame = 0;

    const setMotion = (next: CharacterMotion) => {
      if (motion === next) return;
      motion = next;
      motionChangeRef.current(next);
    };
    const sitAction = () => {
      const clip = THREE.AnimationClip.findByName(clips, "Sit");
      return mixer && clip ? mixer.existingAction(clip) : null;
    };
    const play = (name: "Idle" | "Walk" | "Sit") => {
      standingUp = 0;
      if (activeAnimation === "Sit" && name === "Sit") {
        // กดนั่งอีกครั้งระหว่างกำลังลุก → นั่งกลับลงจากท่าที่อยู่ตอนนี้
        const action = sitAction();
        if (action) action.paused = false;
        action?.setEffectiveTimeScale(1);
        return;
      }
      if (!mixer || activeAnimation === name) return;
      const clip = THREE.AnimationClip.findByName(clips, name);
      if (!clip) return;
      const next = mixer.clipAction(clip).reset().setEffectiveTimeScale(1).setEffectiveWeight(1);
      if (name === "Sit") {
        next.setLoop(THREE.LoopOnce, 1);
        next.clampWhenFinished = true;
      }
      next.play();
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
      seatedRef.current = false;
      walkTarget = hit.clone();
      targetMarker.position.set(walkTarget.x, 0.016, walkTarget.z);
      targetMarker.visible = true;
      play("Walk");
      setMotion("walking");
    };

    let disposed = false;
    // เปลี่ยนบทบาทกลางคัน ตัวละครเดิมหายไป → ท่าเริ่มต้นของฉากใหม่คือยืน (ถ้าไม่ได้สั่งนั่งไว้)
    if (!seatedRef.current) motionChangeRef.current("idle");
    loader.load(
      CHARACTER_MODELS[role].full,
      (gltf) => {
        const model = gltf.scene;
        if (disposed) {
          disposeModel(model);
          return;
        }
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
        const walkClip = THREE.AnimationClip.findByName(clips, "Walk");
        const stride = model.getObjectByName("CafeMannequin")?.userData.walkCycleDistance;
        if (walkClip && typeof stride === "number" && stride > 0) walkSpeed = stride * CHARACTER_SCALE / walkClip.duration;
        mixer = new THREE.AnimationMixer(model);
      play(walkTarget ? "Walk" : seatedRef.current ? "Sit" : "Idle");
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
      if (root) {
        if (seatedRef.current && motion !== "seated") {
          walkTarget = null;
          currentSpeed = 0;
          targetMarker.visible = false;
          // ถอยข้อสะโพกไปหลังกลางเบาะเล็กน้อย ให้หลังชิดพนักพิงโดยไม่จม (เท่าฉากร้าน)
          root.position.set(0, 0, -0.035);
          root.rotation.y = FACING_RADIANS.front;
          play("Sit");
          setMotion("seated");
        } else if (!seatedRef.current && motion === "seated") {
          // ลุกจากเก้าอี้ด้วยท่านั่งย้อนกลับ แล้วค่อยผสมเข้าท่ายืน
          const action = sitAction();
          if (action) {
            action.paused = false;
            action.setEffectiveTimeScale(-STAND_UP_RATE);
            standingUp = action.time / STAND_UP_RATE;
          } else play("Idle");
          setMotion("idle");
        }
        if (standingUp > 0) {
          standingUp -= delta;
          if (standingUp <= 0) play("Idle");
        }
        chair.visible = seatedRef.current || standingUp > 0;
        if (walkTarget) {
          const dx = walkTarget.x - root.position.x;
          const dz = walkTarget.z - root.position.z;
          const distance = Math.hypot(dx, dz);
          if (distance <= 0.004) {
            root.position.set(walkTarget.x, 0, walkTarget.z);
            walkTarget = null;
            currentSpeed = 0;
            targetMarker.visible = false;
            play("Idle");
            setMotion("idle");
          } else {
            targetRotationRef.current = Math.atan2(dx, dz);
            const turn = Math.abs(shortestAngle(root.rotation.y, targetRotationRef.current));
            const desiredSpeed = Math.min(walkSpeed, Math.sqrt(2 * WALK_ACCELERATION * distance)) * Math.max(0.15, Math.cos(turn));
            currentSpeed += THREE.MathUtils.clamp(desiredSpeed - currentSpeed, -WALK_ACCELERATION * delta, WALK_ACCELERATION * delta);
            const step = Math.min(distance, currentSpeed * delta);
            root.position.x += (dx / distance) * step;
            root.position.z += (dz / distance) * step;
          }
        }
        root.rotation.y += shortestAngle(root.rotation.y, targetRotationRef.current) * Math.min(1, delta * 8);
      }
      if (mixer) {
        const walkClip = THREE.AnimationClip.findByName(clips, "Walk");
        if (walkClip) mixer.existingAction(walkClip)?.setEffectiveTimeScale(currentSpeed / walkSpeed);
        mixer.update(delta);
      }
      renderer.render(scene, camera);
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", chooseTarget);
      mixer?.stopAllAction();
      if (root) disposeModel(root);
      chair.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
      });
      chairMaterial.dispose();
      floor.geometry.dispose();
      (floor.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
    // เปลี่ยนบทบาท = สร้างฉากใหม่ด้วยโมเดลของบทบาทนั้น
  }, [role, reducedMotion]);

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

  return <div ref={hostRef} className="h-[min(62vh,620px)] min-h-[360px] overflow-hidden rounded-[18px]" aria-label={`Mannequin ${CHARACTER_MODELS[role].label}${seated ? "นั่งบนเก้าอี้" : ""}ในฉากทดลอง 3 มิติ`} role="img" />;
}
