// Call graph.
// Interprocedural walk.

import type {
  BlockId,
  CallEdgeIR,
  EffectIR,
  EntrypointIR,
  FunctionIR,
  SemanticIR,
  SymbolId,
} from "@vibegate/contracts";
import { buildCfg, reachableBlocks } from "./cfg.js";

// Max walk depth.
const MAX_DEPTH = 12;

// One traced path.
export interface CallPath {
  readonly entry: EntrypointIR;
  readonly functions: readonly SymbolId[];
  readonly effect: EffectIR;
  readonly hasUnresolved: boolean;
}

// Enumeration outcome.
export interface CallPathResult {
  readonly paths: readonly CallPath[];
  readonly unresolvedEdges: number;
  readonly truncated: boolean;
}

// Edges by caller.
function indexEdges(
  ir: SemanticIR,
): ReadonlyMap<SymbolId, readonly CallEdgeIR[]> {
  const map = new Map<SymbolId, CallEdgeIR[]>();
  for (const edge of ir.callEdges) {
    const list = map.get(edge.caller) ?? [];
    list.push(edge);
    map.set(edge.caller, list);
  }
  return map;
}

// Effects by function.
function indexEffects(
  effects: readonly EffectIR[],
): ReadonlyMap<SymbolId, readonly EffectIR[]> {
  const map = new Map<SymbolId, EffectIR[]>();
  for (const e of effects) {
    const list = map.get(e.inFunction) ?? [];
    list.push(e);
    map.set(e.inFunction, list);
  }
  return map;
}

// Walk to effects.
export function enumerateCallPaths(
  ir: SemanticIR,
  entry: EntrypointIR,
  targets: readonly EffectIR[],
): CallPathResult {
  const edgesByCaller = indexEdges(ir);
  const effectsByFn = indexEffects(targets);
  const fnById = new Map(ir.functions.map((f) => [f.symbolId, f]));
  const reachCache = new Map<SymbolId, ReadonlySet<BlockId>>();
  const paths: CallPath[] = [];
  let unresolvedEdges = 0;
  let truncated = false;

  // Reachable blocks of.
  const reachOf = (fn: FunctionIR): ReadonlySet<BlockId> => {
    let set = reachCache.get(fn.symbolId);
    if (!set) {
      set = reachableBlocks(buildCfg(fn));
      reachCache.set(fn.symbolId, set);
    }
    return set;
  };

  // DFS with visited.
  const walk = (
    fn: SymbolId,
    stack: readonly SymbolId[],
    sawUnresolved: boolean,
  ): void => {
    if (stack.length > MAX_DEPTH) {
      truncated = true;
      return;
    }
    const fnIr = fnById.get(fn);
    const reachable = fnIr ? reachOf(fnIr) : undefined;
    // Reachable calls.
    const edges = (edgesByCaller.get(fn) ?? []).filter(
      (edge) => reachable === undefined || reachable.has(edge.block),
    );
    const localUnresolved = edges.some(
      (e) => e.resolution === "UNRESOLVED" || !e.callee,
    );
    const taint = sawUnresolved || localUnresolved;
    // Collect local effects.
    for (const effect of effectsByFn.get(fn) ?? []) {
      // Skip unreachable effect.
      if (fnIr && !reachOf(fnIr).has(effect.block)) continue;
      paths.push({
        entry,
        functions: [...stack, fn],
        effect,
        hasUnresolved: taint,
      });
    }
    // Follow call edges.
    for (const edge of edges) {
      if (edge.resolution === "UNRESOLVED" || !edge.callee) {
        unresolvedEdges += 1;
        continue;
      }
      if (stack.includes(edge.callee)) continue;
      walk(edge.callee, [...stack, fn], taint);
    }
  };

  walk(entry.handler, [], false);
  return { paths, unresolvedEdges, truncated };
}
