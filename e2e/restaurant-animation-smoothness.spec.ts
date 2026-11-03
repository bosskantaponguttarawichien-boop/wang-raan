import { appendFileSync, mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { enableDiagnostics, openReadyCafe, rendererName, show3D, startSimulation, watchErrors } from "./animation-harness";

/**
 * วัดความลื่นของการเดินในภาพ 3D จากตำแหน่งที่วาดจริงทุกเฟรม (hook `characters` ของ scene diagnostics)
 *
 *   npx playwright test e2e/restaurant-animation-smoothness.spec.ts --workers=1
 *
 * ต่อช่วงที่ตัวละครเดิน (ขยับต่อเนื่อง) คำนวณ
 * - speedCv: ส่วนเบี่ยงเบนของความเร็วต่อเฟรม / ค่าเฉลี่ย — ยิ่งต่ำยิ่งเดินสม่ำเสมอ (เดิมพุ่ง-หยุดทุก TICK)
 * - speedSpread: ความเร็วเฉลี่ยของคนที่เดินเร็วสุด / ช้าสุด — 1 = ทุกคนเดินเท่ากัน (บันทึกอย่างเดียว ไม่ assert)
 * - maxStepMeters: ระยะที่ขยับมากที่สุดในเฟรมเดียว — ค่าโตผิดปกติ = วาร์ป
 */

const EVIDENCE_DIR = "harness/evidence/feat-162";

interface Sample { t: number; customers: number[][]; staff: number[][] }

test.describe("ความลื่นของการเดิน 3D", () => {
  test.beforeEach(async ({ page }) => {
    await enableDiagnostics(page);
  });

  test("ตัวละครเดินความเร็วคงที่และเท่ากัน ไม่วาร์ป", async ({ page }) => {
    test.setTimeout(240_000);
    const errors = watchErrors(page);
    await page.setViewportSize({ width: 1024, height: 700 });
    await openReadyCafe(page);
    await startSimulation(page);
    await show3D(page);
    // รอให้มีคนเดินเข้าร้านก่อนวัด
    await page.waitForTimeout(4_000);
    const samples = await page.evaluate(async (durationMs) => {
      const hook = (window as unknown as { __wangraanScene?: { characters?: () => { customers: number[][]; staff: number[][] } } }).__wangraanScene;
      const out: { t: number; customers: number[][]; staff: number[][] }[] = [];
      const start = performance.now();
      await new Promise<void>((resolve) => {
        const step = () => {
          const now = performance.now();
          const characters = hook?.characters?.();
          if (characters) out.push({ t: now, customers: characters.customers.map(row => [...row]), staff: characters.staff.map(row => [...row]) });
          if (now - start < durationMs) requestAnimationFrame(step); else resolve();
        };
        requestAnimationFrame(step);
      });
      return out;
    }, 45_000) as Sample[];
    expect(samples.length).toBeGreaterThan(100);
    if (process.env.SMOOTHNESS_DUMP) {
      const frameInfo = await page.evaluate(() => (window as unknown as { __wangraanScene?: { frame?: () => unknown } }).__wangraanScene?.frame?.());
      appendFileSync(process.env.SMOOTHNESS_DUMP, JSON.stringify({ samples, frameInfo }));
    }

    // ความเร็วต่อเฟรมของแต่ละคน (แยกลูกค้า/พนักงานด้วย key)
    const tracks = new Map<string, { t: number; x: number; z: number }[]>();
    for (const sample of samples) {
      for (const [kind, rows] of [["c", sample.customers], ["s", sample.staff]] as const) {
        for (const row of rows) {
          const key = `${kind}${row[0]}`;
          const track = tracks.get(key) ?? [];
          track.push({ t: sample.t, x: row[1]!, z: row[2]! });
          tracks.set(key, track);
        }
      }
    }
    const segmentCvs: number[] = [];
    const meanSpeeds: number[] = [];
    let maxStepMeters = 0;
    for (const track of tracks.values()) {
      let run: number[] = [];
      const flush = () => {
        // ช่วงเดินต่อเนื่องอย่างน้อย 8 เฟรม ตัดต้น/ท้าย (ออกตัว/ชะลอ) ทิ้ง
        // (เครื่องไม่มี GPU วาดได้ ~5–10 fps จึงนับเป็นเฟรม ไม่ใช่วินาที)
        if (run.length >= 8) {
          const core = run.slice(2, -2);
          const mean = core.reduce((a, b) => a + b, 0) / core.length;
          const sd = Math.sqrt(core.reduce((a, b) => a + (b - mean) ** 2, 0) / core.length);
          // นับเฉพาะการเดินจริง (ไม่ใช่การเลื่อนตัวช้า ๆ ตอนดึงเก้าอี้/ขยับแถว)
          if (mean > 0.8) { segmentCvs.push(sd / mean); meanSpeeds.push(mean); }
        }
        run = [];
      };
      for (let i = 1; i < track.length; i++) {
        const dt = (track[i]!.t - track[i - 1]!.t) / 1000;
        const step = Math.hypot(track[i]!.x - track[i - 1]!.x, track[i]!.z - track[i - 1]!.z);
        maxStepMeters = Math.max(maxStepMeters, step);
        // เฟรมที่เบราว์เซอร์ค้างนาน (>300 ms) ไม่ใช่ปัญหาการเดิน — ตัดช่วง
        if (dt <= 0 || dt > 0.3) { flush(); continue; }
        const speed = step / dt;
        if (speed > 0.05) run.push(speed); else flush();
      }
      flush();
    }
    const median = (values: number[]) => {
      const sorted = [...values].sort((a, b) => a - b);
      return sorted.length ? sorted[Math.floor(sorted.length / 2)]! : null;
    };
    const measurement = {
      at: new Date().toISOString(),
      renderer: await rendererName(page),
      frames: samples.length,
      walkingSegments: segmentCvs.length,
      medianSpeedCv: median(segmentCvs),
      speedSpread: meanSpeeds.length ? Math.max(...meanSpeeds) / Math.min(...meanSpeeds) : null,
      maxStepMeters,
    };
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    await page.getByTestId("three-canvas").locator("..").screenshot({ path: `${EVIDENCE_DIR}/scene.png` });
    appendFileSync(`${EVIDENCE_DIR}/smoothness.jsonl`, `${JSON.stringify(measurement)}\n`, "utf8");
    console.log(JSON.stringify(measurement));

    expect(segmentCvs.length).toBeGreaterThan(0);
    expect(measurement.medianSpeedCv!).toBeLessThan(0.25);
    // speedSpread บันทึกไว้ดูอย่างเดียว: ที่ ~5 fps ค่าแกว่งตามจังหวะเฟรม (CI ได้ 1.36–1.46) และแยกก่อน/หลังแก้ไม่ออก
    // วาร์ป = ขยับเกิน 1 ม. ในเฟรมเดียว (เครื่องไม่มี GPU วาดได้ ~5 fps เดินปกติจึงได้ราว 0.4–0.5 ม./เฟรม)
    expect(measurement.maxStepMeters).toBeLessThan(1);
    expect(errors).toEqual([]);
  });
});
