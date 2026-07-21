// Verdict rollup.
// Single implementation.

import type {
  AnalysisCoverage,
  CounterevidenceCoverage,
  DefenseProof,
  EvidencePath,
  EvidenceResult,
  PathProof,
  PropertyResult,
  UnresolvedBoundary,
} from "@vibegate/contracts";

// Defense search complete.
// Searched categories gate.
function counterevidenceComplete(c: CounterevidenceCoverage): boolean {
  return (
    c.middleware === "COMPLETE" &&
    c.prismaExtensions === "COMPLETE" &&
    c.externalPolicies === "COMPLETE"
  );
}

// Required properties proven.
function allPropertiesProven(path: PathProof): boolean {
  if (path.propertyResults.length === 0) return false;
  if (path.unresolved.some((b) => b.critical)) return false;
  return path.propertyResults.every((p) => p.status === "PROVEN");
}

// Some property unestablished.
function anyPropertyUnestablished(path: PathProof): boolean {
  return path.propertyResults.some((p) => p.status === "NOT_ESTABLISHED");
}

// Some property unknown.
function anyPropertyUnknown(path: PathProof): boolean {
  return path.propertyResults.some((p) => p.status === "UNKNOWN");
}

// Clean unprotected path.
// Fully interpreted.
function isCleanWitness(path: PathProof): boolean {
  return (
    path.entrypointReachable === "PROVEN" &&
    path.attackerControlsSelector === "PROVEN" &&
    path.effectReachable === "PROVEN" &&
    anyPropertyUnestablished(path) &&
    !anyPropertyUnknown(path) &&
    path.unresolved.length === 0
  );
}

// Path reaches effect.
function reachesEffect(path: PathProof): boolean {
  return (
    path.entrypointReachable === "PROVEN" &&
    path.effectReachable === "PROVEN"
  );
}

// Unestablished property labels.
function unestablishedLabels(path: PathProof): string[] {
  return path.propertyResults
    .filter((p) => p.status !== "PROVEN")
    .map((p) => propertyLabel(p));
}

// Property display label.
function propertyLabel(result: PropertyResult): string {
  return result.property.kind;
}

// Build witness path.
function toWitness(path: PathProof): EvidencePath {
  return {
    pathId: path.pathId,
    steps: path.sourcePath,
    unestablishedInvariants: unestablishedLabels(path),
  };
}

// Build candidate path.
function toCandidate(path: PathProof): EvidencePath {
  return {
    pathId: path.pathId,
    steps: path.sourcePath,
    unestablishedInvariants: unestablishedLabels(path),
  };
}

// Core decision.
// Exists vs forall.
export function rollupVerdict(
  paths: readonly PathProof[],
  coverage: AnalysisCoverage,
  extraBoundaries: readonly UnresolvedBoundary[] = [],
): EvidenceResult {
  const defenseComplete = counterevidenceComplete(coverage.counterevidence);
  const witness = defenseComplete ? paths.find(isCleanWitness) : undefined;

  // Exists clean witness.
  if (witness) {
    return {
      verdict: "SUPPORTED",
      witnessPath: toWitness(witness),
      coverage,
    };
  }

  // Complete and proven.
  const enumerationComplete = coverage.pathEnumeration.status === "COMPLETE";
  const reaching = paths.filter(reachesEffect);
  const allProven =
    reaching.length > 0 && reaching.every(allPropertiesProven);

  if (enumerationComplete && defenseComplete && allProven) {
    const blockingProofs: DefenseProof[] = [];
    for (const path of paths) {
      const blocking = path.defenses.find((d) => d.verdict === "BLOCKING");
      if (blocking) blockingProofs.push({ pathId: path.pathId, defense: blocking });
    }
    return { verdict: "REFUTED", blockingProofs, coverage };
  }

  // Neither proven.
  const candidatePaths = reaching.map(toCandidate);
  const unresolvedBoundaries = [
    ...paths.flatMap((p) => p.unresolved),
    ...extraBoundaries,
  ];
  return {
    verdict: "INCONCLUSIVE",
    ...(candidatePaths.length > 0 ? { candidatePaths } : {}),
    unresolvedBoundaries,
    coverage,
  };
}
