#include <gtest/gtest.h>

#include "domain/SecretsScanner.hpp"

using namespace redteam;

namespace {
Region region_with(const std::string& code) {
  Region r;
  r.file = "f.py";
  r.function = "<module>";
  r.span = SourceSpan{"f.py", 1, 1};
  r.code = code;
  return r;
}
}  // namespace

TEST(Secrets, EntropyOrdering) {
  EXPECT_LT(shannon_entropy("aaaaaaaaaaaa"), shannon_entropy("a1B2c3D4e5F6"));
  EXPECT_GT(shannon_entropy("Xk9$mPq2vLz8Wc7RtY4"), 3.5);
}

TEST(Secrets, DetectsHardcodedKeyword) {
  auto sigs = scan_secrets(region_with(
      "API_KEY = \"NOT_A_REAL_SECRET_FOR_TESTS\"\n"));
  ASSERT_FALSE(sigs.empty());
  bool found = false;
  for (const auto& s : sigs)
    if (s.tag == "secret:hardcoded") found = true;
  EXPECT_TRUE(found);
  EXPECT_EQ(sigs.front().category, Category::SecretExposure);
}

TEST(Secrets, IgnoresLowEntropyShortLiterals) {
  auto sigs = scan_secrets(region_with("greeting = \"hello world\"\n"));
  EXPECT_TRUE(sigs.empty());
}
