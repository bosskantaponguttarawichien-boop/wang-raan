import * as THREE from "three";
import type { StoreLayout } from "@/core/layout/types";

/** Legacy fixed lighting, extracted without changing colours/intensities/shadows. */
export function createLegacyLighting(scene: THREE.Scene) {
  const ambient = new THREE.HemisphereLight("#ffffff", "#d4d8df", 2.1);
  const key = new THREE.DirectionalLight("#fff1dc", 2.4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0005;
  key.shadow.normalBias = 0.02;
  scene.add(ambient, key, key.target);
  let disposed = false;
  // `ambient` and `key` are handed to the lighting feature so the simulation sun adopts
  // the existing lights instead of adding a second set to the same scene.
  return { key, ambient, dispose() {
    if (disposed) return;
    disposed = true;
    ambient.removeFromParent();
    key.removeFromParent();
    key.target.removeFromParent();
    key.shadow.map?.dispose();
  } };
}

/**
 * กล้องเงาค่าเริ่มต้นครอบแค่ ±5 ม. รอบ (0,0,0) = มุมร้าน → เงาวัตถุไกลมุมถูกตัดขาด
 * จึงเล็งไฟไปกลางร้าน และขยาย frustum ให้ครอบทั้งร้าน (2–30 ม.) ตามขนาดผัง
 * ทิศแสงยึดกับโลกของร้าน ไม่ย้ายตามกล้อง เพื่อให้เงาไม่เปลี่ยนระหว่างหมุนมุมมอง
 */
export function fitKeyLight(key: THREE.DirectionalLight, layout: StoreLayout) {
  const centerX = layout.width / 2;
  const centerZ = layout.depth / 2;
  const span = Math.hypot(layout.width, layout.depth) / 2 + 1;
  const reach = span / 5;
  // world-space light: กล้องหมุนได้ แต่ตำแหน่ง/ทิศเงายังคงเดิมเสมอ
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
