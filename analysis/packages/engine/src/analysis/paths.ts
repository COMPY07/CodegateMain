// Path enumeration.
// Interprocedural.

import type {
  EffectIR,
  EntrypointIR,
  FunctionIR,
  GuardIR,
  PathCoverage,
  Proof,
  SemanticIR,
  SymbolId,
  UnresolvedBoundary,
} from "@vibegate/contracts";
import { buildCfg, dominators, dominates } from "./cfg.js";
import { enumerateCallPaths } from "./callgraph.js";
import { valueRefEqual } from "./value-flow.js";
import type { EffectPath } from "./relation.js";

// Guard hold status.
export type GuardStatus = "HOLDS" | "FAILS" | "AMBIGUOUS";

// Guard actually holds.
// Param must trace.
export function guardStatus(ir: SemanticIR, guard: GuardIR): GuardStatus {
  if (guard.failOpen) return "FAILS";
  if (guard.boundParam === undefined) return "HOLDS";
  const claim = ir.principalSources[0]?.tenantClaim;
  if (!claim) return "FAILS";
  const callers = ir.callEdges.filter((e) => e.callee === guard.inFunction);
  if (callers.length === 0) return "FAILS";
  // Per-caller bound arg.
  let anyHold = false;
  let anyFail = false;
  for (const edge of callers) {
    const flow = edge.argFlows.find((a) => a.argIndex === guard.boundParam);
    if (flow !== undefined && valueRefEqual(flow.value, claim)) anyHold = true;
    else anyFail = true;
  }
  if (anyHold && anyFail) return "AMBIGUOUS";
  return anyHold ? "HOLDS" : "FAILS";
}

// Simple hold check.
function guardHolds(ir: SemanticIR, guard: GuardIR): boolean {
  return guardStatus(ir, guard) === "HOLDS";
}

// Enumeration result.
export interface PathEnumeration {
  readonly paths: readonly EffectPath[];
  readonly coverage: PathCoverage;
  readonly boundaries: readonly UnresolvedBoundary[];
}

// Requested entrypoint scope.
function scopedEntrypoints(
  ir: SemanticIR,
  proof: Proof,
): { entrypoints: readonly EntrypointIR[]; missing: boolean } {
  const wanted = proof.entrypoint.nodeId;
  const match = ir.entrypoints.find((e) => e.nodeId === wanted);
  if (match) return { entrypoints: [match], missing: false };
  // Absent: analyze none.
  return { entrypoints: [], missing: true };
}

// Target effects only.
function targetEffects(ir: SemanticIR, proof: Proof): readonly EffectIR[] {
  return ir.effects.filter(
    (e) =>
      e.effectKind === proof.targetEffect.kind &&
      e.resource === proof.targetEffect.resource,
  );
}

// Relation guards effect.
function relationOnFunctions(
  ir: SemanticIR,
  functions: readonly SymbolId[],
  effect: EffectIR,
): boolean {
  for (const fnId of functions) {
    const fn = ir.functions.find((f) => f.symbolId === fnId);
    if (!fn) continue;
    if (relationDominates(ir, fn, effect)) return true;
  }
  return false;
}

// Relation dominates effect.
function relationDominates(
  ir: SemanticIR,
  fn: FunctionIR,
  effect: EffectIR,
): boolean {
  if (fn.symbolId !== effect.inFunction) {
    return hasRelationGuard(ir, fn);
  }
  const cfg = buildCfg(fn);
  const dom = dominators(cfg);
  for (const guard of ir.guards) {
    if (guard.inFunction !== fn.symbolId) continue;
    if (guard.establishes !== "resource_relation") continue;
    if (guard.targetEffectId && guard.targetEffectId !== effect.nodeId) continue;
    if (!guardHolds(ir, guard)) continue;
    if (dominates(dom, guard.block, effect.block)) return true;
  }
  return false;
}

// Any relation guard.
function hasRelationGuard(ir: SemanticIR, fn: FunctionIR): boolean {
  return ir.guards.some(
    (g) =>
      g.inFunction === fn.symbolId &&
      g.establishes === "resource_relation" &&
      guardHolds(ir, g),
  );
}

// Enumerate effect paths.
export function enumeratePaths(ir: SemanticIR, proof: Proof): PathEnumeration {
  const effects = targetEffects(ir, proof);
  const paths: EffectPath[] = [];
  let unresolvedEdges = 0;
  let truncated = false;

  const scope = scopedEntrypoints(ir, proof);
  for (const entry of scope.entrypoints) {
    if (!entry.externallyReachable) continue;
    const result = enumerateCallPaths(ir, entry, effects);
    unresolvedEdges += result.unresolvedEdges;
    truncated = truncated || result.truncated;

    for (const cp of result.paths) {
      const relationOnPath = relationOnFunctions(ir, cp.functions, cp.effect);
      const siblingUnprotected = result.paths.some(
        (o) => o.effect !== cp.effect && o.effect.resource === cp.effect.resource,
      );
      paths.push({
        pathId: `${entry.nodeId}:${cp.effect.nodeId}`,
        effect: cp.effect,
        guardBlocks: [],
        relationOnPath,
        bypassesExtension: siblingUnprotected && !relationOnPath,
        functions: cp.functions,
        hasUnresolved: cp.hasUnresolved,
      });
    }
  }

  const anyUnresolved = unresolvedEdges > 0 || truncated || scope.missing;
  const coverage: PathCoverage = {
    status: anyUnresolved
      ? "PARTIAL"
      : effects.length > 0
        ? "COMPLETE"
        : "NOT_RUN",
    resolvedPaths: paths.length,
    unresolvedCallEdges: unresolvedEdges,
    truncated,
  };
  const boundaries: UnresolvedBoundary[] = scope.missing
    ? [
        {
          reason: "REQUESTED_ENTRYPOINT_NOT_FOUND",
          critical: true,
          evidence: [],
          rationale: `requested entrypoint ${proof.entrypoint.nodeId} absent`,
        },
      ]
    : [];
  return { paths, coverage, boundaries };
}
