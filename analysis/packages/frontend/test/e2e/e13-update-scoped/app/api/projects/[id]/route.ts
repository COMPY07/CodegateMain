// E13 update scoped.
// Tenant in where.

import { prisma } from "../../../../lib/db";
import { auth } from "../../../../lib/auth";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth();
  if (!session) return new Response("unauth", { status: 401 });

  const body = await req.json();
  await prisma.project.updateMany({
    where: { id: params.id, tenantId: session.user.tenantId },
    data: { name: body.name },
  });
  return new Response("ok");
}
