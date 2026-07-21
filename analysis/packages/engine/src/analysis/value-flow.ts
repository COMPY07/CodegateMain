// Value flow.
// Ref resolution.

import type { ValueRef } from "@vibegate/contracts";

// Structural equality.
export function valueRefEqual(a: ValueRef, b: ValueRef): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "symbol" && b.kind === "symbol") {
    return a.symbolId === b.symbolId;
  }
  if (a.kind === "literal" && b.kind === "literal") {
    return a.value === b.value;
  }
  if (a.kind === "field" && b.kind === "field") {
    if (a.path.length !== b.path.length) return false;
    if (!a.path.every((p, i) => p === b.path[i])) return false;
    return valueRefEqual(a.base, b.base);
  }
  return false;
}

// Client resolvable.
export function clientResolved(client: ValueRef | undefined): boolean {
  if (!client) return false;
  return client.kind === "symbol";
}

// Same client instance.
export function sameClient(
  a: ValueRef | undefined,
  b: ValueRef | undefined,
): boolean {
  if (!a || !b) return false;
  return valueRefEqual(a, b);
}
