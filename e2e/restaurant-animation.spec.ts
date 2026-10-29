import { appendFileSync, mkdirSync } from "node:fs";
import { expect, test, type Locator, type Page, type Request } from "@playwright/test";
import { BREAKPOINTS, openTab } from "./helpers";

/**
 * feat-123 · ตรวจรับภาพวงจรบริการในมุมมอง 3D
 *
 * **สองเทสต์ที่วัดผลจริงต้องรันเดี่ยว** — "เห็นครบทุกช่วงของวงจรบริการ" และ "performance ฉากหนาแน่น"
 * ใช้เวลาเดินของการจำลองและความเร็วของเครื่องเป็นตัวแปร การรันขนานกับเบราว์เซอร์อื่นทำให้ throughput
 * ของร้านต่างออกไปจนผลไม่เทียบกันได้ ให้รันด้วย:
 *   npx playwright test e2e/restaurant-animation.spec.ts --workers=1
 *
 * ทุกข้อวัดจากของจริงบนหน้าเว็บ: ภาพที่ canvas วาดจริง, ไฟล์โมเดลที่ถูกโหลดจริง และ console ของเบราว์เซอร์
 * ไม่ใช้ hook ภายในแอปและไม่ถือว่า "GLB โหลด 200" เท่ากับ "เห็นภาพถูกต้อง"
 */

/** สะสม console error / uncaught error ตลอดเทสต์ — ต้องเป็น 0 ทุกข้อ */
function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));
  return errors;
}

/** URL ของโมเดลที่หน้าเว็บขอจริง (ตัวละคร/อาหาร) */
function watchModelRequests(page: Page) {
  const urls: string[] = [];
  page.on("request", (request: Request) => {
    const url = request.url();
    if (url.includes("/assets/models/")) urls.push(url);
  });
  return urls;
}

const SCREENS_DIR = "harness/evidence/feat-123/screens";
mkdirSync(SCREENS_DIR, { recursive: true });

const statusBar = (page: Page) => page.getByTestId("validation-status-bar");

/**
 * เปิด diagnostic hook อ่านอย่างเดียวของฉาก (feat-123) — ต้องตั้งก่อนหน้าโหลด
 * ของจริงไม่มีใครตั้ง flag นี้ ผู้ใช้ทั่วไปจึงไม่เคยได้ object นี้
 */
async function enableDiagnostics(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).__wangraanDiagnostics = true;
  });
}

interface SceneReports {
  staff: { clip: string; tier: string; trayMealIds: string[]; wipeProgress: number; dishReleased: boolean; tableId: string | null }[];
  customers: { clip: string; eating: boolean; seated: boolean; utensil: { utensil: string; foodKind: string } | null; plateOutOfReach: boolean }[];
  seating: { phase: string; chairPull: number; handOnBackrest: boolean; usesChairClips: boolean }[];
  tableService: { tableCount: number; activeDishCount: number; activeStainTableCount: number; activeStainMeshCount: number } | null;
  renderer: { calls: number; triangles: number; geometries: number; textures: number; programs: number } | null;
  frame: { modern: boolean; running: boolean; simTimeSeconds: number | null; frameDebtSeconds: number; customerCount: number; staffCount: number } | null;
}

async function readScene(page: Page): Promise<SceneReports> {
  return page.evaluate(() => {
    const hook = (window as unknown as { __wangraanScene?: Record<string, (() => unknown) | undefined> }).__wangraanScene;
    if (!hook) return { staff: [], customers: [], seating: [], tableService: null, renderer: null, frame: null };
    return {
      staff: (hook.staffActions?.() ?? []) as SceneReports["staff"],
      customers: (hook.customerActions?.() ?? []) as SceneReports["customers"],
      seating: (hook.seating?.() ?? []) as SceneReports["seating"],
      tableService: (hook.tableService?.() ?? null) as SceneReports["tableService"],
      renderer: (hook.renderer?.() ?? null) as SceneReports["renderer"],
      frame: (hook.frame?.() ?? null) as SceneReports["frame"],
    };
  });
}

/**
 * ผังหนาแน่น 80 ที่นั่ง (โต๊ะ 4 ที่ 20 ชุด) ในร้าน 20 × 16 ม.
 * ระยะเก้าอี้รอบโต๊ะเท่ากับที่ `createTableSet` ของ Core วาง (สอดใต้โต๊ะ 0.10 ม.)
 * ถ้าสูตรนี้เพี้ยน ผลตรวจผังของแอปเองจะไม่เป็น Ready — เทสต์จึงตรวจสถานะหลังนำเข้าเสมอ
 */
function denseLayoutJson(): string {
  const objects: Record<string, unknown>[] = [
    { id: "counter-1", type: "counter", x: 0.5, y: 0.5, width: 2.4, depth: 0.7, rotation: 0 },
  ];
  let serial = 0;
  for (let column = 0; column < 5; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      const x = 1 + column * 3.75;
      const y = 2.5 + row * 3.25;
      serial += 1;
      const tableId = `table-${serial}`;
      const sides = [
        { dx: 0.35, dy: -0.4, rotation: 180 },
        { dx: 1.1, dy: 0.35, rotation: 270 },
        { dx: 0.35, dy: 1.1, rotation: 0 },
        { dx: -0.4, dy: 0.35, rotation: 90 },
      ];
      const chairIds = sides.map((_, index) => `${tableId}-chair-${index + 1}`);
      objects.push({ id: tableId, type: "table", preset: "table-4-seats", x, y, width: 1.2, depth: 1.2, rotation: 0, chairIds });
      sides.forEach((side, index) => {
        objects.push({
          id: chairIds[index], type: "chair", tableId,
          x: Number((x + side.dx).toFixed(2)), y: Number((y + side.dy).toFixed(2)),
          width: 0.5, depth: 0.5, rotation: side.rotation,
        });
      });
    }
  }
  return JSON.stringify({
    id: "dense-80-seats", version: 1, units: "m", width: 20, depth: 16,
    entrance: { id: "entrance-1", wall: "south", position: 9, width: 1.2 },
    kitchenDoor: { id: "kitchen-1", wall: "north", position: 4, width: 0.9 },
    objects,
  });
}

/** นำเข้าผังหนาแน่นผ่านช่องเลือกไฟล์จริงของแอป */
async function importDenseLayout(page: Page) {
  await page.goto("/playground");
  await page.setInputFiles('input[aria-label="เลือกไฟล์ผังร้าน JSON"]', {
    name: "dense-80-seats.json",
    mimeType: "application/json",
    buffer: Buffer.from(denseLayoutJson(), "utf8"),
  });
  await expect(statusBar(page)).toHaveAttribute("data-status", "ready", { timeout: 30_000 });
}

/** เปิด Playground ด้วยผังคาเฟ่ตัวอย่างที่ผ่านการตรวจแล้ว */
async function openReadyCafe(page: Page) {
  await page.goto("/playground");
  // จอแคบ: แผงเป็น bottom sheet ที่อาจพับอยู่ — openTab เปิดให้ก่อนหาปุ่มในแผง
  await openTab(page, "add");
  await page.getByRole("button", { name: /ใช้ผังตัวอย่าง/ }).click();
  await expect(statusBar(page)).toHaveAttribute("data-status", "ready");
}

async function startSimulation(page: Page) {
  await openTab(page, "check");
  const start = page.getByTestId("start-simulation");
  await expect(start).toHaveAttribute("aria-disabled", "false");
  await start.click();
  // controller หยุดชั่วคราวเองได้เมื่อพบช่องว่างของเวลา (feat-115) — เริ่มเล่นต่อให้ก่อนวัดอะไร
  await expect(page.getByTestId("simulation-status")).toContainText(/กำลังจำลอง|หยุดชั่วคราว/);
  const resume = page.getByRole("button", { name: /เล่นต่อ/ });
  if (await resume.count()) await resume.first().click();
  await expect(page.getByTestId("simulation-status")).toContainText("กำลังจำลอง");
}

async function show3D(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "ดูตัวอย่าง 3D" }).click();
  const canvas = page.getByTestId("three-canvas");
  await expect(canvas).toBeVisible();
  return canvas;
}

/** แผงจำลองมีแถบความเร็วสองชุด (ก่อนเริ่ม / ระหว่างเล่น) — ระหว่างจำลองใช้ชุดที่มองเห็นอยู่ */
async function setSpeed(page: Page, label: "1×" | "2×" | "5×" | "10×" | "30×") {
  const button = page.getByTestId("simulation-panel").getByRole("button", { name: label, exact: true });
  await button.last().click();
}

/** ความสว่างเฉลี่ย 0–1 ของภาพ PNG — ถอดรหัสในเบราว์เซอร์ จึงอ่านภาพ WebGL ที่ composite แล้วได้ */
async function meanLuminance(page: Page, png: Buffer): Promise<number> {
  return page.evaluate(async (base64) => {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("decode failed"));
      image.src = `data:image/png;base64,${base64}`;
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.min(240, image.width));
    canvas.height = Math.max(1, Math.min(240, image.height));
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let total = 0;
    for (let index = 0; index < data.length; index += 4) {
      total += (0.2126 * data[index]! + 0.7152 * data[index + 1]! + 0.0722 * data[index + 2]!) / 255;
    }
    return total / (data.length / 4);
  }, png.toString("base64"));
}

/** บันทึกค่าที่วัดได้ลงไฟล์เดียวกัน เพื่อให้หลักฐานของ feat-123 มีตัวเลขจริงไม่ใช่แค่ผ่าน/ไม่ผ่าน */
function record(measurement: Record<string, unknown>) {
  // ไม่เขียนลง e2e/.results เพราะ Playwright ล้าง outputDir ทุกครั้งที่เริ่มรัน
  mkdirSync("harness/evidence/feat-123", { recursive: true });
  appendFileSync("harness/evidence/feat-123/measurements.jsonl", `${JSON.stringify(measurement)}
`, "utf8");
}

/** สัดส่วนพิกเซลที่ต่างกันเกิน threshold ระหว่างภาพ PNG สองภาพ (ถอดรหัสในเบราว์เซอร์) */
async function pixelDiffRatio(page: Page, a: Buffer, b: Buffer, threshold = 8): Promise<number> {
  return page.evaluate(async ({ first, second, limit }) => {
    const decode = async (base64: string) => {
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("decode failed"));
        image.src = `data:image/png;base64,${base64}`;
      });
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      canvas.getContext("2d")!.drawImage(image, 0, 0);
      return canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    };
    const left = await decode(first);
    const right = await decode(second);
    if (left.length !== right.length) return 1;
    let differing = 0;
    for (let index = 0; index < left.length; index += 4) {
      const delta = Math.max(
        Math.abs(left[index]! - right[index]!),
        Math.abs(left[index + 1]! - right[index + 1]!),
        Math.abs(left[index + 2]! - right[index + 2]!),
      );
      if (delta > limit) differing += 1;
    }
    return differing / (left.length / 4);
  }, { first: a.toString("base64"), second: b.toString("base64"), limit: threshold });
}

test.describe("feat-123: วงจรบริการในมุมมอง 3D", () => {
  test("อาหารขึ้นโต๊ะจริงระหว่างจำลอง และไม่มี console error ตลอดรอบ", async ({ page }) => {
    // รอบบริการจริงกินเวลาหลายนาทีจำลอง แม้เร่ง 10× ก็ยังนานกว่า timeout มาตรฐาน
    test.setTimeout(240_000);
    const errors = watchErrors(page);
    const models = watchModelRequests(page);
    await openReadyCafe(page);
    await startSimulation(page);
    const canvas = await show3D(page);
    await setSpeed(page, "10×");

    // โมเดลตัวละครต้องถูกโหลดก่อน แล้วจานอาหารจึงขึ้นโต๊ะเมื่อถึงคิวเสิร์ฟจริง
    await expect
      .poll(() => models.some((url) => url.includes("cafe-customer")), { timeout: 30_000 })
      .toBe(true);
    await expect
      .poll(() => models.some((url) => url.includes("/assets/models/food/")), {
        timeout: 120_000,
        message: "ไม่มีจานอาหารถูกโหลดเลยระหว่างจำลอง — วงจรเสิร์ฟไม่ถึงโต๊ะ",
      })
      .toBe(true);

    const served = await canvas.screenshot();
    await page.screenshot({ path: `${SCREENS_DIR}/animation-service-cycle.png` });
    // ภาพต้องไม่ใช่เฟรมว่าง (ฉากจริงมีผนัง เฟอร์นิเจอร์ และเงา)
    const luminance = await meanLuminance(page, served);
    record({ check: "service-cycle", meanLuminance: luminance, models: models.filter((url) => url.includes("/food/")) });
    expect(luminance).toBeGreaterThan(0.05);
    expect(luminance).toBeLessThan(0.99);
    expect(errors).toEqual([]);
  });

  test("pause หยุดภาพจริง resume เล่นต่อ และ stop คืนฉากเป็นผังนิ่ง", async ({ page }) => {
    test.setTimeout(150_000);
    const errors = watchErrors(page);
    await openReadyCafe(page);
    await startSimulation(page);
    const canvas = await show3D(page);
    await setSpeed(page, "10×");
    // รอให้มีลูกค้าอยู่ในฉากก่อน ภาพจึงมีอะไรให้ขยับ
    await expect.poll(async () => {
      const before = await canvas.screenshot();
      await page.waitForTimeout(600);
      const after = await canvas.screenshot();
      return before.equals(after) ? "still" : "moving";
    }, { timeout: 60_000 }).toBe("moving");

    await page.getByRole("button", { name: /หยุดชั่วคราว/ }).click();
    // asset ที่โหลดเสร็จระหว่างนั้น (ผิวรุ่นละเอียด/โมเดลอาหาร) เปลี่ยนภาพได้ครั้งเดียว
    // จึงรอให้เข้าฉากครบก่อน แล้วค่อยวัดว่าภาพนิ่งจริง
    await page.waitForTimeout(3000);
    const paused = await canvas.screenshot();
    await page.waitForTimeout(2500);
    const still = await canvas.screenshot();
    const drift = await pixelDiffRatio(page, paused, still);
    record({ check: "paused-frame-drift", ratio: drift, windowSeconds: 2.5 });
    // หยุดจริงต้องไม่มีการเคลื่อนไหวต่อเนื่อง — เผื่อ noise ของการ composite ไว้เพียง 0.1% ของเฟรม
    expect(drift, `พิกเซลที่เปลี่ยนระหว่างหยุดชั่วคราว ${(drift * 100).toFixed(3)}%`).toBeLessThan(0.001);

    await page.getByRole("button", { name: /เล่นต่อ|หยุดชั่วคราว/ }).click();
    await page.getByTestId("stop-simulation").click();
    await expect(page.getByTestId("simulation-status")).not.toContainText("กำลังจำลอง");
    // ออกจากโหมดจำลองแล้วฉากยังวาดได้ และนิ่งสนิท (ไม่มีลูกค้า/เก้าอี้ค้างกลางทาง)
    await page.waitForTimeout(2500);
    const stopped = await canvas.screenshot();
    await page.waitForTimeout(2000);
    const stoppedDrift = await pixelDiffRatio(page, stopped, await canvas.screenshot());
    record({ check: "stopped-frame-drift", ratio: stoppedDrift, windowSeconds: 2.0 });
    expect(stoppedDrift, `พิกเซลที่เปลี่ยนหลังจบรอบ ${(stoppedDrift * 100).toFixed(3)}%`).toBeLessThan(0.001);
    await page.screenshot({ path: `${SCREENS_DIR}/animation-after-stop.png` });
    expect(errors).toEqual([]);
  });

  test("สลับ 2D ↔ 3D ระหว่างจำลองและกลับมาเล่นต่อได้โดยไม่มี error", async ({ page }) => {
    const errors = watchErrors(page);
    await openReadyCafe(page);
    await startSimulation(page);
    await show3D(page);
    await page.getByRole("button", { name: "จัดผัง 2D" }).click();
    await expect(page.getByTestId("three-canvas")).toHaveCount(0);
    const canvas = await show3D(page);
    await expect(canvas).toBeVisible();
    // เข้า 3D กลางรอบแล้วต้องสร้างฉากใหม่ได้ และมี canvas เดียวเท่านั้น
    expect(await page.locator("canvas[data-testid='three-canvas']").count()).toBe(1);
    expect(errors).toEqual([]);
  });

  test("WebGL ใช้ไม่ได้ → ฉาก SVG isometric แทน และยังจำลองต่อได้", async ({ page }) => {
    const errors = watchErrors(page);
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      // คืน null เฉพาะ context ของ WebGL — canvas 2D ของ overlay ยังต้องใช้ได้
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        if (typeof type === "string" && type.includes("webgl")) return null;
        return (original as (...args: unknown[]) => unknown).call(this, type, ...rest);
      } as typeof HTMLCanvasElement.prototype.getContext;
    });
    await openReadyCafe(page);
    await startSimulation(page);
    await page.getByRole("button", { name: "ดูตัวอย่าง 3D" }).click();
    // ไม่มี WebGL → ต้องเห็นฉาก isometric แบบ SVG ไม่ใช่หน้าว่างหรือ error
    await expect(page.getByTestId("iso-svg")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("three-canvas")).toHaveCount(0);
    await page.screenshot({ path: `${SCREENS_DIR}/animation-svg-fallback.png` });
    // three.js แจ้งว่าสร้าง WebGL context ไม่ได้ ซึ่งเป็นเหตุผลของการถอยไป SVG — ไม่ใช่ข้อผิดพลาดของแอป
    expect(errors.filter((text) => !text.includes("Error creating WebGL context"))).toEqual([]);
  });

  test("เห็นครบทุกช่วงของวงจรบริการจากสิ่งที่ feature ตัดสินใจจริง", async ({ page }) => {
    test.setTimeout(900_000);
    const errors = watchErrors(page);
    await enableDiagnostics(page);
    await openReadyCafe(page);
    await startSimulation(page);
    const canvas = await show3D(page);
    await setSpeed(page, "1×");
    expect((await readScene(page)).frame?.modern, "ฉากไม่ได้ใช้ metadata ของ simulation").toBe(true);

    // ช่วงดึงเก้าอี้กินเวลาแค่ 1.1 วินาทีจำลอง จึงต้องเฝ้าที่ 1× ก่อนเร่งความเร็ว
    const grip = { seen: false, phases: new Set<string>(), maxPull: 0, usesChairClips: true };
    await expect.poll(async () => {
      const scene = await readScene(page);
      for (const report of scene.seating) {
        grip.phases.add(report.phase);
        grip.maxPull = Math.max(grip.maxPull, report.chairPull);
        if (report.handOnBackrest && report.chairPull > 0) {
          grip.seen = true;
          grip.usesChairClips = report.usesChairClips;
        }
      }
      return grip.seen;
    }, { timeout: 180_000, intervals: [60], message: "ไม่เคยเห็นมือเกาะพนักพิงขณะเก้าอี้กำลังเคลื่อน" }).toBe(true);
    await page.screenshot({ path: `${SCREENS_DIR}/cycle-chair-grip.png` });
    // มือเกาะพนักตั้งแต่เก้าอี้ยังแทบไม่เคลื่อน จึงต้องเฝ้าต่ออีกหน่อยเพื่อดูระยะดึงเต็ม
    const until = Date.now() + 8000;
    while (Date.now() < until) {
      for (const report of (await readScene(page)).seating) {
        grip.phases.add(report.phase);
        grip.maxPull = Math.max(grip.maxPull, report.chairPull);
      }
    }
    record({
      check: "cycle-chair-grip", handOnBackrestWhileChairMoves: grip.seen,
      phasesSeen: [...grip.phases].sort(), maxChairPull: Number(grip.maxPull.toFixed(4)),
      usesChairClips: grip.usesChairClips,
    });
    // ระยะดึงต้องไม่เกินระยะของฉาก (CHAIR_PULL = 0.30 ม.) และต้องเดินผ่านช่วงที่มือเกาะจริง
    expect(grip.maxPull).toBeGreaterThan(0.05);
    expect(grip.maxPull).toBeLessThanOrEqual(0.3001);

    await setSpeed(page, "30×");

    /**
     * รอจนเงื่อนไขเป็นจริง โดยนับ **เวลาจำลอง** ไม่ใช่เวลาจริง — เครื่องที่รันหลายเบราว์เซอร์พร้อมกัน
     * จะเดินช้าลงในเวลาจริง แต่วงจรบริการยังมาถึงเท่าเดิมเมื่อวัดด้วยนาฬิกาของร้าน
     */
    const milestone = async (
      name: string,
      ready: (scene: SceneReports) => boolean,
      detail: (scene: SceneReports) => Record<string, unknown>,
      simSecondsBudget = 5400,
    ) => {
      const start = (await readScene(page)).frame?.simTimeSeconds ?? 0;
      let seen: SceneReports | null = null;
      await expect.poll(async () => {
        const scene = await readScene(page);
        if (ready(scene)) seen = scene;
        const elapsed = (scene.frame?.simTimeSeconds ?? start) - start;
        if (seen) return "found";
        return elapsed > simSecondsBudget ? "out-of-sim-time" : "waiting";
      }, {
        timeout: 600_000, intervals: [250],
        message: `ไม่พบช่วง "${name}" ภายใน ${simSecondsBudget} วินาทีจำลอง`,
      }).toBe("found");
      await page.screenshot({ path: `${SCREENS_DIR}/cycle-${name}.png` });
      record({ check: `cycle-${name}`, ...detail(seen!) });
      return seen!;
    };

    // 1. พนักงานถือถาดอาหารเดินไปเสิร์ฟ
    await milestone(
      "carrying",
      (scene) => scene.staff.some((report) => report.trayMealIds.length > 0 && report.clip.startsWith("Carry")),
      (scene) => {
        const carrying = scene.staff.find((report) => report.trayMealIds.length > 0)!;
        return { clip: carrying.clip, tier: carrying.tier, meals: carrying.trayMealIds.length };
      },
    );

    // 2. ลูกค้านั่งกินอาหารพร้อมอุปกรณ์ตามเมนู และจานอยู่บนโต๊ะจริง
    const eating = await milestone(
      "eating",
      (scene) => scene.customers.some((report) => report.eating) && (scene.tableService?.activeDishCount ?? 0) > 0,
      (scene) => {
        const diner = scene.customers.find((report) => report.eating)!;
        return {
          clip: diner.clip, utensil: diner.utensil?.utensil, foodKind: diner.utensil?.foodKind,
          plateOutOfReach: diner.plateOutOfReach, dishesOnTables: scene.tableService?.activeDishCount,
        };
      },
    );
    expect(eating.customers.find((report) => report.eating)!.clip).toBe("Eat");
    expect(eating.customers.find((report) => report.eating)!.seated).toBe(true); expect(eating.customers.find((report) => report.eating)!.plateOutOfReach).toBe(false);

    // 3. คราบปรากฏบนโต๊ะหลังลูกค้ากิน
    await milestone(
      "stained",
      (scene) => (scene.tableService?.activeStainMeshCount ?? 0) > 0,
      (scene) => ({
        stainTables: scene.tableService?.activeStainTableCount,
        stainMeshes: scene.tableService?.activeStainMeshCount,
      }),
    );

    // 4. พนักงานเช็ดโต๊ะ โดยคราบยังไม่หายก่อนเช็ดเสร็จ
    const wiping = await milestone(
      "wiping",
      (scene) => scene.staff.some((report) => report.clip === "WipeTable") && (scene.tableService?.activeStainMeshCount ?? 0) > 0,
      (scene) => {
        const cleaner = scene.staff.find((report) => report.clip === "WipeTable")!;
        return {
          clip: cleaner.clip, wipeProgress: cleaner.wipeProgress, tableId: cleaner.tableId,
          stainMeshesStillThere: scene.tableService?.activeStainMeshCount,
        };
      },
    );
    const cleaner = wiping.staff.find((report) => report.clip === "WipeTable")!;
    expect(cleaner.wipeProgress).toBeGreaterThanOrEqual(0);
    expect(cleaner.wipeProgress).toBeLessThanOrEqual(1);
    expect(wiping.tableService!.activeStainMeshCount, "คราบหายไปแล้วทั้งที่ยังเช็ดไม่เสร็จ").toBeGreaterThan(0);

    // 5. งานเช็ดเดินจนจบจริง — ตรวจที่ความคืบหน้าของงาน ไม่ใช่ "ทั้งร้านไม่มีคราบ"
    //    (ร้านที่คนเยอะมีโต๊ะอื่นเปื้อนตลอดเวลา เงื่อนไขระดับร้านจึงไม่ใช่สิ่งที่ควรรอ)
    await milestone(
      "wipe-complete",
      (scene) => scene.staff.some((report) => report.clip === "WipeTable" && report.wipeProgress >= 0.95),
      (scene) => {
        const done = scene.staff.find((report) => report.clip === "WipeTable" && report.wipeProgress >= 0.95)!;
        return {
          wipeProgress: done.wipeProgress, tableId: done.tableId,
          stainMeshes: scene.tableService?.activeStainMeshCount,
          dishesOnTables: scene.tableService?.activeDishCount,
        };
      },
    );

    await expect(canvas).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("เมนูที่ขึ้นโต๊ะอยู่ในห้าเมนูที่ล็อกไว้เท่านั้น", async ({ page }) => {
    test.setTimeout(300_000);
    const errors = watchErrors(page);
    const models = watchModelRequests(page);
    await openReadyCafe(page);
    await startSimulation(page);
    await show3D(page);
    await setSpeed(page, "30×");
    // ปล่อยให้ร้านเสิร์ฟหลายรอบ แล้วดูว่ามีเมนูใดขึ้นโต๊ะบ้าง
    await page.waitForTimeout(120_000);
    const MENUS = ["fried-rice", "noodles", "steak", "salad", "cake"] as const;
    const loaded = [...new Set(
      models
        .filter((url) => url.includes("/assets/models/food/"))
        .map((url) => url.split("/assets/models/food/")[1]!.split("/")[0]!),
    )].sort();
    record({ check: "menus-observed", loaded, expected: MENUS });
    expect(loaded.length, "ไม่มีเมนูใดขึ้นโต๊ะเลย").toBeGreaterThan(0);
    // เมนูถูกล็อกไว้ห้าแบบ — ห้ามมีชื่ออื่นหลุดมาเป็นคำขอโมเดล
    expect(loaded.filter((menu) => !MENUS.includes(menu as typeof MENUS[number]))).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("performance บนเครื่องอ้างอิง: ฉากหนาแน่น 80 ที่นั่ง + พนักงาน 8 คน", async ({ page }) => {
    test.setTimeout(900_000);
    const errors = watchErrors(page);
    await enableDiagnostics(page);
    await importDenseLayout(page);
    await openTab(page, "check");

    // พนักงานหน้าร้าน 8 คน (เพดานของระบบ) และพ่อครัวมากพอไม่ให้ครัวเป็นคอขวด
    const panel = page.getByTestId("simulation-panel");
    for (let click = 0; click < 8; click += 1) {
      const add = panel.getByRole("button", { name: "เพิ่มพนักงานหน้าร้าน" });
      if (await add.isDisabled()) break;
      await add.click();
    }
    for (let click = 0; click < 8; click += 1) {
      const add = panel.getByRole("button", { name: "เพิ่มพ่อครัว" });
      if (await add.isDisabled()) break;
      await add.click();
    }
    // ลูกค้าต่อวันสูงสุดและนั่งนาน เพื่อให้ที่นั่งเต็มพร้อมกันได้จริง (เลือกจาก label ไม่ใช่ลำดับ)
    for (const [label, value] of [["อยากให้ลูกค้าเข้าทั้งวัน", "500"], ["ลูกค้านั่งกินประมาณ", "120"]] as const) {
      const slider = panel.getByLabel(new RegExp(label));
      if (await slider.count()) await slider.first().fill(value);
    }
    const staffCount = await panel.getByLabel(/พนักงานหน้าร้าน \d+ คน/).innerText().catch(() => "?");

    await startSimulation(page);
    await show3D(page);
    await setSpeed(page, "30×");
    // เร่ง 30× เป็นเวลาคงที่เพื่อให้ร้านเต็มเท่าที่ engine จะพาไปได้ แล้วค่อยวัดที่ 1×
    // (ไม่ตั้งเป้าจำนวนคนตายตัว เพราะจำนวนที่นั่งเต็มขึ้นกับอัตราเข้าร้านของ engine ไม่ใช่ของภาพ)
    let peak = 0;
    const fillFrom = (await readScene(page)).frame?.simTimeSeconds ?? 0;
    // งบเป็นเวลาจำลอง (1 ชั่วโมงในร้าน) เพื่อให้ผลไม่ขึ้นกับว่าเครื่องว่างแค่ไหน
    let lastSimTime = fillFrom;
    let stalled = 0;
    const fillDeadline = Date.now() + 300_000;
    for (;;) {
      const scene = await readScene(page);
      peak = Math.max(peak, scene.frame?.customerCount ?? 0);
      const simTime = scene.frame?.simTimeSeconds ?? lastSimTime;
      // นาฬิกาจำลองหยุดเดิน = controller หยุดชั่วคราวเองหรือรอบจบ ไม่ควรวนรอต่อ
      stalled = simTime > lastSimTime ? 0 : stalled + 1;
      lastSimTime = Math.max(lastSimTime, simTime);
      if (peak >= 70 || simTime - fillFrom > 3600 || stalled > 20 || Date.now() > fillDeadline) break;
      await page.waitForTimeout(500);
    }
    record({ check: "dense-fill", peak, simSecondsElapsed: Number((lastSimTime - fillFrom).toFixed(1)), stalled });
    await setSpeed(page, "1×");
    await page.waitForTimeout(3000);
    const dense = await readScene(page);

    const sample = await page.evaluate(async () => {
      const intervals: number[] = [];
      await new Promise<void>((resolve) => {
        let previous = performance.now();
        const started = previous;
        const step = (now: number) => {
          intervals.push(now - previous);
          previous = now;
          if (now - started >= 10_000) resolve();
          else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
      intervals.sort((a, b) => a - b);
      const at = (ratio: number) => intervals[Math.min(intervals.length - 1, Math.floor(intervals.length * ratio))]!;
      const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
      const canvas = document.querySelector<HTMLCanvasElement>("canvas[data-testid='three-canvas']");
      const gl = canvas?.getContext("webgl2") ?? canvas?.getContext("webgl");
      const info = gl?.getExtension("WEBGL_debug_renderer_info");
      return {
        frames: intervals.length,
        medianMs: at(0.5),
        p95Ms: at(0.95),
        usedJSHeapMB: memory ? Number((memory.usedJSHeapSize / 1024 / 1024).toFixed(1)) : null,
        canvasPixels: canvas ? [canvas.width, canvas.height] : null,
        devicePixelRatio: window.devicePixelRatio,
        renderer: info && gl ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : null,
        vendor: info && gl ? String(gl.getParameter(info.UNMASKED_VENDOR_WEBGL)) : null,
      };
    });
    const inStore = await page.getByTestId("simulation-metrics").innerText().catch(() => "");
    const after = await readScene(page);
    record({
      check: "performance-dense",
      ...sample,
      medianFps: Number((1000 / sample.medianMs).toFixed(1)),
      p95Fps: Number((1000 / sample.p95Ms).toFixed(1)),
      seats: 80,
      staffControl: staffCount,
      peakCustomersInScene: peak,
      customersWhileMeasuring: after.frame?.customerCount ?? null,
      staffInScene: after.frame?.staffCount ?? null,
      drawCalls: after.renderer?.calls ?? null,
      triangles: after.renderer?.triangles ?? null,
      geometries: after.renderer?.geometries ?? null,
      textures: after.renderer?.textures ?? null,
      programs: after.renderer?.programs ?? null,
      dishesOnTables: dense.tableService?.activeDishCount ?? null,
      frameDebtSeconds: after.frame?.frameDebtSeconds ?? null,
      storeMetrics: inStore.replace(/\s+/g, " ").slice(0, 240),
    });
    await page.screenshot({ path: `${SCREENS_DIR}/performance-dense.png` });
    expect(peak, "ร้านแทบไม่มีคนเลย วัด performance ไม่มีความหมาย").toBeGreaterThanOrEqual(20);
    expect(sample.frames, "วัดเฟรมไม่ได้เลย").toBeGreaterThan(60);
    expect(1000 / sample.medianMs, `median ${(1000 / sample.medianMs).toFixed(1)} fps`).toBeGreaterThanOrEqual(30);
    expect(errors).toEqual([]);
  });

  test("เริ่ม–จบรอบ 10 ครั้ง: canvas ไม่งอกและไม่มี error สะสม", async ({ page }) => {
    test.setTimeout(240_000);
    const errors = watchErrors(page);
    await openReadyCafe(page);
    await show3D(page);
    const heapBefore = await page.evaluate(() => (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null);
    for (let round = 0; round < 10; round += 1) {
      // กดเริ่มจำลองพากลับไปมุมมอง 2D เสมอ จึงต้องเข้า 3D ใหม่ทุกรอบ = mount/unmount จริง 10 ครั้ง
      await startSimulation(page);
      await show3D(page);
      await page.waitForTimeout(500);
      await page.getByTestId("stop-simulation").click();
      await expect(page.getByTestId("simulation-status")).not.toContainText("กำลังจำลอง");
      // WebGL context มีจำกัดต่อหน้า — ห้ามมี canvas ค้างสะสมจากรอบก่อน
      expect(await page.locator("canvas[data-testid='three-canvas']").count(), `รอบที่ ${round + 1}`).toBeLessThanOrEqual(1);
    }
    await show3D(page);
    expect(await page.locator("canvas[data-testid='three-canvas']").count()).toBe(1);
    const heapAfter = await page.evaluate(() => (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null);
    record({
      check: "start-stop-10-rounds",
      canvases: await page.locator("canvas[data-testid='three-canvas']").count(),
      heapBeforeMB: heapBefore === null ? null : Number((heapBefore / 1024 / 1024).toFixed(1)),
      heapAfterMB: heapAfter === null ? null : Number((heapAfter / 1024 / 1024).toFixed(1)),
    });
    expect(errors).toEqual([]);
  });

  for (const width of BREAKPOINTS) {
    test(`มุมมอง 3D ที่ ${width}px: ไม่มี horizontal scroll และ canvas อยู่ในจอ`, async ({ page }) => {
      const errors = watchErrors(page);
      await page.setViewportSize({ width, height: width < 768 ? 812 : 900 });
      await openReadyCafe(page);
      const canvas = await show3D(page);
      const box = (await canvas.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: `${SCREENS_DIR}/animation-3d-${width}.png` });
      expect(errors).toEqual([]);
    });
  }
});
