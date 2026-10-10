import { describe, expect, it } from "vitest";
import { sessionCookie } from "@/test/session";
import * as contactRoute from "../../app/api/contact/route";
import { CONTACT_MAX_BYTES, createContactHandler, createMemoryDelivery, createWebhookDelivery } from "./contact-handlers";
import { clientIp, createRateLimiter } from "./rate-limit";
import type { ResolveUser } from "./session";

const valid = { name: "สมชาย", email: "somchai@example.com", message: "อยากปรึกษาการจัดร้านกาแฟ 20 ที่นั่ง" };
const asUser: ResolveUser = async (r) => {
  const id = r.headers.get("x-user");
  return id ? { id, name: null } : null;
};
const send = (body: unknown, opts: { ip?: string; user?: string; type?: string } = {}) =>
  new Request("http://localhost/api/contact", {
    method: "POST",
    headers: {
      "content-type": opts.type ?? "application/json",
      "x-forwarded-for": `${opts.ip ?? "203.0.113.5"}, 10.0.0.1`,
      ...(opts.user ? { "x-user": opts.user } : {}),
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

function setup(now = () => 0) {
  const delivery = createMemoryDelivery();
  const handler = createContactHandler({
    delivery,
    resolveUser: asUser,
    ipLimiter: createRateLimiter({ limit: 5, windowMs: 600_000, now }),
    userLimiter: createRateLimiter({ limit: 5, windowMs: 600_000, now }),
    now: () => new Date("2026-10-10T03:00:00Z"),
  });
  return { delivery, handler };
}

describe("rate limiter", () => {
  it("fixed window: ครบโควตาแล้วบล็อก พร้อม retryAfter และรีเซ็ตเมื่อหมดหน้าต่าง", () => {
    let t = 0;
    const limiter = createRateLimiter({ limit: 2, windowMs: 60_000, now: () => t });
    expect(limiter.hit("a")).toEqual({ allowed: true, remaining: 1, retryAfter: 0 });
    expect(limiter.hit("a").allowed).toBe(true);
    t = 15_000;
    expect(limiter.hit("a")).toEqual({ allowed: false, remaining: 0, retryAfter: 45 });
    expect(limiter.hit("b").allowed).toBe(true);
    t = 60_000;
    expect(limiter.hit("a").allowed).toBe(true);
  });

  it("จำกัดจำนวน key — กวาดของหมดอายุ แล้วจึงทิ้ง key เก่าสุด", () => {
    let t = 0;
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: () => t, maxKeys: 2 });
    limiter.hit("a");
    limiter.hit("b");
    t = 2000;
    limiter.hit("c");
    expect(limiter.size).toBe(1);
    limiter.hit("d");
    limiter.hit("e");
    expect(limiter.size).toBe(2);
  });

  it("clientIp อ่าน x-forwarded-for ตัวแรก → x-real-ip → unknown", () => {
    expect(clientIp(new Request("http://x", { headers: { "x-forwarded-for": "1.1.1.1, 2.2.2.2" } }))).toBe("1.1.1.1");
    expect(clientIp(new Request("http://x", { headers: { "x-real-ip": "3.3.3.3" } }))).toBe("3.3.3.3");
    expect(clientIp(new Request("http://x"))).toBe("unknown");
  });
});

describe("POST /api/contact (feat-032 gate)", () => {
  it("ส่งสำเร็จ → 202 และส่งต่อข้อความ (trim แล้ว ไม่มี honeypot)", async () => {
    const { delivery, handler } = setup();
    const res = await handler(send({ ...valid, name: "  สมชาย  ", website: "" }, { user: "guest-1" }));
    expect(res.status).toBe(202);
    expect(delivery.messages).toEqual([{ ...valid, userId: "guest-1", receivedAt: "2026-10-10T03:00:00.000Z" }]);
  });

  it("ส่งถี่เกิน 5 ครั้ง / 10 นาที ต่อ IP → 429 + Retry-After", async () => {
    let t = 0;
    const { delivery, handler } = setup(() => t);
    for (let i = 0; i < 5; i++) expect((await handler(send(valid))).status).toBe(202);
    t = 60_000;
    const blocked = await handler(send(valid));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBe("540");
    expect((await blocked.json()).error).toMatchObject({ code: "RATE_LIMITED", message: "ส่งข้อความถี่เกินไป กรุณารออีก 9 นาที" });
    expect(delivery.messages).toHaveLength(5);
    expect((await handler(send(valid, { ip: "198.51.100.9" }))).status).toBe(202); // IP อื่นไม่โดน
    t = 600_000;
    expect((await handler(send(valid))).status).toBe(202);
  });

  it("ผู้ใช้ที่ล็อกอินถูกจำกัดต่อบัญชีด้วย แม้เปลี่ยน IP", async () => {
    const { handler } = setup();
    for (let i = 0; i < 5; i++) expect((await handler(send(valid, { ip: `192.0.2.${i}`, user: "guest-x" }))).status).toBe(202);
    expect((await handler(send(valid, { ip: "192.0.2.99", user: "guest-x" }))).status).toBe(429);
  });

  it.each([
    ["ข้อมูลไม่ครบ", { ...valid, email: "not-email", message: "สั้น" }, {}, 400, "INVALID_CONTACT"],
    ["ฟิลด์แปลกปลอม", { ...valid, admin: true }, {}, 400, "INVALID_CONTACT"],
    ["JSON เสีย", "{", {}, 400, "INVALID_JSON"],
    ["ไม่ใช่ JSON", "a=1", { type: "application/x-www-form-urlencoded" }, 415, "UNSUPPORTED_MEDIA_TYPE"],
    ["ใหญ่เกิน", { ...valid, message: "ก".repeat(CONTACT_MAX_BYTES) }, {}, 413, "PAYLOAD_TOO_LARGE"],
  ] as const)("%s → %s", async (_name, body, opts, status, code) => {
    const { delivery, handler } = setup();
    const res = await handler(send(body, opts));
    expect(res.status).toBe(status);
    expect((await res.json()).error.code).toBe(code);
    expect(delivery.messages).toEqual([]);
  });

  it("รายละเอียด error ระบุช่องที่ผิดเป็นภาษาไทย", async () => {
    const { handler } = setup();
    const { error } = await (await handler(send({ ...valid, email: "x" }))).json();
    expect(error.details).toEqual([{ path: "email", message: "รูปแบบอีเมลไม่ถูกต้อง" }]);
  });

  it("Honeypot ถูกกรอก → ตอบเหมือนสำเร็จแต่ไม่ส่งต่อ", async () => {
    const { delivery, handler } = setup();
    expect((await handler(send({ ...valid, website: "http://spam" }))).status).toBe(202);
    expect(delivery.messages).toEqual([]);
  });

  it("Webhook: ส่ง JSON ไปปลายทาง; ปลายทางล่ม → 502", async () => {
    const sent: unknown[] = [];
    let ok = true;
    const fetchImpl = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      sent.push(JSON.parse(String(init?.body)));
      return new Response(null, { status: ok ? 200 : 500 });
    }) as typeof fetch;
    const handler = createContactHandler({ delivery: createWebhookDelivery("https://hooks.example/x", fetchImpl), resolveUser: asUser });
    expect((await handler(send(valid))).status).toBe(202);
    expect(sent[0]).toMatchObject({ ...valid, userId: null });
    ok = false;
    const res = await handler(send(valid));
    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe("DELIVERY_FAILED");
  });

  it("route module จริงใช้ Session Cookie ของ Auth.js", async () => {
    const res = await contactRoute.POST(
      new Request("http://localhost/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: await sessionCookie("guest-contact"), "x-forwarded-for": "192.0.2.200" },
        body: JSON.stringify(valid),
      }),
    );
    expect(res.status).toBe(202);
  });
});
