import { getSessionUser } from "@/server/session";
import { createShareHandlers } from "@/server/share-handlers";
import { shareRepository } from "@/server/share-repository";

const handlers = createShareHandlers(shareRepository, getSessionUser);

export const dynamic = "force-dynamic";

/** GET /api/layouts/[id]/shares — ลิงก์แชร์ทั้งหมดของผัง (รวมที่ยกเลิก/หมดอายุ) */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handlers.list(request, (await params).id);
}
