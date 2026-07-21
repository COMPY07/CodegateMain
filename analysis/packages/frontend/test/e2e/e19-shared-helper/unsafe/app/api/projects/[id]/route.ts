// E19 unsafe caller.
// Body tenant given.

import { remove } from "../../../../../lib/svc";

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } },
) {
  const body = await req.json();
  await remove(params.id, body.tenantId);
  return new Response("ok");
}
