#pragma once
#include <vector>

#include "redteam/Types.hpp"

// Turns the hottest ranked regions into category-specialized red-team probes:
// a prompt (redacted code slice + focused instructions + expected output
// schema) and a deterministic task_id. Probing consumes these in the service.
namespace redteam {

std::vector<Probe> plan_probes(const std::vector<RankedRegion>& ranked,
                               const std::vector<Region>& regions,
                               int max_probes);

}  // namespace redteam
