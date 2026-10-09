import { createLayoutHandlers } from "@/server/layout-handlers";
import { layoutRepository } from "@/server/layout-repository";

const handlers = createLayoutHandlers(layoutRepository);

export const dynamic = "force-dynamic";

/** GET /api/layouts — รายการผังร้าน */
export function GET() {
  return handlers.list();
}

/** POST /api/layouts — สร้างผังใหม่ (Zod + Re-validate; Blocked → 422) */
export function POST(request: Request) {
  return handlers.create(request);
}
