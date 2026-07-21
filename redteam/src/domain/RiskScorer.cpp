#include "domain/RiskScorer.hpp"

#include <algorithm>

namespace redteam {
namespace {

double clamp01(double x) { return x < 0.0 ? 0.0 : (x > 1.0 ? 1.0 : x); }

// noisy-OR: 1 - Π(1 - w_i). Saturates toward 1; order-independent.
double noisy_or(const std::vector<double>& ws) {
  double inv = 1.0;
  for (double w : ws) inv *= (1.0 - clamp01(w));
  return 1.0 - inv;
}

}  // namespace

RiskScore fuse_risk(const Region& region, const std::vector<Signal>& signals,
                    const RiskInputs& in) {
  // Collect per-category weights, ignoring generic taint sources (Category::Other).
  std::map<Category, std::vector<double>> by_cat;
  for (const auto& s : signals) {
    if (s.category == Category::Other) continue;
    by_cat[s.category].push_back(std::min(s.weight, 0.99));
  }

  std::map<Category, double> cat_score;
  double headline = 0.0;
  for (const auto& [cat, ws] : by_cat) {
    double p = noisy_or(ws);
    const auto it = in.intent_profile.find(cat);
    const double intent = it == in.intent_profile.end() ? 0.0 : it->second;
    p = clamp01(p * (1.0 + in.intent_weight * intent));
    cat_score[cat] = p;
    headline = std::max(headline, p);
  }

  // Merging-LLM hint raises the floor via noisy-OR with its possibility.
  headline = 1.0 - (1.0 - headline) * (1.0 - clamp01(in.hint_possibility));
  // Just-changed code is always at least a candidate.
  headline = std::max(headline, clamp01(in.churn_floor));

  RiskScore rs;
  rs.region_id = region.id;
  rs.score = headline;
  rs.signals = signals;
  // Report categories that materially contributed, strongest first.
  std::vector<std::pair<Category, double>> cats(cat_score.begin(), cat_score.end());
  std::sort(cats.begin(), cats.end(),
            [](const auto& a, const auto& b) { return a.second > b.second; });
  for (const auto& [cat, sc] : cats)
    if (sc >= 0.2) rs.categories.push_back(cat);
  return rs;
}

}  // namespace redteam
