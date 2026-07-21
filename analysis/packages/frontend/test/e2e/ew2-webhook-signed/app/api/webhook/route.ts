// EW2 webhook.
// Signature checked.

import { prisma } from "../../../lib/db";
import { createHmac } from "node:crypto";

function verifySignature(body: string, sig: string | null): boolean {
  const expected = createHmac("sha256", "secret").update(body).digest("hex");
  return sig === expected;
}

export async function POST(req: Request) {
  const raw = await req.text();
  const sig = req.headers.get("x-signature");
  if (!verifySignature(raw, sig)) {
    return new Response("bad sig", { status: 401 });
  }
  const body = JSON.parse(raw);
  await prisma.project.delete({ where: { id: body.id } });
  return new Response("ok");
}
