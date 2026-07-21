// Extraction cache.
// Content keyed.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { ExternalPolicyIR, SemanticIR } from "@vibegate/contracts";
import { extractProgram } from "./extract.js";

// Frontend model version.
const MODEL_VERSION = "1";

// Cached entry.
interface Entry {
  readonly key: string;
  readonly ir: SemanticIR;
}

// In-process store.
const store = new Map<string, Entry>();

// Hash the inputs.
function cacheKey(
  files: readonly string[],
  policies: readonly ExternalPolicyIR[],
): string {
  const h = createHash("sha256");
  h.update(MODEL_VERSION);
  for (const f of [...files].sort()) {
    h.update(f);
    try {
      h.update(readFileSync(f));
    } catch {
      h.update("MISSING");
    }
  }
  h.update(JSON.stringify(policies));
  return h.digest("hex");
}

// Extract with cache.
export function extractCached(
  files: readonly string[],
  policies: readonly ExternalPolicyIR[],
  snapshot: string,
): SemanticIR {
  const key = cacheKey(files, policies);
  const hit = store.get(snapshot);
  if (hit && hit.key === key) return hit.ir;
  const ir = extractProgram(files, policies, snapshot);
  store.set(snapshot, { key, ir });
  return ir;
}

// Clear the cache.
export function clearCache(): void {
  store.clear();
}
