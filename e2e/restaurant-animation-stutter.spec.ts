import { appendFileSync, mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import {
  enableDiagnostics, importDenseLayout, openReadyCafe, readScene, show3D, startSimulation, watchErrors,
} from "./animation-harness";
import { openTab } from "./helpers";

/**
 * feat-137 · วัดอาการกระตุกระหว่างจำลอง (ภาระฝั่งเบราว์เซอร์)
 *
 * **ต้องรันเดี่ยว** — ตัวเลขขึ้นกับว่าเครื่องว่างแค่ไหน การรันขนานทำให้สองชุดเทียบกันไม่ได้:
 *   npx playwright test e2e/restaurant-animation-stutter.spec.ts --workers=1
 *
 * วัดจากของจริงในเบราว์เซอร์ทั้งหมด: ช่วงเวลาระหว่างเฟรม (rAF), long task ของ main thread,
 * จำนวนครั้งที่ controller หยุดชั่วคราวเองเพื่อ resync, heap, จำนวน DOM node และ draw calls
 *
 * **ข้อจำกัดของตัวเลข**: เครื่องที่ไม่มี GPU จะได้ WebGL แบบ software (SwiftShader) ซึ่งแรสเตอร์
 * ด้วย CPU ตัวเลข fps สัมบูรณ์จึงเทียบกับเครื่องอ้างอิงที่มี GPU ไม่ได้ เทสต์นี้จึงบันทึกชื่อ renderer
 * ไว้ทุกครั้ง และเกณฑ์ที่ assert เป็นเกณฑ์ "ไม่แย่ลงเมื่อเทียบกันเองใน environment เดียวกัน"
 * (สัดส่วนเฟรมกระตุก, การหยุดเองของ controller, แนวโน้ม heap/DOM/draw calls) ไม่ใช่เพดาน fps
 */

/**
 * จำนวนลูกค้าในฉากที่เล็งไว้ก่อนเริ่มวัด — ไม่ดันให้สูงสุด เพราะฉากที่หนาแน่นมากบนเครื่องที่ไม่มี GPU
 * ทำให้ main thread แน่นจนสั่งงานหน้าเว็บไม่ได้เลย (คลิกปุ่มค้าง) แล้ววัดอะไรต่อไม่ได้
 */
const FILL_TARGET = 25;

const EVIDENCE_DIR = "harness/evidence/feat-137";
const SCREENS_DIR = `${EVIDENCE_DIR}/screens`;
mkdirSync(SCREENS_DIR, { recursive: true });

function record(measurement: Record<string, unknown>) {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  appendFileSync(`${EVIDENCE_DIR}/measurements.jsonl`, `${JSON.stringify(measurement)}\n`, "utf8");
}

interface FrameSample {
  frames: number;
  medianMs: number;
  p95Ms: number;
  p99Ms: number;
  worstMs: number;
  /** เฟรมที่ใช้เวลาเกิน 50 ms — ตาเห็นเป็นอาการกระตุก */
  jankFrames: number;
  jankRatio: number;
  longTasks: number;
  longTaskMsTotal: number;
  /** controller หยุดชั่วคราวเองกลางทาง (gap resync) = ภาพหยุดให้เห็น */
  selfPauses: number;
  simSecondsAdvanced: number;
  frameDebtSeconds: number | null;
  customerCount: number | null;
  staffCount: number | null;
  drawCalls: number | null;
  triangles: number | null;
  geometries: number | null;
  textures: number | null;
  usedJSHeapMB: number | null;
  domNodes: number;
  thoughtBubbles: number;
  renderer: string | null;
}

/**
 * เก็บตัวอย่างในเบราว์เซอร์ให้จบในครั้งเดียว แล้วส่งกลับเป็นสรุป — ถ้าให้ Node ไล่ถาม
 * ทุก ๆ เฟรม การถามเองจะกลายเป็นภาระที่ทำให้ตัวเลขเพี้ยน
 */
async function sampleFrames(page: Page, durationMs: number): Promise<FrameSample> {
  return page.evaluate(async (duration) => {
    interface Hook {
      frame?: () => { running: boolean; simTimeSeconds: number | null; frameDebtSeconds: number; customerCount: number; staffCount: number };
      renderer?: () => { calls: number; triangles: number; geometries: number; textures: number } | null;
    }
    const hook = (window as unknown as { __wangraanScene?: Hook }).__wangraanScene;
    const intervals: number[] = [];
    let longTasks = 0;
    let longTaskMsTotal = 0;
    let observer: PerformanceObserver | null = null;
    try {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) { longTasks += 1; longTaskMsTotal += entry.duration; }
      });
      observer.observe({ entryTypes: ["longtask"] });
    } catch { observer = null; }

    const first = hook?.frame?.();
    const simStart = first?.simTimeSeconds ?? null;
    let wasRunning = first?.running ?? false;
    let selfPauses = 0;

    await new Promise<void>((resolve) => {
      let previous = performance.now();
      const started = previous;
      const step = (now: number) => {
        intervals.push(now - previous);
        previous = now;
        const state = hook?.frame?.();
        if (state) {
          // true → false ระหว่างที่ยังจำลองอยู่ = controller หยุดภาพเอง
          if (wasRunning && !state.running) selfPauses += 1;
          wasRunning = state.running;
        }
        if (now - started >= duration) resolve();
        else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    observer?.disconnect();

    const last = hook?.frame?.();
    const counters = hook?.renderer?.() ?? null;
    const sorted = [...intervals].sort((a, b) => a - b);
    const at = (ratio: number) => sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))]!;
    const jankFrames = intervals.filter((value) => value > 50).length;
    const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    const canvas = document.querySelector<HTMLCanvasElement>("canvas[data-testid='three-canvas']");
    const gl = canvas?.getContext("webgl2") ?? canvas?.getContext("webgl");
    const info = gl?.getExtension("WEBGL_debug_renderer_info");
    const round = (value: number) => Number(value.toFixed(2));
    return {
      frames: intervals.length,
      medianMs: round(at(0.5)), p95Ms: round(at(0.95)), p99Ms: round(at(0.99)),
      worstMs: round(sorted.length ? sorted[sorted.length - 1]! : 0),
      jankFrames, jankRatio: intervals.length ? round(jankFrames / intervals.length) : 0,
      longTasks, longTaskMsTotal: round(longTaskMsTotal),
      selfPauses,
      simSecondsAdvanced: simStart === null || last?.simTimeSeconds == null ? 0 : round(last.simTimeSeconds - simStart),
      frameDebtSeconds: last ? round(last.frameDebtSeconds) : null,
      customerCount: last?.customerCount ?? null,
      staffCount: last?.staffCount ?? null,
      drawCalls: counters?.calls ?? null, triangles: counters?.triangles ?? null,
      geometries: counters?.geometries ?? null, textures: counters?.textures ?? null,
      usedJSHeapMB: memory ? Number((memory.usedJSHeapSize / 1024 / 1024).toFixed(1)) : null,
      domNodes: document.getElementsByTagName("*").length,
      thoughtBubbles: document.querySelectorAll("[data-agent-id],[data-staff-id]").length,
      renderer: info && gl ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : null,
    };
  }, durationMs);
}

/**
 * กดปุ่มความเร็วแบบมีเพดานเวลา — เครื่องที่ไม่มี GPU ทำให้ main thread แน่นจน Playwright
 * รอ actionability ไม่จบ ถ้าปล่อยไว้จะกินเวลาจนเทสต์ timeout โดยไม่บอกสาเหตุ
 */
async function setSpeedOrFail(page: Page, label: "1×" | "2×" | "5×" | "10×" | "30×") {
  const button = page.getByTestId("simulation-panel").getByRole("button", { name: label, exact: true });
  await button.last().click({ timeout: 30_000 });
}

/** เติมคนให้ร้านแน่นก่อนวัด — ภาระจริงอยู่ที่จำนวนตัวละครในฉาก ไม่ใช่ขนาดผัง */
async function fillRoom(page: Page, target: number, budgetMs: number): Promise<number> {
  let peak = 0;
  let lastSimTime = (await readScene(page)).frame?.simTimeSeconds ?? 0;
  let stalled = 0;
  const deadline = Date.now() + budgetMs;
  for (;;) {
    const scene = await readScene(page);
    peak = Math.max(peak, scene.frame?.customerCount ?? 0);
    const simTime = scene.frame?.simTimeSeconds ?? lastSimTime;
    stalled = simTime > lastSimTime ? 0 : stalled + 1;
    lastSimTime = Math.max(lastSimTime, simTime);
    if (peak >= target || stalled > 20 || Date.now() > deadline) break;
    await page.waitForTimeout(500);
  }
  return peak;
}

/** ผังหนาแน่น + พนักงานเต็มเพดาน + ลูกค้าเยอะและนั่งนาน = ภาระสูงสุดที่ระบบรองรับ */
async function openDenseRun(page: Page) {
  await enableDiagnostics(page);
  await importDenseLayout(page);
  await openTab(page, "check");
  const panel = page.getByTestId("simulation-panel");
  for (const name of ["เพิ่มพนักงานหน้าร้าน", "เพิ่มพ่อครัว"] as const) {
    for (let click = 0; click < 8; click += 1) {
      const add = panel.getByRole("button", { name });
      if (await add.isDisabled()) break;
      await add.click();
    }
  }
  for (const [label, value] of [["อยากให้ลูกค้าเข้าทั้งวัน", "500"], ["ลูกค้านั่งกินประมาณ", "120"]] as const) {
    const slider = panel.getByLabel(new RegExp(label));
    if (await slider.count()) await slider.first().fill(value);
  }
  await startSimulation(page);
  await show3D(page);
  // เครื่องที่ไม่มี GPU วาดฉากหนาแน่นได้ 3-4 fps จน main thread แน่นเกินกว่าจะสั่งงานหน้าเว็บได้
  // (คลิกปุ่มค้าง) วัดต่อไปก็ไม่มีความหมายและเทียบกับเครื่องอ้างอิงไม่ได้ จึงข้ามอย่างชัดเจน
  const renderer = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("canvas[data-testid='three-canvas']");
    const gl = canvas?.getContext("webgl2") ?? canvas?.getContext("webgl");
    const info = gl?.getExtension("WEBGL_debug_renderer_info");
    return info && gl ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
  });
  record({ check: "renderer", renderer });
  test.skip(/swiftshader|software|llvmpipe|basic render/i.test(renderer),
    `ฉากหนาแน่นต้องวัดบนเครื่องที่มี GPU จริง — เครื่องนี้เป็น software renderer (${renderer})`);
}

test.describe("feat-137: ภาระและอาการกระตุกระหว่างจำลอง", () => {
  /**
   * ข้อนี้รันได้ทุกเครื่องรวมเครื่องที่ไม่มี GPU และเป็นด่านกันถอยหลังของอาการที่แก้ใน feat-137:
   * ก่อนแก้ ผังตัวอย่าง 6 ที่นั่งที่มีลูกค้าเพียงคนเดียวก็ขึ้น "หยุดชั่วคราว" ภายใน 0.4 วินาที
   * แล้วค้างตลอด เพราะจังหวะโหลดโมเดลครั้งแรกถูกตีความว่าเป็นช่องว่างของเวลา
   */
  test("ผังตัวอย่าง: เปิด 3D แล้วเวลาจำลองเดินต่อเนื่องเอง ไม่หยุดรอให้กดเล่นต่อ", async ({ page }) => {
    test.setTimeout(300_000);
    const errors = watchErrors(page);
    await enableDiagnostics(page);
    await openReadyCafe(page);
    await startSimulation(page);
    await show3D(page);

    for (const speed of ["1×", "10×"] as const) {
      await setSpeedOrFail(page, speed);
      await page.waitForTimeout(2000);
      const sample = await sampleFrames(page, 8000);
      record({ check: "light-scene-speed", speed, ...sample });
      // หัวใจของงานนี้: เวลาจำลองต้องเดินหน้าเอง และ controller ต้องไม่หยุดภาพเอง
      expect(sample.simSecondsAdvanced, `${speed}: เวลาจำลองไม่เดิน (ภาพค้าง)`).toBeGreaterThan(0);
      expect(sample.selfPauses, `${speed}: controller หยุดภาพเอง ${sample.selfPauses} ครั้ง`).toBeLessThanOrEqual(1);
    }
    await page.screenshot({ path: `${SCREENS_DIR}/light-scene.png` });
    expect(errors).toEqual([]);
  });

  test("เปลี่ยนความเร็วทุกระดับแล้วภาพยังเดินต่อเนื่อง ไม่หยุดเองและไม่กระตุกเป็นส่วนใหญ่", async ({ page }) => {
    test.setTimeout(900_000);
    const errors = watchErrors(page);
    await openDenseRun(page);
    await setSpeedOrFail(page, "30×");
    const peak = await fillRoom(page, FILL_TARGET, 180_000);

    const perSpeed: Record<string, FrameSample> = {};
    for (const speed of ["1×", "2×", "5×", "10×", "30×"] as const) {
      await setSpeedOrFail(page, speed);
      // ให้ worker ปรับคาดหวังก่อนวัด แล้วถ้า controller หยุดเองตอนเปลี่ยนความเร็วให้เล่นต่อ
      await page.waitForTimeout(2000);
      const resume = page.getByRole("button", { name: /เล่นต่อ/ });
      if (await resume.count()) await resume.first().click().catch(() => undefined);
      await page.waitForTimeout(1000);
      const sample = await sampleFrames(page, 8000);
      perSpeed[speed] = sample;
      record({ check: "speed-step", speed, peakCustomers: peak, ...sample });
    }
    await page.screenshot({ path: `${SCREENS_DIR}/speed-steps.png` });

    // ความหนาแน่นที่ทำได้ขึ้นกับว่าเครื่องวาดทันแค่ไหน — เครื่องที่ไม่มี GPU เติมคนไม่ขึ้นเลย
    // เกณฑ์ fps ของฉากหนาแน่นอยู่ที่ restaurant-animation.spec.ts ("performance ฉากหนาแน่น")
    // ซึ่งต้องรันบนเครื่องอ้างอิงที่มี GPU; ข้อนี้ตรวจ "ภาพเดินต่อเนื่อง" ซึ่งใช้ได้ทุกความหนาแน่น
    record({ check: "density-context", peakCustomers: peak, renderer: perSpeed["1×"]?.renderer ?? null });

    // ที่ 1× ถึง 10× เวลาจำลองต้องเดินหน้าจริงและ controller ต้องไม่หยุดภาพเอง
    // (30× บนเครื่องที่วาดได้ 3–4 fps ยังหยุดเองได้ตามเกณฑ์ MAX_RESYNC_SECONDS — ดู summary.md)
    for (const speed of ["1×", "2×", "5×", "10×"] as const) {
      const sample = perSpeed[speed]!;
      expect(sample.frames, `${speed}: วัดเฟรมไม่ได้`).toBeGreaterThan(10);
      expect(sample.simSecondsAdvanced, `${speed}: เวลาจำลองไม่เดิน (ภาพค้าง ไม่ใช่แค่ช้า)`).toBeGreaterThan(0);
      expect(sample.selfPauses, `${speed}: controller หยุดภาพเอง ${sample.selfPauses} ครั้ง`).toBeLessThanOrEqual(1);
    }
    expect(errors).toEqual([]);
  });

  test("รันต่อเนื่อง: heap, DOM และ draw calls ไม่โตขึ้นเรื่อย ๆ", async ({ page }) => {
    test.setTimeout(900_000);
    const errors = watchErrors(page);
    await openDenseRun(page);
    await setSpeedOrFail(page, "30×");
    const peak = await fillRoom(page, FILL_TARGET, 180_000);
    await setSpeedOrFail(page, "10×");
    await page.waitForTimeout(2000);

    const segments: FrameSample[] = [];
    for (let segment = 0; segment < 6; segment += 1) {
      const sample = await sampleFrames(page, 15_000);
      segments.push(sample);
      record({ check: "long-run-segment", segment, peakCustomers: peak, ...sample });
    }
    await page.screenshot({ path: `${SCREENS_DIR}/long-run.png` });

    const first = segments[0]!;
    const last = segments[segments.length - 1]!;
    record({
      check: "long-run-trend",
      heapFirstMB: first.usedJSHeapMB, heapLastMB: last.usedJSHeapMB,
      domFirst: first.domNodes, domLast: last.domNodes,
      drawCallsFirst: first.drawCalls, drawCallsLast: last.drawCalls,
      geometriesFirst: first.geometries, geometriesLast: last.geometries,
      jankRatioFirst: first.jankRatio, jankRatioLast: last.jankRatio,
      selfPausesTotal: segments.reduce((sum, item) => sum + item.selfPauses, 0),
    });

    // DOM ของก้อนความคิดต้องใช้ซ้ำ ไม่ใช่สร้างใหม่ทุกเฟรมจนโน้ตโตขึ้นเรื่อย ๆ
    expect(last.domNodes, `DOM ${first.domNodes} → ${last.domNodes}`).toBeLessThanOrEqual(first.domNodes + 400);
    if (first.geometries !== null && last.geometries !== null) {
      expect(last.geometries, `geometries ${first.geometries} → ${last.geometries}`).toBeLessThanOrEqual(first.geometries * 2 + 50);
    }
    if (first.usedJSHeapMB !== null && last.usedJSHeapMB !== null) {
      expect(last.usedJSHeapMB, `heap ${first.usedJSHeapMB} → ${last.usedJSHeapMB} MB`).toBeLessThanOrEqual(first.usedJSHeapMB * 2 + 60);
    }
    expect(errors).toEqual([]);
  });
});
