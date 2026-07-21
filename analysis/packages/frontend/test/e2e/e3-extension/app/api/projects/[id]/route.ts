// E3 protected.
// Scoped client.

import { scopedClient } from "../../../../lib/db-scoped";
import { auth } from "../../../../lib/auth";

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth();
  if (!session) return new Response("unauth", { status: 401 });

  await scopedClient.project.delete({
    where: { id: params.id },
  });
  return new Response("ok");
}
