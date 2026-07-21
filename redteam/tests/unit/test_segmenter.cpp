#include <gtest/gtest.h>

#include <algorithm>

#include "domain/Segmenter.hpp"

using namespace redteam;

namespace {
bool has_function(const std::vector<Region>& rs, const std::string& name) {
  return std::any_of(rs.begin(), rs.end(),
                     [&](const Region& r) { return r.function == name; });
}
const Region* find_fn(const std::vector<Region>& rs, const std::string& name) {
  for (const auto& r : rs)
    if (r.function == name) return &r;
  return nullptr;
}
}  // namespace

TEST(Segmenter, PythonFunctions) {
  const std::string src =
      "import os\n"
      "def ping(host):\n"
      "    os.system(host)\n"
      "    return 1\n"
      "def add(a, b):\n"
      "    return a + b\n";
  auto rs = segment_file("app.py", Language::Python, src);
  EXPECT_TRUE(has_function(rs, "ping"));
  EXPECT_TRUE(has_function(rs, "add"));
  const Region* ping = find_fn(rs, "ping");
  ASSERT_NE(ping, nullptr);
  EXPECT_EQ(ping->span.start_line, 2);
  EXPECT_GE(ping->span.end_line, 4);
}

TEST(Segmenter, BraceFunctionsNotControlFlow) {
  const std::string src =
      "int add(int a, int b) { return a + b; }\n"
      "void run() {\n"
      "  if (a) { work(); }\n"
      "  while (b) { spin(); }\n"
      "}\n";
  auto rs = segment_file("x.cpp", Language::Cpp, src);
  EXPECT_TRUE(has_function(rs, "add"));
  EXPECT_TRUE(has_function(rs, "run"));
  // control-flow keywords must not be captured as functions
  EXPECT_FALSE(has_function(rs, "if"));
  EXPECT_FALSE(has_function(rs, "while"));
}

TEST(Segmenter, JsFunctionAndArrow) {
  const std::string src =
      "function healthy() { return true; }\n"
      "const handler = (req, res) => {\n"
      "  res.send('ok');\n"
      "};\n";
  auto rs = segment_file("s.js", Language::JavaScript, src);
  EXPECT_TRUE(has_function(rs, "healthy"));
  EXPECT_TRUE(has_function(rs, "handler"));
}

TEST(Segmenter, UnknownYieldsNoFunctionRegions) {
  auto rs = segment_file("notes.txt", Language::Unknown, "just some text\nlines\n");
  EXPECT_TRUE(rs.empty());  // caller adds a module region
}
