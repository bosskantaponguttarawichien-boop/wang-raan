import "server-only";
/**
 * Helper HTTP ที่ BFF ทุก route ใช้ร่วมกัน — รูปแบบ error `{ error: { code, message, ...extra } }`,
 * อ่าน JSON body แบบจำกัดขนาด และแปลง error จาก Backend เป็น response ที่ปลอดภัย
 */
import type { ZodError } from "zod";
import type { SessionUser } from "./auth-config";
import { BackendConfigError, BackendError } from "./backend";
import { LAYOUT_LIMIT, SHARE_LIMIT } from "./limits";
import type { ResolveUser } from "./session";

export const MAX_BODY_BYTES = 512 * 1024;

export const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export function problem(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
  return json({ error: { code, message, ...extra } }, status);
}

export const unauthorized = () => problem(401, "UNAUTHORIZED", "กรุณาเข้าสู่ระบบก่อน");

export function zodDetails(error: ZodError) {
  return error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
}

/** วินาทีที่ต้องรอ → นาที (ปัดขึ้น อย่างน้อย 1) สำหรับข้อความ rate limit */
export const retryMinutes = (seconds: number) => Math.max(1, Math.ceil(seconds / 60));

/** อ่าน body ทีละ chunk และหยุดทันทีเมื่อเกิน maxBytes (ไม่เก็บทั้งก้อนลงหน่วยความจำก่อนวัด) */
async function readBounded(request: Request, maxBytes: number): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/** อ่าน JSON body: บังคับ content-type JSON (กัน CSRF แบบ form POST) และจำกัดขนาด */
export async function readJson(request: Request, maxBytes = MAX_BODY_BYTES): Promise<{ ok: true; body: unknown } | { ok: false; response: Response }> {
  const type = request.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) {
    return { ok: false, response: problem(415, "UNSUPPORTED_MEDIA_TYPE", "ต้องส่งข้อมูลเป็น application/json") };
  }
  const tooLarge = { ok: false as const, response: problem(413, "PAYLOAD_TOO_LARGE", "ข้อมูลมีขนาดใหญ่เกินกำหนด") };
  if (Number(request.headers.get("content-length") ?? 0) > maxBytes) return tooLarge;
  const text = await readBounded(request, maxBytes);
  if (text === null) return tooLarge;
  try {
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return { ok: false, response: problem(400, "INVALID_JSON", "รูปแบบ JSON ไม่ถูกต้อง") };
  }
}

/**
 * error จาก Backend ที่ผู้ใช้ควรเห็น (ส่งต่อสถานะ + code พร้อมข้อความภาษาไทย) — code อื่นทั้งหมดถือว่า Backend ขัดข้อง
 * อ้างอิงรายการ code: contracts/openapi.yaml → ErrorCode
 */
const FORWARDED: Record<string, (detail: Record<string, unknown>) => string> = {
  LAYOUT_BLOCKED: () => "ผังยังไม่ผ่านกฎจำเป็น จึงบันทึกหรือแชร์ไม่ได้",
  LAYOUT_LIMIT_REACHED: () => `บัญชีนี้บันทึกผังครบ ${LAYOUT_LIMIT} ผังแล้ว — ลบผังที่ไม่ใช้ก่อน`,
  SHARE_LIMIT_REACHED: () => `ผังนี้มีลิงก์แชร์ที่ใช้งานได้ครบ ${SHARE_LIMIT} ลิงก์แล้ว — ยกเลิกลิงก์เก่าก่อน`,
  SHARE_REVOKED: () => "ลิงก์นี้ถูกยกเลิกแล้ว",
  SHARE_EXPIRED: () => "ลิงก์นี้หมดอายุแล้ว",
  PAYLOAD_TOO_LARGE: () => "ข้อมูลมีขนาดใหญ่เกินกำหนด",
  INVALID_REQUEST: () => "ข้อมูลไม่ถูกต้อง",
  INVALID_LAYOUT_SCHEMA: () => "โครงสร้างข้อมูลผังไม่ถูกต้อง",
  RATE_LIMITED: (d) => `ส่งคำขอถี่เกินไป กรุณารออีก ${retryMinutes(Number(d.retryAfter) || 60)} นาที`,
};
const FORWARDED_STATUS = new Set([400, 409, 410, 413, 422, 429]);

/** ตอบ 429 พร้อม Retry-After */
export function tooManyRequests(message: string, retryAfter: number): Response {
  const res = problem(429, "RATE_LIMITED", message, { retryAfter });
  res.headers.set("Retry-After", String(retryAfter));
  return res;
}

export function backendProblem(error: BackendError): Response {
  const message = error.code && FORWARDED_STATUS.has(error.status) ? FORWARDED[error.code] : undefined;
  if (!message) {
    // ผู้ใช้เห็นแค่ข้อความกลาง ๆ — รายละเอียดอยู่ใน log (เช่น 401 = INTERNAL_TOKEN_SECRET ไม่ตรงกับ Backend, 0 = ติดต่อไม่ได้/หมดเวลา)
    console.error("[wang-raan] Backend error", { status: error.status, code: error.code, path: error.path, cause: error.detail.cause });
    return problem(502, "BACKEND_ERROR", "ระบบจัดเก็บผังขัดข้อง ลองใหม่ภายหลัง");
  }
  const text = message(error.detail);
  if (error.code === "RATE_LIMITED") return tooManyRequests(text, Number(error.detail.retryAfter) || 60);
  const { validation, issues } = error.detail;
  return problem(error.status, error.code!, text, error.code === "LAYOUT_BLOCKED" ? { validation, issues } : {});
}

/** Backend ตอบผิดปกติ → แปลงเป็น response ที่ปลอดภัย (ไม่ส่งรายละเอียดภายในออกไป) */
export async function withBackendErrors(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof BackendError) return backendProblem(error);
    if (error instanceof BackendConfigError) return problem(503, "BACKEND_NOT_CONFIGURED", "ระบบจัดเก็บข้อมูลยังไม่พร้อมใช้งาน");
    throw error;
  }
}

/** endpoint ที่ต้องเข้าสู่ระบบ: ไม่มี Session → 401, error จาก Backend → response ที่ปลอดภัย */
export function withUser<A extends unknown[]>(
  resolveUser: ResolveUser,
  run: (user: SessionUser, request: Request, ...args: A) => Promise<Response>,
): (request: Request, ...args: A) => Promise<Response> {
  return (request, ...args) =>
    withBackendErrors(async () => {
      const user = await resolveUser(request);
      return user ? run(user, request, ...args) : unauthorized();
    });
}
