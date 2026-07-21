// E15 passthrough safe.
// Session tenant passed.

import { removeScoped } from "../../../../lib/svc";
import { auth } from "../../../../lib/auth";

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth();
  await removeScoped(params.id, session.user.tenantId);
  return new Response("ok");
}
