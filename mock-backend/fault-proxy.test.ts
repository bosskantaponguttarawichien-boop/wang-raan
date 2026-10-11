/**
 * Proxy ฉีดความขัดข้อง — คำสั่ง /__mock/* ต้องมีความหมายเดียวกับ Backend จำลอง และคำขออื่นส่งต่อ Backend จริงครบ
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createInternalToken } from "@/server/token-relay";
import { createFaultProxy } from "./fault-proxy";

const PROXY = "http://localhost:4010";
const GUEST = "guest-0f8fad5b-d9cb-469f-a165-70867728950e";

let forwarded: Request[];
let expired: string[];
let proxy: ReturnType<typeof createFaultProxy>;

beforeEach(() => {
  forwarded = [];
  expired = [];
  proxy = createFaultProxy({
    target: "http://backend.real:4000",
    expireShare: async (key) => {
      expired.push(key);
      return key !== "missing";
    },
    fetch: (async (input: URL, init?: RequestInit) => {
      forwarded.push(new Request(input, init));
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  });
});

const control = (path: string, body?: unknown) =>
  proxy.fetch(new Request(`${PROXY}/__mock/${path}`, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }));
const asUser = async (subject: string, path = "/v1/layouts") =>
  proxy.fetch(new Request(`${PROXY}${path}`, { headers: { authorization: `Bearer ${await createInternalToken(subject, "s")}` } }));

describe("fault proxy", () => {
  it("ส่งต่อ method, path, query, header และ body ไป Backend จริง (ไม่ส่ง host เดิม)", async () => {
    const res = await proxy.fetch(
      new Request(`${PROXY}/v1/layouts/abc?x=1`, { method: "PUT", headers: { authorization: "Bearer t", host: "localhost:4010" }, body: '{"a":1}' }),
    );
    expect(res.status).toBe(200);
    expect(forwarded).toHaveLength(1);
    const [req] = forwarded;
    expect(req!.method).toBe("PUT");
    expect(req!.url).toBe("http://backend.real:4000/v1/layouts/abc?x=1");
    expect(req!.headers.get("authorization")).toBe("Bearer t");
    expect(req!.headers.get("host")).toBeNull();
    expect(await req!.text()).toBe('{"a":1}');
  });

  it("outage เฉพาะ path → 503 โดยไม่ถึง Backend; requests: 0 → กลับมาปกติ", async () => {
    const path = "/v1/public/shares/abc";
    expect((await control("outage", { path })).status).toBe(204);
    expect((await proxy.fetch(new Request(`${PROXY}${path}`))).status).toBe(503);
    expect((await proxy.fetch(new Request(`${PROXY}/v1/other`))).status).toBe(200);
    await control("outage", { path, requests: 0 });
    expect((await proxy.fetch(new Request(`${PROXY}${path}`))).status).toBe(200);
    expect(forwarded.map((r) => new URL(r.url).pathname)).toEqual(["/v1/other", path]);
  });

  it("outage เฉพาะผู้ใช้ (sub ใน token) ไม่กระทบผู้ใช้อื่น; นับจำนวนคำขอตาม requests", async () => {
    await control("outage", { subject: GUEST, requests: 2 });
    expect((await asUser(GUEST)).status).toBe(503);
    expect((await asUser("someone-else")).status).toBe(200);
    expect((await asUser(GUEST)).status).toBe(503);
    expect((await asUser(GUEST)).status).toBe(200);
  });

  it("outage ทั้งระบบ แล้ว reset ล้างทุกอย่าง", async () => {
    await control("outage");
    await control("outage", { subject: GUEST });
    expect((await proxy.fetch(new Request(`${PROXY}/health`))).status).toBe(503);
    expect((await control("reset")).status).toBe(204);
    expect((await asUser(GUEST)).status).toBe(200);
  });

  it("expire ทำให้ลิงก์หมดอายุผ่านฐานข้อมูล; ไม่พบ → 404; คำสั่งไม่รู้จัก → 404", async () => {
    expect((await control("shares/abc/expire")).status).toBe(204);
    expect((await control("shares/missing/expire")).status).toBe(404);
    expect(expired).toEqual(["abc", "missing"]);
    expect((await control("nope")).status).toBe(404);
    expect(forwarded).toHaveLength(0);
  });
});
