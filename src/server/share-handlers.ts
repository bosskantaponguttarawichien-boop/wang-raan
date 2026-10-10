import "server-only";
/**
 * BFF ลิงก์แชร์ (architecture.md §4.3, feat-030 / feat-040)
 * - POST   /api/share { layoutId, expiresAt? }   — สร้างลิงก์ (เจ้าของผังเท่านั้น)
 * - GET    /api/layouts/[id]/shares              — ลิงก์ทั้งหมดของผัง
 * - PATCH  /api/share/[shareKey] { expiresAt }   — เปลี่ยนวันหมดอายุ
 * - DELETE /api/share/[shareKey]                 — ยกเลิกลิงก์
 * - GET    /api/share/[shareKey]                 — สาธารณะ อ่านอย่างเดียว ไม่ต้องเข้าสู่ระบบ
 */
import { z } from "zod";
import { json, problem, readJson, unauthorized, withBackendErrors } from "./layout-handlers";
import { SHARE_MAX_DAYS } from "./limits";
import { clientIp } from "./rate-limit";
import type { ResolveUser } from "./session";
import type { ShareLink, ShareRepository } from "./share-repository";

/** body มีแค่ layoutId / expiresAt — 1 KB ก็เกินพอ */
export const SHARE_MAX_BYTES = 1024;
const DAY_MS = 24 * 60 * 60 * 1000;

const ExpiresAt = z.string().datetime({ offset: true }).nullable();
const CreateShareSchema = z.object({ layoutId: z.string().min(1).max(128), expiresAt: ExpiresAt.optional() }).strict();
const UpdateShareSchema = z.object({ expiresAt: ExpiresAt }).strict();

/** ลิงก์ยกเลิกได้แล้ว → cache สั้น (CDN 60 วินาที) เพื่อให้การยกเลิกมีผลเร็ว */
export const PUBLIC_SHARE_CACHE = "public, max-age=0, s-maxage=60, must-revalidate";

export function shareUrl(request: Request, shareKey: string): string {
  return new URL(`/share/${shareKey}`, request.url).toString();
}

const withUrl = (request: Request, link: ShareLink) => ({ ...link, url: shareUrl(request, link.shareKey) });

/** ตรวจวันหมดอายุฝั่ง BFF ก่อน (ข้อความไทยชัดกว่า) — Backend ตรวจซ้ำตามสัญญา */
function invalidExpiry(expiresAt: string | null | undefined, now: number): Response | null {
  if (expiresAt == null) return null;
  const t = Date.parse(expiresAt);
  if (t > now && t <= now + SHARE_MAX_DAYS * DAY_MS) return null;
  return problem(400, "INVALID_EXPIRY", `วันหมดอายุต้องอยู่ในอนาคตและไม่เกิน ${SHARE_MAX_DAYS} วัน`);
}

export function createShareHandlers(shares: ShareRepository, resolveUser: ResolveUser, now: () => number = Date.now) {
  return {
    create: (request: Request) =>
      withBackendErrors(async () => {
        const user = await resolveUser(request);
        if (!user) return unauthorized();
        const read = await readJson(request, SHARE_MAX_BYTES);
        if (!read.ok) return read.response;
        const parsed = CreateShareSchema.safeParse(read.body);
        if (!parsed.success) return problem(400, "INVALID_REQUEST", "ต้องระบุ layoutId ของผังที่บันทึกแล้ว");
        const bad = invalidExpiry(parsed.data.expiresAt, now());
        if (bad) return bad;
        const link = await shares.create(user.id, parsed.data.layoutId, parsed.data.expiresAt ?? null);
        if (link === "not-found") return problem(404, "NOT_FOUND", "ไม่พบผังร้านนี้ — บันทึกผังก่อนแชร์");
        return json(withUrl(request, link), 201);
      }),

    list: (request: Request, layoutId: string) =>
      withBackendErrors(async () => {
        const user = await resolveUser(request);
        if (!user) return unauthorized();
        const links = await shares.list(user.id, layoutId);
        if (links === "not-found") return problem(404, "NOT_FOUND", "ไม่พบผังร้านนี้");
        return json({ shares: links.map((l) => withUrl(request, l)) });
      }),

    update: (request: Request, shareKey: string) =>
      withBackendErrors(async () => {
        const user = await resolveUser(request);
        if (!user) return unauthorized();
        const read = await readJson(request, SHARE_MAX_BYTES);
        if (!read.ok) return read.response;
        const parsed = UpdateShareSchema.safeParse(read.body);
        if (!parsed.success) return problem(400, "INVALID_REQUEST", "ต้องระบุ expiresAt (หรือ null = ไม่หมดอายุ)");
        const bad = invalidExpiry(parsed.data.expiresAt, now());
        if (bad) return bad;
        const link = await shares.update(user.id, shareKey, parsed.data.expiresAt);
        if (link === "not-found") return problem(404, "NOT_FOUND", "ไม่พบลิงก์แชร์นี้");
        if (link === "revoked") return problem(410, "SHARE_REVOKED", "ลิงก์นี้ถูกยกเลิกแล้ว แก้วันหมดอายุไม่ได้");
        return json(withUrl(request, link));
      }),

    revoke: (request: Request, shareKey: string) =>
      withBackendErrors(async () => {
        const user = await resolveUser(request);
        if (!user) return unauthorized();
        return (await shares.revoke(user.id, shareKey)) ? new Response(null, { status: 204 }) : problem(404, "NOT_FOUND", "ไม่พบลิงก์แชร์นี้");
      }),

    get: (request: Request, shareKey: string) =>
      withBackendErrors(async () => {
        const shared = await shares.getPublic(shareKey, clientIp(request));
        if (shared === "not-found") return problem(404, "NOT_FOUND", "ไม่พบลิงก์แชร์นี้");
        if (shared === "revoked") return problem(410, "SHARE_REVOKED", "ลิงก์นี้ถูกยกเลิกแล้ว");
        if (shared === "expired") return problem(410, "SHARE_EXPIRED", "ลิงก์นี้หมดอายุแล้ว");
        // ไม่เปิดเผยเจ้าของ (Backend ไม่ส่งมาอยู่แล้วตามสัญญา)
        return Response.json(shared, { headers: { "Cache-Control": PUBLIC_SHARE_CACHE } });
      }),
  };
}
