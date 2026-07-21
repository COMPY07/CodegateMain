// E19 safe caller.
// Session tenant given.

import { remove } from "../../../../../lib/svc";
import { auth } from "../../../../../lib/auth";

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth();
  await remove(params.id, session.user.tenantId);
  return new Response("ok");
}
