import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { applySeatedIdle, clearSeatedIdle } from "./seated-idle";

function model() {
  const root = new THREE.Object3D();
  const spine = new THREE.Object3D(); spine.name = "Spine";
  const head = new THREE.Object3D(); head.name = "Head";
  root.add(spine); spine.add(head);
  return { root, spine, head };
}

describe("applySeatedIdle", () => {
  it("นาฬิกาไม่เดิน (หยุดชั่วคราว) แล้วท่านิ่งสนิท ไม่สะสมทุกเฟรม แม้คลิปไม่เขียนทับกระดูก", () => {
    const { root, spine, head } = model();
    applySeatedIdle(root, 1.3, 7);
    const first = [spine.rotation.x, head.rotation.x, head.rotation.y];
    for (let i = 0; i < 100; i++) applySeatedIdle(root, 1.3, 7);
    expect([spine.rotation.x, head.rotation.x, head.rotation.y]).toEqual(first);
  });

  it("ซ้อนบนท่าที่มิกเซอร์เพิ่งวาง และถอดออกได้หมดเมื่อเลิกนั่งรอ", () => {
    const { root, spine } = model();
    applySeatedIdle(root, 2, 3);
    const offset = spine.rotation.x;
    spine.rotation.x = 0.5; // มิกเซอร์เขียนท่าคลิปทับ
    applySeatedIdle(root, 2, 3);
    expect(spine.rotation.x).toBeCloseTo(0.5 + offset, 9);
    spine.rotation.x = 0.5;
    applySeatedIdle(root, 2, 3);
    clearSeatedIdle(root);
    expect(spine.rotation.x).toBeCloseTo(0.5, 9);
  });
});
