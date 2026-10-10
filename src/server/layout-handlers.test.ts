import { beforeEach, describe, expect, it } from "vitest";
import { cafeLayout, withoutType } from "@/test/fixtures/layouts";
import * as listRoute from "../../app/api/layouts/route";
import * as itemRoute from "../../app/api/layouts/[id]/route";
import { MAX_BODY_BYTES, createLayoutHandlers } from "./layout-handlers";
import { createMemoryLayoutRepository } from "./layout-repository";
import type { ResolveUser } from "./session";
import { sessionCookie } from "@/test/session";

const url = "http://localhost/api/layouts";
/** ผู้ใช้ในเทสต์ระบุด้วย header x-user (handlers รับ resolver ที่ inject ได้) */
const asUser: ResolveUser = async (r) => {
  const id = r.headers.get("x-user");
  return id ? { id, name: null } : null;
};
const req = (path: string, init: RequestInit = {}, user: string | null = "alice") => {
  const headers = new Headers(init.headers);
  if (user) headers.set("x-user", user);
  return new Request(`${url}${path}`, { ...init, headers });
};
const post = (body: unknown, type = "application/json", user: string | null = "alice") =>
  req("", { method: "POST", headers: { "content-type": type }, body: typeof body === "string" ? body : JSON.stringify(body) }, user);
const put = (id: string, body: unknown, user: string | null = "alice") =>
  req(`/${id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, user);
const get = (id: string, user: string | null = "alice") => req(`/${id}`, {}, user);
const del = (id: string, user: string | null = "alice") => req(`/${id}`, { method: "DELETE" }, user);
const list = (user: string | null = "alice") => req("", {}, user);

let handlers: ReturnType<typeof createLayoutHandlers>;
beforeEach(() => {
  let tick = 0;
  handlers = createLayoutHandlers(createMemoryLayoutRepository(() => new Date(Date.UTC(2026, 9, 10, 1, 0, tick++))), asUser);
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
    expect((await (await handlers.list(list())).json()).layouts).toEqual([]);
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
    [
      "Content-Length บอกว่าใหญ่เกิน (ปฏิเสธก่อนอ่าน)",
      () => req("", { method: "POST", headers: { "content-type": "application/json", "content-length": String(MAX_BODY_BYTES + 1) }, body: "{}" }),
      413,
      "PAYLOAD_TOO_LARGE",
    ],
    [
      "stream ใหญ่เกินโดยไม่บอกขนาด (หยุดอ่านกลางทาง)",
      () =>
        req("", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: new ReadableStream({
            pull(controller) {
              controller.enqueue(new Uint8Array(64 * 1024).fill(32)); // ส่งไม่หยุด — ต้องถูกตัดเมื่อเกินขนาด
            },
          }),
          duplex: "half",
        } as RequestInit),
      413,
      "PAYLOAD_TOO_LARGE",
    ],
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
    expect((await (await handlers.get(get(layout.id), layout.id)).json()).layout).toEqual(layout);

    const updated = { ...layout, width: 9 };
    const res = await handlers.update(put(layout.id, { layout: updated }), layout.id);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.layout.width).toBe(9);
    expect(body.updatedAt > body.createdAt).toBe(true);

    const summaries = (await (await handlers.list(list())).json()).layouts;
    expect(summaries).toEqual([expect.objectContaining({ id: layout.id, width: 9, status: "ready", objectCount: layout.objects.length })]);

    expect((await handlers.remove(del(layout.id), layout.id)).status).toBe(204);
    expect((await handlers.get(get(layout.id), layout.id)).status).toBe(404);
    expect((await handlers.remove(del(layout.id), layout.id)).status).toBe(404);
  });

  it("PUT ผัง Blocked → 422 และข้อมูลเดิมไม่เปลี่ยน", async () => {
    const layout = cafeLayout();
    await handlers.create(post({ layout }));
    const res = await handlers.update(put(layout.id, { layout: withoutType(layout, "kitchen") }), layout.id);
    expect(res.status).toBe(422);
    expect((await (await handlers.get(get(layout.id), layout.id)).json()).layout).toEqual(layout);
  });

  it("PUT id ใน URL ไม่ตรง → 400, ไม่มีผัง → 404", async () => {
    const layout = cafeLayout();
    expect((await handlers.update(put("other", { layout }), "other")).status).toBe(400);
    expect((await handlers.update(put(layout.id, { layout }), layout.id)).status).toBe(404);
  });
});

describe("Session & ความเป็นเจ้าของ (feat-031)", () => {
  it("ไม่มี Session → 401 ทุก endpoint", async () => {
    const layout = cafeLayout();
    const results = await Promise.all([
      handlers.list(list(null)),
      handlers.create(post({ layout }, "application/json", null)),
      handlers.get(get(layout.id, null), layout.id),
      handlers.update(put(layout.id, { layout }, null), layout.id),
      handlers.remove(del(layout.id, null), layout.id),
    ]);
    for (const res of results) {
      expect(res.status).toBe(401);
      expect((await res.json()).error.code).toBe("UNAUTHORIZED");
    }
  });

  it("ผู้ใช้คนละคนใช้ id ผังเดียวกันได้ (เช่น นำเข้าไฟล์ของคนอื่น) — ไม่ได้ 409 ที่บอกว่าอีกคนมีผังนี้", async () => {
    const layout = cafeLayout();
    expect((await handlers.create(post({ layout }))).status).toBe(201);
    const bobs = { ...layout, width: 9 };
    expect((await handlers.create(post({ layout: bobs }, "application/json", "bob"))).status).toBe(201);
    expect((await (await handlers.get(get(layout.id), layout.id)).json()).layout.width).toBe(8);
    expect((await (await handlers.get(get(layout.id, "bob"), layout.id)).json()).layout.width).toBe(9);
    expect((await handlers.remove(del(layout.id, "bob"), layout.id)).status).toBe(204);
    expect((await handlers.get(get(layout.id), layout.id)).status).toBe(200);
  });

  it("ผู้ใช้อื่นมองไม่เห็น/แก้/ลบผังที่ไม่ใช่ของตน (ตอบ 404 ไม่บอกว่ามีอยู่)", async () => {
    const layout = cafeLayout();
    await handlers.create(post({ layout }));
    expect((await (await handlers.list(list("bob"))).json()).layouts).toEqual([]);
    expect((await handlers.get(get(layout.id, "bob"), layout.id)).status).toBe(404);
    expect((await handlers.update(put(layout.id, { layout }, "bob"), layout.id)).status).toBe(404);
    expect((await handlers.remove(del(layout.id, "bob"), layout.id)).status).toBe(404);
    expect((await handlers.get(get(layout.id), layout.id)).status).toBe(200);
  });
});

describe("Next.js route modules (Session Cookie จริงของ Auth.js)", () => {
  it("ต่อสายกับ handlers จริง (POST → GET → PUT → DELETE) และไม่มี cookie → 401", async () => {
    const layout = { ...cafeLayout(), id: `route-${Date.now()}` };
    const cookie = await sessionCookie("guest-route-test");
    const withCookie = (path: string, init: RequestInit = {}) => {
      const headers = new Headers(init.headers);
      headers.set("cookie", cookie);
      return new Request(`${url}${path}`, { ...init, headers });
    };
    const json = { "content-type": "application/json" };
    const params = Promise.resolve({ id: layout.id });
    expect((await listRoute.GET(new Request(url))).status).toBe(401);
    expect((await listRoute.POST(withCookie("", { method: "POST", headers: json, body: JSON.stringify({ layout }) }))).status).toBe(201);
    const listed = await (await listRoute.GET(withCookie(""))).json();
    expect(listed.layouts).toEqual([expect.objectContaining({ id: layout.id })]);
    expect((await itemRoute.GET(withCookie(`/${layout.id}`), { params })).status).toBe(200);
    expect((await itemRoute.PUT(withCookie(`/${layout.id}`, { method: "PUT", headers: json, body: JSON.stringify({ layout }) }), { params })).status).toBe(200);
    expect((await itemRoute.DELETE(withCookie(`/${layout.id}`, { method: "DELETE" }), { params })).status).toBe(204);
  });
});
