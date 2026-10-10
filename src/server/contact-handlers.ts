import "server-only";
/**
 * BFF POST /api/contact (architecture.md §4.3, feat-032)
 * ลำดับ: Rate limit (IP + ผู้ใช้ที่ล็อกอิน) → จำกัดขนาด → Zod → honeypot → ส่งต่อ (webhook หรือกล่องข้อความในหน่วยความจำ)
 */
import { ContactSchema, type ContactInput } from "@/lib/contact-schema";
import { json, problem } from "./layout-handlers";
import { clientIp, createRateLimiter, type RateLimiter } from "./rate-limit";
import type { ResolveUser } from "./session";

export const CONTACT_MAX_BYTES = 8 * 1024;
/** 5 ครั้ง / 10 นาที ต่อ IP และต่อผู้ใช้ */
export const CONTACT_LIMIT = { limit: 5, windowMs: 10 * 60 * 1000 };

export interface ContactMessage extends Omit<ContactInput, "website"> {
  receivedAt: string;
  userId: string | null;
}

export interface ContactDelivery {
  deliver(message: ContactMessage): Promise<void>;
}

/** ส่งต่อไป Webhook (เช่น Slack/LINE Notify/อีเมลเกตเวย์) */
export function createWebhookDelivery(url: string, doFetch: typeof fetch = fetch): ContactDelivery {
  return {
    async deliver(message) {
      const res = await doFetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(message) });
      if (!res.ok) throw new Error(`Webhook ${res.status}`);
    },
  };
}

/** ไม่มีบริการส่งต่อ (dev / V1): เก็บไว้ในหน่วยความจำ ล่าสุด 100 รายการ */
export function createMemoryDelivery(): ContactDelivery & { messages: ContactMessage[] } {
  const messages: ContactMessage[] = [];
  return {
    messages,
    async deliver(message) {
      messages.push(message);
      if (messages.length > 100) messages.shift();
    },
  };
}

export interface ContactHandlerDeps {
  delivery: ContactDelivery;
  resolveUser: ResolveUser;
  ipLimiter?: RateLimiter;
  userLimiter?: RateLimiter;
  now?: () => Date;
}

export function createContactHandler(deps: ContactHandlerDeps) {
  const ipLimiter = deps.ipLimiter ?? createRateLimiter(CONTACT_LIMIT);
  const userLimiter = deps.userLimiter ?? createRateLimiter(CONTACT_LIMIT);
  const now = deps.now ?? (() => new Date());

  const tooMany = (retryAfter: number) => {
    const res = problem(429, "RATE_LIMITED", `ส่งข้อความถี่เกินไป กรุณารออีก ${Math.max(1, Math.ceil(retryAfter / 60))} นาที`, { retryAfter });
    res.headers.set("Retry-After", String(retryAfter));
    return res;
  };

  return async function POST(request: Request): Promise<Response> {
    const user = await deps.resolveUser(request);
    const byIp = ipLimiter.hit(`ip:${clientIp(request)}`);
    if (!byIp.allowed) return tooMany(byIp.retryAfter);
    if (user) {
      const byUser = userLimiter.hit(`user:${user.id}`);
      if (!byUser.allowed) return tooMany(byUser.retryAfter);
    }

    if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
      return problem(415, "UNSUPPORTED_MEDIA_TYPE", "ต้องส่งข้อมูลเป็น application/json");
    }
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > CONTACT_MAX_BYTES) return problem(413, "PAYLOAD_TOO_LARGE", "ข้อความยาวเกินกำหนด");
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return problem(400, "INVALID_JSON", "รูปแบบ JSON ไม่ถูกต้อง");
    }
    const parsed = ContactSchema.safeParse(body);
    if (!parsed.success) {
      return problem(400, "INVALID_CONTACT", "กรอกข้อมูลไม่ครบหรือไม่ถูกต้อง", {
        details: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    const { website, ...input } = parsed.data;
    // Honeypot ถูกกรอก → ตอบเหมือนสำเร็จแต่ไม่ส่งต่อ (ไม่บอก bot ว่าโดนจับได้)
    if (website) return json({ ok: true }, 202);
    try {
      await deps.delivery.deliver({ ...input, userId: user?.id ?? null, receivedAt: now().toISOString() });
    } catch {
      return problem(502, "DELIVERY_FAILED", "ส่งข้อความไม่สำเร็จ ลองใหม่ภายหลัง");
    }
    return json({ ok: true }, 202);
  };
}
