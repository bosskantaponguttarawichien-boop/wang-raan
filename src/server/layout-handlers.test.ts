import { beforeEach, describe, expect, it } from "vitest";
import { cafeLayout, withoutType } from "@/test/fixtures/layouts";
import * as listRoute from "../../app/api/layouts/route";
import * as itemRoute from "../../app/api/layouts/[id]/route";
import { MAX_BODY_BYTES, createLayoutHandlers } from "./layout-handlers";
import { createMemoryLayoutRepository } from "./layout-repository";

const url = "http://localhost/api/layouts";
const post = (body: unknown, type = "application/json") =>
  new Request(url, { method: "POST", headers: { "content-type": type }, body: typeof body === "string" ? body : JSON.stringify(body) });
const put = (id: string, body: unknown) =>
  new Request(`${url}/${id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

let handlers: ReturnType<typeof createLayoutHandlers>;
beforeEach(() => {
  let tick = 0;
  handlers = createLayoutHandlers(createMemoryLayoutRepository(() => new Date(Date.UTC(2026, 9, 10, 1, 0, tick++))));
});

describe("POST /api/layouts", () => {
  it("ผัง Ready → 201 พร้อมผลตรวจที่ server คำนวณเอง", async () => {
    const layout = cafeLayout();
    const res = await handlers.create(post({ layout }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.layout).toEqual(layout);
    expect(body.validation.status).toBe("ready");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("Re-validation พบ Blocked → 422 พร้อม Error รายข้อ และไม่บันทึก", async () => {
    const layout = withoutType(cafeLayout(), "counter");
    const res = await handlers.create(post({ layout }));
    expect(res.status).toBe(422);
    const { error } = await res.json();
    expect(error.code).toBe("LAYOUT_BLOCKED");
    expect(error.issues).toEqual([
      expect.objectContaining({ id: "completeness/missing-counter", severity: "blocked", message: "ยังไม่มีเคาน์เตอร์" }),
    ]);
    expect(error.validation.status).toBe("blocked");
    expect((await (await handlers.list()).json()).layouts).toEqual([]);
  });

  it("ไม่เชื่อผลตรวจจาก Client: ฟิลด์ validation ใน body ถูกปฏิเสธด้วย schema", async () => {
    const res = await handlers.create(post({ layout: cafeLayout(), validation: { status: "ready" } }));
    expect(res.status).toBe(400);
  });

  it("โครงสร้างผิด → 400 พร้อมรายละเอียด path", async () => {
    const layout = { ...cafeLayout(), width: 99 };
    const res = await handlers.create(post({ layout }));
    expect(res.status).toBe(400);
    const { error } = await res.json();
    expect(error.code).toBe("INVALID_LAYOUT_SCHEMA");
    expect(error.details).toContainEqual(expect.objectContaining({ path: "layout.width" }));
  });

  it.each([
    ["JSON เสีย", () => post("{oops"), 400, "INVALID_JSON"],
    ["ไม่ใช่ JSON", () => post("a=1", "application/x-www-form-urlencoded"), 415, "UNSUPPORTED_MEDIA_TYPE"],
    ["ใหญ่เกิน", () => post(`{"pad":"${"x".repeat(MAX_BODY_BYTES)}"}`), 413, "PAYLOAD_TOO_LARGE"],
  ] as const)("%s → %s", async (_, request, status, code) => {
    const res = await handlers.create(request());
    expect(res.status).toBe(status);
    expect((await res.json()).error.code).toBe(code);
  });

  it("id ซ้ำ → 409", async () => {
    const layout = cafeLayout();
    await handlers.create(post({ layout }));
    expect((await handlers.create(post({ layout }))).status).toBe(409);
  });
});

describe("GET / PUT / DELETE /api/layouts/[id]", () => {
  it("วงจรครบ: สร้าง → อ่าน → อัปเดต → รายการ → ลบ", async () => {
    const layout = cafeLayout();
    await handlers.create(post({ layout }));
    expect((await (await handlers.get(layout.id)).json()).layout).toEqual(layout);

    const updated = { ...layout, width: 9 };
    const res = await handlers.update(put(layout.id, { layout: updated }), layout.id);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.layout.width).toBe(9);
    expect(body.updatedAt > body.createdAt).toBe(true);

    const list = (await (await handlers.list()).json()).layouts;
    expect(list).toEqual([expect.objectContaining({ id: layout.id, width: 9, status: "ready", objectCount: layout.objects.length })]);

    expect((await handlers.remove(layout.id)).status).toBe(204);
    expect((await handlers.get(layout.id)).status).toBe(404);
    expect((await handlers.remove(layout.id)).status).toBe(404);
  });

  it("PUT ผัง Blocked → 422 และข้อมูลเดิมไม่เปลี่ยน", async () => {
    const layout = cafeLayout();
    await handlers.create(post({ layout }));
    const res = await handlers.update(put(layout.id, { layout: withoutType(layout, "kitchen") }), layout.id);
    expect(res.status).toBe(422);
    expect((await (await handlers.get(layout.id)).json()).layout).toEqual(layout);
  });

  it("PUT id ใน URL ไม่ตรง → 400, ไม่มีผัง → 404", async () => {
    const layout = cafeLayout();
    expect((await handlers.update(put("other", { layout }), "other")).status).toBe(400);
    expect((await handlers.update(put(layout.id, { layout }), layout.id)).status).toBe(404);
  });
});

describe("Next.js route modules", () => {
  it("ต่อสายกับ handlers จริง (POST → GET → PUT → DELETE)", async () => {
    const layout = { ...cafeLayout(), id: `route-${Date.now()}` };
    const params = Promise.resolve({ id: layout.id });
    expect((await listRoute.POST(post({ layout }))).status).toBe(201);
    expect((await listRoute.GET()).status).toBe(200);
    expect((await itemRoute.GET(new Request(`${url}/${layout.id}`), { params })).status).toBe(200);
    expect((await itemRoute.PUT(put(layout.id, { layout }), { params })).status).toBe(200);
    expect((await itemRoute.DELETE(new Request(`${url}/${layout.id}`), { params })).status).toBe(204);
  });
});
