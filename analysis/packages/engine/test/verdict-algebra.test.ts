// Verdict algebra.
// Invariant tests.

import { describe, it, expect } from "vitest";
import type {
  AnalysisCoverage,
  CoverageStatus,
  DefenseCandidate,
  PathProof,
  PropertyResult,
  UnresolvedBoundary,
} from "@vibegate/contracts";
import { rollupVerdict } from "../src/verdict.js";

// Same-tenant property.
function prop(status: PropertyResult["status"]): PropertyResult {
  return {
    property: { kind: "SAME_TENANT" },
    status,
    evidence: [],
  };
}

// Reachable path base.
function path(over: Partial<PathProof> = {}): PathProof {
  return {
    pathId: "p" as PathProof["pathId"],
    entrypointReachable: "PROVEN",
    attackerControlsSelector: "PROVEN",
    effectReachable: "PROVEN",
    propertyResults: [prop("NOT_ESTABLISHED")],
    defenses: [],
    unresolved: [],
    sourcePath: [],
    ...over,
  };
}

// Coverage helper.
function cov(status: CoverageStatus): AnalysisCoverage {
  return {
    pathEnumeration: {
      status,
      resolvedPaths: 1,
      unresolvedCallEdges: status === "COMPLETE" ? 0 : 1,
      truncated: false,
    },
    counterevidence: {
      middleware: "COMPLETE",
      wrappers: "COMPLETE",
      prismaExtensions: "COMPLETE",
      migrations: "COMPLETE",
      externalPolicies: "COMPLETE",
    },
  };
}

// Nonblocking defense.
const nonBlocking: DefenseCandidate = {
  kind: "EXTERNAL_POLICY",
  verdict: "NON_BLOCKING",
  evidence: [],
  rationale: "not applicable",
};

// Critical unknown.
const criticalUnknown: UnresolvedBoundary = {
  reason: "UNRESOLVED_CALL_EDGE",
  critical: true,
  evidence: [],
  rationale: "unresolved",
};

describe("verdict algebra", () => {
  // Witness yields supported.
  it("clean witness => SUPPORTED", () => {
    expect(rollupVerdict([path()], cov("COMPLETE")).verdict).toBe("SUPPORTED");
  });

  // Nonblocking keeps supported.
  it("nonblocking defense does not flip SUPPORTED", () => {
    const p = path({ defenses: [nonBlocking] });
    expect(rollupVerdict([p], cov("COMPLETE")).verdict).toBe("SUPPORTED");
  });

  // Search incomplete.
  it("incomplete defense search blocks SUPPORTED", () => {
    const coverage = cov("COMPLETE");
    const incomplete: AnalysisCoverage = {
      ...coverage,
      counterevidence: {
        ...coverage.counterevidence,
        prismaExtensions: "NOT_RUN",
      },
    };
    expect(rollupVerdict([path()], incomplete).verdict).toBe("INCONCLUSIVE");
  });

  // All proven refutes.
  it("all properties PROVEN + COMPLETE => REFUTED", () => {
    const p = path({ propertyResults: [prop("PROVEN")] });
    expect(rollupVerdict([p], cov("COMPLETE")).verdict).toBe("REFUTED");
  });

  // Partial forbids refuted.
  it("PARTIAL coverage never REFUTED", () => {
    const p = path({ propertyResults: [prop("PROVEN")] });
    expect(rollupVerdict([p], cov("PARTIAL")).verdict).not.toBe("REFUTED");
  });

  // Unknown blocks refuted.
  it("critical unknown => not REFUTED", () => {
    const p = path({
      propertyResults: [prop("PROVEN")],
      unresolved: [criticalUnknown],
    });
    expect(rollupVerdict([p], cov("COMPLETE")).verdict).not.toBe("REFUTED");
  });

  // Witness survives unknown.
  it("clean witness survives unrelated unknown path", () => {
    const w = path();
    const unknownPath = path({
      pathId: "q" as PathProof["pathId"],
      propertyResults: [prop("UNKNOWN")],
      unresolved: [criticalUnknown],
    });
    expect(rollupVerdict([w, unknownPath], cov("COMPLETE")).verdict).toBe(
      "SUPPORTED",
    );
  });

  // No paths inconclusive.
  it("no paths => INCONCLUSIVE", () => {
    expect(rollupVerdict([], cov("NOT_RUN")).verdict).toBe("INCONCLUSIVE");
  });

  // Property unknown inconclusive.
  it("single unknown property => INCONCLUSIVE", () => {
    const p = path({ propertyResults: [prop("UNKNOWN")] });
    expect(rollupVerdict([p], cov("COMPLETE")).verdict).toBe("INCONCLUSIVE");
  });
});
