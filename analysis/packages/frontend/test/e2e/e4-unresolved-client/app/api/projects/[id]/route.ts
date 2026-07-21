// E4 unresolved.
// Dynamic client.

import { registry } from "../../../../lib/registry";
import { auth } from "../../../../lib/auth";

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth();
  if (!session) return new Response("unauth", { status: 401 });

  const client = registry.get(params.id);
  await client.project.delete({
    where: { id: params.id },
  });
  return new Response("ok");
}
