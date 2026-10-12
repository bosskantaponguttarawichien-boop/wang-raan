import "server-only";
/**
 * BFF บัญชีผู้ใช้ — `/api/me` (โปรไฟล์, ลบบัญชี) และ `/api/me/export` (ดาวน์โหลดข้อมูลทั้งหมด, PDPA)
 * ทุก endpoint ต้องมี Session (401) และจัดการได้เฉพาะบัญชีของตนเอง
 */
import type { AccountRepository } from "./account-repository";
import { profileInput } from "./account-sync";
import { json, problem, withUser } from "./http";
import type { ResolveUser } from "./session";

export function createAccountHandlers(repo: AccountRepository, resolveUser: ResolveUser) {
  return {
    /** โปรไฟล์ — ยังไม่มีใน Backend (session ก่อนเปิดซิงก์ หรือซิงก์ตอนล็อกอินล้มเหลว) → สร้างจาก session ตอนนี้ */
    get: withUser(resolveUser, async (user) => {
      const profile = await repo.get(user.id);
      if (profile) return json(profile);
      const input = profileInput(user.id, { name: user.name });
      return input ? json(await repo.upsert(user.id, input)) : problem(404, "NOT_FOUND", "ไม่พบบัญชีผู้ใช้");
    }),

    /** ลบบัญชีและข้อมูลทั้งหมดถาวร (ผัง ลิงก์แชร์ ข้อความติดต่อ) — Client ต้องออกจากระบบต่อเอง */
    remove: withUser(resolveUser, async (user) => {
      await repo.remove(user.id);
      return new Response(null, { status: 204 });
    }),

    /** ข้อมูลทั้งหมดเป็นไฟล์ JSON */
    export: withUser(resolveUser, async (user) => {
      const data = await repo.export(user.id);
      const res = json(data);
      res.headers.set("Content-Disposition", `attachment; filename="wang-raan-account-${data.exportedAt.slice(0, 10)}.json"`);
      return res;
    }),
  };
}
