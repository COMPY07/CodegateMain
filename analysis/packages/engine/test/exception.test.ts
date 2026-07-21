// Exception fail-closed.
// Swallowed guard.

import { describe, it, expect } from "vitest";
import type {
  GuardIR,
  SecurityProveInput,
  SemanticIR,
  SnapshotId,
} from "@vibegate/contracts";
import { analyze } from "../src/index.js";
import { blk, deleteEffect, fn, nid, span, sym } from "./ir-builder.js";

// Delete with guard.
function guardedModule(failOpen: boolean): SemanticIR {
  const guard: GuardIR = {
    nodeId: nid("guard_auth"),
    predicate: {
      left: { kind: "field", base: { kind: "symbol", symbolId: sym("session") }, path: ["user"] },
      op: "NEQ",
      right: { kind: "literal", value: null },
      evidence: { span: span("route.ts"), note: "auth check" },
    },
    inFunction: sym("del"),
    block: blk("b0"),
    establishes: "authentication",
    failOpen,
  };
  return {
    schemaVersion: 1,
    snapshot: "snap" as SnapshotId,
    functions: [fn("del")],
    entrypoints: [
      {
        nodeId: nid("ep"),
        kind: "route_handler",
        method: "DELETE",
        path: "/api/projects/:id",
        handler: sym("del"),
        externallyReachable: true,
        span: span("route.ts"),
      },
    ],
    effects: [deleteEffect("del")],
    guards: [guard],
    principalSources: [],
    resources: [{ name: "Project", tenantColumn: "tenantId" }],
    externalPolicies: [],
    callEdges: [],
    analyzedDefenses: ["prismaExtensions","externalPolicies","migrations","wrappers","middleware"],
  };
}

// Fail-closed proof.
function proof(): SecurityProveInput {
  return {
    proof: {
      claim: "EXISTS_VIOLATING_PATH",
      template: "EXCEPTION_FAILS_CLOSED",
      attacker: { principalType: "anonymous", constraints: [] },
      entrypoint: { nodeId: "ep" },
      attackerControl: [],
      targetEffect: { kind: "DB_DELETE", resource: "Project" },
      requiredInvariants: [],
      analysisScope: {
        buildProfile: "production",
        includeMiddleware: true,
        includeOrmExtensions: true,
        includeDatabasePolicies: true,
        maximumCallDepth: 12,
      },
    },
    snapshot: { root: ".", snapshotId: "snap" },
  };
}

describe("exception fails closed", () => {
  // Guard swallowed.
  it("fail-open auth guard => SUPPORTED", () => {
    expect(analyze(guardedModule(true), proof()).result.verdict).toBe(
      "SUPPORTED",
    );
  });

  // Guard enforced.
  it("enforced auth guard => REFUTED", () => {
    expect(analyze(guardedModule(false), proof()).result.verdict).toBe(
      "REFUTED",
    );
  });
});
