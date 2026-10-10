import "server-only";
/**
 * BFF POST /api/contact (architecture.md §4.3, feat-032 → feat-039)
 * ลำดับ: จำกัดขนาด → Zod → honeypot → ส่งต่อ Backend (`POST /v1/contact-messages` พร้อม X-Client-IP)
 * Rate limit และการแจ้งเตือนทีมงานอยู่ที่ Backend — BFF บน Cloudflare Workers นับในหน่วยความจำข้าม isolate ไม่ได้
 */
import { ContactSchema } from "@/lib/contact-schema";
import { BackendConfigError, BackendError, backendClient, send } from "./backend";
import { json, problem, readJson, tooManyRequests } from "./layout-handlers";
import { clientIp } from "./rate-limit";
import type { ResolveUser } from "./session";
import type { BackendClient } from "./token-relay";

export const CONTACT_MAX_BYTES = 8 * 1024;

export interface ContactHandlerDeps {
  resolveUser: ResolveUser;
  client?: BackendClient;
}

const contactTooMany = (retryAfter: number) =>
  tooManyRequests(`ส่งข้อความถี่เกินไป กรุณารออีก ${Math.max(1, Math.ceil(retryAfter / 60))} นาที`, retryAfter);

export function createContactHandler(deps: ContactHandlerDeps) {
  const client = deps.client ?? backendClient;

  return async function POST(request: Request): Promise<Response> {
    const user = await deps.resolveUser(request);
    const read = await readJson(request, CONTACT_MAX_BYTES);
    if (!read.ok) return read.response;
    const parsed = ContactSchema.safeParse(read.body);
    if (!parsed.success) {
      return problem(400, "INVALID_CONTACT", "กรอกข้อมูลไม่ครบหรือไม่ถูกต้อง", {
        details: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    const { website, ...input } = parsed.data;
    // Honeypot ถูกกรอก → ตอบเหมือนสำเร็จแต่ไม่ส่งต่อ (ไม่บอก bot ว่าโดนจับได้)
    if (website) return json({ ok: true }, 202);
    try {
      await send(client, user?.id ?? null, "/v1/contact-messages", {
        method: "POST",
        headers: { "x-client-ip": clientIp(request) },
        body: JSON.stringify(input),
      });
    } catch (error) {
      if (error instanceof BackendError && error.code === "RATE_LIMITED") return contactTooMany(Number(error.detail.retryAfter) || 600);
      if (error instanceof BackendError && error.status === 400) return problem(400, "INVALID_CONTACT", "กรอกข้อมูลไม่ครบหรือไม่ถูกต้อง");
      if (error instanceof BackendError || error instanceof BackendConfigError) {
        console.error("[wang-raan] ส่งข้อความติดต่อไป Backend ไม่สำเร็จ", error instanceof BackendError ? { status: error.status, code: error.code, cause: error.detail.cause } : error.message);
        return problem(502, "DELIVERY_FAILED", "ส่งข้อความไม่สำเร็จ ลองใหม่ภายหลัง");
      }
      throw error;
    }
    return json({ ok: true }, 202);
  };
}
