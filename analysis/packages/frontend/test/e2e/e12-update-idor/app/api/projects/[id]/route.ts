// E12 update idor.
// No tenant scope.

import { prisma } from "../../../../lib/db";
import { auth } from "../../../../lib/auth";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth();
  if (!session) return new Response("unauth", { status: 401 });

  const body = await req.json();
  await prisma.project.update({
    where: { id: params.id },
    data: { name: body.name },
  });
  return new Response("ok");
}
