import { describe, expect, it } from "vitest";
import { cafeLayout } from "@/test/fixtures/layouts";
import { validateLayout } from "@/core/validation";
import { createRemoteLayoutRepository } from "./layout-repository";
import { createBackendClient, createInternalToken, verifyInternalToken } from "./token-relay";

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
    return { calls, client: createBackendClient({ baseUrl: "https://be.internal/api/", secret: SECRET, fetch: fetchImpl, now: () => now }) };
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

  it("Remote repository เรียก Backend ครบทุกเมธอดในนามผู้ใช้", async () => {
    const layout = cafeLayout();
    const validation = validateLayout(layout);
    const stored = { layout, validation, createdAt: "a", updatedAt: "b" };
    const { calls, client } = fakeBackend((req) => {
      const path = new URL(req.url).pathname;
      if (req.method === "GET" && path.endsWith("/layouts")) return Response.json({ layouts: [{ id: layout.id }] });
      if (req.method === "GET" && path.endsWith("/missing")) return new Response(null, { status: 404 });
      if (req.method === "POST") return Response.json(stored, { status: 201 });
      if (req.method === "PUT" && path.endsWith("/gone")) return new Response(null, { status: 404 });
      if (req.method === "DELETE") return new Response(null, { status: 204 });
      if (req.method === "GET" && path.includes("/boom")) return new Response(null, { status: 503 });
      return Response.json(stored);
    });
    const repo = createRemoteLayoutRepository(client);
    expect(await repo.list("u1")).toEqual([{ id: layout.id }]);
    expect(await repo.get("u1", layout.id)).toEqual(stored);
    expect(await repo.get("u1", "missing")).toBeNull();
    expect(await repo.create("u1", layout, validation)).toEqual(stored);
    expect(await repo.update("u1", layout, validation)).toEqual(stored);
    expect(await repo.update("u1", { ...layout, id: "gone" }, validation)).toBe("not-found");
    expect(await repo.remove("u1", layout.id)).toBe(true);
    await expect(repo.get("u1", "boom")).rejects.toThrow("Backend 503");
    for (const call of calls) {
      expect((await verifyInternalToken(call.headers.get("authorization")!.slice(7), SECRET, now))?.sub).toBe("u1");
    }
    const created = calls.find((c) => c.method === "POST")!;
    expect(await created.json()).toEqual({ layout, validation });
  });
});
