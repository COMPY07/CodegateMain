// E11 unresolved call.
// Guard maybe present.

import { prisma } from "../../../../lib/db";
import { checkAccess } from "../../../../lib/access";

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  checkAccess(params.id);
  await prisma.project.delete({
    where: { id: params.id },
  });
  return new Response("ok");
}
