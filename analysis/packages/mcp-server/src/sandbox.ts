// Repository sandbox.
// Untrusted target.

import { resolve, relative, isAbsolute } from "node:path";

// Sandbox violation.
export class SandboxError extends Error {}

// Fixed root.
function pinnedRoot(): string | undefined {
  const root = process.env["VIBEGATE_ROOT"];
  return root ? resolve(root) : undefined;
}

// Confine to root.
export function confineRoot(requested: string): string {
  const pinned = pinnedRoot();
  // No pin.
  if (!pinned) return resolve(requested);
  const abs = resolve(pinned, requested);
  const rel = relative(pinned, abs);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new SandboxError("path escapes root");
  }
  return abs;
}
