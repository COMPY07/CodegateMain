// Policy parity.
// Channel comparison.

import type {
  EntrypointIR,
  SecurityCompareOutput,
  SecurityProveInput,
  SemanticIR,
} from "@vibegate/contracts";
import { analyze } from "./prove.js";

// Engine version.
const ENGINE_VERSION = "0.1.0";

// Isolate one entrypoint.
function onlyEntrypoint(ir: SemanticIR, ep: EntrypointIR): SemanticIR {
  return {
    ...ir,
    entrypoints: ir.entrypoints.map((e) =>
      e === ep ? e : { ...e, externallyReachable: false },
    ),
  };
}

// Relation proof input.
function relationProof(
  snapshot: SemanticIR["snapshot"],
  resource: string,
  effectKind: string,
  entrypointId: string,
): SecurityProveInput {
  return {
    proof: {
      claim: "EXISTS_VIOLATING_PATH",
      template: "EFFECT_REQUIRES_RELATION",
      attacker: { principalType: "authenticated_user", constraints: [] },
      entrypoint: { nodeId: entrypointId },
      attackerControl: [],
      targetEffect: { kind: effectKind as never, resource },
      requiredInvariants: [{ kind: "RELATION_ESTABLISHED", predicate: "tenant" }],
      analysisScope: {
        buildProfile: "production",
        includeMiddleware: true,
        includeOrmExtensions: true,
        includeDatabasePolicies: true,
        maximumCallDepth: 12,
      },
    },
    snapshot: { root: ".", snapshotId: `${snapshot}` },
  };
}

// Compare channel policies.
export function compare(
  ir: SemanticIR,
  resource: string,
  effectKind: string,
): SecurityCompareOutput {
  const channels = ir.entrypoints
    .filter((e) => e.externallyReachable)
    .map((ep) => {
      const proof = relationProof(ir.snapshot, resource, effectKind, ep.nodeId);
      const isolated = onlyEntrypoint(ir, ep);
      const verdict = analyze(isolated, proof).result.verdict;
      return {
        channel: ep.kind,
        entrypoint: `${ep.nodeId}`,
        verdict,
      };
    });
  const distinct = new Set(channels.map((c) => c.verdict));
  return {
    resource,
    channels,
    parityHolds: distinct.size <= 1,
    engine: { name: "vibegate", version: ENGINE_VERSION },
  };
}
