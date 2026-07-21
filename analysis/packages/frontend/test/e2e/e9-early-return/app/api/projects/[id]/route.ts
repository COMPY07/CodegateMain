// E9 early return.
// CFG dominance.

import { prisma } from "../../../../lib/db";
import { auth } from "../../../../lib/auth";

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth();
  const project = { tenantId: "x" };

  if (project.tenantId !== session.user.tenantId) {
    return new Response("forbidden", { status: 403 });
  }

  await prisma.project.delete({
    where: { id: params.id },
  });
  return new Response("ok");
}
