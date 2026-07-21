// CFG analysis.
// Computed downstream.

import type { BlockId, FunctionIR } from "@vibegate/contracts";

// Adjacency form.
export interface Cfg {
  readonly entry: BlockId;
  readonly nodes: readonly BlockId[];
  readonly succ: ReadonlyMap<BlockId, readonly BlockId[]>;
  readonly pred: ReadonlyMap<BlockId, readonly BlockId[]>;
}

// Build adjacency.
export function buildCfg(fn: FunctionIR): Cfg {
  const succ = new Map<BlockId, readonly BlockId[]>();
  const pred = new Map<BlockId, BlockId[]>();
  const nodes: BlockId[] = [];
  for (const b of fn.blocks) {
    nodes.push(b.id);
    succ.set(b.id, b.terminator.successors);
    if (!pred.has(b.id)) pred.set(b.id, []);
  }
  for (const b of fn.blocks) {
    for (const s of b.terminator.successors) {
      const list = pred.get(s) ?? [];
      list.push(b.id);
      pred.set(s, list);
    }
  }
  return { entry: fn.entryBlock, nodes, succ, pred };
}

// Iterative dominators.
export function dominators(cfg: Cfg): ReadonlyMap<BlockId, ReadonlySet<BlockId>> {
  const all = new Set(cfg.nodes);
  const dom = new Map<BlockId, Set<BlockId>>();
  for (const n of cfg.nodes) {
    dom.set(n, n === cfg.entry ? new Set([cfg.entry]) : new Set(all));
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of cfg.nodes) {
      if (n === cfg.entry) continue;
      const preds = cfg.pred.get(n) ?? [];
      let inter: Set<BlockId> | null = null;
      for (const p of preds) {
        const dp = dom.get(p);
        if (!dp) continue;
        if (inter === null) {
          inter = new Set(dp);
        } else {
          for (const x of [...inter]) if (!dp.has(x)) inter.delete(x);
        }
      }
      const next = inter ?? new Set<BlockId>();
      next.add(n);
      const cur = dom.get(n)!;
      if (next.size !== cur.size || [...next].some((x) => !cur.has(x))) {
        dom.set(n, next);
        changed = true;
      }
    }
  }
  return dom;
}

// Guard dominates effect.
export function dominates(
  dom: ReadonlyMap<BlockId, ReadonlySet<BlockId>>,
  guardBlock: BlockId,
  effectBlock: BlockId,
): boolean {
  return dom.get(effectBlock)?.has(guardBlock) ?? false;
}

// Entry-reachable blocks.
export function reachableBlocks(cfg: Cfg): ReadonlySet<BlockId> {
  const seen = new Set<BlockId>([cfg.entry]);
  const stack: BlockId[] = [cfg.entry];
  while (stack.length > 0) {
    const b = stack.pop()!;
    for (const s of cfg.succ.get(b) ?? []) {
      if (!seen.has(s)) {
        seen.add(s);
        stack.push(s);
      }
    }
  }
  return seen;
}
