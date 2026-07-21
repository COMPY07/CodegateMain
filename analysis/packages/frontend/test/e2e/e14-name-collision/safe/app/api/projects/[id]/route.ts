// E14 safe helper.
// Same name unsafe.

import { prisma } from "../../../../../../lib/db";
import { auth } from "../../../../../../lib/auth";

async function remove(id: string) {
  const session = await auth();
  return prisma.project.deleteMany({
    where: { id, tenantId: session.user.tenantId },
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  await remove(params.id);
  return new Response("ok");
}
