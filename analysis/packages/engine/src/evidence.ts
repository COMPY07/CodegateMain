// Evidence expansion.
// Path detail.

import type {
  EvidencePath,
  EvidenceResult,
  PathEvidence,
  SecurityEvidenceOutput,
} from "@vibegate/contracts";

// Engine version.
const ENGINE_VERSION = "0.1.0";

// Expand one path.
function expandPath(path: EvidencePath): PathEvidence {
  return {
    pathId: `${path.pathId}`,
    steps: path.steps.map((s) => ({
      file: s.span.file,
      start: s.span.start,
      end: s.span.end,
      note: s.note,
    })),
    unestablished: path.unestablishedInvariants,
  };
}

// Expand a verdict.
export function expandEvidence(
  result: EvidenceResult,
): SecurityEvidenceOutput {
  const witnessPaths: PathEvidence[] = [];
  const candidatePaths: PathEvidence[] = [];
  const checkedDefenses: string[] = [];
  const unresolvedBoundaries: string[] = [];

  if (result.verdict === "SUPPORTED") {
    witnessPaths.push(expandPath(result.witnessPath));
  } else if (result.verdict === "REFUTED") {
    for (const p of result.blockingProofs) {
      checkedDefenses.push(p.defense.kind);
    }
  } else {
    for (const p of result.candidatePaths ?? []) {
      candidatePaths.push(expandPath(p));
    }
    for (const b of result.unresolvedBoundaries) {
      unresolvedBoundaries.push(b.reason);
    }
  }

  return {
    verdict: result.verdict,
    witnessPaths,
    candidatePaths,
    checkedDefenses,
    unresolvedBoundaries,
    engine: { name: "vibegate", version: ENGINE_VERSION },
  };
}
