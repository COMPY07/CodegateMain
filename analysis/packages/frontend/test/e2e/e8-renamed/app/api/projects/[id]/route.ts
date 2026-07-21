// E8 renamed.
// Same as E1.

import { prisma as db } from "../../../../lib/db";
import { auth as authenticate } from "../../../../lib/auth";

export async function DELETE(
  _request: Request,
  { params: routeParams }: { params: { id: string } },
) {
  const currentSession = await authenticate();
  if (!currentSession) return new Response("unauth", { status: 401 });

  const extraFlag = routeParams.id.length > 0;
  if (extraFlag) {
    await db.project.delete({
      where: { id: routeParams.id },
    });
  }
  return new Response("ok");
}
