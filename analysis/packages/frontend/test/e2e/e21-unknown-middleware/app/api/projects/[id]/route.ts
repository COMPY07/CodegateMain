// Unknown middleware.
// Search incomplete.

import { prisma } from "../../../../lib/db";

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  await prisma.project.delete({ where: { id: params.id } });
  return new Response("ok");
}
