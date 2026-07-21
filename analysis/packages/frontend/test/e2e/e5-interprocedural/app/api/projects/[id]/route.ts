// E5 interprocedural.
// Route to service.

import { deleteProject } from "../../../../lib/project-service";
import { auth } from "../../../../lib/auth";

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth();
  if (!session) return new Response("unauth", { status: 401 });

  await deleteProject(params.id);
  return new Response("ok");
}
