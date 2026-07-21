#include <gtest/gtest.h>

#include "redteam/Enums.hpp"

using namespace redteam;

TEST(Enums, CategoryRoundTrip) {
  for (Category c : {Category::CommandInjection, Category::PathTraversal,
                     Category::SqlInjection, Category::Deserialization,
                     Category::Ssrf, Category::CodeInjection,
                     Category::MemorySafety, Category::AuthWeakness,
                     Category::CryptoWeakness, Category::SecretExposure,
                     Category::Redos, Category::Csrf, Category::Xss,
                     Category::Other}) {
    auto parsed = parse_category(to_string(c));
    ASSERT_TRUE(parsed.has_value());
    EXPECT_EQ(*parsed, c);
  }
}

TEST(Enums, SeverityRoundTripAndOrder) {
  EXPECT_EQ(parse_severity("critical").value(), Severity::Critical);
  EXPECT_EQ(to_string(Severity::Medium), "medium");
  EXPECT_LT(severity_rank(Severity::Info), severity_rank(Severity::Low));
  EXPECT_LT(severity_rank(Severity::Low), severity_rank(Severity::Medium));
  EXPECT_LT(severity_rank(Severity::Medium), severity_rank(Severity::High));
  EXPECT_LT(severity_rank(Severity::High), severity_rank(Severity::Critical));
}

TEST(Enums, KebabCaseWireForm) {
  EXPECT_EQ(to_string(Category::CommandInjection), "command-injection");
  EXPECT_EQ(to_string(Category::SecretExposure), "secret-exposure");
  EXPECT_EQ(to_string(FindingSource::Both), "both");
  EXPECT_EQ(to_string(FindingStatus::Suspected), "suspected");
}

TEST(Enums, UnknownParsesToNullopt) {
  EXPECT_FALSE(parse_category("not-a-category").has_value());
  EXPECT_FALSE(parse_severity("catastrophic").has_value());
  EXPECT_FALSE(parse_language("cobol").has_value());
}
