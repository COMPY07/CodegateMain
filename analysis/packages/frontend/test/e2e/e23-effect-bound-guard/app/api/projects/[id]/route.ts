// Bound guard.
// Separate effect.

import { prisma } from "../../../../lib/db";
import { auth } from "../../../../lib/auth";

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth();
  await prisma.project.delete({ where: { id: params.id } });
  await prisma.auditLog.deleteMany({
    where: { id: params.id, tenantId: session.user.tenantId },
  });
  return new Response("ok");
}
