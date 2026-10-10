import { layoutRepository } from "@/server/layout-repository";
import { getSessionUser } from "@/server/session";
import { createShareHandlers } from "@/server/share-handlers";
import { shareRepository } from "@/server/share-repository";

const handlers = createShareHandlers(layoutRepository, shareRepository, getSessionUser);

export const dynamic = "force-dynamic";

/** POST /api/share — สร้างลิงก์แชร์สาธารณะของผังที่บันทึกแล้ว */
export function POST(request: Request) {
  return handlers.create(request);
}
