// Fixture builder.
// Terse construction.

import type {
  BlockId,
  CallEdgeIR,
  EffectIR,
  ExternalPolicyIR,
  GuardIR,
  NodeId,
  SemanticIR,
  SnapshotId,
  SymbolId,
  ValueRef,
} from "@vibegate/contracts";

// Cast helpers.
export const sym = (s: string): SymbolId => s as SymbolId;
export const nid = (s: string): NodeId => s as NodeId;
export const blk = (s: string): BlockId => s as BlockId;

// Direct call edge.
export function callEdge(caller: string, callee: string): CallEdgeIR {
  return {
    caller: sym(caller),
    callee: sym(callee),
    resolution: "DIRECT",
    block: blk("b0"),
    argFlows: [],
    span: span("route.ts"),
  };
}

// Span factory.
export const span = (file: string) => ({ file, start: 0, end: 1 });

// Symbol ref.
export const ref = (s: string): ValueRef => ({ kind: "symbol", symbolId: sym(s) });

// Field ref.
export const field = (base: ValueRef, ...path: string[]): ValueRef => ({
  kind: "field",
  base,
  path,
});

// Single-block function.
export function fn(symbol: string): SemanticIR["functions"][number] {
  return {
    symbolId: sym(symbol),
    entryBlock: blk("b0"),
    blocks: [
      {
        id: blk("b0"),
        operations: [],
        terminator: { kind: "return", successors: [] },
      },
    ],
  };
}

// Delete effect.
export function deleteEffect(
  inFn: string,
  client?: ValueRef,
): EffectIR {
  return {
    nodeId: nid("effect_delete"),
    effectKind: "DB_DELETE",
    resource: "Project",
    selector: field(ref("params"), "id"),
    ...(client ? { clientSymbol: client } : {}),
    inFunction: sym(inFn),
    block: blk("b0"),
    span: span("route.ts"),
  };
}

// Tenant relation guard.
export function tenantGuard(inFn: string): GuardIR {
  return {
    nodeId: nid("guard_tenant"),
    predicate: {
      left: field(ref("project"), "tenantId"),
      op: "EQ",
      right: field(ref("session"), "user", "tenantId"),
      evidence: { span: span("route.ts"), note: "tenant check" },
    },
    inFunction: sym(inFn),
    block: blk("b0"),
    establishes: "resource_relation",
  };
}

// Prisma extension policy.
export function prismaExtension(
  facts: ExternalPolicyIR["prismaFacts"],
  client?: ValueRef,
): ExternalPolicyIR {
  return {
    kind: "PRISMA_EXTENSION",
    resource: "Project",
    status: "RESOLVED",
    ...(client ? { clientRef: client } : {}),
    ...(facts ? { prismaFacts: facts } : {}),
    evidence: { span: span("db.ts"), note: "extension" },
  };
}

// RLS policy.
export function rlsPolicy(
  status: ExternalPolicyIR["status"],
  facts?: ExternalPolicyIR["rlsFacts"],
): ExternalPolicyIR {
  return {
    kind: "DATABASE_RLS",
    resource: "Project",
    status,
    ...(facts ? { rlsFacts: facts } : {}),
    evidence: { span: span("migration.sql"), note: "rls" },
  };
}

// Assemble module.
export function ir(parts: {
  functions: SemanticIR["functions"];
  effects: SemanticIR["effects"];
  guards?: SemanticIR["guards"];
  policies?: SemanticIR["externalPolicies"];
  callEdges?: SemanticIR["callEdges"];
}): SemanticIR {
  return {
    schemaVersion: 1,
    snapshot: "snap" as SnapshotId,
    functions: parts.functions,
    entrypoints: [
      {
        nodeId: nid("ep_delete"),
        kind: "route_handler",
        method: "DELETE",
        path: "/api/projects/:id",
        handler: parts.effects[0]!.inFunction,
        externallyReachable: true,
        span: span("route.ts"),
      },
    ],
    effects: parts.effects,
    guards: parts.guards ?? [],
    principalSources: [
      {
        nodeId: nid("principal"),
        tenantClaim: field(ref("session"), "user", "tenantId"),
        span: span("auth.ts"),
      },
    ],
    resources: [{ name: "Project", tenantColumn: "tenantId" }],
    externalPolicies: parts.policies ?? [],
    callEdges: parts.callEdges ?? [],
    analyzedDefenses: [
      "prismaExtensions",
      "externalPolicies",
      "migrations",
      "wrappers",
      "middleware",
    ],
  };
}
