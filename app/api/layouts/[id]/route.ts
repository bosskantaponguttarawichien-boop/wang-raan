import { createLayoutHandlers } from "@/server/layout-handlers";
import { layoutRepository } from "@/server/layout-repository";

const handlers = createLayoutHandlers(layoutRepository);

type Context = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: Context) {
  return handlers.get((await params).id);
}

export async function PUT(request: Request, { params }: Context) {
  return handlers.update(request, (await params).id);
}

export async function DELETE(_request: Request, { params }: Context) {
  return handlers.remove((await params).id);
}
