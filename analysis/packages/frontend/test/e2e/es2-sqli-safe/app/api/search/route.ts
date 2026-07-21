// ES2 parameterized.
// Tagged template.

import { prisma } from "../../../lib/db";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const sort = url.searchParams.get("sort");

  await prisma.$queryRaw`SELECT * FROM users WHERE name = ${sort}`;
  return new Response("ok");
}
