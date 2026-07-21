// E14 unsafe helper.
// Same name safe.

import { prisma } from "../../../../../../lib/db";
import { auth } from "../../../../../../lib/auth";

function remove(id: string) {
  return prisma.project.delete({ where: { id } });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth();
  await remove(params.id);
  return new Response("ok");
}
