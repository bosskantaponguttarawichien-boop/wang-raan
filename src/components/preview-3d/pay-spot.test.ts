import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { objectCenter } from "@/core/layout/geometry";
import type { Counter, StoreLayout } from "@/core/layout/types";
import { STAFF_STANDOFFS, cashierSpot, paySpots, posInset } from "@/core/preview/staff-spots";
import { prepareStore } from "@/core/simulation/engine";
import { staffHomes } from "@/core/simulation/staff-visual";

const room = (counter: Counter): StoreLayout => ({ id: "room", version: 1, units: "m", width: 10, depth: 10, entrance: null, kitchenDoor: null, objects: [counter] });

/** จุดบนผังของจุดท้องถิ่นในเคาน์เตอร์ — แปลงแบบเดียวกับที่ three-view วางเคาน์เตอร์ (object + createCounter) */
function sceneSpot(counter: Counter, localX: number, localZ: number) {
  const center = objectCenter(counter);
  const object = new THREE.Object3D();
  object.position.set(center.x, 0, center.y);
  object.rotation.y = THREE.MathUtils.degToRad(-counter.rotation);
  const inner = new THREE.Object3D();
  if (counter.depth > counter.width) inner.rotation.y = Math.PI / 2;
  object.add(inner);
  object.updateMatrixWorld(true);
  const world = inner.localToWorld(new THREE.Vector3(localX, 0, localZ));
  return { x: world.x, y: world.z };
}

describe("จุดจ่ายเงินหน้าจอ POS ตรงกับโมเดล 3D", () => {
  for (const [width, depth] of [[2.4, 0.7], [0.7, 2.4]] as const) {
    for (const rotation of [0, 90, 180, 270] as const) {
      it(`เคาน์เตอร์ ${width}×${depth} หมุน ${rotation}°`, () => {
        const counter: Counter = { id: "c", type: "counter", x: 4, y: 4, width, depth, rotation };
        const long = Math.max(width, depth), short = Math.min(width, depth), standoff = STAFF_STANDOFFS[0]!;
        const [spot] = paySpots(room(counter));
        const posX = long / 2 - posInset(long);
        // ลูกค้าฝั่ง +z (ฝั่งห้อง) พนักงานฝั่ง −z
        const customer = sceneSpot(counter, posX, short / 2 + standoff);
        const staff = sceneSpot(counter, posX, -(short / 2 + standoff));
        expect(spot!.customer.x).toBeCloseTo(customer.x, 6);
        expect(spot!.customer.y).toBeCloseTo(customer.y, 6);
        expect(spot!.staff!.x).toBeCloseTo(staff.x, 6);
        expect(spot!.staff!.y).toBeCloseTo(staff.y, 6);
        const pos = sceneSpot(counter, posX, 0);
        expect(spot!.pos.x).toBeCloseTo(pos.x, 6);
        expect(spot!.pos.y).toBeCloseTo(pos.y, 6);
      });
    }
  }
});

describe("หลายเคาน์เตอร์: ลูกค้าจ่าย และพนักงานรับเงิน ที่จอ POS เดียวกัน", () => {
  const twoCounters = (): StoreLayout => ({
    ...room({ id: "a", type: "counter", x: 1, y: 1, width: 2.4, depth: 0.7, rotation: 0 }),
    objects: [
      { id: "a", type: "counter", x: 1, y: 1, width: 2.4, depth: 0.7, rotation: 0 },
      { id: "b", type: "counter", x: 6, y: 6, width: 2.4, depth: 0.7, rotation: 0 },
    ],
  });

  it("คิวจ่ายเงินช่องแรกอยู่หน้าจอของเคาน์เตอร์ที่พนักงานรับเงิน", () => {
    const layout = twoCounters();
    const cashier = cashierSpot(layout)!;
    expect(cashier.counterId).toBe("a");
    const { grid, paymentQueueCells } = prepareStore(layout);
    const first = paymentQueueCells[0]!;
    const col = first % grid.cols;
    const at = { x: (col + 0.5) * grid.cellSize, y: ((first - col) / grid.cols + 0.5) * grid.cellSize };
    expect(Math.hypot(at.x - cashier.customer.x, at.y - cashier.customer.y)).toBeLessThan(grid.cellSize);
  });

  it("engine ใช้จุดยืนประจำเดียวกับภาพ — พนักงานเกินจุดหลังเคาน์เตอร์ก็มีจุดยืนจริง", () => {
    const homes = staffHomes(twoCounters(), 5);
    expect(homes).toHaveLength(5);
    for (const home of homes) expect(Number.isFinite(home.x) && Number.isFinite(home.y)).toBe(true);
  });
});
