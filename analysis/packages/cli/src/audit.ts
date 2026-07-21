// Audit runner.
// Testable core.

import { resolve } from "node:path";
import { glob } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import type {
  ExternalPolicyIR,
  Proof,
  SecurityProveInput,
} from "@vibegate/contracts";
import { analyze, inventory } from "@vibegate/engine";
import { extractProgram } from "@vibegate/frontend";

// Read policy sidecar.
function readPolicies(root: string): readonly ExternalPolicyIR[] {
  const path = resolve(root, "vibegate.policies.json");
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, "utf8")) as ExternalPolicyIR[];
}

// Collect source files.
async function sources(root: string): Promise<string[]> {
  const out: string[] = [];
  for await (const entry of glob("**/*.{ts,tsx,js,jsx}", { cwd: root })) {
    if (/node_modules|\.d\.ts$/.test(entry)) continue;
    out.push(resolve(root, entry));
  }
  return out;
}

// Relation proof body.
function relationProof(resource: string, entrypointId: string): Proof {
  return {
    claim: "EXISTS_VIOLATING_PATH",
    template: "EFFECT_REQUIRES_RELATION",
    attacker: { principalType: "authenticated_user", constraints: [] },
    entrypoint: { nodeId: entrypointId },
    attackerControl: [],
    targetEffect: { kind: "DB_DELETE", resource },
    requiredInvariants: [{ kind: "RELATION_ESTABLISHED", predicate: "tenant" }],
    analysisScope: {
      buildProfile: "production",
      includeMiddleware: true,
      includeOrmExtensions: true,
      includeDatabasePolicies: true,
      maximumCallDepth: 12,
    },
  };
}

// Entrypoint for effect.
function entrypointFor(
  ir: ReturnType<typeof extractProgram>,
  inFunction: string,
): string {
  const direct = ir.entrypoints.find(
    (e) => e.externallyReachable && `${e.handler}` === inFunction,
  );
  if (direct) return `${direct.nodeId}`;
  const reachable = ir.entrypoints.find((e) => e.externallyReachable);
  return reachable ? `${reachable.nodeId}` : "";
}

// One audit result.
export interface AuditResult {
  readonly entrypoints: number;
  readonly effects: number;
  readonly findings: readonly { resource: string; verdict: string }[];
}

// Audit a repository.
export async function audit(root: string): Promise<AuditResult> {
  const files = await sources(root);
  const ir = extractProgram(files, readPolicies(root), "cli");
  const inv = inventory(ir);
  const deletes = inv.effects.filter((e) => e.effectKind === "DB_DELETE");
  const findings = deletes.map((effect) => {
    const entry = entrypointFor(ir, effect.inFunction);
    const input: SecurityProveInput = {
      proof: relationProof(effect.resource, entry),
      snapshot: { root, snapshotId: "cli" },
    };
    return {
      resource: effect.resource,
      verdict: analyze(ir, input).result.verdict,
    };
  });
  return {
    entrypoints: inv.entrypoints.length,
    effects: inv.effects.length,
    findings,
  };
}
