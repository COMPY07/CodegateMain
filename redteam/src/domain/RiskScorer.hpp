#pragma once
#include <map>
#include <vector>

#include "redteam/Enums.hpp"
#include "redteam/Types.hpp"

// Fuses a region's signals into a single risk score. Per category the signals
// combine via noisy-OR (saturating, so a big region can't win on volume alone);
// the strongest category becomes the region's headline score, then intent, a
// merging-LLM hint, and a changed-file floor adjust it.
namespace redteam {

struct RiskInputs {
  std::map<Category, double> intent_profile;
  double intent_weight = 0.5;   // scales the intent multiplier
  double churn_floor = 0.0;     // min score if the file was just changed
  double hint_possibility = 0.0;  // merging-LLM security hint, 0..1
};

RiskScore fuse_risk(const Region& region, const std::vector<Signal>& signals,
                    const RiskInputs& in);

}  // namespace redteam
