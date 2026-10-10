/**
 * Backend จำลอง (feat-038) — ทุกคำขอผ่าน contractFetch: request และ response ต้องตรง contracts/openapi.yaml
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { contractFetch } from "../contracts/contract-checker";
import { cafeLayout, withoutType } from "@/test/fixtures/layouts";
import { createInternalToken } from "@/server/token-relay";
import { LAYOUT_LIMIT, SHARE_LIMIT, createMockBackend, type MockBackend } from "./handler";

const SECRET = "mock-test-secret";
const BASE = "http://backend.test";
const T0 = Date.parse("2026-10-10T06:00:00.000Z");
const GUEST = "guest-0f8fad5b-d9cb-469f-a165-70867728950e";

let clock = T0;
let mock: MockBackend;
let checked: ReturnType<typeof contractFetch>;
/** สำหรับคำขอที่ตั้งใจผิดสัญญา — ตรวจเฉพาะ response */
let lenient: ReturnType<typeof contractFetch>;

beforeEach(() => {
  clock = T0;
  let n = 0;
  mock = createMockBackend({ secret: SECRET, now: () => new Date(clock), newShareKey: () => `k${String(n++).padStart(42, "0")}` });
  checked = contractFetch(mock.fetch);
  lenient = contractFetch(mock.fetch, { requests: false });
});
afterEach(() => expect([...checked.violations, ...lenient.violations]).toEqual([]));

async function call(
  method: string,
  path: string,
  opts: { user?: string | null; body?: unknown; headers?: Record<string, string>; invalid?: boolean } = {},
) {
  const headers: Record<string, string> = { "x-request-id": globalThis.crypto.randomUUID(), ...opts.headers };
  const user = opts.user === undefined ? "google-alice" : opts.user;
  if (user) headers.authorization = `Bearer ${await createInternalToken(user, SECRET)}`;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  const res = await (opts.invalid ? lenient : checked).fetch(`${BASE}${path}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body),
  });
  const text = await res.text();
  return { status: res.status, headers: res.headers, body: text ? JSON.parse(text) : null };
}

const save = (layout = cafeLayout(), user?: string) => call("POST", "/v1/layouts", { body: { layout }, user });

describe("ระบบ", () => {
  it("/health ไม่ต้องใช้ token", async () => {
    const res = await checked.fetch(`${BASE}/health`);
    expect(await res.json()).toEqual({ status: "ok", version: "mock", database: "ok" });
  });

  it("ไม่มี token / token ผิด secret / anonymous ใน endpoint ที่ต้องมีผู้ใช้ → 401", async () => {
    expect((await call("GET", "/v1/layouts", { user: null, invalid: true })).status).toBe(401);
    const forged = await createInternalToken("google-alice", "other-secret");
    expect((await call("GET", "/v1/layouts", { user: null, headers: { authorization: `Bearer ${forged}` } })).status).toBe(401);
    expect((await call("GET", "/v1/layouts", { user: "anonymous" })).status).toBe(401);
  });
});

describe("ผังร้าน", () => {
  it("สร้าง → รายการ → เปิด → บันทึกทับ → ลบ", async () => {
    const layout = cafeLayout();
    const created = await save(layout);
    expect(created.status).toBe(201);
    expect(created.body.validation.status).toBe("ready");
    expect(created.body.createdAt).toBe(new Date(T0).toISOString());

    expect((await call("GET", "/v1/layouts")).body.layouts).toEqual([
      expect.objectContaining({ id: layout.id, objectCount: layout.objects.length, status: "ready" }),
    ]);
    expect((await call("GET", `/v1/layouts/${layout.id}`)).body.layout).toEqual(layout);

    clock += 60_000;
    const updated = await call("PUT", `/v1/layouts/${layout.id}`, { body: { layout: { ...layout, width: 9 } } });
    expect(updated.status).toBe(200);
    expect(updated.body.createdAt).toBe(created.body.createdAt);
    expect(updated.body.updatedAt).not.toBe(created.body.updatedAt);

    expect((await call("DELETE", `/v1/layouts/${layout.id}`)).status).toBe(204);
    expect((await call("GET", `/v1/layouts/${layout.id}`)).status).toBe(404);
  });

  it("Backend ตรวจผังเอง: Blocked → 422 พร้อม validation และไม่บันทึก", async () => {
    const res = await save(withoutType(cafeLayout(), "counter"));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("LAYOUT_BLOCKED");
    expect(res.body.error.validation.status).toBe("blocked");
    expect((await call("GET", "/v1/layouts")).body.layouts).toEqual([]);
  });

  it("schema ผิด → 400 INVALID_LAYOUT_SCHEMA, JSON พัง → 400 INVALID_JSON, ไม่ใช่ JSON → 415", async () => {
    const bad = await call("POST", "/v1/layouts", { body: { layout: { ...cafeLayout(), units: "cm" } }, invalid: true });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("INVALID_LAYOUT_SCHEMA");
    expect(bad.body.error.details.length).toBeGreaterThan(0);
    // คำขอผิดรูปแบบโดยตั้งใจ — ตรวจ response แต่ไม่ตรวจ request
    const raw = createMockBackend({ secret: SECRET });
    const token = await createInternalToken("google-alice", SECRET);
    const broken = await raw.fetch(
      new Request(`${BASE}/v1/layouts`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: "{" }),
    );
    expect((await broken.json()).error.code).toBe("INVALID_JSON");
    const text = await raw.fetch(new Request(`${BASE}/v1/layouts`, { method: "POST", headers: { authorization: `Bearer ${token}` }, body: "x" }));
    expect(text.status).toBe(415);
  });

  it("id ซ้ำ → 409 LAYOUT_EXISTS, id ใน path ไม่ตรง → 400 ID_MISMATCH, ไม่มีผัง → 404", async () => {
    const layout = cafeLayout();
    await save(layout);
    expect((await save(layout)).body.error.code).toBe("LAYOUT_EXISTS");
    expect((await call("PUT", "/v1/layouts/other", { body: { layout } })).body.error.code).toBe("ID_MISMATCH");
    expect((await call("PUT", "/v1/layouts/missing", { body: { layout: { ...layout, id: "missing" } } })).status).toBe(404);
    expect((await call("DELETE", "/v1/layouts/missing")).status).toBe(404);
  });

  it("ผู้ใช้อื่นมองไม่เห็นและแก้ไม่ได้ (404) — แต่ใช้ id เดียวกันได้", async () => {
    const layout = cafeLayout();
    await save(layout);
    expect((await call("GET", `/v1/layouts/${layout.id}`, { user: "google-bob" })).status).toBe(404);
    expect((await call("DELETE", `/v1/layouts/${layout.id}`, { user: "google-bob" })).status).toBe(404);
    expect((await save(layout, "google-bob")).status).toBe(201);
  });

  it(`โควตา ${LAYOUT_LIMIT} ผังต่อผู้ใช้ → 409 LAYOUT_LIMIT_REACHED`, async () => {
    for (let i = 0; i < LAYOUT_LIMIT; i++) {
      const res = await mock.fetch(
        new Request(`${BASE}/v1/layouts`, {
          method: "POST",
          headers: { authorization: `Bearer ${await createInternalToken("google-alice", SECRET)}`, "content-type": "application/json" },
          body: JSON.stringify({ layout: { ...cafeLayout(), id: `l-${i}` } }),
        }),
      );
      expect(res.status).toBe(201);
    }
    expect((await save({ ...cafeLayout(), id: "one-more" })).body.error.code).toBe("LAYOUT_LIMIT_REACHED");
  });

  it("body ผังเกิน 512 KB → 413", async () => {
    const res = await call("POST", "/v1/layouts", { body: { layout: { ...cafeLayout(), id: "x".repeat(600 * 1024) } }, invalid: true });
    expect(res.status).toBe(413);
  });
});

describe("ลิงก์แชร์", () => {
  const key0 = `k${"0".repeat(42)}`;

  it("สร้าง (snapshot) → เปิดแบบ anonymous → แก้ผังทีหลังลิงก์ไม่เปลี่ยน", async () => {
    const layout = cafeLayout();
    await save(layout);
    const created = await call("POST", `/v1/layouts/${layout.id}/shares`, { body: {} });
    expect(created.status).toBe(201);
    expect(created.body).toEqual({ shareKey: key0, layoutId: layout.id, status: "active", createdAt: new Date(T0).toISOString(), expiresAt: null, revokedAt: null });

    await call("PUT", `/v1/layouts/${layout.id}`, { body: { layout: { ...layout, width: 10 } } });
    const pub = await call("GET", `/v1/public/shares/${key0}`, { user: "anonymous", headers: { "x-client-ip": "203.0.113.9" } });
    expect(pub.status).toBe(200);
    expect(pub.body.layout.width).toBe(layout.width);
    expect(pub.body).not.toHaveProperty("ownerId");
  });

  it("ยกเลิก → 410 SHARE_REVOKED (เรียกซ้ำได้), เปลี่ยนวันหมดอายุของลิงก์ที่ยกเลิกแล้ว → 410", async () => {
    const layout = cafeLayout();
    await save(layout);
    await call("POST", `/v1/layouts/${layout.id}/shares`, { body: {} });
    expect((await call("DELETE", `/v1/shares/${key0}`)).status).toBe(204);
    expect((await call("DELETE", `/v1/shares/${key0}`)).status).toBe(204);
    const pub = await call("GET", `/v1/public/shares/${key0}`, { user: "anonymous", headers: { "x-client-ip": "1.1.1.1" } });
    expect(pub.status).toBe(410);
    expect(pub.body.error.code).toBe("SHARE_REVOKED");
    expect((await call("PATCH", `/v1/shares/${key0}`, { body: { expiresAt: null } })).body.error.code).toBe("SHARE_REVOKED");
    expect((await call("GET", `/v1/layouts/${layout.id}/shares`)).body.shares[0]).toMatchObject({ status: "revoked" });
  });

  it("หมดอายุตามเวลา → 410 SHARE_EXPIRED; ต่ออายุได้", async () => {
    const layout = cafeLayout();
    await save(layout);
    const expiresAt = new Date(T0 + 60_000).toISOString();
    expect((await call("POST", `/v1/layouts/${layout.id}/shares`, { body: { expiresAt } })).body.expiresAt).toBe(expiresAt);
    clock += 61_000;
    const pub = () => call("GET", `/v1/public/shares/${key0}`, { user: "anonymous", headers: { "x-client-ip": "1.1.1.1" } });
    expect((await pub()).body.error.code).toBe("SHARE_EXPIRED");
    expect((await call("GET", `/v1/layouts/${layout.id}/shares`)).body.shares[0].status).toBe("expired");
    const renewed = await call("PATCH", `/v1/shares/${key0}`, { body: { expiresAt: null } });
    expect(renewed.body).toMatchObject({ status: "active", expiresAt: null });
    expect((await pub()).status).toBe(200);
  });

  it("วันหมดอายุต้องอยู่ในอนาคตและไม่เกิน 365 วัน → ไม่งั้น 400", async () => {
    const layout = cafeLayout();
    await save(layout);
    for (const expiresAt of [new Date(T0 - 1).toISOString(), new Date(T0 + 366 * 86_400_000).toISOString()]) {
      expect((await call("POST", `/v1/layouts/${layout.id}/shares`, { body: { expiresAt } })).status).toBe(400);
    }
  });

  it("ลบผัง → ลิงก์ของผังนั้นถูกยกเลิก", async () => {
    const layout = cafeLayout();
    await save(layout);
    await call("POST", `/v1/layouts/${layout.id}/shares`, { body: {} });
    await call("DELETE", `/v1/layouts/${layout.id}`);
    expect((await call("GET", `/v1/public/shares/${key0}`, { user: "anonymous", headers: { "x-client-ip": "1.1.1.1" } })).status).toBe(410);
  });

  it("เจ้าของเท่านั้นที่ยกเลิก/แก้/ดูรายการได้ (คนอื่น 404), key ที่ไม่มี → 404", async () => {
    const layout = cafeLayout();
    await save(layout);
    await call("POST", `/v1/layouts/${layout.id}/shares`, { body: {} });
    expect((await call("DELETE", `/v1/shares/${key0}`, { user: "google-bob" })).status).toBe(404);
    expect((await call("PATCH", `/v1/shares/${key0}`, { user: "google-bob", body: { expiresAt: null } })).status).toBe(404);
    expect((await call("GET", `/v1/layouts/${layout.id}/shares`, { user: "google-bob" })).status).toBe(404);
    expect((await call("GET", `/v1/public/shares/${"Z".repeat(43)}`, { user: "anonymous", headers: { "x-client-ip": "1.1.1.1" } })).status).toBe(404);
  });

  it(`ลิงก์ที่ใช้งานได้ต่อผังไม่เกิน ${SHARE_LIMIT} — ยกเลิกแล้วสร้างใหม่ได้`, async () => {
    const layout = cafeLayout();
    await save(layout);
    for (let i = 0; i < SHARE_LIMIT; i++) expect((await call("POST", `/v1/layouts/${layout.id}/shares`, { body: {} })).status).toBe(201);
    expect((await call("POST", `/v1/layouts/${layout.id}/shares`, { body: {} })).body.error.code).toBe("SHARE_LIMIT_REACHED");
    await call("DELETE", `/v1/shares/${key0}`);
    expect((await call("POST", `/v1/layouts/${layout.id}/shares`, { body: {} })).status).toBe(201);
  });
});

describe("ฟอร์มติดต่อ", () => {
  const message = { name: "สมชาย", email: "somchai@example.com", message: "สนใจใช้กับร้านกาแฟ 3 สาขา" };
  const send = (ip: string, user: string | null = "anonymous") => call("POST", "/v1/contact-messages", { user, body: message, headers: { "x-client-ip": ip } });

  it("anonymous ส่งได้ → 202; ครั้งที่ 6 ใน 10 นาทีจาก IP เดิม → 429 + Retry-After", async () => {
    for (let i = 0; i < 5; i++) expect((await send("203.0.113.1")).status).toBe(202);
    const blocked = await send("203.0.113.1");
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toMatchObject({ code: "RATE_LIMITED", retryAfter: 600 });
    expect(blocked.headers.get("retry-after")).toBe("600");
    expect((await send("203.0.113.2")).status).toBe(202);
    clock += 10 * 60_000;
    expect((await send("203.0.113.1")).status).toBe(202);
  });

  it("ผู้ใช้ที่ล็อกอินถูกนับต่อบัญชีด้วย (เปลี่ยน IP ก็ไม่พ้น)", async () => {
    for (let i = 0; i < 5; i++) expect((await send(`198.51.100.${i}`, "google-alice")).status).toBe(202);
    expect((await send("198.51.100.99", "google-alice")).status).toBe(429);
  });

  it("schema ผิด → 400 พร้อม details", async () => {
    const res = await call("POST", "/v1/contact-messages", {
      user: "anonymous",
      body: { ...message, message: "สั้น" },
      headers: { "x-client-ip": "1.1.1.1" },
      invalid: true,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe("message");
  });
});

describe("บัญชีผู้ใช้", () => {
  it("โปรไฟล์: ยังไม่มี → 404, PUT สร้าง → GET ได้, PUT ซ้ำ createdAt คงเดิม", async () => {
    expect((await call("GET", "/v1/me")).status).toBe(404);
    const created = await call("PUT", "/v1/me", { body: { provider: "google", name: "Alice", email: "alice@example.com", image: null } });
    expect(created.body).toMatchObject({ id: "google-alice", provider: "google", name: "Alice" });
    clock += 1000;
    const again = await call("PUT", "/v1/me", { body: { provider: "google", name: "Alice B." } });
    expect(again.body.createdAt).toBe(created.body.createdAt);
    expect((await call("GET", "/v1/me")).body.name).toBe("Alice B.");
  });

  it("ส่งออกข้อมูลครบ แล้วลบบัญชี → ไม่เหลือข้อมูลของผู้ใช้ (ลบซ้ำได้)", async () => {
    const layout = cafeLayout();
    await call("PUT", "/v1/me", { body: { provider: "google", name: "Alice" } });
    await save(layout);
    await call("POST", `/v1/layouts/${layout.id}/shares`, { body: {} });
    await call("POST", "/v1/contact-messages", { body: { name: "Alice", email: "a@example.com", message: "ขอใบเสนอราคาหน่อย" }, headers: { "x-client-ip": "1.1.1.1" } });
    const exported = await call("GET", "/v1/me/export");
    expect(exported.body.layouts).toHaveLength(1);
    expect(exported.body.shares).toHaveLength(1);
    expect(exported.body.contactMessages).toHaveLength(1);

    expect((await call("DELETE", "/v1/me")).status).toBe(204);
    expect((await call("DELETE", "/v1/me")).status).toBe(204);
    const { users, layouts, shares, contacts } = mock.inspect();
    expect(users.has("google-alice")).toBe(false);
    expect(layouts.has("google-alice")).toBe(false);
    expect([...shares.values()].some((s) => s.ownerId === "google-alice")).toBe(false);
    expect(contacts.some((c) => c.userId === "google-alice")).toBe(false);
  });

  it("ย้ายผัง Guest เข้าบัญชี: id ชนได้ id ใหม่, ลิงก์ย้ายตาม, เรียกซ้ำได้ 0", async () => {
    const layout = cafeLayout();
    await save(layout, GUEST);
    await save({ ...layout, id: "guest-only" }, GUEST);
    await call("POST", `/v1/layouts/${layout.id}/shares`, { user: GUEST, body: {} });
    await save(layout); // ผู้ใช้มีผัง id เดียวกันอยู่แล้ว

    const merged = await call("POST", "/v1/me/merge-guest", { body: { guestId: GUEST } });
    expect(merged.body.movedLayouts).toBe(2);
    expect(merged.body.movedShares).toBe(1);
    expect(merged.body.renamed).toEqual([{ from: layout.id, to: expect.stringMatching(new RegExp(`^${layout.id}-`)) }]);
    const ids = (await call("GET", "/v1/layouts")).body.layouts.map((l: { id: string }) => l.id).sort();
    expect(ids).toEqual([layout.id, merged.body.renamed[0].to, "guest-only"].sort());
    expect((await call("GET", `/v1/layouts/${merged.body.renamed[0].to}/shares`)).body.shares).toHaveLength(1);
    expect((await call("GET", "/v1/layouts", { user: GUEST })).body.layouts).toEqual([]);
    expect((await call("POST", "/v1/me/merge-guest", { body: { guestId: GUEST } })).body.movedLayouts).toBe(0);
  });

  it("Guest ย้ายเข้า Guest ไม่ได้ → 400", async () => {
    const res = await call("POST", "/v1/me/merge-guest", { user: GUEST, body: { guestId: `guest-${globalThis.crypto.randomUUID()}` } });
    expect(res.status).toBe(400);
  });
});

describe("คำสั่งควบคุมสำหรับเทสต์ (/__mock)", () => {
  const control = (path: string, body?: unknown) =>
    mock.fetch(new Request(`${BASE}/__mock/${path}`, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }));

  it("outage: N คำขอถัดไปตอบ 503 แล้วกลับมาปกติ (/health ไม่ล่ม)", async () => {
    await control("outage", { requests: 2 });
    expect((await mock.fetch(new Request(`${BASE}/health`))).status).toBe(200);
    expect((await mock.fetch(new Request(`${BASE}/v1/layouts`))).status).toBe(503);
    expect((await mock.fetch(new Request(`${BASE}/v1/layouts`))).status).toBe(503);
    expect((await call("GET", "/v1/layouts")).status).toBe(200);
  });

  it("outage เฉพาะผู้ใช้ — ผู้ใช้อื่นใช้งานได้ปกติ (E2E รันขนานกัน)", async () => {
    await control("outage", { subject: "google-alice" });
    expect((await call("GET", "/v1/layouts", { user: "google-bob" })).status).toBe(200);
    expect((await call("GET", "/v1/layouts")).status).toBe(503);
    await control("outage", { subject: "google-alice", requests: 0 });
    expect((await call("GET", "/v1/layouts")).status).toBe(200);
  });

  it("outage เฉพาะ path — path อื่นใช้งานได้ปกติ", async () => {
    await control("outage", { path: "/v1/me" });
    expect((await call("GET", "/v1/layouts")).status).toBe(200);
    expect((await mock.fetch(new Request(`${BASE}/v1/me`))).status).toBe(503);
    await control("outage", { path: "/v1/me", requests: 0 });
    expect((await call("GET", "/v1/me")).status).toBe(404);
  });

  it("outage ไม่ระบุจำนวน = ล่มจนกว่าจะสั่ง outage 0", async () => {
    await control("outage");
    for (let i = 0; i < 3; i++) expect((await mock.fetch(new Request(`${BASE}/v1/layouts`))).status).toBe(503);
    await control("outage", { requests: 0 });
    expect((await call("GET", "/v1/layouts")).status).toBe(200);
  });

  it("expire ลิงก์ทันที และ reset ล้างข้อมูลทั้งหมด", async () => {
    const layout = cafeLayout();
    await save(layout);
    const { body } = await call("POST", `/v1/layouts/${layout.id}/shares`, { body: {} });
    expect((await control(`shares/${body.shareKey}/expire`)).status).toBe(204);
    expect((await call("GET", `/v1/public/shares/${body.shareKey}`, { user: "anonymous", headers: { "x-client-ip": "1.1.1.1" } })).body.error.code).toBe(
      "SHARE_EXPIRED",
    );
    await control("reset");
    expect((await call("GET", "/v1/layouts")).body.layouts).toEqual([]);
  });
});
