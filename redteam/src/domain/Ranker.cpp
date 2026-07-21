#include "domain/Ranker.hpp"

#include <algorithm>
#include <map>
#include <tuple>

namespace redteam {

std::vector<RankedRegion> rank_regions(const std::vector<Region>& regions,
                                       const std::vector<RiskScore>& scored,
                                       int max_regions, double min_score) {
  std::map<std::string, const Region*> by_id;
  for (const auto& r : regions) by_id[r.id] = &r;

  std::vector<RankedRegion> ranked;
  ranked.reserve(scored.size());
  for (const auto& s : scored) {
    if (s.score < min_score) continue;
    const auto it = by_id.find(s.region_id);
    if (it == by_id.end()) continue;
    const Region& r = *it->second;
    RankedRegion rr;
    rr.region_id = s.region_id;
    rr.file = r.file;
    rr.function = r.function;
    rr.start_line = r.span.start_line;
    rr.end_line = r.span.end_line;
    rr.risk_score = s.score;
    rr.categories = s.categories;
    rr.probed = false;
    ranked.push_back(std::move(rr));
  }

  std::sort(ranked.begin(), ranked.end(), [](const RankedRegion& a,
                                             const RankedRegion& b) {
    if (a.risk_score != b.risk_score) return a.risk_score > b.risk_score;
    return std::tie(a.file, a.start_line, a.region_id) <
           std::tie(b.file, b.start_line, b.region_id);
  });

  if (max_regions > 0 && ranked.size() > static_cast<std::size_t>(max_regions))
    ranked.resize(static_cast<std::size_t>(max_regions));
  return ranked;
}

}  // namespace redteam
