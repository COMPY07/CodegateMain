// E1 vulnerable.
// Id-only delete.

import { prisma } from "../../../../lib/db";
import { auth } from "../../../../lib/auth";

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth();
  if (!session) return new Response("unauth", { status: 401 });

  await prisma.project.delete({
    where: { id: params.id },
  });
  return new Response("ok");
}
