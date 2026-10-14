import "server-only";
/**
 * BFF Layout handlers — แยกจากไฟล์ route.ts เพื่อ inject repository ในเทสต์
 * ลำดับ: จำกัดขนาด body → parse JSON → Zod schema (400) → Re-validate ฝั่ง server (422 ถ้า Blocked) → บันทึก
 * ผลตรวจจาก Client ไม่ถูกเชื่อถือ: server คำนวณ ValidationResult ใหม่ทุกครั้ง (Dual-Tier Validation)
 * ทุก endpoint ต้องมี Session (401) และเห็นเฉพาะผังของตนเอง (ผังของคนอื่นตอบ 404)
 */
import { SaveLayoutRequestSchema, validateLayout } from "@/core/validation";
import { json, problem, readJson, withUser, zodDetails } from "./http";
import type { LayoutRepository } from "./layout-repository";
import type { ResolveUser } from "./session";

export { MAX_BODY_BYTES } from "./http";

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
  const name = parsed.data.name;
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
  return { ok: true as const, layout, validation, name };
}

export function createLayoutHandlers(repo: LayoutRepository, resolveUser: ResolveUser) {
  const notFound = () => problem(404, "NOT_FOUND", "ไม่พบผังร้านนี้");
  return {
    list: withUser(resolveUser, async (user) => json({ layouts: await repo.list(user.id) })),

    create: withUser(resolveUser, async (user, request) => {
      const result = await parseAndValidate(request);
      if (!result.ok) return result.response;
      const stored = await repo.create(user.id, result.layout, result.name);
      if (stored === "conflict") return problem(409, "LAYOUT_EXISTS", "มีผังรหัสนี้อยู่แล้ว ใช้ PUT เพื่ออัปเดต");
      return json(stored, 201);
    }),

    get: withUser(resolveUser, async (user, _request, id: string) => {
      const stored = await repo.get(user.id, id);
      return stored ? json(stored) : notFound();
    }),

    update: withUser(resolveUser, async (user, request, id: string) => {
      const result = await parseAndValidate(request);
      if (!result.ok) return result.response;
      if (result.layout.id !== id) return problem(400, "ID_MISMATCH", "รหัสผังใน URL ไม่ตรงกับข้อมูล");
      const stored = await repo.update(user.id, result.layout, result.name);
      return stored === "not-found" ? notFound() : json(stored);
    }),

    remove: withUser(resolveUser, async (user, _request, id: string) =>
      (await repo.remove(user.id, id)) ? new Response(null, { status: 204 }) : notFound(),
    ),
  };
}
