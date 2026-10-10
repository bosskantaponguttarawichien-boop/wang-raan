import { getSessionUser } from "@/server/session";
import { createShareHandlers } from "@/server/share-handlers";
import { shareRepository } from "@/server/share-repository";

const handlers = createShareHandlers(shareRepository, getSessionUser);

type Context = { params: Promise<{ shareKey: string }> };

export const dynamic = "force-dynamic";

/** GET /api/share/[shareKey] — ดูผังแบบสาธารณะ (Read-only); ยกเลิก/หมดอายุ → 410 */
export async function GET(request: Request, { params }: Context) {
  return handlers.get(request, (await params).shareKey);
}

/** PATCH /api/share/[shareKey] — เปลี่ยนวันหมดอายุ (เจ้าของเท่านั้น) */
export async function PATCH(request: Request, { params }: Context) {
  return handlers.update(request, (await params).shareKey);
}

/** DELETE /api/share/[shareKey] — ยกเลิกลิงก์ (เจ้าของเท่านั้น) */
export async function DELETE(request: Request, { params }: Context) {
  return handlers.revoke(request, (await params).shareKey);
}
