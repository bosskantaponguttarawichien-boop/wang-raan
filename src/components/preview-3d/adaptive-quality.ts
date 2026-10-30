/**
 * ปรับคุณภาพฉาก 3D อัตโนมัติตามความเร็วเครื่อง — วัดช่วงเวลาระหว่างเฟรม (requestAnimationFrame) ระหว่างจำลอง
 * ถ้าช้ากว่าเป้าต่อเนื่องก็ลดคุณภาพลงทีละขั้น (ไม่เพิ่มกลับเอง กันภาพกระพริบสลับไปมา — เปิดฉากใหม่เริ่มที่ขั้นสูงสุด)
 * ไม่พึ่ง three จึงทดสอบได้ตรง ๆ
 */
export interface QualityLevel {
  /** เพดาน devicePixelRatio ของ canvas */
  maxPixelRatio: number;
  /** ตัวละครทอดเงา — ปิดแล้วเงาฉากนิ่ง (ผนัง โต๊ะ เคาน์เตอร์) วาดครั้งเดียวไม่ต้องวาดใหม่ทุกเฟรม */
  characterShadows: boolean;
  /** ขนาด shadow map (px ต่อด้าน) */
  shadowMapSize: number;
}

/** ขั้น 0 = ดีสุด — ลดความละเอียดจอก่อน (เห็นต่างน้อยสุด) แล้วค่อยตัดเงาตัวละคร */
export const QUALITY_LEVELS: readonly QualityLevel[] = [
  { maxPixelRatio: 1.5, characterShadows: true, shadowMapSize: 2048 },
  { maxPixelRatio: 1, characterShadows: true, shadowMapSize: 2048 },
  { maxPixelRatio: 1, characterShadows: false, shadowMapSize: 1024 },
  { maxPixelRatio: 0.75, characterShadows: false, shadowMapSize: 1024 },
];

export interface AdaptiveQualityOptions {
  /**
   * ช่วงเวลาระหว่างเฟรมที่ยอมรับได้ (ms) — เกินนี้ (ต่ำกว่า ~26 fps) ถือว่าช้า
   * ต้องมากกว่า 33.3 ms: โหมดประหยัดแบต/จอบางรุ่นจำกัด rAF ไว้ 30 fps ทั้งที่เครื่องวาดทัน — ไม่ควรลดคุณภาพ
   */
  slowFrameMs: number;
  /** ความยาวช่วงวัดแต่ละรอบ (ms) */
  windowMs: number;
  /** ไม่นับช่วงแรกหลังเริ่มวัด/เปลี่ยนขั้น (คอมไพล์ shader, โหลดโมเดล ทำเฟรมกระตุกชั่วคราว) */
  warmupMs: number;
  /**
   * เฟรมที่ห่างกว่านี้ = เครื่องหลับ/แท็บถูกพักยาว ไม่นับ
   *
   * เพดานนี้ไม่ใช่ตัวตรวจ "แท็บถูกซ่อน" อีกต่อไป: การจำลองหยุดเองเมื่อแท็บถูกซ่อน (controller
   * ใช้ document.hidden จริง) ลูปจึงไม่ได้วัดช่วงนั้นอยู่แล้ว · เดิมตั้งไว้ 250 แล้วขยับเป็น 900 ms
   * ซึ่งยังตัดฉากหนาแน่นที่วาดเฟรมละเกิน 0.9 วินาทีทิ้งทั้งหมด = ไม่เคยลดคุณภาพให้เครื่องที่ช้าที่สุด
   */
  ignoreAboveMs: number;
}

const DEFAULTS: AdaptiveQualityOptions = { slowFrameMs: 38, windowMs: 2000, warmupMs: 1000, ignoreAboveMs: 5000 };

export class AdaptiveQuality {
  level = 0;
  private readonly options: AdaptiveQualityOptions;
  private intervals: number[] = [];
  private measured = 0;
  private warmup = 0;
  private lastSample = 0;

  constructor(options: Partial<AdaptiveQualityOptions> = {}) {
    this.options = { ...DEFAULTS, ...options };
  }

  get current(): QualityLevel {
    return QUALITY_LEVELS[this.level]!;
  }

  /** สิ่งที่ตัววัดเห็นอยู่จริง — ใช้ตอบว่า "ทำไมคุณภาพไม่ลด" ได้โดยไม่ต้องเดา (diagnostics ของ feat-123) */
  get stats(): { samplesInWindow: number; measuredMs: number; warmupMs: number; lastSampleMs: number } {
    return {
      samplesInWindow: this.intervals.length,
      measuredMs: Number(this.measured.toFixed(1)),
      warmupMs: Number(this.warmup.toFixed(1)),
      lastSampleMs: Number(this.lastSample.toFixed(1)),
    };
  }

  /** เริ่มช่วงวัดใหม่ (เช่นหยุดจำลอง หรือเพิ่งเปลี่ยนขั้น) */
  reset() {
    this.intervals = [];
    this.measured = 0;
    this.warmup = 0;
  }

  /**
   * ส่งช่วงเวลาตั้งแต่เฟรมก่อน (ms) — คืนขั้นใหม่ถ้าต้องลดคุณภาพ, ไม่เปลี่ยนคืน null
   * ใช้ค่ามัธยฐานของช่วงวัด เฟรมกระตุกนาน ๆ ครั้ง (GC, โหลดไฟล์) จึงไม่ทำให้ลดคุณภาพ
   */
  sample(intervalMs: number): number | null {
    const { slowFrameMs, windowMs, warmupMs, ignoreAboveMs } = this.options;
    this.lastSample = intervalMs;
    if (!(intervalMs > 0) || intervalMs > ignoreAboveMs) return null;
    if (this.warmup < warmupMs) {
      this.warmup += intervalMs;
      return null;
    }
    this.intervals.push(intervalMs);
    this.measured += intervalMs;
    if (this.measured < windowMs) return null;
    const sorted = this.intervals.slice().sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)]!;
    this.intervals = [];
    this.measured = 0;
    if (median <= slowFrameMs || this.level >= QUALITY_LEVELS.length - 1) return null;
    // ช้ากว่าเป้าหลายเท่า = ลดทีละขั้นต้องรอหลายวินาทีกว่าจะถึงขั้นที่ไหว ข้ามให้เร็วขึ้นตามระยะที่ห่าง
    // (ยังไม่เพิ่มกลับเอง จึงไม่เกิดภาพกระพริบสลับคุณภาพ)
    const steps = median > slowFrameMs * 4 ? 2 : 1;
    this.level = Math.min(QUALITY_LEVELS.length - 1, this.level + steps);
    this.warmup = 0;
    return this.level;
  }
}
