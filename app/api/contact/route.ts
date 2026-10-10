import { createContactHandler } from "@/server/contact-handlers";
import { getSessionUser } from "@/server/session";

export const dynamic = "force-dynamic";

/** POST /api/contact — ฟอร์มติดต่อ → Backend (Rate limit อยู่ที่ Backend) */
export const POST = createContactHandler({ resolveUser: getSessionUser });
