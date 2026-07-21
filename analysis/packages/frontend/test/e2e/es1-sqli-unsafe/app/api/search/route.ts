// ES1 sqli.
// Tainted template.

import { prisma } from "../../../lib/db";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const sort = url.searchParams.get("sort");

  await prisma.$queryRawUnsafe(`SELECT * FROM users ORDER BY ${sort}`);
  return new Response("ok");
}
