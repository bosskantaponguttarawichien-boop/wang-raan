import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cafeLayout } from "@/test/fixtures/layouts";
import { testBackend } from "@/test/backend";
import { sessionCookie } from "@/test/session";
import * as meRoute from "../../app/api/me/route";
import * as exportRoute from "../../app/api/me/export/route";
import { createAccountHandlers } from "./account-handlers";
import { guestToMerge, syncSignIn } from "./account-sync";
import type { ResolveUser } from "./session";

const GUEST = "guest-0f8fad5b-d9cb-469f-a165-70867728950e";
/** ผู้ใช้เดิมก่อน v1.3.0 (id รูปแบบ <provider>-<providerAccountId>) — ยังต้องใช้งานได้ */
const GITHUB = "github-12345";
const IP = "203.0.113.7";

const asUser: ResolveUser = async (r) => {
  const id = r.headers.get("x-user");
  const name = r.headers.get("x-name");
  return id ? { id, name: name && decodeURIComponent(name) } : null;
};
const req = (path = "", init: RequestInit = {}, user: string | null = GITHUB, name: string | null = "Somchai") => {
  const headers = new Headers(init.headers);
  if (user) headers.set("x-user", user);
  if (name) headers.set("x-name", encodeURIComponent(name));
  return new Request(`http://localhost/api/me${path}`, { ...init, headers });
};

let backend: ReturnType<typeof testBackend>;
let handlers: ReturnType<typeof createAccountHandlers>;
beforeEach(() => {
  let tick = 0;
  backend = testBackend({ now: () => new Date(Date.UTC(2026, 9, 12, 1, 0, tick++)) });
  handlers = createAccountHandlers(backend.accounts, asUser);
});
afterEach(() => expect(backend.violations).toEqual([]));

describe("GET /api/me", () => {
  it("ไม่มี Session → 401", async () => {
    expect((await handlers.get(req("", {}, null))).status).toBe(401);
  });

  it("บัญชีที่ resolve แล้ว → คืนโปรไฟล์นั้น", async () => {
    const { user } = await backend.accounts.resolve(
      { provider: "github", providerAccountId: "12345", email: "s@example.com", emailVerified: false, name: "Somchai" },
      IP,
    );
    const res = await handlers.get(req("", {}, user.id));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: user.id, provider: "github", email: "s@example.com", name: "Somchai" });
  });

  it("ไม่มีบัญชีใน Backend (เช่น ลบไปแล้ว) → 404 ไม่สร้างใหม่", async () => {
    expect((await handlers.get(req("", {}, GUEST, "ผู้ใช้ทั่วไป"))).status).toBe(404);
    expect(backend.mock.inspect().users.size).toBe(0);
  });
});

describe("DELETE /api/me", () => {
  it("ลบโปรไฟล์ identities และผังทั้งหมด → 204", async () => {
    const { user } = await backend.accounts.resolve({ provider: "github", providerAccountId: "1", email: null, emailVerified: false }, IP);
    await backend.layouts.create(user.id, cafeLayout());
    const res = await handlers.remove(req("", { method: "DELETE" }, user.id));
    expect(res.status).toBe(204);
    expect(backend.mock.inspect().users.has(user.id)).toBe(false);
    expect(backend.mock.inspect().identities.size).toBe(0);
    expect(await backend.layoutIds(user.id)).toEqual([]);
  });

  it("ไม่มี Session → 401", async () => {
    expect((await handlers.remove(req("", { method: "DELETE" }, null))).status).toBe(401);
  });
});

describe("GET /api/me/export", () => {
  it("คืนข้อมูลทั้งหมดเป็นไฟล์แนบ", async () => {
    const layout = cafeLayout();
    await backend.layouts.create(GITHUB, layout);
    const res = await handlers.export(req("/export"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="wang-raan-account-2026-10-12.json"');
    const body = await res.json();
    expect(body.user.id).toBe(GITHUB);
    expect(body.identities).toEqual([]);
    expect(body.layouts.map((l: { layout: { id: string } }) => l.layout.id)).toEqual([layout.id]);
  });
});

describe("route files", () => {
  it("ใช้ Session จริง: ไม่มี cookie → 401, มี cookie → ผ่าน handler", async () => {
    expect((await meRoute.GET(new Request("http://localhost/api/me"))).status).toBe(401);
    expect((await exportRoute.GET(new Request("http://localhost/api/me/export"))).status).toBe(401);
    // cookie ของบัญชีที่ Backend ไม่รู้จัก → ผ่าน session แล้ว handler ตอบ 404 (ไม่ใช่ 401)
    const cookie = await sessionCookie(GUEST);
    const res = await meRoute.GET(new Request("http://localhost/api/me", { headers: { cookie } }));
    expect(res.status).toBe(404);
  });
});

describe("syncSignIn", () => {
  it("Guest → บัญชีใหม่ (usr-): ย้ายผังเข้าบัญชีและลบ Guest", async () => {
    const guest = (await backend.accounts.resolve({ provider: "guest" }, IP)).user.id;
    const layout = cafeLayout();
    await backend.layouts.create(guest, layout);
    const { user } = await backend.accounts.resolve({ provider: "google", providerAccountId: "g1", email: "a@example.com", emailVerified: true }, IP);
    expect(user.id).toMatch(/^usr-/);
    const result = await syncSignIn(backend.accounts, { userId: user.id, previousUserId: guest });
    expect(result).toEqual({ movedLayouts: 1, movedShares: 0, renamed: [] });
    expect(await backend.layoutIds(user.id)).toEqual([layout.id]);
    expect(await backend.layoutIds(guest)).toEqual([]);
  });

  it("ผู้ใช้เดิม (github-…) ก็ย้ายผัง Guest เข้าได้", async () => {
    await backend.layouts.create(GUEST, cafeLayout());
    expect(await syncSignIn(backend.accounts, { userId: GITHUB, previousUserId: GUEST })).toMatchObject({ movedLayouts: 1 });
  });

  it("ไม่มี Guest เดิม → ไม่เรียก Backend; ย้ายผังไม่สำเร็จ → throw (session Guest เดิมยังอยู่)", async () => {
    const failing = { ...backend.accounts, mergeGuest: () => Promise.reject(new Error("down")) };
    await expect(syncSignIn(failing, { userId: GITHUB })).resolves.toBeNull();
    await expect(syncSignIn(failing, { userId: GITHUB, previousUserId: GUEST })).rejects.toThrow("down");
  });

  it("ย้ายเฉพาะ Guest → บัญชีจริงที่ต่างกัน", () => {
    expect(guestToMerge(GITHUB, GUEST)).toBe(GUEST);
    expect(guestToMerge("usr-0f8fad5b-d9cb-469f-a165-70867728950e", GUEST)).toBe(GUEST);
    expect(guestToMerge(GITHUB, null)).toBeNull();
    expect(guestToMerge(GITHUB, GITHUB)).toBeNull();
    expect(guestToMerge(GUEST, GUEST.replace("0f8f", "1f8f"))).toBeNull();
    expect(guestToMerge(GITHUB, "github-999")).toBeNull();
    expect(guestToMerge(GITHUB, "guest-not-a-uuid")).toBeNull();
  });
});
