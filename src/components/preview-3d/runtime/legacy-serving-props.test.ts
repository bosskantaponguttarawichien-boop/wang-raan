import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { MAX_TRAY_PLATES, createLegacyServingProps, setTrayPlateCount, trayPlateLayout } from "./legacy-serving-props";

describe("ถาดเสิร์ฟ: จานเท่าจำนวนที่ถือจริง", () => {
  it("จัดจาน 1–6 ใบไม่ซ้อนกัน และถาดขยายตามจำนวน", () => {
    let previousArea = 0;
    for (let count = 1; count <= MAX_TRAY_PLATES; count++) {
      const { plates, width, depth } = trayPlateLayout(count);
      expect(plates).toHaveLength(count);
      for (const [i, a] of plates.entries()) for (const b of plates.slice(i + 1)) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(0.17);
      for (const plate of plates) {
        expect(Math.abs(plate.x)).toBeLessThan(width / 2);
        expect(Math.abs(plate.z)).toBeLessThan(depth / 2);
      }
      expect(width * depth).toBeGreaterThanOrEqual(previousArea);
      previousArea = width * depth;
    }
    expect(trayPlateLayout(9).plates).toHaveLength(MAX_TRAY_PLATES);
  });

  it("เสิร์ฟ 3 จาน → เห็น 3 จานบนถาด แล้วลดลงเมื่อวางไปทีละจาน", () => {
    const props = createLegacyServingProps(1, 1, 0.3);
    const tray = props.createTray();
    const visiblePlates = () => tray.children.filter(child => child instanceof THREE.Mesh && child.visible).length - 2;
    expect(visiblePlates() / 2).toBe(1);
    setTrayPlateCount(tray, 3);
    expect(visiblePlates() / 2).toBe(3);
    setTrayPlateCount(tray, 1);
    expect(visiblePlates() / 2).toBe(1);
    props.dispose();
  });
});
