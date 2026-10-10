import "server-only";
/**
 * BFF /api/share (architecture.md §4.3, feat-030)
 * - POST /api/share { layoutId } — ต้องเข้าสู่ระบบและเป็นเจ้าของผัง; ผังที่บันทึกแล้วผ่าน Re-validate มาแล้ว (ไม่ Blocked)
 * - GET /api/share/[shareKey] — สาธารณะ อ่านอย่างเดียว ไม่ต้องเข้าสู่ระบบ, cache ได้เพราะเป็น snapshot
 */
import { z } from "zod";
import { json, problem, unauthorized } from "./layout-handlers";
import type { LayoutRepository } from "./layout-repository";
import type { ResolveUser } from "./session";
import type { ShareRepository } from "./share-repository";

const CreateShareSchema = z.object({ layoutId: z.string().min(1).max(128) }).strict();

export function shareUrl(request: Request, shareKey: string): string {
  return new URL(`/share/${shareKey}`, request.url).toString();
}

export function createShareHandlers(layouts: LayoutRepository, shares: ShareRepository, resolveUser: ResolveUser) {
  return {
    async create(request: Request) {
      const user = await resolveUser(request);
      if (!user) return unauthorized();
      // บังคับ JSON → คำขอข้ามโดเมนต้องผ่าน CORS preflight (กัน CSRF แบบ form POST)
      if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
        return problem(415, "UNSUPPORTED_MEDIA_TYPE", "ต้องส่งข้อมูลเป็น application/json");
      }
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return problem(400, "INVALID_JSON", "รูปแบบ JSON ไม่ถูกต้อง");
      }
      const parsed = CreateShareSchema.safeParse(body);
      if (!parsed.success) return problem(400, "INVALID_REQUEST", "ต้องระบุ layoutId ของผังที่บันทึกแล้ว");
      const stored = await layouts.get(user.id, parsed.data.layoutId);
      if (!stored) return problem(404, "NOT_FOUND", "ไม่พบผังร้านนี้ — บันทึกผังก่อนแชร์");
      if (stored.validation.status === "blocked") return problem(422, "LAYOUT_BLOCKED", "ผังยังไม่ผ่านกฎจำเป็น จึงแชร์ไม่ได้");
      const shared = await shares.create({ ownerId: user.id, layout: stored.layout, validation: stored.validation });
      return json({ shareKey: shared.shareKey, url: shareUrl(request, shared.shareKey), createdAt: shared.createdAt }, 201);
    },

    async get(shareKey: string) {
      const shared = await shares.get(shareKey);
      if (!shared) return problem(404, "NOT_FOUND", "ไม่พบลิงก์แชร์นี้");
      // ไม่เปิดเผย ownerId
      return Response.json(
        { layout: shared.layout, validation: shared.validation, createdAt: shared.createdAt },
        { headers: { "Cache-Control": "public, max-age=300, s-maxage=86400, immutable" } },
      );
    },
  };
}
