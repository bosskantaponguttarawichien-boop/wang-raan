import { createLayoutHandlers } from "@/server/layout-handlers";
import { layoutRepository } from "@/server/layout-repository";
import { getSessionUser } from "@/server/session";

const handlers = createLayoutHandlers(layoutRepository, getSessionUser);

type Context = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: Context) {
  return handlers.get(request, (await params).id);
}

export async function PUT(request: Request, { params }: Context) {
  return handlers.update(request, (await params).id);
}

export async function DELETE(request: Request, { params }: Context) {
  return handlers.remove(request, (await params).id);
}
