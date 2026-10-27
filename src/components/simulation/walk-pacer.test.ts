import { describe, expect, it } from "vitest";
import { AGENT_STATE_CODE, AGENT_STRIDE } from "@/core/simulation";
import { MAX_VISUAL_LAG_SECONDS, WalkPacer } from "./walk-pacer";

const TO_SEAT = AGENT_STATE_CODE["to-seat"];
const SEATED = AGENT_STATE_CODE.seated;
const LEAVING = AGENT_STATE_CODE.leaving;

const agents = (...rows: [number, number, number, number][]) => new Float32Array(rows.flat());
const paths = (...rows: [number, number[]][]) => new Float32Array(rows.flatMap(([id, pts]) => [id, pts.length / 2, ...pts]));
const row = (frame: Float32Array, id: number) => {
  for (let o = 0; o < frame.length; o += AGENT_STRIDE) if (frame[o] === id) return [...frame.subarray(o + 1, o + 4)];
  return null;
};

describe("WalkPacer — ภาพเดินเท่าคนจริง", () => {
  it("คนที่อยู่ในร้านตั้งแต่เริ่มเล่นภาพ แสดงที่ตำแหน่งจริงทันที", () => {
    const pacer = new WalkPacer();
    const out = pacer.update(agents([1, 3, 2, SEATED]), undefined, 0, 1.4);
    expect(row(out, 1)).toEqual([3, 2, SEATED]);
  });

  it("ลูกค้ามาใหม่เริ่มที่ประตู แล้วเดิน 1.4 ม./วินาที ไม่กระโดดไปตำแหน่งจริง", () => {
    const pacer = new WalkPacer();
    pacer.update(agents(), undefined, 0, 1.4);
    // tick เดียว engine เดินไป 3 ม. แล้ว
    let out = pacer.update(agents([2, 1, 3, TO_SEAT]), paths([2, [1, 6, 1, 3]]), 0.05, 1.4);
    expect(row(out, 2)![0]).toBeCloseTo(1, 5);
    expect(row(out, 2)![1]).toBeCloseTo(6 - 0.07, 4);
    for (let i = 0; i < 20; i++) out = pacer.update(agents([2, 1, 3, TO_SEAT]), undefined, 0.05, 1.4);
    expect(row(out, 2)![1]).toBeCloseTo(6 - 0.07 * 21, 4);
  });

  it("เดินตามทางที่ engine เดินจริง (เลี้ยวตามมุม ไม่ตัดผ่านโต๊ะ)", () => {
    const pacer = new WalkPacer();
    pacer.update(agents(), undefined, 0, 1.4);
    pacer.update(agents([3, 3, 3, TO_SEAT]), paths([3, [0, 0, 0, 3, 3, 3]]), 0, 1.4);
    let out: Float32Array = new Float32Array();
    const seen: number[][] = [];
    for (let i = 0; i < 100; i++) {
      out = pacer.update(agents([3, 3, 3, TO_SEAT]), undefined, 0.05, 1.4);
      seen.push(row(out, 3)!);
    }
    // ทุกจุดอยู่บนเส้น x = 0 หรือ y = 3 (ไม่ตัดมุมเฉียง)
    for (const [x, y] of seen) expect(Math.min(Math.abs(x!), Math.abs(y! - 3))).toBeLessThan(1e-4);
    expect(row(out, 3)).toEqual([3, 3, TO_SEAT]);
  });

  it("นั่งแล้วในการจำลองแต่ภาพยังเดินไม่ถึง → แสดงท่าเดิน จนถึงเก้าอี้จึงนั่ง", () => {
    const pacer = new WalkPacer();
    pacer.update(agents(), undefined, 0, 1.4);
    let out = pacer.update(agents([4, 2, 0, SEATED]), paths([4, [0, 0, 2, 0]]), 0.05, 1.4);
    expect(row(out, 4)![2]).toBe(TO_SEAT);
    for (let i = 0; i < 40; i++) out = pacer.update(agents([4, 2, 0, SEATED]), undefined, 0.05, 1.4);
    expect(row(out, 4)).toEqual([2, 0, SEATED]);
  });

  it("ออกจากร้านในการจำลองแล้ว ภาพยังเดินจนถึงประตูก่อนหายไป", () => {
    const pacer = new WalkPacer();
    pacer.update(agents([5, 0, 0, LEAVING]), undefined, 0, 1.4);
    let out = pacer.update(agents(), paths([5, [0, 1]]), 0.05, 1.4);
    expect(row(out, 5)).not.toBeNull();
    expect(row(out, 5)![2]).toBe(LEAVING);
    for (let i = 0; i < 20 && row(out, 5); i++) out = pacer.update(agents(), undefined, 0.05, 1.4);
    expect(row(out, 5)).toBeNull();
  });

  it("ตามหลังไกลเกินไป → เร่งให้ทันภายในราว MAX_VISUAL_LAG_SECONDS", () => {
    const pacer = new WalkPacer();
    pacer.update(agents(), undefined, 0, 1.4);
    const far = 40;
    let out = pacer.update(agents([6, far, 0, TO_SEAT]), paths([6, [0, 0, far, 0]]), 0.05, 1.4);
    expect(row(out, 6)![0]).toBeCloseTo((far / MAX_VISUAL_LAG_SECONDS) * 0.05, 4);
    for (let i = 0; i < (MAX_VISUAL_LAG_SECONDS * 5) / 0.05; i++) out = pacer.update(agents([6, far, 0, TO_SEAT]), undefined, 0.05, 1.4);
    expect(row(out, 6)![0]).toBeCloseTo(far, 4);
  });

  it("reset ล้างทุกคน", () => {
    const pacer = new WalkPacer();
    pacer.update(agents([7, 1, 1, SEATED]), undefined, 0, 1.4);
    pacer.reset();
    expect(pacer.update(agents(), undefined, 0.05, 1.4)).toHaveLength(0);
  });
});
