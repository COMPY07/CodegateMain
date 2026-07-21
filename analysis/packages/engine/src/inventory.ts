// Inventory analysis.
// Attack surface.

import type {
  SecurityIndexOutput,
  SecurityInventoryOutput,
  SemanticIR,
} from "@vibegate/contracts";

// Engine version.
const ENGINE_VERSION = "0.1.0";

// List attack surface.
export function inventory(ir: SemanticIR): SecurityInventoryOutput {
  const unresolved = ir.callEdges.filter(
    (e) => e.resolution === "UNRESOLVED" || !e.callee,
  ).length;
  return {
    entrypoints: ir.entrypoints
      .filter((e) => e.externallyReachable)
      .map((e) => ({
        nodeId: `${e.nodeId}`,
        kind: e.kind,
        ...(e.method ? { method: e.method } : {}),
        ...(e.path ? { path: e.path } : {}),
      })),
    effects: ir.effects.map((e) => ({
      nodeId: `${e.nodeId}`,
      effectKind: e.effectKind,
      resource: e.resource,
      inFunction: `${e.inFunction}`,
    })),
    resources: ir.resources.map((r) => r.name),
    unresolvedCallEdges: unresolved,
    engine: { name: "vibegate", version: ENGINE_VERSION },
  };
}

// Index summary.
export function index(ir: SemanticIR): SecurityIndexOutput {
  return {
    snapshotId: `${ir.snapshot}`,
    functionCount: ir.functions.length,
    entrypointCount: ir.entrypoints.length,
    effectCount: ir.effects.length,
    engine: { name: "vibegate", version: ENGINE_VERSION },
  };
}
