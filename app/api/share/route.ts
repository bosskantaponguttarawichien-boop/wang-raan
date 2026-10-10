import { getSessionUser } from "@/server/session";
import { createShareHandlers } from "@/server/share-handlers";
import { shareRepository } from "@/server/share-repository";

const handlers = createShareHandlers(shareRepository, getSessionUser);

export const dynamic = "force-dynamic";

/** POST /api/share — สร้างลิงก์แชร์ของผังที่บันทึกแล้ว (เลือกวันหมดอายุได้) */
export function POST(request: Request) {
  return handlers.create(request);
}
