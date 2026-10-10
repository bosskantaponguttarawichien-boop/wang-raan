import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cafeLayout, withoutType } from "@/test/fixtures/layouts";
import { testBackend } from "@/test/backend";
import { sessionCookie } from "@/test/session";
import * as createRoute from "../../app/api/share/route";
import * as shareRoute from "../../app/api/share/[shareKey]/route";
import * as layoutsRoute from "../../app/api/layouts/route";
import * as layoutSharesRoute from "../../app/api/layouts/[id]/shares/route";
import type { ResolveUser } from "./session";
import { PUBLIC_SHARE_CACHE, createShareHandlers } from "./share-handlers";
import { SHARE_KEY_PATTERN, createShareKey } from "./share-repository";

const T0 = Date.parse("2026-10-10T06:00:00.000Z");
const DAY = 86_400_000;
const asUser: ResolveUser = async (r) => {
  const id = r.headers.get("x-user");
  return id ? { id, name: null } : null;
};
const ORIGIN = "https://wangraan.example";
const request = (method: string, path: string, body?: unknown, user: string | null = "google-alice") =>
  new Request(`${ORIGIN}${path}`, {
    method,
    headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(user ? { "x-user": user } : {}) },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
const post = (body: unknown, user: string | null = "google-alice") => request("POST", "/api/share", body, user);

let clock = T0;
let backend: ReturnType<typeof testBackend>;
let handlers: ReturnType<typeof createShareHandlers>;
beforeEach(() => {
  clock = T0;
  backend = testBackend({ now: () => new Date(clock) });
  handlers = createShareHandlers(backend.shares, asUser, () => clock);
});
afterEach(() => expect(backend.violations).toEqual([]));

async function savedLayout(owner = "google-alice", layout = cafeLayout()) {
  expect(await backend.layouts.create(owner, layout)).not.toBe("conflict");
  return layout;
}

describe("share key", () => {
  it("สุ่ม 256 บิต base64url 43 ตัว ไม่ซ้ำกัน", () => {
    const keys = new Set(Array.from({ length: 200 }, createShareKey));
    expect(keys.size).toBe(200);
    for (const key of keys) expect(key).toMatch(SHARE_KEY_PATTERN);
  });
});

describe("สร้างและเปิดลิงก์ (feat-030)", () => {
  it("เจ้าของแชร์ได้ → ใครก็เปิดได้ (ไม่ต้อง Session) แบบอ่านอย่างเดียว ไม่เปิดเผยเจ้าของ", async () => {
    const layout = await savedLayout();
    const res = await handlers.create(post({ layoutId: layout.id }));
    expect(res.status).toBe(201);
    const link = await res.json();
    expect(link).toMatchObject({ layoutId: layout.id, status: "active", expiresAt: null, revokedAt: null });
    expect(link.shareKey).toMatch(SHARE_KEY_PATTERN);
    expect(link.url).toBe(`${ORIGIN}/share/${link.shareKey}`);

    const shared = await handlers.get(request("GET", `/api/share/${link.shareKey}`, undefined, null), link.shareKey);
    expect(shared.status).toBe(200);
    expect(shared.headers.get("cache-control")).toBe(PUBLIC_SHARE_CACHE);
    const body = await shared.json();
    expect(body.layout).toEqual(layout);
    expect(body).not.toHaveProperty("ownerId");

    // snapshot: แก้ผังภายหลังไม่กระทบลิงก์เดิม
    await backend.layouts.update("google-alice", { ...layout, width: 9 });
    expect((await (await handlers.get(request("GET", "/x", undefined, null), link.shareKey)).json()).layout.width).toBe(8);
  });

  it.each([
    ["ไม่มี Session", post({ layoutId: "x" }, null), 401],
    ["JSON เสีย", post("{"), 400],
    ["ไม่มี layoutId", post({}), 400],
    ["body ใหญ่เกิน 1 KB", post({ layoutId: "layout-01", pad: "x".repeat(2000) }), 413],
    [
      "ไม่ใช่ JSON (form POST ข้ามโดเมน)",
      new Request(`${ORIGIN}/api/share`, { method: "POST", headers: { "content-type": "text/plain", "x-user": "google-alice" }, body: '{"layoutId":"layout-01"}' }),
      415,
    ],
    ["ผังไม่มี/ไม่ใช่ของตน", post({ layoutId: "layout-01" }, "google-bob"), 404],
    ["วันหมดอายุในอดีต", post({ layoutId: "layout-01", expiresAt: new Date(T0 - 1).toISOString() }), 400],
    ["วันหมดอายุเกิน 365 วัน", post({ layoutId: "layout-01", expiresAt: new Date(T0 + 366 * DAY).toISOString() }), 400],
  ])("%s → %s", async (_name, req, status) => {
    await savedLayout();
    expect((await handlers.create(req)).status).toBe(status);
  });

  it("Backend ปฏิเสธผัง Blocked → 422 LAYOUT_BLOCKED พร้อมข้อความไทย", async () => {
    // ผังที่บันทึกไว้แล้วกลายเป็น Blocked ไม่ได้ผ่าน BFF — จำลองด้วยการใส่ข้อมูลตรงใน Backend
    const layout = withoutType(cafeLayout(), "counter");
    const { layouts } = backend.mock.inspect();
    layouts.set("google-alice", new Map([[layout.id, { layout, validation: { layoutRevision: "r", status: "blocked", issues: [], validatedAt: new Date(T0).toISOString() }, createdAt: "", updatedAt: "" }]]));
    const res = await handlers.create(post({ layoutId: layout.id }));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatchObject({ code: "LAYOUT_BLOCKED", message: "ผังยังไม่ผ่านกฎจำเป็น จึงบันทึกหรือแชร์ไม่ได้" });
  });

  it("share key ผิดรูปแบบหรือไม่มีอยู่ → 404 (รูปแบบผิดไม่เรียก Backend)", async () => {
    expect((await handlers.get(request("GET", "/x", undefined, null), "../../etc")).status).toBe(404);
    expect((await handlers.get(request("GET", "/x", undefined, null), createShareKey())).status).toBe(404);
  });
});

describe("จัดการลิงก์: วันหมดอายุ / ยกเลิก / รายการ (feat-040)", () => {
  it("สร้างพร้อมวันหมดอายุ → หมดเวลาแล้วเปิดได้ 410 SHARE_EXPIRED → ต่ออายุ → เปิดได้", async () => {
    const layout = await savedLayout();
    const expiresAt = new Date(T0 + DAY).toISOString();
    const link = await (await handlers.create(post({ layoutId: layout.id, expiresAt }))).json();
    expect(link.expiresAt).toBe(expiresAt);

    clock += DAY + 1;
    const gone = await handlers.get(request("GET", "/x", undefined, null), link.shareKey);
    expect(gone.status).toBe(410);
    expect((await gone.json()).error).toEqual({ code: "SHARE_EXPIRED", message: "ลิงก์นี้หมดอายุแล้ว" });

    const renewed = await handlers.update(request("PATCH", `/api/share/${link.shareKey}`, { expiresAt: null }), link.shareKey);
    expect(renewed.status).toBe(200);
    expect(await renewed.json()).toMatchObject({ status: "active", expiresAt: null, url: link.url });
    expect((await handlers.get(request("GET", "/x", undefined, null), link.shareKey)).status).toBe(200);
  });

  it("ยกเลิก → 410 SHARE_REVOKED; แก้วันหมดอายุลิงก์ที่ยกเลิกแล้ว → 410", async () => {
    const layout = await savedLayout();
    const { shareKey } = await (await handlers.create(post({ layoutId: layout.id }))).json();
    expect((await handlers.revoke(request("DELETE", `/api/share/${shareKey}`), shareKey)).status).toBe(204);
    const gone = await handlers.get(request("GET", "/x", undefined, null), shareKey);
    expect(gone.status).toBe(410);
    expect((await gone.json()).error.code).toBe("SHARE_REVOKED");
    expect((await handlers.update(request("PATCH", "/x", { expiresAt: null }), shareKey)).status).toBe(410);
  });

  it("รายการลิงก์ของผัง (ใหม่สุดก่อน) พร้อม url และสถานะ", async () => {
    const layout = await savedLayout();
    const first = await (await handlers.create(post({ layoutId: layout.id }))).json();
    clock += 1000;
    const second = await (await handlers.create(post({ layoutId: layout.id }))).json();
    await handlers.revoke(request("DELETE", "/x"), first.shareKey);
    const res = await handlers.list(request("GET", `/api/layouts/${layout.id}/shares`), layout.id);
    expect(res.status).toBe(200);
    const { shares } = await res.json();
    expect(shares.map((s: { shareKey: string; status: string }) => [s.shareKey, s.status])).toEqual([
      [second.shareKey, "active"],
      [first.shareKey, "revoked"],
    ]);
    expect(shares[0].url).toBe(second.url);
  });

  it("ผู้ใช้อื่นจัดการลิงก์ไม่ได้ (404), ไม่มี Session → 401, body ผิด → 400", async () => {
    const layout = await savedLayout();
    const { shareKey } = await (await handlers.create(post({ layoutId: layout.id }))).json();
    expect((await handlers.revoke(request("DELETE", "/x", undefined, "google-bob"), shareKey)).status).toBe(404);
    expect((await handlers.update(request("PATCH", "/x", { expiresAt: null }, "google-bob"), shareKey)).status).toBe(404);
    expect((await handlers.list(request("GET", "/x", undefined, "google-bob"), layout.id)).status).toBe(404);
    expect((await handlers.revoke(request("DELETE", "/x", undefined, null), shareKey)).status).toBe(401);
    expect((await handlers.list(request("GET", "/x", undefined, null), layout.id)).status).toBe(401);
    expect((await handlers.update(request("PATCH", "/x", {}), shareKey)).status).toBe(400);
    expect((await handlers.revoke(request("DELETE", "/x"), "bad-key")).status).toBe(404);
  });

  it("ลิงก์ที่ใช้งานได้ครบ 20 → 409 SHARE_LIMIT_REACHED พร้อมข้อความไทย", async () => {
    const layout = await savedLayout();
    for (let i = 0; i < 20; i++) expect((await handlers.create(post({ layoutId: layout.id }))).status).toBe(201);
    const res = await handlers.create(post({ layoutId: layout.id }));
    expect(res.status).toBe(409);
    expect((await res.json()).error.message).toContain("ครบ 20 ลิงก์");
  });

  it("ลบผัง → ลิงก์ของผังนั้นเปิดไม่ได้ (410)", async () => {
    const layout = await savedLayout();
    const { shareKey } = await (await handlers.create(post({ layoutId: layout.id }))).json();
    await backend.layouts.remove("google-alice", layout.id);
    expect((await handlers.get(request("GET", "/x", undefined, null), shareKey)).status).toBe(410);
  });
});

describe("Route modules ใช้ Session Cookie จริง (Backend จำลองในตัว)", () => {
  it("บันทึก → แชร์ → รายการ → เปิดแบบไม่ล็อกอิน → ยกเลิก", async () => {
    const cookie = await sessionCookie("guest-share-route");
    const layout = { ...cafeLayout(), id: `share-route-${Date.now()}` };
    const headers = { "content-type": "application/json", cookie };
    expect((await layoutsRoute.POST(new Request("http://localhost/api/layouts", { method: "POST", headers, body: JSON.stringify({ layout }) }))).status).toBe(201);
    const res = await createRoute.POST(new Request("http://localhost/api/share", { method: "POST", headers, body: JSON.stringify({ layoutId: layout.id }) }));
    expect(res.status).toBe(201);
    const { shareKey } = await res.json();
    const params = Promise.resolve({ shareKey });
    const listed = await layoutSharesRoute.GET(new Request(`http://localhost/api/layouts/${layout.id}/shares`, { headers: { cookie } }), {
      params: Promise.resolve({ id: layout.id }),
    });
    expect((await listed.json()).shares).toHaveLength(1);
    expect((await shareRoute.GET(new Request(`http://localhost/api/share/${shareKey}`), { params })).status).toBe(200);
    expect((await shareRoute.DELETE(new Request(`http://localhost/api/share/${shareKey}`, { method: "DELETE", headers: { cookie } }), { params })).status).toBe(204);
    expect((await shareRoute.GET(new Request(`http://localhost/api/share/${shareKey}`), { params })).status).toBe(410);
  });
});
