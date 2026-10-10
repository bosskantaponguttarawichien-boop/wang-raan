import { createLayoutHandlers } from "@/server/layout-handlers";
import { layoutRepository } from "@/server/layout-repository";
import { getSessionUser } from "@/server/session";

const handlers = createLayoutHandlers(layoutRepository, getSessionUser);

export const dynamic = "force-dynamic";

/** GET /api/layouts — รายการผังร้านของผู้ใช้ */
export function GET(request: Request) {
  return handlers.list(request);
}

/** POST /api/layouts — สร้างผังใหม่ (Session + Zod + Re-validate; Blocked → 422) */
export function POST(request: Request) {
  return handlers.create(request);
}
