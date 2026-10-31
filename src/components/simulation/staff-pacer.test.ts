import { describe, expect, it } from "vitest";
import { STAFF_STATE_CODE, STAFF_STRIDE } from "@/core/simulation";
import { cafeLayout } from "@/test/fixtures/layouts";
import { KITCHEN_SECONDS, STAFF_KITCHEN_CODE, StaffPacer } from "./staff-pacer";
import { wallDoorFrame } from "./walk-pacer";

const WALKING = STAFF_STATE_CODE.walking;
const SERVING = STAFF_STATE_CODE.serving;
const COUNTER = STAFF_STATE_CODE.counter;
const SPEED = 1.4;

/** staff buffer: [index, x, y, stateCode] ต่อคน */
const staff = (...rows: [number, number, number, number][]) => new Float32Array(rows.flat());
const row = (frame: Float32Array, index: number) => {
  for (let o = 0; o < frame.length; o += STAFF_STRIDE) if (frame[o] === index) return [...frame.subarray(o + 1, o + 4)];
  return null;
};

/** ผังคาเฟ่: ประตูครัวอยู่ผนังทิศเหนือ (y = 0) ช่อง x 1.0–1.9 */
const kitchenDoor = () => {
  const layout = cafeLayout();
  return wallDoorFrame(layout, layout.kitchenDoor);
};

describe("StaffPacer — ภาพพนักงานเดินเท่าคนจริงและแวะเข้าครัว", () => {
  it("พนักงานที่ยืนอยู่ตั้งแต่เริ่มเล่นภาพ แสดงที่ตำแหน่งจริงทันที", () => {
    const pacer = new StaffPacer();
    const out = pacer.update(staff([0, 5.2, 0.2, COUNTER]), 0, SPEED);
    const [x, y, code] = row(out, 0)!;
    expect(x).toBeCloseTo(5.2, 5);
    expect(y).toBeCloseTo(0.2, 5);
    expect(code).toBe(COUNTER);
  });

  it("engine ขยับไปไกลใน tick เดียว ภาพยังเดิน 1.4 ม./วินาที ไม่กระโดดตาม", () => {
    const pacer = new StaffPacer();
    pacer.update(staff([0, 1, 1, COUNTER]), 0, SPEED);
    let out = pacer.update(staff([0, 6, 1, WALKING]), 0.1, SPEED);
    expect(row(out, 0)![0]).toBeCloseTo(1 + 0.14, 4);
    for (let i = 0; i < 9; i++) out = pacer.update(staff([0, 6, 1, WALKING]), 0.1, SPEED);
    // เดิน 1 วินาที = 1.4 ม. (ยังไม่ถึงเป้าหมายของ engine)
    expect(row(out, 0)![0]).toBeCloseTo(2.4, 4);
    expect(row(out, 0)![2]).toBe(WALKING);
  });

  it("บอกได้ว่าภาพค้างหลังการจำลองกี่วินาที (ระยะที่ยังต้องเดิน ÷ ความเร็ว)", () => {
    const pacer = new StaffPacer();
    pacer.update(staff([0, 1, 1, COUNTER]), 0, SPEED);
    expect(pacer.backlogSeconds(SPEED, 30)).toBe(0);
    pacer.update(staff([0, 8, 1, WALKING]), 0, SPEED);
    expect(pacer.backlogSeconds(SPEED, 30)).toBeCloseTo(7 / SPEED, 5);
    pacer.update(staff([0, 8, 1, WALKING]), 1, SPEED);
    expect(pacer.backlogSeconds(SPEED, 30)).toBeCloseTo((7 - SPEED) / SPEED, 5);
  });

  it("holdAt: ภาพหยุดที่จุดที่ต่อคิวไว้ตามเวลาที่สั่ง แล้วเดินต่อ (ท่าวางจาน)", () => {
    const pacer = new StaffPacer();
    pacer.update(staff([0, 1, 1, COUNTER]), 0, SPEED);
    pacer.update(staff([0, 2.4, 1, SERVING]), 0, SPEED);
    pacer.update(staff([0, 2.4, 3.8, WALKING]), 0, SPEED);
    expect(pacer.holdAt(0, 2.4, 1, 2)).toBe(true);
    expect(pacer.holdAt(0, 9, 9, 2)).toBe(false);
    // 1 วินาทีถึงจุดวาง (1.4 ม.) แล้วยืนอีก 2 วินาทีจำลอง (timeScale 1) ก่อนเดินต่อ
    let out = pacer.update(staff([0, 2.4, 3.8, WALKING]), 1, SPEED);
    expect(row(out, 0)!.slice(0, 2)).toEqual([expect.closeTo(2.4, 4), expect.closeTo(1, 4)]);
    out = pacer.update(staff([0, 2.4, 3.8, WALKING]), 1.5, SPEED);
    expect(row(out, 0)![1]).toBeCloseTo(1, 4);
    out = pacer.update(staff([0, 2.4, 3.8, WALKING]), 1, SPEED);
    expect(row(out, 0)![1]).toBeCloseTo(1 + 0.5 * SPEED, 4);
  });

  it("เดินตามทางที่ engine เดินจริง (เลี้ยวตามมุม ไม่ตัดผ่านโต๊ะ)", () => {
    const pacer = new StaffPacer();
    pacer.update(staff([0, 0, 0, COUNTER]), 0, SPEED);
    pacer.update(staff([0, 0, 3, WALKING]), 0, SPEED);
    const out = pacer.update(staff([0, 3, 3, WALKING]), 1, SPEED);
    expect(row(out, 0)![0]).toBeCloseTo(0, 5);
    expect(row(out, 0)![1]).toBeCloseTo(1.4, 4);
  });

  it("รับอาหาร → เดินพ้นผนังเข้าครัว หายไป ~5 วินาที แล้วออกมาที่ประตูพร้อมถาด", () => {
    const pacer = new StaffPacer();
    pacer.setKitchenDoor(kitchenDoor());
    // ยืนรับอาหารที่ช่องติดประตูครัว แล้ว engine สั่งเสิร์ฟไปโต๊ะกลางร้าน
    let out = pacer.update(staff([0, 1.375, 0.35, WALKING]), 0, SPEED);
    const seen: Array<[number, number]> = [];
    let hidden = 0;
    for (let t = 0; t < 12; t += 0.1) {
      out = pacer.update(staff([0, 3, 3, SERVING]), 0.1, SPEED);
      const [x, y, code] = row(out, 0)!;
      seen.push([y!, code!]);
      if (code === STAFF_KITCHEN_CODE) {
        hidden += 0.1;
        expect(x).toBeCloseTo(1.375, 5); // อยู่ในแนวช่องประตู ไม่เดินทะลุผนัง
      }
    }
    // เข้าไปอยู่หลังผนัง (y < 0) และตอนนั้นเป็นสถานะ "อยู่ในครัว" เสมอ
    const inside = seen.filter(([y]) => y < 0);
    expect(inside.length).toBeGreaterThan(0);
    expect(inside.every(([, code]) => code === STAFF_KITCHEN_CODE)).toBe(true);
    // รออยู่ในครัวราว KITCHEN_SECONDS วินาที (บวกช่วงเดินเข้า–ออกประตูสั้น ๆ)
    expect(hidden).toBeGreaterThan(KITCHEN_SECONDS);
    expect(hidden).toBeLessThan(KITCHEN_SECONDS + 1.5);
    // สุดท้ายกลับเข้าร้านแล้วเดินไปเสิร์ฟ
    const [, lastY, lastCode] = row(out, 0)!;
    expect(lastY).toBeGreaterThan(0);
    expect(lastCode).toBe(SERVING);
  });

  it("เล่นภาพเร็วขึ้น เวลารอในครัวสั้นลงตามความเร็วที่เลือก", () => {
    const pacer = new StaffPacer();
    pacer.setKitchenDoor(kitchenDoor());
    pacer.update(staff([0, 1.375, 0.35, WALKING]), 0, SPEED * 5);
    let hidden = 0;
    for (let t = 0; t < 6; t += 0.1) {
      const out = pacer.update(staff([0, 3, 3, SERVING]), 0.1, SPEED * 5, 5);
      if (row(out, 0)![2] === STAFF_KITCHEN_CODE) hidden += 0.1;
    }
    expect(hidden).toBeLessThan(KITCHEN_SECONDS / 2);
  });

  it("ผังที่ไม่มีประตูครัว เสิร์ฟต่อได้โดยไม่ต้องแวะ", () => {
    const pacer = new StaffPacer();
    pacer.setKitchenDoor(null);
    pacer.update(staff([0, 1.375, 0.35, WALKING]), 0, SPEED);
    for (let t = 0; t < 3; t += 0.1) {
      const out = pacer.update(staff([0, 3, 3, SERVING]), 0.1, SPEED);
      expect(row(out, 0)![1]).toBeGreaterThan(0);
      expect(row(out, 0)![2]).toBe(SERVING);
    }
  });

  it("คืนค่าครบทุกคนตามลำดับ index เดิม", () => {
    const pacer = new StaffPacer();
    const out = pacer.update(staff([0, 1, 1, COUNTER], [1, 2, 2, WALKING]), 0.1, SPEED);
    expect(out).toHaveLength(2 * STAFF_STRIDE);
    expect(out[0]).toBe(0);
    expect(out[STAFF_STRIDE]).toBe(1);
  });

  it("ตามหลังไกลมากก็ยังเดินด้วยความเร็วเดิม", () => {
    const pacer = new StaffPacer();
    let out = pacer.update(staff([0, 0, 0, COUNTER]), 0, SPEED);
    for (let i = 0; i < 10; i++) out = pacer.update(staff([0, 20, 0, WALKING]), 0.1, SPEED);
    expect(row(out, 0)![0]).toBeCloseTo(SPEED, 5);
  });
});
