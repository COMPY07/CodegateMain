#pragma once
#include <map>
#include <vector>

#include "redteam/Signals.hpp"
#include "redteam/Types.hpp"
#include "redteam/ports/FileSource.hpp"

// The deterministic "rough filtering" engine: given the request and the loaded
// project files, it segments code into regions, scores each with the signal
// detectors, ranks the hottest ones, and emits heuristic-only findings. This is
// the whole Phase-1 pipeline; probing (Phase 2) consumes `ranked`.
namespace redteam {

struct FilterResult {
  std::vector<Region> regions;
  std::map<Category, double> intent_profile;
  std::vector<RiskScore> scored;
  std::vector<RankedRegion> ranked;
  std::vector<Finding> heuristic_findings;
  int files = 0;
};

class FilterEngine {
 public:
  explicit FilterEngine(const Request& request);
  FilterResult run(const std::vector<LoadedFile>& files);

 private:
  const Request& request_;
};

}  // namespace redteam
