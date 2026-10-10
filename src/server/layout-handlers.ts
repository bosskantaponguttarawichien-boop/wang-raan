import "server-only";
/**
 * BFF Layout handlers — แยกจากไฟล์ route.ts เพื่อ inject repository ในเทสต์
 * ลำดับ: จำกัดขนาด body → parse JSON → Zod schema (400) → Re-validate ฝั่ง server (422 ถ้า Blocked) → บันทึก
 * ผลตรวจจาก Client ไม่ถูกเชื่อถือ: server คำนวณ ValidationResult ใหม่ทุกครั้ง (Dual-Tier Validation)
 * ทุก endpoint ต้องมี Session (401) และเห็นเฉพาะผังของตนเอง (ผังของคนอื่นตอบ 404)
 */
import type { ZodError } from "zod";
import { SaveLayoutRequestSchema, validateLayout } from "@/core/validation";
import { BackendError, type LayoutRepository } from "./layout-repository";
import type { ResolveUser } from "./session";

export const MAX_BODY_BYTES = 512 * 1024;

export const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export function problem(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
  return json({ error: { code, message, ...extra } }, status);
}

function zodDetails(error: ZodError) {
  return error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
}

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

/** parse + re-validate; คืน layout/validation ที่ผ่านแล้ว หรือ Response ข้อผิดพลาด */
async function parseAndValidate(request: Request) {
  const read = await readJson(request);
  if (!read.ok) return read;
  const parsed = SaveLayoutRequestSchema.safeParse(read.body);
  if (!parsed.success) {
    return {
      ok: false as const,
      response: problem(400, "INVALID_LAYOUT_SCHEMA", "โครงสร้างข้อมูลผังไม่ถูกต้อง", { details: zodDetails(parsed.error) }),
    };
  }
  const layout = parsed.data.layout;
  const validation = validateLayout(layout);
  if (validation.status === "blocked") {
    return {
      ok: false as const,
      response: problem(422, "LAYOUT_BLOCKED", "ผังยังไม่ผ่านกฎจำเป็น จึงบันทึกไม่ได้", {
        validation,
        issues: validation.issues.filter((i) => i.severity === "blocked"),
      }),
    };
  }
  return { ok: true as const, layout, validation };
}

export const unauthorized = () => problem(401, "UNAUTHORIZED", "กรุณาเข้าสู่ระบบก่อน");

/** Backend ตอบผิดปกติ → 502 (ไม่ส่งรายละเอียดภายในออกไป) */
export async function withBackendErrors(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof BackendError) return problem(502, "BACKEND_ERROR", "ระบบจัดเก็บผังขัดข้อง ลองใหม่ภายหลัง");
    throw error;
  }
}

export function createLayoutHandlers(repo: LayoutRepository, resolveUser: ResolveUser) {
  const handlers = {
    async list(request: Request) {
      const user = await resolveUser(request);
      if (!user) return unauthorized();
      return json({ layouts: await repo.list(user.id) });
    },

    async create(request: Request) {
      const user = await resolveUser(request);
      if (!user) return unauthorized();
      const result = await parseAndValidate(request);
      if (!result.ok) return result.response;
      const stored = await repo.create(user.id, result.layout, result.validation);
      if (stored === "conflict") return problem(409, "LAYOUT_EXISTS", "มีผังรหัสนี้อยู่แล้ว ใช้ PUT เพื่ออัปเดต");
      return json(stored, 201);
    },

    async get(request: Request, id: string) {
      const user = await resolveUser(request);
      if (!user) return unauthorized();
      const stored = await repo.get(user.id, id);
      return stored ? json(stored) : problem(404, "NOT_FOUND", "ไม่พบผังร้านนี้");
    },

    async update(request: Request, id: string) {
      const user = await resolveUser(request);
      if (!user) return unauthorized();
      const result = await parseAndValidate(request);
      if (!result.ok) return result.response;
      if (result.layout.id !== id) return problem(400, "ID_MISMATCH", "รหัสผังใน URL ไม่ตรงกับข้อมูล");
      const stored = await repo.update(user.id, result.layout, result.validation);
      return stored === "not-found" ? problem(404, "NOT_FOUND", "ไม่พบผังร้านนี้") : json(stored);
    },

    async remove(request: Request, id: string) {
      const user = await resolveUser(request);
      if (!user) return unauthorized();
      return (await repo.remove(user.id, id)) ? new Response(null, { status: 204 }) : problem(404, "NOT_FOUND", "ไม่พบผังร้านนี้");
    },
  };
  return {
    list: (request: Request) => withBackendErrors(() => handlers.list(request)),
    create: (request: Request) => withBackendErrors(() => handlers.create(request)),
    get: (request: Request, id: string) => withBackendErrors(() => handlers.get(request, id)),
    update: (request: Request, id: string) => withBackendErrors(() => handlers.update(request, id)),
    remove: (request: Request, id: string) => withBackendErrors(() => handlers.remove(request, id)),
  };
}
