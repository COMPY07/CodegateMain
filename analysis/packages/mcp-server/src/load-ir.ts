// IR loader.
// Frontend bridge.

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { glob } from "node:fs/promises";
import type {
  ExternalPolicyIR,
  SecurityProveInput,
  SemanticIR,
} from "@vibegate/contracts";
import { extractProgram } from "@vibegate/frontend";
import { confineRoot } from "./sandbox.js";

// Read policy sidecar.
function readPolicies(root: string): readonly ExternalPolicyIR[] {
  const path = resolve(root, "vibegate.policies.json");
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, "utf8")) as ExternalPolicyIR[];
}

// Collect source files.
async function sourceFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  for await (const entry of glob("**/*.{ts,tsx,js,jsx}", { cwd: root })) {
    if (/node_modules|\.d\.ts$/.test(entry)) continue;
    out.push(resolve(root, entry));
  }
  return out;
}

// Load from root.
export async function loadIrFrom(
  root: string,
  snapshotId: string,
): Promise<SemanticIR> {
  const safeRoot = confineRoot(root);
  const files = await sourceFiles(safeRoot);
  const policies = readPolicies(safeRoot);
  return extractProgram(files, policies, snapshotId);
}

// Load snapshot IR.
export async function loadIr(input: SecurityProveInput): Promise<SemanticIR> {
  return loadIrFrom(input.snapshot.root, input.snapshot.snapshotId);
}
