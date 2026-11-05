import * as THREE from "three";

/** จานบนถาดได้มากสุดเท่านี้ (เกินนี้ถาดยังโชว์เท่านี้ — ภาพไม่ล้นมือ) */
export const MAX_TRAY_PLATES = 6;
/** จานบนถาดเล็กกว่าจานบนโต๊ะ เพื่อวางได้หลายใบบนถาดเดียว (ม.) */
const TRAY_PLATE_RADIUS = 0.085;
const PLATE_GAP = 0.02;
const TRAY_MARGIN = 0.035;

/**
 * ตำแหน่งจานบนถาด (ม., กลางถาด = 0,0; x = กว้าง, z = ลึก) และขนาดถาดที่พอดีจำนวนจาน
 * 1 ใบ: กลาง · 2: เรียงคู่ · 3–4: 2×2 · 5–6: 3×2
 */
export function trayPlateLayout(count: number): { plates: { x: number; z: number }[]; width: number; depth: number } {
  const n = Math.max(1, Math.min(MAX_TRAY_PLATES, Math.floor(count)));
  const columns = n <= 2 ? n : n <= 4 ? 2 : 3;
  const rows = Math.ceil(n / columns);
  const pitch = TRAY_PLATE_RADIUS * 2 + PLATE_GAP;
  const plates: { x: number; z: number }[] = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / columns);
    // แถวสุดท้ายที่ไม่เต็มจัดให้อยู่กลาง
    const inRow = row === rows - 1 ? n - row * columns : columns;
    const column = i - row * columns;
    plates.push({ x: (column - (inRow - 1) / 2) * pitch, z: (row - (rows - 1) / 2) * pitch });
  }
  return { plates, width: columns * pitch - PLATE_GAP + TRAY_MARGIN * 2, depth: rows * pitch - PLATE_GAP + TRAY_MARGIN * 2 };
}

interface TrayParts {
  board: THREE.Mesh;
  rim: THREE.Mesh;
  plates: { plate: THREE.Mesh; food: THREE.Mesh }[];
}

const BOARD_SIZE = { width: 0.42, depth: 0.3 };
const RIM_EXTRA = 0.04;

/**
 * แสดงจานบนถาดให้เท่าจำนวนอาหารที่ถืออยู่จริง (เดิมถาดมีจานเดียวตายตัว — เสิร์ฟ 3 จานแต่เห็นถือ 1)
 * ถาดยืด/หดตามจำนวนจาน
 */
export function setTrayPlateCount(tray: THREE.Object3D, count: number) {
  const parts = tray.userData.trayParts as TrayParts | undefined;
  if (!parts || tray.userData.plateCount === count) return;
  tray.userData.plateCount = count;
  const layout = trayPlateLayout(count);
  parts.board.scale.set(layout.width / BOARD_SIZE.width, 1, layout.depth / BOARD_SIZE.depth);
  parts.rim.scale.set((layout.width + RIM_EXTRA) / (BOARD_SIZE.width + RIM_EXTRA), 1, (layout.depth + RIM_EXTRA) / (BOARD_SIZE.depth + RIM_EXTRA));
  parts.plates.forEach(({ plate, food }, index) => {
    const spot = layout.plates[index];
    plate.visible = food.visible = spot !== undefined;
    if (!spot) return;
    plate.position.x = food.position.x = spot.x;
    plate.position.z = food.position.z = spot.z;
  });
}

/** Shared placeholder serving props from the original scene (no new food assets). */
export function createLegacyServingProps(characterScale: number, trayHeight: number, trayForward: number) {
  const plateGeometry = new THREE.CylinderGeometry(TRAY_PLATE_RADIUS, TRAY_PLATE_RADIUS * 0.78, 0.022, 20);
  const plateMaterial = new THREE.MeshStandardMaterial({ color: 0xfaf7f0, roughness: 0.5 });
  const foodGeometry = new THREE.SphereGeometry(TRAY_PLATE_RADIUS * 0.6, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  const foodMaterial = new THREE.MeshStandardMaterial({ color: 0xe0a23a, roughness: 0.8 });
  // ถาดเสิร์ฟ: แผ่นถาดกับขอบถาดบาง ๆ ใต้แผ่น (ใช้ geometry/material ชุดเดียวทั้งร้าน)
  const trayGeometry = new THREE.BoxGeometry(BOARD_SIZE.width, 0.022, BOARD_SIZE.depth);
  const trayRimGeometry = new THREE.BoxGeometry(BOARD_SIZE.width + RIM_EXTRA, 0.012, BOARD_SIZE.depth + RIM_EXTRA);
  const trayMaterial = new THREE.MeshStandardMaterial({ color: 0x3c4150, roughness: 0.65 });
  /** ถาดพร้อมจานอาหาร วางไว้ระดับมือหน้าตัวพนักงาน (ซ่อนไว้จนถึงตอนเสิร์ฟ) — เริ่มที่ 1 จาน */
  const createTray = () => {
    const tray = new THREE.Group();
    const board = new THREE.Mesh(trayGeometry, trayMaterial);
    const rim = new THREE.Mesh(trayRimGeometry, trayMaterial);
    rim.position.y = -0.014;
    tray.add(board, rim);
    const plates = Array.from({ length: MAX_TRAY_PLATES }, () => {
      const plate = new THREE.Mesh(plateGeometry, plateMaterial);
      plate.position.y = 0.022;
      const food = new THREE.Mesh(foodGeometry, foodMaterial);
      food.position.y = 0.033;
      tray.add(plate, food);
      return { plate, food };
    });
    tray.userData.trayParts = { board, rim, plates } satisfies TrayParts;
    setTrayPlateCount(tray, 1);
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
