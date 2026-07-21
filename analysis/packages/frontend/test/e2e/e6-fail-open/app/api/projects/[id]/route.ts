// E6 fail-open.
// Guard swallowed.

import { prisma } from "../../../../lib/db";
import { auth } from "../../../../lib/auth";

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth();
  const project = { tenantId: "x" };

  try {
    if (project.tenantId !== session.user.tenantId) {
      throw new Error("forbidden");
    }
  } catch {
    // swallow
  }

  await prisma.project.delete({
    where: { id: params.id },
  });
  return new Response("ok");
}
