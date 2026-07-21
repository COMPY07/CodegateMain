// ER1 open redirect.
// Tainted destination.

import { redirect } from "next/navigation";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const next = url.searchParams.get("next") ?? "/";

  redirect(next);
}
