// Symbol minting.
// Frontend only.

import { createHash } from "node:crypto";
import type { SymbolId, NodeId, BlockId } from "@vibegate/contracts";

// Deterministic digest.
function digest(parts: readonly string[]): string {
  return createHash("sha1").update(parts.join("\\0")).digest("hex").slice(0, 16);
}

// Mint symbol id.
export function mintSymbolId(
  file: string,
  qualifiedName: string,
  start: number,
): SymbolId {
  return `sym_${digest([file, qualifiedName, String(start)])}` as SymbolId;
}

// Mint node id.
export function mintNodeId(kind: string, file: string, start: number): NodeId {
  return `${kind}_${digest([file, String(start)])}` as NodeId;
}

// Mint block id.
export function mintBlockId(fn: string, index: number): BlockId {
  return `blk_${digest([fn, String(index)])}` as BlockId;
}
