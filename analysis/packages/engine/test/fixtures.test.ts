// Contract fixtures.
// Verdict assertions.

import { describe, it, expect } from "vitest";
import type {
  SecurityProveInput,
  SemanticIR,
  Verdict,
} from "@vibegate/contracts";
import { analyze } from "../src/index.js";
import {
  callEdge,
  deleteEffect,
  field,
  fn,
  ir,
  prismaExtension,
  ref,
  rlsPolicy,
  tenantGuard,
} from "./ir-builder.js";

// Standard proof.
function proof(): SecurityProveInput {
  return {
    proof: {
      claim: "EXISTS_VIOLATING_PATH",
      template: "EFFECT_REQUIRES_RELATION",
      attacker: { principalType: "authenticated_user", constraints: [] },
      entrypoint: { nodeId: "ep_delete" },
      attackerControl: [
        {
          value: field(ref("params"), "id"),
          semanticRole: "resource_identifier",
        },
      ],
      targetEffect: { kind: "DB_DELETE", resource: "Project" },
      requiredInvariants: [
        { kind: "RELATION_ESTABLISHED", predicate: "same tenant" },
      ],
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

// Run one fixture.
function verdictOf(semantic: SemanticIR): Verdict {
  return analyze(semantic, proof()).result.verdict;
}

// Four blocking facts.
const allFour = {
  exactClientUsed: true,
  appliesToTargetEffect: true,
  addsRequiredRelation: true,
  noBypassingPath: true,
};

describe("contract fixtures", () => {
  // F1 vulnerable.
  it("F1 id-only delete => SUPPORTED", () => {
    const m = ir({ functions: [fn("del")], effects: [deleteEffect("del")] });
    expect(verdictOf(m)).toBe("SUPPORTED");
  });

  // F2 inline scope.
  it("F2 inline tenant relation => REFUTED", () => {
    const m = ir({
      functions: [fn("del")],
      effects: [deleteEffect("del")],
      guards: [tenantGuard("del")],
    });
    expect(verdictOf(m)).toBe("REFUTED");
  });

  // F3 exact extension.
  it("F3 exact-client extension => REFUTED", () => {
    const client = ref("scopedClient");
    const m = ir({
      functions: [fn("del")],
      effects: [deleteEffect("del", client)],
      policies: [
        prismaExtension(allFour, client),
      ],
    });
    expect(verdictOf(m)).toBe("REFUTED");
  });

  // F4 rls unavailable.
  it("F4 RLS declared-but-unavailable => INCONCLUSIVE", () => {
    const m = ir({
      functions: [fn("del")],
      effects: [deleteEffect("del")],
      policies: [rlsPolicy("DECLARED_BUT_UNAVAILABLE")],
    });
    expect(verdictOf(m)).toBe("INCONCLUSIVE");
  });

  // F5 different client.
  it("F5 extension but different client => SUPPORTED", () => {
    const m = ir({
      functions: [fn("del")],
      effects: [deleteEffect("del", ref("baseClient"))],
      policies: [
        prismaExtension({ ...allFour, exactClientUsed: false },
          ref("scopedClient"),
        ),
      ],
    });
    expect(verdictOf(m)).toBe("SUPPORTED");
  });

  // F6 read not delete.
  it("F6 extension applies to read not delete => SUPPORTED", () => {
    const client = ref("scopedClient");
    const m = ir({
      functions: [fn("del")],
      effects: [deleteEffect("del", client)],
      policies: [
        prismaExtension({ ...allFour, appliesToTargetEffect: false },
          client,
        ),
      ],
    });
    expect(verdictOf(m)).toBe("SUPPORTED");
  });

  // F7 bypass path.
  it("F7 two delete paths, one bypasses => SUPPORTED", () => {
    const client = ref("scopedClient");
    const protectedEffect = deleteEffect("del", client);
    const bypassEffect = {
      ...deleteEffect("del2", ref("baseClient")),
      nodeId: "effect_delete_bypass" as typeof protectedEffect.nodeId,
    };
    const m = ir({
      functions: [fn("del"), fn("del2")],
      effects: [protectedEffect, bypassEffect],
      policies: [
        prismaExtension(allFour, client),
      ],
      callEdges: [callEdge("del", "del2")],
    });
    expect(verdictOf(m)).toBe("SUPPORTED");
  });

  // F8 unresolved client.
  it("F8 unresolved prisma client => INCONCLUSIVE", () => {
    const dynamicClient = field(ref("registry"), "get");
    const m = ir({
      functions: [fn("del")],
      effects: [deleteEffect("del", dynamicClient)],
    });
    expect(verdictOf(m)).toBe("INCONCLUSIVE");
  });

  // F9 rls blocks.
  it("F9 RLS with full facts => REFUTED", () => {
    const m = ir({
      functions: [fn("del")],
      effects: [deleteEffect("del")],
      policies: [
        rlsPolicy("RESOLVED", {
          tableMatches: true,
          tenantPredicatePresent: true,
          forceApplied: true,
          noBypassingPath: true,
        }),
      ],
    });
    expect(verdictOf(m)).toBe("REFUTED");
  });

  // F10 rls unproven.
  it("F10 RLS resolved without facts => SUPPORTED", () => {
    const m = ir({
      functions: [fn("del")],
      effects: [deleteEffect("del")],
      policies: [rlsPolicy("RESOLVED")],
    });
    expect(verdictOf(m)).toBe("SUPPORTED");
  });
});
