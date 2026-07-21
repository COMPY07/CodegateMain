// Unreachable helper.

import { remove } from "../../../../lib/svc";

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  return new Response("early");
  await remove(params.id);
}
