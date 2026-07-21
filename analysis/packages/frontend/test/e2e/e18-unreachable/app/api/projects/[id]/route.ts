// E18 unreachable.
// Delete after return.

import { prisma } from "../../../../lib/db";
import { auth } from "../../../../lib/auth";

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth();
  if (!session) return new Response("unauth", { status: 401 });
  return new Response("early");
  await prisma.project.delete({ where: { id: params.id } });
}
