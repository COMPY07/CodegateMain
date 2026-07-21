// Entrypoint scope.
// Proof honored.

import { describe, it, expect } from "vitest";
import type {
  SecurityProveInput,
  SemanticIR,
  SnapshotId,
} from "@vibegate/contracts";
import { analyze } from "../src/index.js";
import { blk, deleteEffect, fn, nid, span, sym, tenantGuard } from "./ir-builder.js";

// Guarded delete module.
function guardedModule(): SemanticIR {
  return {
    schemaVersion: 1,
    snapshot: "snap" as SnapshotId,
    functions: [fn("del")],
    entrypoints: [
      {
        nodeId: nid("ep_real"),
        kind: "route_handler",
        method: "DELETE",
        path: "/api/projects/:id",
        handler: sym("del"),
        externallyReachable: true,
        span: span("route.ts"),
      },
    ],
    effects: [deleteEffect("del")],
    guards: [tenantGuard("del")],
    principalSources: [
      {
        nodeId: nid("principal"),
        tenantClaim: {
          kind: "field",
          base: { kind: "symbol", symbolId: sym("session") },
          path: ["user", "tenantId"],
        },
        span: span("auth.ts"),
      },
    ],
    resources: [{ name: "Project", tenantColumn: "tenantId" }],
    externalPolicies: [],
    callEdges: [],
    analyzedDefenses: [
      "prismaExtensions",
      "externalPolicies",
      "migrations",
      "wrappers",
      "middleware",
    ],
  };
}

// Proof at entrypoint.
function proofAt(nodeId: string): SecurityProveInput {
  return {
    proof: {
      claim: "EXISTS_VIOLATING_PATH",
      template: "EFFECT_REQUIRES_RELATION",
      attacker: { principalType: "authenticated_user", constraints: [] },
      entrypoint: { nodeId },
      attackerControl: [],
      targetEffect: { kind: "DB_DELETE", resource: "Project" },
      requiredInvariants: [{ kind: "RELATION_ESTABLISHED", predicate: "t" }],
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

describe("entrypoint scope", () => {
  // Existing entrypoint proves.
  it("requested entrypoint present => REFUTED", () => {
    const out = analyze(guardedModule(), proofAt("ep_real")).result;
    expect(out.verdict).toBe("REFUTED");
    expect(out.coverage.pathEnumeration.status).toBe("COMPLETE");
  });

  // Absent entrypoint downgrades.
  it("requested entrypoint absent => INCONCLUSIVE partial", () => {
    const out = analyze(guardedModule(), proofAt("ep_absent")).result;
    expect(out.verdict).toBe("INCONCLUSIVE");
    expect(out.coverage.pathEnumeration.status).toBe("PARTIAL");
    if (out.verdict === "INCONCLUSIVE") {
      const reasons = out.unresolvedBoundaries.map((b) => b.reason);
      expect(reasons).toContain("REQUESTED_ENTRYPOINT_NOT_FOUND");
    }
  });
});
