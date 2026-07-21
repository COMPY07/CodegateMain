#include <gtest/gtest.h>

#include "domain/RiskScorer.hpp"

using namespace redteam;

namespace {
Region reg() {
  Region r;
  r.id = "R1";
  r.file = "app.py";
  r.span = SourceSpan{"app.py", 1, 10};
  return r;
}
Signal sink(Category c, double w) {
  Signal s;
  s.category = c;
  s.weight = w;
  s.tag = "sink";
  return s;
}
}  // namespace

TEST(RiskScorer, NoisyOrCombination) {
  std::vector<Signal> sigs = {sink(Category::CommandInjection, 0.5),
                              sink(Category::CommandInjection, 0.5)};
  RiskScore rs = fuse_risk(reg(), sigs, {});
  EXPECT_NEAR(rs.score, 0.75, 1e-9);  // 1 - (1-0.5)(1-0.5)
}

TEST(RiskScorer, AddingSinkNeverLowersScore) {
  std::vector<Signal> one = {sink(Category::SqlInjection, 0.6)};
  std::vector<Signal> two = {sink(Category::SqlInjection, 0.6),
                             sink(Category::SqlInjection, 0.4)};
  EXPECT_GE(fuse_risk(reg(), two, {}).score, fuse_risk(reg(), one, {}).score);
}

TEST(RiskScorer, TaintSourcesDoNotScoreOnTheirOwn) {
  Signal src;
  src.category = Category::Other;
  src.weight = 0.9;
  src.tag = "source:http-request";
  RiskScore rs = fuse_risk(reg(), {src}, {});
  EXPECT_DOUBLE_EQ(rs.score, 0.0);
}

TEST(RiskScorer, IntentMultiplierRaisesRelevantCategory) {
  std::vector<Signal> sigs = {sink(Category::CommandInjection, 0.4)};
  RiskInputs plain;
  RiskInputs intent;
  intent.intent_profile[Category::CommandInjection] = 1.0;
  intent.intent_weight = 0.5;
  EXPECT_GT(fuse_risk(reg(), sigs, intent).score,
            fuse_risk(reg(), sigs, plain).score);
}

TEST(RiskScorer, ChurnFloorAndHintRaiseScore) {
  RiskInputs churn;
  churn.churn_floor = 0.15;
  EXPECT_GE(fuse_risk(reg(), {}, churn).score, 0.15);

  std::vector<Signal> sigs = {sink(Category::Ssrf, 0.3)};
  RiskInputs hint;
  hint.hint_possibility = 0.8;
  EXPECT_GT(fuse_risk(reg(), sigs, hint).score, 0.8);
}

TEST(RiskScorer, ReportsContributingCategories) {
  std::vector<Signal> sigs = {sink(Category::CommandInjection, 0.9)};
  RiskScore rs = fuse_risk(reg(), sigs, {});
  ASSERT_FALSE(rs.categories.empty());
  EXPECT_EQ(rs.categories.front(), Category::CommandInjection);
}
