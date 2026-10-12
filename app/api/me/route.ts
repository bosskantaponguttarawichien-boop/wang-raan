import { createAccountHandlers } from "@/server/account-handlers";
import { accountRepository } from "@/server/account-repository";
import { getSessionUser } from "@/server/session";

const handlers = createAccountHandlers(accountRepository, getSessionUser);

export const dynamic = "force-dynamic";

/** GET /api/me — โปรไฟล์ของผู้ใช้ที่ล็อกอินอยู่ */
export function GET(request: Request) {
  return handlers.get(request);
}

/** DELETE /api/me — ลบบัญชีและข้อมูลทั้งหมดถาวร (PDPA) */
export function DELETE(request: Request) {
  return handlers.remove(request);
}
