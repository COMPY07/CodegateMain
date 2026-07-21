#include <gtest/gtest.h>

#include <map>
#include <string>

#include "adapters/driven/fs/InMemoryFileSource.hpp"

using namespace redteam;

namespace {
ProjectSpec spec_with(std::vector<std::string> include,
                      std::vector<std::string> exclude = {},
                      std::uint64_t max_bytes = 1048576) {
  ProjectSpec p;
  p.root = "/virtual";
  p.include = std::move(include);
  p.exclude = std::move(exclude);
  p.max_file_bytes = max_bytes;
  return p;
}
}  // namespace

TEST(InMemoryFileSource, LoadsSortedAndFiltered) {
  std::map<std::string, std::string> files{
      {"src/app.py", "print('hi')"},
      {"src/util.js", "let x = 1;"},
      {"node_modules/dep/index.js", "module.exports = {};"},
      {"README.md", "# hello"},
  };
  InMemoryFileSource fsrc(files, spec_with({"**/*.py", "**/*.js"},
                                           {"node_modules/**"}));
  auto loaded = fsrc.load();
  ASSERT_EQ(loaded.size(), 2u);
  // std::map iteration is sorted by path.
  EXPECT_EQ(loaded[0].path, "src/app.py");
  EXPECT_EQ(loaded[1].path, "src/util.js");
}

TEST(InMemoryFileSource, SkipsBinaryAndOversize) {
  std::map<std::string, std::string> files{
      {"a.txt", std::string("ok text")},
      {"bin.dat", std::string("has\0null", 8)},
      {"big.txt", std::string(2048, 'x')},
  };
  InMemoryFileSource fsrc(files, spec_with({"**/*"}, {}, /*max_bytes=*/1024));
  auto loaded = fsrc.load();
  ASSERT_EQ(loaded.size(), 1u);
  EXPECT_EQ(loaded[0].path, "a.txt");
}

TEST(InMemoryFileSource, ReadHonoursFilter) {
  std::map<std::string, std::string> files{{"secret.env", "KEY=1"},
                                           {"src/app.py", "x=1"}};
  InMemoryFileSource fsrc(files, spec_with({"**/*.py"}));
  EXPECT_TRUE(fsrc.read("src/app.py").has_value());
  EXPECT_FALSE(fsrc.read("secret.env").has_value());
  EXPECT_FALSE(fsrc.read("missing.py").has_value());
}
