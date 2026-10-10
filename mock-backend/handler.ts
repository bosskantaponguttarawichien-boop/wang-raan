/**
 * Backend จำลองตามสัญญา contracts/openapi.yaml (feat-038)
 * - fetch handler ล้วน `(Request) => Response` เก็บข้อมูลในหน่วยความจำ — ใช้ได้ทั้งในเทสต์ (ส่งเป็น fetch ให้ BFF ตรง ๆ),
 *   ใน dev (BFF เรียกในตัวเมื่อไม่ได้ตั้ง WANGRAAN_BACKEND_URL) และเป็น HTTP server สำหรับ E2E (mock-backend/server.ts)
 * - ตรวจผังด้วย Zod + validateLayout() ชุดเดียวกับ Backend จริง (@bosskantaponguttarawichien-boop/wang-raan-core)
 * - `/__mock/*` คือคำสั่งควบคุมสำหรับเทสต์เท่านั้น (ไม่อยู่ในสัญญา):
 *   POST /__mock/reset · POST /__mock/outage { requests?, subject?, path? } · POST /__mock/shares/{key}/expire
 *
 * ไม่ใช่ Backend จริง: ไม่มีฐานข้อมูล ไม่มี backup ข้อมูลหายเมื่อปิด process
 */
import { z } from "zod";
import type { StoreLayout, ValidationResult } from "@/core/layout";
import { SaveLayoutRequestSchema, validateLayout } from "@/core/validation";
import { ContactSchema } from "@/lib/contact-schema";
import { LAYOUT_LIMIT, SHARE_LIMIT, SHARE_MAX_DAYS } from "@/server/limits";
import { createRateLimiter } from "@/server/rate-limit";
import { createShareKey } from "@/server/share-key";
import { verifyInternalToken } from "@/server/token-relay";

export { LAYOUT_LIMIT, SHARE_LIMIT, SHARE_MAX_DAYS };
const DAY_MS = 24 * 60 * 60 * 1000;
const KB = 1024;

type Provider = "guest" | "google" | "line" | "github";

interface UserRecord {
  id: string;
  provider: Provider;
  name: string | null;
  email: string | null;
  image: string | null;
  createdAt: string;
  updatedAt: string;
}
interface LayoutRecord {
  layout: StoreLayout;
  validation: ValidationResult;
  createdAt: string;
  updatedAt: string;
}
interface ShareRecord {
  shareKey: string;
  ownerId: string;
  layoutId: string;
  layout: StoreLayout;
  validation: ValidationResult;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
}
interface ContactRecord {
  id: string;
  userId: string | null;
  name: string;
  email: string;
  message: string;
  clientIp: string;
  receivedAt: string;
}

export interface MockBackendOptions {
  secret: string;
  now?: () => Date;
  newShareKey?: () => string;
}

class HttpProblem extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const noContent = () => new Response(null, { status: 204 });

const zodDetails = (error: z.ZodError) => error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));

const ExpiresAtSchema = z.string().datetime({ offset: true }).nullable();
const CreateShareSchema = z.object({ expiresAt: ExpiresAtSchema.optional() }).strict();
const UpdateShareSchema = z.object({ expiresAt: ExpiresAtSchema }).strict();
const ContactMessageSchema = ContactSchema.omit({ website: true });
const ProfileSchema = z
  .object({
    provider: z.enum(["guest", "google", "line", "github"]),
    name: z.string().max(200).nullable().optional(),
    email: z.string().email().max(254).nullable().optional(),
    image: z.string().url().max(2048).nullable().optional(),
  })
  .strict();
const MergeGuestSchema = z
  .object({ guestId: z.string().regex(/^guest-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/) })
  .strict();

function providerOf(userId: string): Provider {
  const prefix = userId.split("-")[0];
  return prefix === "google" || prefix === "line" || prefix === "github" ? prefix : "guest";
}

export function createMockBackend(options: MockBackendOptions) {
  const now = options.now ?? (() => new Date());
  const newShareKey = options.newShareKey ?? createShareKey;
  const iso = () => now().toISOString();

  let users = new Map<string, UserRecord>();
  let layouts = new Map<string, Map<string, LayoutRecord>>();
  let shares = new Map<string, ShareRecord>();
  let contacts: ContactRecord[] = [];
  const minute10 = 10 * 60 * 1000;
  const clock = () => now().getTime();
  let limiters = {
    ip: createRateLimiter({ limit: 5, windowMs: minute10, now: clock }),
    user: createRateLimiter({ limit: 5, windowMs: minute10, now: clock }),
    global: createRateLimiter({ limit: 50, windowMs: minute10, now: clock }),
  };
  /** จำนวนคำขอถัดไปที่จะตอบ 503 (Infinity = ล่มจนกว่าจะสั่ง reset/outage 0) — ทั้งระบบ หรือเฉพาะผู้ใช้ (E2E รันขนาน) */
  let outage = 0;
  let outageBySubject = new Map<string, number>();
  let outageByPath = new Map<string, number>();

  function reset() {
    users = new Map();
    layouts = new Map();
    shares = new Map();
    contacts = [];
    limiters = {
      ip: createRateLimiter({ limit: 5, windowMs: minute10, now: clock }),
      user: createRateLimiter({ limit: 5, windowMs: minute10, now: clock }),
      global: createRateLimiter({ limit: 50, windowMs: minute10, now: clock }),
    };
    outage = 0;
    outageBySubject = new Map();
    outageByPath = new Map();
  }

  const layoutsOf = (owner: string) => {
    let items = layouts.get(owner);
    if (!items) layouts.set(owner, (items = new Map()));
    return items;
  };

  const shareStatus = (s: ShareRecord): "active" | "expired" | "revoked" =>
    s.revokedAt ? "revoked" : s.expiresAt && Date.parse(s.expiresAt) <= clock() ? "expired" : "active";
  const shareLink = (s: ShareRecord) => ({
    shareKey: s.shareKey,
    layoutId: s.layoutId,
    status: shareStatus(s),
    createdAt: s.createdAt,
    expiresAt: s.expiresAt,
    revokedAt: s.revokedAt,
  });
  const summary = ({ layout, validation, updatedAt }: LayoutRecord) => ({
    id: layout.id,
    width: layout.width,
    depth: layout.depth,
    objectCount: layout.objects.length,
    status: validation.status,
    updatedAt,
  });

  // ── อ่าน request ─────────────────────────────────────────────────────────
  async function readBody(request: Request, maxBytes: number): Promise<unknown> {
    if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
      throw new HttpProblem(415, "UNSUPPORTED_MEDIA_TYPE", "content-type must be application/json");
    }
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) throw new HttpProblem(413, "PAYLOAD_TOO_LARGE", `body exceeds ${maxBytes} bytes`);
    try {
      return JSON.parse(text);
    } catch {
      throw new HttpProblem(400, "INVALID_JSON", "malformed JSON");
    }
  }

  function parse<T>(schema: z.ZodType<T>, body: unknown, code = "INVALID_REQUEST"): T {
    const result = schema.safeParse(body);
    if (!result.success) throw new HttpProblem(400, code, "request does not match schema", { details: zodDetails(result.error) });
    return result.data;
  }

  async function subject(request: Request): Promise<string | null> {
    const auth = request.headers.get("authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return null;
    const claims = await verifyInternalToken(auth.slice(7), options.secret);
    return claims?.sub ?? null;
  }

  function parseLayout(body: unknown) {
    const { layout } = parse(SaveLayoutRequestSchema, body, "INVALID_LAYOUT_SCHEMA");
    const validation = validateLayout(layout, { now });
    if (validation.status === "blocked") {
      throw new HttpProblem(422, "LAYOUT_BLOCKED", "layout has blocking issues", {
        validation,
        issues: validation.issues.filter((i) => i.severity === "blocked"),
      });
    }
    return { layout, validation };
  }

  function expiresAtFrom(value: string | null | undefined): string | null {
    if (value == null) return null;
    const t = Date.parse(value);
    if (t <= clock() || t > clock() + SHARE_MAX_DAYS * DAY_MS) {
      throw new HttpProblem(400, "INVALID_REQUEST", `expiresAt must be in the future and within ${SHARE_MAX_DAYS} days`);
    }
    return new Date(t).toISOString();
  }

  function ownShare(owner: string, key: string) {
    const share = shares.get(key);
    if (!share || share.ownerId !== owner) throw new HttpProblem(404, "NOT_FOUND", "share not found");
    return share;
  }

  function hit(limiter: ReturnType<typeof createRateLimiter>, key: string) {
    const result = limiter.hit(key);
    if (!result.allowed) {
      throw new HttpProblem(429, "RATE_LIMITED", "too many requests", { retryAfter: result.retryAfter });
    }
  }

  // ── endpoint ──────────────────────────────────────────────────────────────
  type Handler = (ctx: { request: Request; user: string; params: string[] }) => Promise<Response> | Response;
  interface RouteDef {
    method: string;
    pattern: RegExp;
    anonymous?: boolean;
    handle: Handler;
  }

  const routes: RouteDef[] = [
    {
      method: "GET",
      pattern: /^\/v1\/layouts$/,
      handle: ({ user }) =>
        json({ layouts: [...(layouts.get(user)?.values() ?? [])].map(summary).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) }),
    },
    {
      method: "POST",
      pattern: /^\/v1\/layouts$/,
      handle: async ({ request, user }) => {
        const { layout, validation } = parseLayout(await readBody(request, 512 * KB));
        const items = layoutsOf(user);
        if (items.has(layout.id)) throw new HttpProblem(409, "LAYOUT_EXISTS", "layout id already exists");
        if (items.size >= LAYOUT_LIMIT) throw new HttpProblem(409, "LAYOUT_LIMIT_REACHED", `limit ${LAYOUT_LIMIT} layouts`);
        const at = iso();
        const record = { layout, validation, createdAt: at, updatedAt: at };
        items.set(layout.id, record);
        return json(record, 201);
      },
    },
    {
      method: "GET",
      pattern: /^\/v1\/layouts\/([^/]+)$/,
      handle: ({ user, params: [id] }) => {
        const record = layouts.get(user)?.get(id!);
        if (!record) throw new HttpProblem(404, "NOT_FOUND", "layout not found");
        return json(record);
      },
    },
    {
      method: "PUT",
      pattern: /^\/v1\/layouts\/([^/]+)$/,
      handle: async ({ request, user, params: [id] }) => {
        const { layout, validation } = parseLayout(await readBody(request, 512 * KB));
        if (layout.id !== id) throw new HttpProblem(400, "ID_MISMATCH", "layout.id does not match path");
        const existing = layouts.get(user)?.get(id);
        if (!existing) throw new HttpProblem(404, "NOT_FOUND", "layout not found");
        const record = { ...existing, layout, validation, updatedAt: iso() };
        layoutsOf(user).set(id, record);
        return json(record);
      },
    },
    {
      method: "DELETE",
      pattern: /^\/v1\/layouts\/([^/]+)$/,
      handle: ({ user, params: [id] }) => {
        if (!layouts.get(user)?.delete(id!)) throw new HttpProblem(404, "NOT_FOUND", "layout not found");
        const at = iso();
        for (const s of shares.values()) if (s.ownerId === user && s.layoutId === id && !s.revokedAt) s.revokedAt = at;
        return noContent();
      },
    },
    {
      method: "GET",
      pattern: /^\/v1\/layouts\/([^/]+)\/shares$/,
      handle: ({ user, params: [id] }) => {
        if (!layouts.get(user)?.has(id!)) throw new HttpProblem(404, "NOT_FOUND", "layout not found");
        const list = [...shares.values()]
          .filter((s) => s.ownerId === user && s.layoutId === id)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map(shareLink);
        return json({ shares: list });
      },
    },
    {
      method: "POST",
      pattern: /^\/v1\/layouts\/([^/]+)\/shares$/,
      handle: async ({ request, user, params: [id] }) => {
        const body = parse(CreateShareSchema, await readBody(request, KB));
        const record = layouts.get(user)?.get(id!);
        if (!record) throw new HttpProblem(404, "NOT_FOUND", "layout not found");
        if (record.validation.status === "blocked") throw new HttpProblem(422, "LAYOUT_BLOCKED", "layout is blocked");
        const expiresAt = expiresAtFrom(body.expiresAt);
        const active = [...shares.values()].filter((s) => s.ownerId === user && s.layoutId === id && shareStatus(s) === "active");
        if (active.length >= SHARE_LIMIT) throw new HttpProblem(409, "SHARE_LIMIT_REACHED", `limit ${SHARE_LIMIT} active shares`);
        const share: ShareRecord = {
          shareKey: newShareKey(),
          ownerId: user,
          layoutId: id!,
          layout: record.layout,
          validation: record.validation,
          createdAt: iso(),
          expiresAt,
          revokedAt: null,
        };
        shares.set(share.shareKey, share);
        return json(shareLink(share), 201);
      },
    },
    {
      method: "PATCH",
      pattern: /^\/v1\/shares\/([^/]+)$/,
      handle: async ({ request, user, params: [key] }) => {
        const body = parse(UpdateShareSchema, await readBody(request, KB));
        const share = ownShare(user, key!);
        if (share.revokedAt) throw new HttpProblem(410, "SHARE_REVOKED", "share was revoked");
        share.expiresAt = expiresAtFrom(body.expiresAt);
        return json(shareLink(share));
      },
    },
    {
      method: "DELETE",
      pattern: /^\/v1\/shares\/([^/]+)$/,
      handle: ({ user, params: [key] }) => {
        const share = ownShare(user, key!);
        share.revokedAt ??= iso();
        return noContent();
      },
    },
    {
      method: "GET",
      pattern: /^\/v1\/public\/shares\/([^/]+)$/,
      anonymous: true,
      handle: ({ params: [key] }) => {
        const share = shares.get(key!);
        if (!share) throw new HttpProblem(404, "NOT_FOUND", "share not found");
        const status = shareStatus(share);
        if (status === "revoked") throw new HttpProblem(410, "SHARE_REVOKED", "share was revoked");
        if (status === "expired") throw new HttpProblem(410, "SHARE_EXPIRED", "share has expired");
        return json({ layout: share.layout, validation: share.validation, createdAt: share.createdAt, expiresAt: share.expiresAt });
      },
    },
    {
      method: "POST",
      pattern: /^\/v1\/contact-messages$/,
      anonymous: true,
      handle: async ({ request, user }) => {
        const clientIp = request.headers.get("x-client-ip");
        if (!clientIp) throw new HttpProblem(400, "INVALID_REQUEST", "missing X-Client-IP");
        hit(limiters.ip, clientIp);
        if (user !== "anonymous") hit(limiters.user, user);
        hit(limiters.global, "global");
        const input = parse(ContactMessageSchema, await readBody(request, 8 * KB));
        const record: ContactRecord = {
          id: globalThis.crypto.randomUUID(),
          userId: user === "anonymous" ? null : user,
          ...input,
          clientIp,
          receivedAt: iso(),
        };
        contacts.push(record);
        return json({ id: record.id, receivedAt: record.receivedAt }, 202);
      },
    },
    {
      method: "GET",
      pattern: /^\/v1\/me$/,
      handle: ({ user }) => {
        const record = users.get(user);
        if (!record) throw new HttpProblem(404, "NOT_FOUND", "profile not found");
        return json(record);
      },
    },
    {
      method: "PUT",
      pattern: /^\/v1\/me$/,
      handle: async ({ request, user }) => {
        const body = parse(ProfileSchema, await readBody(request, 4 * KB));
        const at = iso();
        const existing = users.get(user);
        const record: UserRecord = {
          id: user,
          provider: body.provider,
          name: body.name ?? null,
          email: body.email ?? null,
          image: body.image ?? null,
          createdAt: existing?.createdAt ?? at,
          updatedAt: at,
        };
        users.set(user, record);
        return json(record);
      },
    },
    {
      method: "DELETE",
      pattern: /^\/v1\/me$/,
      handle: ({ user }) => {
        deleteUser(user);
        return noContent();
      },
    },
    {
      method: "GET",
      pattern: /^\/v1\/me\/export$/,
      handle: ({ user }) => {
        const at = iso();
        const profile = users.get(user) ?? { id: user, provider: providerOf(user), name: null, email: null, image: null, createdAt: at, updatedAt: at };
        return json({
          exportedAt: at,
          user: profile,
          layouts: [...(layouts.get(user)?.values() ?? [])],
          shares: [...shares.values()].filter((s) => s.ownerId === user).map(shareLink),
          contactMessages: contacts
            .filter((c) => c.userId === user)
            .map(({ name, email, message, receivedAt }) => ({ name, email, message, receivedAt })),
        });
      },
    },
    {
      method: "POST",
      pattern: /^\/v1\/me\/merge-guest$/,
      handle: async ({ request, user }) => {
        const { guestId } = parse(MergeGuestSchema, await readBody(request, KB));
        if (providerOf(user) === "guest") throw new HttpProblem(400, "INVALID_REQUEST", "cannot merge into a guest account");
        const moving = layouts.get(guestId) ?? new Map<string, LayoutRecord>();
        const target = layoutsOf(user);
        const renamed: Array<{ from: string; to: string }> = [];
        const idMap = new Map<string, string>();
        for (const [id, record] of moving) {
          let to = id;
          while (target.has(to)) to = `${id}-${globalThis.crypto.randomUUID().slice(0, 8)}`;
          if (to !== id) renamed.push({ from: id, to });
          idMap.set(id, to);
          target.set(to, { ...record, layout: { ...record.layout, id: to } });
        }
        let movedShares = 0;
        for (const s of shares.values()) {
          if (s.ownerId !== guestId) continue;
          s.ownerId = user;
          s.layoutId = idMap.get(s.layoutId) ?? s.layoutId;
          movedShares++;
        }
        layouts.delete(guestId);
        users.delete(guestId);
        return json({ movedLayouts: moving.size, movedShares, renamed });
      },
    },
  ];

  function deleteUser(user: string) {
    users.delete(user);
    layouts.delete(user);
    for (const [key, s] of shares) if (s.ownerId === user) shares.delete(key);
    contacts = contacts.filter((c) => c.userId !== user);
  }

  // ── คำสั่งควบคุมสำหรับเทสต์ ──────────────────────────────────────────────
  async function control(request: Request, pathname: string): Promise<Response> {
    if (request.method !== "POST") return json({ error: { code: "NOT_FOUND", message: "unknown control" } }, 404);
    if (pathname === "/__mock/reset") {
      reset();
      return noContent();
    }
    if (pathname === "/__mock/outage") {
      const body = (await request.json().catch(() => ({}))) as { requests?: number; subject?: string; path?: string };
      const count = body.requests === undefined ? Infinity : Math.max(0, body.requests);
      if (body.subject) outageBySubject.set(body.subject, count);
      else if (body.path) outageByPath.set(body.path, count);
      else outage = count;
      return noContent();
    }
    const expire = pathname.match(/^\/__mock\/shares\/([^/]+)\/expire$/);
    if (expire) {
      const share = shares.get(expire[1]!);
      if (!share) return json({ error: { code: "NOT_FOUND", message: "share not found" } }, 404);
      share.expiresAt = new Date(clock() - 1000).toISOString();
      return noContent();
    }
    return json({ error: { code: "NOT_FOUND", message: "unknown control" } }, 404);
  }

  async function handle(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith("/__mock/")) return control(request, pathname);
    if (request.method === "GET" && pathname === "/health") return json({ status: "ok", version: "mock", database: "ok" });
    const pathOutage = outageByPath.get(pathname) ?? 0;
    if (outage > 0 || pathOutage > 0) {
      if (outage > 0) outage--;
      else outageByPath.set(pathname, pathOutage - 1);
      return json({ error: { code: "INTERNAL_ERROR", message: "simulated outage" } }, 503);
    }
    try {
      const route = routes.find((r) => r.method === request.method && r.pattern.test(pathname));
      if (!route) throw new HttpProblem(404, "NOT_FOUND", "no such endpoint");
      const user = await subject(request);
      if (!user || (user === "anonymous" && !route.anonymous)) throw new HttpProblem(401, "UNAUTHORIZED", "invalid or missing token");
      const userOutage = outageBySubject.get(user) ?? 0;
      if (userOutage > 0) {
        outageBySubject.set(user, userOutage - 1);
        return json({ error: { code: "INTERNAL_ERROR", message: "simulated outage" } }, 503);
      }
      const params = route.pattern.exec(pathname)!.slice(1).map(decodeURIComponent);
      return await route.handle({ request, user, params });
    } catch (error) {
      if (error instanceof HttpProblem) {
        const retry = typeof error.extra.retryAfter === "number" ? { "Retry-After": String(error.extra.retryAfter) } : undefined;
        return json({ error: { code: error.code, message: error.message, ...error.extra } }, error.status, retry);
      }
      console.error("[mock-backend]", error);
      return json({ error: { code: "INTERNAL_ERROR", message: "internal error" } }, 500);
    }
  }

  return {
    fetch: handle,
    reset,
    /** สำหรับเทสต์ตรวจสถานะภายใน (เช่น ลบบัญชีแล้วไม่เหลือข้อมูล) */
    inspect: () => ({ users, layouts, shares, contacts }),
  };
}

export type MockBackend = ReturnType<typeof createMockBackend>;
