import { createContactHandler, createMemoryDelivery, createWebhookDelivery } from "@/server/contact-handlers";
import { getSessionUser } from "@/server/session";

const delivery = process.env.CONTACT_WEBHOOK_URL ? createWebhookDelivery(process.env.CONTACT_WEBHOOK_URL) : createMemoryDelivery();

export const dynamic = "force-dynamic";

/** POST /api/contact — ฟอร์มติดต่อ + Rate limit (IP/User) */
export const POST = createContactHandler({ delivery, resolveUser: getSessionUser });
