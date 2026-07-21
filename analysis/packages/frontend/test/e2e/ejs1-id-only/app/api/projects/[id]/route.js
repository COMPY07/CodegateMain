// JavaScript variant of the vulnerable id-only delete route.
import { prisma } from "../../../../lib/db.js";
import { auth } from "../../../../lib/auth.js";

export async function DELETE(_req, { params }) {
  const session = await auth();
  if (!session) return new Response("unauth", { status: 401 });

  await prisma.project.delete({
    where: { id: params.id },
  });
  return new Response("ok");
}
