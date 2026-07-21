// EW1 webhook.
// No signature.

import { prisma } from "../../../lib/db";

export async function POST(req: Request) {
  const body = await req.json();
  await prisma.project.delete({ where: { id: body.id } });
  return new Response("ok");
}
