import { expect, type Locator, type Page, type Request } from "@playwright/test";
import { openTab } from "./helpers";

/**
 * ชุดเครื่องมือร่วมของเทสต์ภาพจำลอง (เดิมอยู่ใน restaurant-animation.spec.ts ของ feat-123)
 * แยกออกมาเพื่อให้เทสต์วัดอาการกระตุกของ feat-137 ใช้ผังหนาแน่นและ diagnostic hook ชุดเดียวกัน
 * — ผังหรือวิธีเริ่มจำลองที่ต่างกันทำให้ตัวเลขสองชุดเทียบกันไม่ได้
 * โค้ดทุกฟังก์ชันยกมาตามเดิมทั้งก้อน ไม่เปลี่ยนพฤติกรรม
 */

/** สะสม console error / uncaught error ตลอดเทสต์ — ต้องเป็น 0 ทุกข้อ */
export function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));
  return errors;
}

/** URL ของโมเดลที่หน้าเว็บขอจริง (ตัวละคร/อาหาร) */
export function watchModelRequests(page: Page) {
  const urls: string[] = [];
  page.on("request", (request: Request) => {
    const url = request.url();
    if (url.includes("/assets/models/")) urls.push(url);
  });
  return urls;
}
export const statusBar = (page: Page) => page.getByTestId("validation-status-bar");

/**
 * เปิด diagnostic hook อ่านอย่างเดียวของฉาก (feat-123) — ต้องตั้งก่อนหน้าโหลด
 * ของจริงไม่มีใครตั้ง flag นี้ ผู้ใช้ทั่วไปจึงไม่เคยได้ object นี้
 */
export async function enableDiagnostics(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).__wangraanDiagnostics = true;
  });
}

export interface SceneReports {
  staff: { clip: string; tier: string; trayMealIds: string[]; wipeProgress: number; dishReleased: boolean; tableId: string | null }[];
  customers: { clip: string; eating: boolean; seated: boolean; utensil: { utensil: string; foodKind: string } | null; plateOutOfReach: boolean }[];
  seating: { phase: string; chairPull: number; handOnBackrest: boolean; usesChairClips: boolean }[];
  tableService: { tableCount: number; activeDishCount: number; activeStainTableCount: number; activeStainMeshCount: number } | null;
  renderer: { calls: number; triangles: number; geometries: number; textures: number; programs: number } | null;
  frame: { modern: boolean; running: boolean; simTimeSeconds: number | null; frameDebtSeconds: number; customerCount: number; staffCount: number } | null;
  quality: {
    level: number; maxPixelRatio: number; characterShadows: boolean; shadowMapSize: number;
    pixelRatio: number; shadowAutoUpdate: boolean; visibleShadowProxies: number;
    sampler: { samplesInWindow: number; measuredMs: number; warmupMs: number; lastSampleMs: number };
    sceneInstances: number;
  } | null;
}

export async function readScene(page: Page): Promise<SceneReports> {
  return page.evaluate(() => {
    const hook = (window as unknown as { __wangraanScene?: Record<string, (() => unknown) | undefined> }).__wangraanScene;
    if (!hook) return { staff: [], customers: [], seating: [], tableService: null, renderer: null, frame: null, quality: null };
    return {
      staff: (hook.staffActions?.() ?? []) as SceneReports["staff"],
      customers: (hook.customerActions?.() ?? []) as SceneReports["customers"],
      seating: (hook.seating?.() ?? []) as SceneReports["seating"],
      tableService: (hook.tableService?.() ?? null) as SceneReports["tableService"],
      renderer: (hook.renderer?.() ?? null) as SceneReports["renderer"],
      frame: (hook.frame?.() ?? null) as SceneReports["frame"],
      quality: (hook.quality?.() ?? null) as SceneReports["quality"],
    };
  });
}

/**
 * ผังหนาแน่น 80 ที่นั่ง (โต๊ะ 4 ที่ 20 ชุด) ในร้าน 20 × 16 ม.
 * ระยะเก้าอี้รอบโต๊ะเท่ากับที่ `createTableSet` ของ Core วาง (สอดใต้โต๊ะ 0.10 ม.)
 * ถ้าสูตรนี้เพี้ยน ผลตรวจผังของแอปเองจะไม่เป็น Ready — เทสต์จึงตรวจสถานะหลังนำเข้าเสมอ
 */
export function denseLayoutJson(): string {
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
export async function importDenseLayout(page: Page) {
  await page.goto("/playground");
  await page.setInputFiles('input[aria-label="เลือกไฟล์ผังร้าน JSON"]', {
    name: "dense-80-seats.json",
    mimeType: "application/json",
    buffer: Buffer.from(denseLayoutJson(), "utf8"),
  });
  await expect(statusBar(page)).toHaveAttribute("data-status", "ready", { timeout: 30_000 });
}

/** เปิด Playground ด้วยผังคาเฟ่ตัวอย่างที่ผ่านการตรวจแล้ว */
export async function openReadyCafe(page: Page) {
  await page.goto("/playground");
  // จอแคบ: แผงเป็น bottom sheet ที่อาจพับอยู่ — openTab เปิดให้ก่อนหาปุ่มในแผง
  await openTab(page, "add");
  await page.getByRole("button", { name: /ใช้ผังตัวอย่าง/ }).click();
  await expect(statusBar(page)).toHaveAttribute("data-status", "ready");
}

/** @param speed ตั้งความเร็วก่อนเริ่ม — ค่าเริ่มต้นของแอปคือ 30× (feat-156) จังหวะสั้น ๆ ช่วงแรกจะผ่านไปก่อนเปลี่ยนความเร็วทัน */
export async function startSimulation(page: Page, speed?: "1×" | "2×" | "5×" | "10×" | "30×") {
  await openTab(page, "check");
  if (speed) await setSpeed(page, speed);
  const start = page.getByTestId("start-simulation");
  await expect(start).toHaveAttribute("aria-disabled", "false");
  await start.click();
  // controller หยุดชั่วคราวเองได้เมื่อพบช่องว่างของเวลา (feat-115) — เริ่มเล่นต่อให้ก่อนวัดอะไร
  await expect(page.getByTestId("simulation-status")).toContainText(/กำลังจำลอง|หยุดชั่วคราว/);
  const resume = page.getByRole("button", { name: /เล่นต่อ/ });
  if (await resume.count()) await resume.first().click();
  await expect(page.getByTestId("simulation-status")).toContainText("กำลังจำลอง");
}

export async function show3D(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "ดูตัวอย่าง 3D" }).click();
  const canvas = page.getByTestId("three-canvas");
  await expect(canvas).toBeVisible();
  return canvas;
}

/** แผงจำลองมีแถบความเร็วสองชุด (ก่อนเริ่ม / ระหว่างเล่น) — ระหว่างจำลองใช้ชุดที่มองเห็นอยู่ */
export async function setSpeed(page: Page, label: "1×" | "2×" | "5×" | "10×" | "30×") {
  const button = page.getByTestId("simulation-panel").getByRole("button", { name: label, exact: true });
  await button.last().click();
}

