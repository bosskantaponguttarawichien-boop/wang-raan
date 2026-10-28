import * as THREE from "three";

/** Shared placeholder serving props from the original scene (no new food assets). */
export function createLegacyServingProps(characterScale: number, trayHeight: number, trayForward: number) {
  const plateGeometry = new THREE.CylinderGeometry(0.13, 0.1, 0.025, 20);
  const plateMaterial = new THREE.MeshStandardMaterial({ color: 0xfaf7f0, roughness: 0.5 });
  const foodGeometry = new THREE.SphereGeometry(0.08, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  const foodMaterial = new THREE.MeshStandardMaterial({ color: 0xe0a23a, roughness: 0.8 });
  // ถาดเสิร์ฟ: แผ่นถาดกับขอบถาดบาง ๆ ใต้แผ่น (ใช้ geometry/material ชุดเดียวทั้งร้าน)
  const trayGeometry = new THREE.BoxGeometry(0.42, 0.022, 0.3);
  const trayRimGeometry = new THREE.BoxGeometry(0.46, 0.012, 0.34);
  const trayMaterial = new THREE.MeshStandardMaterial({ color: 0x3c4150, roughness: 0.65 });
  /** ถาดพร้อมจานอาหาร วางไว้ระดับมือหน้าตัวพนักงาน (ซ่อนไว้จนถึงตอนเสิร์ฟ) */
  const createTray = () => {
    const tray = new THREE.Group();
    const board = new THREE.Mesh(trayGeometry, trayMaterial);
    const rim = new THREE.Mesh(trayRimGeometry, trayMaterial);
    rim.position.y = -0.014;
    const plate = new THREE.Mesh(plateGeometry, plateMaterial);
    plate.position.y = 0.024;
    const food = new THREE.Mesh(foodGeometry, foodMaterial);
    food.position.y = 0.036;
    tray.add(board, rim, plate, food);
    tray.position.set(0, trayHeight / characterScale, trayForward / characterScale);
    tray.scale.setScalar(1 / characterScale);
    tray.visible = false;
    return tray;
  };
  let disposed = false;
  return { createTray, dispose() {
    if (disposed) return;
    disposed = true;
    for (const resource of [plateGeometry, plateMaterial, foodGeometry, foodMaterial, trayGeometry, trayRimGeometry, trayMaterial]) resource.dispose();
  } };
}
