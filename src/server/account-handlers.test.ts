import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cafeLayout } from "@/test/fixtures/layouts";
import { testBackend } from "@/test/backend";
import { sessionCookie } from "@/test/session";
import * as meRoute from "../../app/api/me/route";
import * as exportRoute from "../../app/api/me/export/route";
import { createAccountHandlers } from "./account-handlers";
import { guestToMerge, profileInput, syncSignIn } from "./account-sync";
import type { ResolveUser } from "./session";

const GUEST = "guest-0f8fad5b-d9cb-469f-a165-70867728950e";
const GITHUB = "github-12345";

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

  it("มีโปรไฟล์ใน Backend แล้ว → คืนโปรไฟล์นั้น", async () => {
    await backend.accounts.upsert(GITHUB, { provider: "github", name: "Somchai", email: "s@example.com", image: null });
    const res = await handlers.get(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: GITHUB, provider: "github", email: "s@example.com" });
  });

  it("ยังไม่มีโปรไฟล์ → สร้างจาก session แล้วคืนให้", async () => {
    const res = await handlers.get(req("", {}, GUEST, "ผู้ใช้ทั่วไป"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: GUEST, provider: "guest", name: "ผู้ใช้ทั่วไป" });
    expect(backend.mock.inspect().users.has(GUEST)).toBe(true);
  });

  it("id ที่ไม่รู้จัก provider → 404 (ไม่ส่ง PUT ผิดสัญญา)", async () => {
    expect((await handlers.get(req("", {}, "alice"))).status).toBe(404);
  });
});

describe("DELETE /api/me", () => {
  it("ลบโปรไฟล์และผังทั้งหมด → 204", async () => {
    await backend.accounts.upsert(GITHUB, { provider: "github" });
    await backend.layouts.create(GITHUB, cafeLayout());
    const res = await handlers.remove(req("", { method: "DELETE" }));
    expect(res.status).toBe(204);
    expect(backend.mock.inspect().users.has(GITHUB)).toBe(false);
    expect(await backend.layouts.list(GITHUB)).toEqual([]);
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
    expect(body.layouts.map((l: { layout: { id: string } }) => l.layout.id)).toEqual([layout.id]);
  });
});

describe("route files", () => {
  it("ใช้ Session จริง: ไม่มี cookie → 401, มี cookie → ผ่าน handler", async () => {
    expect((await meRoute.GET(new Request("http://localhost/api/me"))).status).toBe(401);
    expect((await exportRoute.GET(new Request("http://localhost/api/me/export"))).status).toBe(401);
    const cookie = await sessionCookie(GUEST);
    const res = await meRoute.GET(new Request("http://localhost/api/me", { headers: { cookie } }));
    expect(res.status).toBe(200);
    expect((await res.json()).provider).toBe("guest");
  });
});

describe("syncSignIn", () => {
  it("ล็อกอิน → บันทึกโปรไฟล์ (ตัด email/image ที่ผิดรูปแบบทิ้ง)", async () => {
    await syncSignIn(backend.accounts, { userId: GITHUB, profile: { name: " Somchai ", email: "not-an-email", image: "https://x.test/a.png" } });
    expect(await backend.accounts.get(GITHUB)).toMatchObject({ provider: "github", name: "Somchai", email: null, image: "https://x.test/a.png" });
  });

  it("Guest → GitHub: ย้ายผังเข้าบัญชีใหม่และลบ Guest", async () => {
    const layout = cafeLayout();
    await backend.layouts.create(GUEST, layout);
    const result = await syncSignIn(backend.accounts, { userId: GITHUB, profile: { name: "Somchai" }, previousUserId: GUEST });
    expect(result).toEqual({ movedLayouts: 1, movedShares: 0, renamed: [] });
    expect((await backend.layouts.list(GITHUB)).map((l) => l.id)).toEqual([layout.id]);
    expect(await backend.layouts.list(GUEST)).toEqual([]);
  });

  it("โปรไฟล์บันทึกไม่สำเร็จ → ล็อกอินต่อได้; ย้ายผังไม่สำเร็จ → throw (session Guest เดิมยังอยู่)", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = { ...backend.accounts, upsert: () => Promise.reject(new Error("down")), mergeGuest: () => Promise.reject(new Error("down")) };
    await expect(syncSignIn(failing, { userId: GITHUB, profile: {} })).resolves.toBeNull();
    await expect(syncSignIn(failing, { userId: GITHUB, profile: {}, previousUserId: GUEST })).rejects.toThrow("down");
    error.mockRestore();
  });

  it("ย้ายเฉพาะ Guest → บัญชีจริงที่ต่างกัน", () => {
    expect(guestToMerge(GITHUB, GUEST)).toBe(GUEST);
    expect(guestToMerge(GITHUB, null)).toBeNull();
    expect(guestToMerge(GITHUB, GITHUB)).toBeNull();
    expect(guestToMerge(GUEST, GUEST.replace("0f8f", "1f8f"))).toBeNull();
    expect(guestToMerge(GITHUB, "github-999")).toBeNull();
    expect(guestToMerge(GITHUB, "guest-not-a-uuid")).toBeNull();
  });

  it("profileInput: id ที่ไม่รู้จัก provider → null", () => {
    expect(profileInput("alice", {})).toBeNull();
    expect(profileInput(GUEST, {})).toEqual({ provider: "guest", name: null, email: null, image: null });
  });
});
