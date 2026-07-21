#pragma once
#include <vector>

#include "redteam/Types.hpp"

// Verifies LLM probe verdicts against the real regions (drops out-of-range
// hallucinations, clamps confidence), aligns them with the heuristic findings,
// and merges the two sets. Deterministic location/evidence stays authoritative;
// the LLM is advisory on severity, confidence, rationale, and fix. Pure — the
// LLM JSON was already parsed into ProbeResponse at the adapter boundary.
namespace redteam {

std::vector<Finding> synthesize_findings(const std::vector<Probe>& probes,
                                         const std::vector<ProbeResponse>& responses,
                                         const std::vector<Region>& regions,
                                         std::vector<Finding> heuristic,
                                         int max_findings);

}  // namespace redteam
