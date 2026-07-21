// E16 forged tenant.
// Attacker body tenant.

import { removeScoped } from "../../../../lib/svc";

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } },
) {
  const body = await req.json();
  await removeScoped(params.id, body.tenantId);
  return new Response("ok");
}
