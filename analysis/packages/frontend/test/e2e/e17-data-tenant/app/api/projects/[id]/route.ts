// E17 data tenant.
// Not a defense.

import { prisma } from "../../../../lib/db";
import { auth } from "../../../../lib/auth";

export async function PATCH(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth();
  await prisma.project.update({
    where: { id: params.id },
    data: { tenantId: session.user.tenantId },
  });
  return new Response("ok");
}
