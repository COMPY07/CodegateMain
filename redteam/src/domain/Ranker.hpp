#pragma once
#include <vector>

#include "redteam/Types.hpp"

// Selects the highest-risk regions to probe. Deterministic tie-break on
// (file, start_line, region_id) so output is byte-stable.
namespace redteam {

std::vector<RankedRegion> rank_regions(const std::vector<Region>& regions,
                                       const std::vector<RiskScore>& scored,
                                       int max_regions, double min_score);

}  // namespace redteam
