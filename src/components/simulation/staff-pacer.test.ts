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

  it("งานใหม่ที่จุดเดิม (รับเงินที่จุดยืนประจำ) ได้สถานะใหม่ ไม่ถูกทิ้ง", () => {
    const pacer = new StaffPacer();
    let task: string | null = null;
    pacer.setGate({ taskOf: () => task, open: () => true });
    pacer.update(staff([0, 1, 1, COUNTER]), 0, SPEED);
    task = "pay:1";
    const out = pacer.update(staff([0, 1, 1, STAFF_STATE_CODE["taking-order"]]), 0.1, SPEED);
    expect(row(out, 0)).toEqual([1, 1, STAFF_STATE_CODE["taking-order"]]);
    expect(pacer.currentTask(0)).toBe("pay:1");
  });

  it("ยืนรอประตูของงาน = ยืนนิ่ง (ระยะที่ยังต้องเดินเป็น 0) ให้หลบทางคนอื่นได้", () => {
    const pacer = new StaffPacer();
    let task: string | null = null;
    pacer.setGate({ taskOf: () => task, open: () => false });
    pacer.update(staff([0, 1, 1, COUNTER]), 0, SPEED);
    task = "task:1";
    pacer.update(staff([0, 4, 1, WALKING]), 0.5, SPEED);
    expect(pacer.waitingTask(0)).toBe("task:1");
    expect(pacer.remainingDistance(0)).toBe(0);
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

  it("โหมด metadata: รับอาหาร → เดินถึงประตูครัวก่อนแล้วจึงหายตัว ไม่หายกลางร้าน", () => {
    const pacer = new StaffPacer();
    pacer.setKitchenDoor(kitchenDoor());
    // เดินจากกลางร้านไปจุดรับอาหาร แล้ว engine ประกาศ "รับอาหาร" ทันทีขณะภาพยังเดินอยู่
    pacer.update(staff([0, 1.375, 2.5, WALKING]), 0, SPEED, 1, true);
    pacer.update(staff([0, 1.375, 0.35, WALKING]), 0, SPEED, 1, true);
    const seen: Array<[number, number]> = [];
    for (let t = 0; t < 3; t += 0.1) {
      const out = pacer.update(staff([0, 1.375, 0.35, STAFF_KITCHEN_CODE]), 0.1, SPEED, 1, true);
      const [, y, code] = row(out, 0)!;
      seen.push([y!, code!]);
    }
    // ยังอยู่ในร้าน (ก่อนถึงแนวผนัง) = มองเห็นเสมอ · พ้นผนังไปแล้ว = อยู่ในครัว
    expect(seen.filter(([y]) => y > 0.01).every(([, code]) => code !== STAFF_KITCHEN_CODE)).toBe(true);
    expect(seen.some(([y]) => y < 0)).toBe(true);
    expect(seen.at(-1)![1]).toBe(STAFF_KITCHEN_CODE);
    // รับเสร็จ: โผล่ที่ช่องประตูก่อน แล้วถือถาดเดินไปโต๊ะ
    const back: Array<[number, number]> = [];
    for (let t = 0; t < 4; t += 0.1) {
      const out = pacer.update(staff([0, 3, 3, SERVING]), 0.1, SPEED, 1, true);
      const [, y, code] = row(out, 0)!;
      back.push([y!, code!]);
    }
    expect(back.filter(([y]) => y < 0).every(([, code]) => code === STAFF_KITCHEN_CODE)).toBe(true);
    expect(back.at(-1)![0]).toBeGreaterThan(0);
    expect(back.at(-1)![1]).toBe(SERVING);
  });

  it("โหมด metadata ไม่มีประตูครัว: รับอาหารที่จุดเดิมโดยไม่หายตัว", () => {
    const pacer = new StaffPacer();
    pacer.setKitchenDoor(null);
    pacer.update(staff([0, 1.375, 0.35, WALKING]), 0, SPEED, 1, true);
    for (let t = 0; t < 1; t += 0.1) {
      const out = pacer.update(staff([0, 1.375, 0.35, STAFF_KITCHEN_CODE]), 0.1, SPEED, 1, true);
      expect(row(out, 0)![2]).not.toBe(STAFF_KITCHEN_CODE);
    }
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

  it("งานใหม่ที่ประตูรอยังปิด: ยืนรอที่เดิมในท่ายืน ไม่เดินไปรอที่โต๊ะ — เปิดแล้วจึงเดิน", () => {
    const pacer = new StaffPacer();
    let task: string | null = null, open = false;
    pacer.setGate({ taskOf: () => task, open: () => open });
    pacer.update(staff([0, 1, 1, COUNTER]), 0, SPEED);
    task = "task:1";
    let out = pacer.update(staff([0, 4, 1, WALKING]), 0.5, SPEED);
    expect(row(out, 0)).toEqual([1, 1, COUNTER]);
    expect(pacer.waitingTask(0)).toBe("task:1");
    for (let i = 0; i < 10; i++) out = pacer.update(staff([0, 4, 1, WALKING]), 0.5, SPEED);
    expect(row(out, 0)![0]).toBe(1);
    open = true;
    out = pacer.update(staff([0, 4, 1, WALKING]), 0.5, SPEED);
    expect(row(out, 0)![0]).toBeCloseTo(1.7, 4);
    expect(pacer.waitingTask(0)).toBeNull();
    // เริ่มงานแล้ว ประตูปิดอีกก็ทำงานเดิมต่อจนจบ (ไม่หยุดกลางทาง)
    open = false;
    out = pacer.update(staff([0, 4, 1, WALKING]), 0.5, SPEED);
    expect(row(out, 0)![0]).toBeCloseTo(2.4, 4);
  });
});
