// ER2 safe redirect.
// Allowlisted only.

import { redirect } from "next/navigation";

const ALLOW = ["/home", "/dashboard"];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const next = url.searchParams.get("next") ?? "/";

  const safe = ALLOW.includes(next) ? next : "/home";
  redirect(safe);
}
