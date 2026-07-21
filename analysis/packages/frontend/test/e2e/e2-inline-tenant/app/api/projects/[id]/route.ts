// E2 protected.
// Inline tenant.

import { prisma } from "../../../../lib/db";
import { auth } from "../../../../lib/auth";

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth();
  if (!session) return new Response("unauth", { status: 401 });

  await prisma.project.deleteMany({
    where: { id: params.id, tenantId: session.user.tenantId },
  });
  return new Response("ok");
}
