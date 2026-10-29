import { describe, expect, it } from "vitest";
import { AdaptiveQuality, QUALITY_LEVELS } from "./adaptive-quality";

/** ป้อนเฟรมช่วงละ intervalMs รวม totalMs คืนขั้นที่เปลี่ยน */
function run(quality: AdaptiveQuality, intervalMs: number, totalMs: number) {
  const changes: number[] = [];
  for (let t = 0; t < totalMs; t += intervalMs) {
    const level = quality.sample(intervalMs);
    if (level !== null) changes.push(level);
  }
  return changes;
}

describe("Adaptive quality (ปรับคุณภาพฉาก 3D ตามความเร็วเครื่อง)", () => {
  it("เครื่องเร็ว (60 fps) คงคุณภาพสูงสุด", () => {
    const quality = new AdaptiveQuality();
    expect(run(quality, 16.7, 20000)).toEqual([]);
    expect(quality.current).toEqual(QUALITY_LEVELS[0]);
  });

  it("rAF ถูกจำกัด 30 fps (โหมดประหยัดแบต) ไม่ถือว่าเครื่องช้า", () => {
    const quality = new AdaptiveQuality();
    expect(run(quality, 33.4, 20000)).toEqual([]);
  });

  it("เครื่องช้า (20 fps) ลดทีละขั้นจนถึงขั้นต่ำสุด แล้วหยุด", () => {
    const quality = new AdaptiveQuality();
    expect(run(quality, 50, 30000)).toEqual([1, 2, 3]);
    expect(quality.current.characterShadows).toBe(false);
    expect(quality.current.maxPixelRatio).toBeLessThan(1);
  });

  it("ไม่นับช่วงอุ่นเครื่อง และเฟรมกระตุกนาน ๆ ครั้งไม่ทำให้ลดคุณภาพ", () => {
    const quality = new AdaptiveQuality();
    // อุ่นเครื่อง 1 วิ ช้ามาก แต่ไม่นับ
    expect(run(quality, 100, 900)).toEqual([]);
    // หลังจากนั้นเร็ว แต่มีเฟรมกระตุก 1 ใน 10
    const changes: number[] = [];
    for (let i = 0; i < 1000; i++) {
      const level = quality.sample(i % 10 === 0 ? 120 : 16);
      if (level !== null) changes.push(level);
    }
    expect(changes).toEqual([]);
  });

  it("ช่วงที่แท็บถูกซ่อน (เฟรมห่างมาก) ไม่นับ และ reset เริ่มวัดใหม่", () => {
    const quality = new AdaptiveQuality();
    expect(run(quality, 1000, 60000)).toEqual([]);
    run(quality, 40, 1500);
    quality.reset();
    // หลัง reset ต้องอุ่นเครื่องใหม่ ยังไม่ครบช่วงวัด
    expect(run(quality, 40, 2500)).toEqual([]);
    expect(run(quality, 40, 1000)).toEqual([1]);
  });

  it("เครื่องช้ามาก (3–4 fps) ยังลดคุณภาพจนถึงขั้นต่ำสุด ไม่ถูกทิ้งทั้งหมดเหมือนแท็บที่ถูกซ่อน", () => {
    // feat-137: เครื่องที่ไม่มี GPU วาดฉากหนาแน่นได้เฟรมละ ~270 ms เดิมเพดานทิ้งที่ 250 ms
    // ทำให้ทุกเฟรมถูกทิ้งและคุณภาพค้างที่ขั้นสูงสุดตลอด
    const quality = new AdaptiveQuality();
    expect(run(quality, 270, 30000)).toEqual([1, 2, 3]);
    expect(quality.current).toEqual(QUALITY_LEVELS[QUALITY_LEVELS.length - 1]);
  });
});
