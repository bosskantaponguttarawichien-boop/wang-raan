import { createAccountHandlers } from "@/server/account-handlers";
import { accountRepository } from "@/server/account-repository";
import { getSessionUser } from "@/server/session";

const handlers = createAccountHandlers(accountRepository, getSessionUser);

export const dynamic = "force-dynamic";

/** GET /api/me/export — ดาวน์โหลดข้อมูลทั้งหมดของผู้ใช้เป็น JSON (PDPA) */
export function GET(request: Request) {
  return handlers.export(request);
}
