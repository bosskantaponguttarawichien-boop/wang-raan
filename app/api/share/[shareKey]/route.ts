import { layoutRepository } from "@/server/layout-repository";
import { getSessionUser } from "@/server/session";
import { createShareHandlers } from "@/server/share-handlers";
import { shareRepository } from "@/server/share-repository";

const handlers = createShareHandlers(layoutRepository, shareRepository, getSessionUser);

export const dynamic = "force-dynamic";

/** GET /api/share/[shareKey] — ดูผังแบบสาธารณะ (Read-only) */
export async function GET(_request: Request, { params }: { params: Promise<{ shareKey: string }> }) {
  return handlers.get((await params).shareKey);
}
