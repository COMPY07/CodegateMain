// Unknown extension.
// Search incomplete.

import { prisma } from "../../../../lib/db";

const extensionMarker = prisma.$extends({});
void extensionMarker;

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  await prisma.project.delete({ where: { id: params.id } });
  return new Response("ok");
}
