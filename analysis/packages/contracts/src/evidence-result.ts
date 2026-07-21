// Evidence result.
// Narrowed verdicts.

import type {
  CoverageStatus,
  EvidenceRef,
  ObligationStatus,
  PathId,
} from "./primitives.js";
import type {
  DefenseCandidate,
  UnresolvedBoundary,
} from "./external-policy.js";
import type { PropertyResult } from "./security-property.js";

// Final verdict.
export type Verdict = "SUPPORTED" | "REFUTED" | "INCONCLUSIVE";

// Per-path proof.
// All facts local.
export interface PathProof {
  readonly pathId: PathId;
  readonly entrypointReachable: ObligationStatus;
  readonly attackerControlsSelector: ObligationStatus;
  readonly effectReachable: ObligationStatus;
  readonly propertyResults: readonly PropertyResult[];
  readonly defenses: readonly DefenseCandidate[];
  readonly unresolved: readonly UnresolvedBoundary[];
  readonly sourcePath: readonly EvidenceRef[];
}

// Concrete evidence path.
export interface EvidencePath {
  readonly pathId: PathId;
  readonly steps: readonly EvidenceRef[];
  readonly unestablishedInvariants: readonly string[];
}

// Blocking defense proof.
export interface DefenseProof {
  readonly pathId: PathId;
  readonly defense: DefenseCandidate;
}

// Path enumeration coverage.
// Distinct from search.
export interface PathCoverage {
  readonly status: CoverageStatus;
  readonly resolvedPaths: number;
  readonly unresolvedCallEdges: number;
  readonly truncated: boolean;
}

// Defense search coverage.
export interface CounterevidenceCoverage {
  readonly middleware: CoverageStatus;
  readonly wrappers: CoverageStatus;
  readonly prismaExtensions: CoverageStatus;
  readonly migrations: CoverageStatus;
  readonly externalPolicies: CoverageStatus;
}

// Combined coverage.
export interface AnalysisCoverage {
  readonly pathEnumeration: PathCoverage;
  readonly counterevidence: CounterevidenceCoverage;
}

// Vulnerable proven.
export interface SupportedResult {
  readonly verdict: "SUPPORTED";
  readonly witnessPath: EvidencePath;
  readonly coverage: AnalysisCoverage;
}

// Fully protected.
export interface RefutedResult {
  readonly verdict: "REFUTED";
  readonly blockingProofs: readonly DefenseProof[];
  readonly coverage: AnalysisCoverage;
}

// Cannot conclude.
export interface InconclusiveResult {
  readonly verdict: "INCONCLUSIVE";
  readonly candidatePaths?: readonly EvidencePath[];
  readonly unresolvedBoundaries: readonly UnresolvedBoundary[];
  readonly coverage: AnalysisCoverage;
}

// Result union.
export type EvidenceResult =
  | SupportedResult
  | RefutedResult
  | InconclusiveResult;
