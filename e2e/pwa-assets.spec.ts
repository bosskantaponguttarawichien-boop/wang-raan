import { expect, test } from "@playwright/test";

/**
 * ไฟล์ใน /assets ชื่อเดิมทุก build (เช่น cafe-customer-lite.glb) — Service Worker ต้องขอจากเน็ตก่อน
 * เดิมใช้แคชก่อน มือถือที่เคยเปิดแอปจึงได้โมเดลรุ่นที่ไม่มีคลิป Eat ตลอดไป (ลูกค้าลุก-นั่งทุกคำที่กิน)
 */

test("Service Worker: โมเดลที่ชื่อไม่มี hash ได้ฉบับใหม่จากเน็ต ไม่ค้างแคชเก่า และยังใช้ออฟไลน์ได้", async ({ page, context }) => {
  let body = "old-model";
  await context.route("**/assets/models/probe.glb", route => route.fulfill({ status: 200, contentType: "model/gltf-binary", body }));
  await page.goto("/playground");
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  const read = () => page.evaluate(async () => (await fetch("/assets/models/probe.glb")).text());
  expect(await read()).toBe("old-model");
  body = "new-model";
  expect(await read()).toBe("new-model");
  // ออฟไลน์ยังได้ฉบับที่เคยโหลด
  await context.setOffline(true);
  await context.unroute("**/assets/models/probe.glb");
  expect(await read()).toBe("new-model");
});
