import { beforeEach, describe, expect, it } from "vitest";
import { validateLayout } from "@/core/validation";
import { cafeLayout, withoutType } from "@/test/fixtures/layouts";
import { sessionCookie } from "@/test/session";
import * as createRoute from "../../app/api/share/route";
import * as getRoute from "../../app/api/share/[shareKey]/route";
import * as layoutsRoute from "../../app/api/layouts/route";
import { createMemoryLayoutRepository, type LayoutRepository } from "./layout-repository";
import type { ResolveUser } from "./session";
import { createShareHandlers } from "./share-handlers";
import { SHARE_KEY_PATTERN, createMemoryShareRepository, createShareKey } from "./share-repository";

const asUser: ResolveUser = async (r) => {
  const id = r.headers.get("x-user");
  return id ? { id, name: null } : null;
};
const post = (body: unknown, user: string | null = "alice") =>
  new Request("https://wangraan.example/api/share", {
    method: "POST",
    headers: { "content-type": "application/json", ...(user ? { "x-user": user } : {}) },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

let layouts: LayoutRepository;
let handlers: ReturnType<typeof createShareHandlers>;
beforeEach(() => {
  layouts = createMemoryLayoutRepository();
  handlers = createShareHandlers(layouts, createMemoryShareRepository(), asUser);
});

describe("share key", () => {
  it("สุ่ม 256 บิต base64url 43 ตัว ไม่ซ้ำกัน", () => {
    const keys = new Set(Array.from({ length: 200 }, createShareKey));
    expect(keys.size).toBe(200);
    for (const key of keys) expect(key).toMatch(SHARE_KEY_PATTERN);
  });
});

describe("POST /api/share → GET /api/share/[shareKey] (feat-030)", () => {
  it("เจ้าของแชร์ได้ → ใครก็เปิดได้ (ไม่ต้อง Session) แบบอ่านอย่างเดียว ไม่เปิดเผยเจ้าของ", async () => {
    const layout = cafeLayout();
    await layouts.create("alice", layout, validateLayout(layout));
    const res = await handlers.create(post({ layoutId: layout.id }));
    expect(res.status).toBe(201);
    const { shareKey, url } = await res.json();
    expect(shareKey).toMatch(SHARE_KEY_PATTERN);
    expect(url).toBe(`https://wangraan.example/share/${shareKey}`);

    const shared = await handlers.get(shareKey);
    expect(shared.status).toBe(200);
    expect(shared.headers.get("cache-control")).toContain("public");
    const body = await shared.json();
    expect(body.layout).toEqual(layout);
    expect(body).not.toHaveProperty("ownerId");

    // snapshot: แก้ผังภายหลังไม่กระทบลิงก์เดิม
    await layouts.update("alice", { ...layout, width: 9 }, validateLayout({ ...layout, width: 9 }));
    expect((await (await handlers.get(shareKey)).json()).layout.width).toBe(8);
  });

  it.each([
    ["ไม่มี Session", post({ layoutId: "x" }, null), 401],
    ["JSON เสีย", post("{"), 400],
    ["ไม่มี layoutId", post({}), 400],
    [
      "ไม่ใช่ JSON (form POST ข้ามโดเมน)",
      new Request("https://wangraan.example/api/share", { method: "POST", headers: { "content-type": "text/plain", "x-user": "alice" }, body: '{"layoutId":"layout-01"}' }),
      415,
    ],
    ["ผังไม่มี/ไม่ใช่ของตน", post({ layoutId: "layout-01" }, "bob"), 404],
  ])("%s → %s", async (_name, request, status) => {
    const layout = cafeLayout();
    await layouts.create("alice", layout, validateLayout(layout));
    expect((await handlers.create(request)).status).toBe(status);
  });

  it("ผังที่เก็บไว้เป็น Blocked (เช่นจาก Backend) → 422", async () => {
    const layout = withoutType(cafeLayout(), "counter");
    await layouts.create("alice", layout, validateLayout(layout));
    expect((await handlers.create(post({ layoutId: layout.id }))).status).toBe(422);
  });

  it("share key ผิดรูปแบบหรือไม่มีอยู่ → 404", async () => {
    expect((await handlers.get("../../etc")).status).toBe(404);
    expect((await handlers.get(createShareKey())).status).toBe(404);
  });
});

describe("Route modules ใช้ Session Cookie จริง", () => {
  it("บันทึก → แชร์ → เปิดแบบไม่ล็อกอิน", async () => {
    const cookie = await sessionCookie("guest-share-route");
    const layout = { ...cafeLayout(), id: `share-route-${Date.now()}` };
    const headers = { "content-type": "application/json", cookie };
    expect((await layoutsRoute.POST(new Request("http://localhost/api/layouts", { method: "POST", headers, body: JSON.stringify({ layout }) }))).status).toBe(201);
    const res = await createRoute.POST(new Request("http://localhost/api/share", { method: "POST", headers, body: JSON.stringify({ layoutId: layout.id }) }));
    expect(res.status).toBe(201);
    const { shareKey } = await res.json();
    const shared = await getRoute.GET(new Request(`http://localhost/api/share/${shareKey}`), { params: Promise.resolve({ shareKey }) });
    expect(shared.status).toBe(200);
  });
});
