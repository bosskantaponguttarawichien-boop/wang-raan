import { describe, expect, it } from "vitest";
import { cafeLayout } from "@/test/fixtures/layouts";
import { BackendConfigError, send } from "./backend";
import { createLayoutHandlers } from "./layout-handlers";
import { BackendError, createRemoteLayoutRepository, type LayoutRepository } from "./layout-repository";
import { createShareHandlers } from "./share-handlers";
import { createRemoteShareRepository } from "./share-repository";
import { createBackendClient, createInternalToken, verifyInternalToken, type BackendClient } from "./token-relay";

const SECRET = "internal-test-secret";
const now = new Date("2026-10-10T03:00:00Z");

describe("internal token (HS256)", () => {
  it("ออกแล้วตรวจกลับได้ — sub / aud / iss / อายุ 5 นาที", async () => {
    const token = await createInternalToken("guest-1", SECRET, { now });
    expect(token.split(".")).toHaveLength(3);
    expect(await verifyInternalToken(token, SECRET, now)).toMatchObject({
      sub: "guest-1",
      aud: "wang-raan-backend",
      iss: "wang-raan-bff",
      exp: Math.floor(now.getTime() / 1000) + 300,
    });
  });

  it("ปฏิเสธ: secret ผิด, หมดอายุ, ถูกแก้ payload, รูปแบบผิด", async () => {
    const token = await createInternalToken("guest-1", SECRET, { now });
    expect(await verifyInternalToken(token, "other", now)).toBeNull();
    expect(await verifyInternalToken(token, SECRET, new Date(now.getTime() + 301_000))).toBeNull();
    const [h, , sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "admin" })).toString("base64url");
    expect(await verifyInternalToken(`${h}.${forged}.${sig}`, SECRET, now)).toBeNull();
    expect(await verifyInternalToken("abc", SECRET, now)).toBeNull();
  });
});

describe("Token Relay ไป Backend (feat-031 gate)", () => {
  function fakeBackend(handler: (req: Request) => Response | Promise<Response>) {
    const calls: Request[] = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      calls.push(request);
      return handler(request);
    }) as typeof fetch;
    return { calls, client: createBackendClient({ baseUrl: "https://be.internal/api/", secret: SECRET, fetch: fetchImpl, now: () => now, retryDelayMs: 0 }) };
  }

  it("แนบ Authorization: Bearer <internal token ของผู้ใช้> และไม่ส่ง Cookie ต่อ", async () => {
    const { calls, client } = fakeBackend(() => Response.json({ ok: true }));
    await client.request("guest-42", "layouts", { headers: { cookie: "authjs.session-token=secret" }, method: "POST", body: "{}" });
    const sent = calls[0]!;
    expect(sent.url).toBe("https://be.internal/api/layouts");
    expect(sent.headers.get("cookie")).toBeNull();
    expect(sent.headers.get("content-type")).toBe("application/json");
    expect(sent.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    const auth = sent.headers.get("authorization")!;
    expect(auth).toMatch(/^Bearer /);
    expect((await verifyInternalToken(auth.slice(7), SECRET, now))?.sub).toBe("guest-42");
  });

  it("ไม่มีผู้ใช้ (null) → token sub = anonymous", async () => {
    const { calls, client } = fakeBackend(() => Response.json({}));
    await client.request(null, "/v1/public/shares/x");
    expect((await verifyInternalToken(calls[0]!.headers.get("authorization")!.slice(7), SECRET, now))?.sub).toBe("anonymous");
  });

  it("GET ลองซ้ำ 1 ครั้งเมื่อ 503 หรือเครือข่ายล้ม — POST/PUT/DELETE ไม่ลองซ้ำ (กันบันทึกซ้อน)", async () => {
    let n = 0;
    const flaky = fakeBackend(() => (n++ === 0 ? new Response(null, { status: 503 }) : Response.json({ ok: true })));
    expect((await flaky.client.request("u", "/v1/layouts")).status).toBe(200);
    expect(flaky.calls).toHaveLength(2);

    let m = 0;
    const down = fakeBackend(() => {
      if (m++ === 0) throw new TypeError("fetch failed");
      return Response.json({ ok: true });
    });
    expect((await down.client.request("u", "/v1/layouts")).status).toBe(200);

    const post = fakeBackend(() => new Response(null, { status: 503 }));
    expect((await post.client.request("u", "/v1/layouts", { method: "POST", body: "{}" })).status).toBe(503);
    expect(post.calls).toHaveLength(1);
  });

  it("หมดเวลา → ยกเลิกคำขอ (AbortSignal) แล้ว send() แปลงเป็น BackendError status 0 — ไม่ลองซ้ำ (Backend ช้าอยู่แล้ว)", async () => {
    let calls = 0;
    const hang = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      calls++;
      return new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason)));
    }) as typeof fetch;
    const client = createBackendClient({ baseUrl: "https://be.internal/", secret: SECRET, fetch: hang, timeoutMs: 20, retryDelayMs: 0 });
    await expect(send(client, "u", "/v1/layouts")).rejects.toMatchObject({ name: "BackendError", status: 0, path: "/v1/layouts" });
    expect(calls).toBe(1);
  });

  it("Backend ขัดข้องแบบที่ผู้ใช้ไม่ควรเห็นรายละเอียด → log สถานะ/code/path ไว้ไล่ปัญหา", async () => {
    const errors: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => void errors.push(args);
    try {
      const client = createBackendClient({
        baseUrl: "https://be.internal/",
        secret: SECRET,
        fetch: (async () => Response.json({ error: { code: "UNAUTHORIZED", message: "bad token" } }, { status: 401 })) as typeof fetch,
      });
      const handlers = createLayoutHandlers(createRemoteLayoutRepository(client), async () => ({ id: "u", name: null }));
      expect((await handlers.list(new Request("http://localhost/api/layouts"))).status).toBe(502);
    } finally {
      console.error = original;
    }
    expect(errors).toEqual([["[wang-raan] Backend error", { status: 401, code: "UNAUTHORIZED", path: "/v1/layouts", cause: undefined }]]);
  });
});

describe("Remote repository: Backend ตอบ error ต้องไม่ถูกนับเป็นข้อมูลผัง", () => {
  const layout = cafeLayout();
  const clientReturning = (status: number, body: unknown = { error: { code: "X", message: "x" } }) =>
    createBackendClient({
      baseUrl: "https://be.internal/",
      secret: SECRET,
      retryDelayMs: 0,
      fetch: (async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })) as typeof fetch,
    });
  const repoReturning = (status: number, body?: unknown) => createRemoteLayoutRepository(clientReturning(status, body));

  it.each([401, 403, 400, 422, 500, 503])("สถานะ %s → BackendError ทุกเมธอด", async (status) => {
    const repo = repoReturning(status);
    await expect(repo.list("u")).rejects.toBeInstanceOf(BackendError);
    await expect(repo.get("u", "a")).rejects.toBeInstanceOf(BackendError);
    await expect(repo.create("u", layout)).rejects.toMatchObject({ status });
    await expect(repo.update("u", layout)).rejects.toMatchObject({ status });
    await expect(repo.remove("u", "a")).rejects.toBeInstanceOf(BackendError);
  });

  it("สถานะที่คาดไว้: 404 → null / not-found / false, 409 LAYOUT_EXISTS → conflict", async () => {
    expect(await repoReturning(404).get("u", "a")).toBeNull();
    expect(await repoReturning(404).update("u", layout)).toBe("not-found");
    expect(await repoReturning(404).remove("u", "a")).toBe(false);
    expect(await repoReturning(409, { error: { code: "LAYOUT_EXISTS", message: "x" } }).create("u", layout)).toBe("conflict");
  });

  it("409 LAYOUT_LIMIT_REACHED ไม่ใช่ conflict → ส่งต่อให้ผู้ใช้เป็น 409 พร้อมข้อความไทย", async () => {
    const repo = repoReturning(409, { error: { code: "LAYOUT_LIMIT_REACHED", message: "limit" } });
    await expect(repo.create("u", layout)).rejects.toMatchObject({ status: 409, code: "LAYOUT_LIMIT_REACHED" });
    const handlers = createLayoutHandlers(repo, async () => ({ id: "u", name: null }));
    const res = await handlers.create(
      new Request("http://localhost/api/layouts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ layout }) }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toEqual({ code: "LAYOUT_LIMIT_REACHED", message: "บัญชีนี้บันทึกผังครบ 200 ผังแล้ว — ลบผังที่ไม่ใช้ก่อน" });
  });

  it("Backend ตอบ 429 → ส่งต่อ 429 + Retry-After", async () => {
    const handlers = createLayoutHandlers(repoReturning(429, { error: { code: "RATE_LIMITED", message: "x", retryAfter: 120 } }), async () => ({ id: "u", name: null }));
    const res = await handlers.list(new Request("http://localhost/api/layouts"));
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("120");
    expect((await res.json()).error.message).toBe("ส่งคำขอถี่เกินไป กรุณารออีก 2 นาที");
  });

  it("list ได้ 200 แต่ไม่มี layouts / ไม่ใช่ JSON → BackendError (ไม่ส่งข้อมูลเสียให้หน้าเว็บ)", async () => {
    await expect(repoReturning(200, { ok: true }).list("u")).rejects.toBeInstanceOf(BackendError);
    const notJson = createBackendClient({ baseUrl: "https://be.internal/", secret: SECRET, fetch: (async () => new Response("<html>")) as typeof fetch });
    await expect(createRemoteLayoutRepository(notJson).get("u", "a")).rejects.toBeInstanceOf(BackendError);
  });

  it("Route Handler แปลง BackendError ที่ผู้ใช้ไม่ควรเห็นเป็น 502 โดยไม่เปิดเผยรายละเอียด", async () => {
    const handlers = createLayoutHandlers(repoReturning(403), async () => ({ id: "u", name: null }));
    const res = await handlers.list(new Request("http://localhost/api/layouts"));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toEqual({ code: "BACKEND_ERROR", message: "ระบบจัดเก็บผังขัดข้อง ลองใหม่ภายหลัง" });
    const share = createShareHandlers(createRemoteShareRepository(clientReturning(500)), async () => ({ id: "u", name: null }));
    const shareRes = await share.create(
      new Request("http://localhost/api/share", { method: "POST", headers: { "content-type": "application/json" }, body: '{"layoutId":"a"}' }),
    );
    expect(shareRes.status).toBe(502);
  });

  it("production ไม่ได้ตั้งค่า Backend → 503 BACKEND_NOT_CONFIGURED (ไม่แอบเก็บในหน่วยความจำ)", async () => {
    const unconfigured: BackendClient = { request: async () => { throw new BackendConfigError(); } };
    const handlers = createLayoutHandlers(createRemoteLayoutRepository(unconfigured), async () => ({ id: "u", name: null }));
    const res = await handlers.list(new Request("http://localhost/api/layouts"));
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("BACKEND_NOT_CONFIGURED");
  });

  it("error อื่นที่ไม่ใช่ BackendError ถูกโยนต่อ (ไม่กลบบั๊ก)", async () => {
    const boom = { list: async () => { throw new TypeError("bug"); } } as unknown as LayoutRepository;
    const handlers = createLayoutHandlers(boom, async () => ({ id: "u", name: null }));
    await expect(handlers.list(new Request("http://localhost/api/layouts"))).rejects.toThrow("bug");
  });
});
