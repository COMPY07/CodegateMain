#include <gtest/gtest.h>

#include "redteam/Glob.hpp"

using redteam::glob_match;

TEST(Glob, StarWithinSegment) {
  EXPECT_TRUE(glob_match("*.py", "app.py"));
  EXPECT_FALSE(glob_match("*.py", "app.js"));
  EXPECT_FALSE(glob_match("*.py", "src/app.py"));  // * does not cross '/'
}

TEST(Glob, DoubleStarCrossesSegments) {
  EXPECT_TRUE(glob_match("**/*.py", "app.py"));
  EXPECT_TRUE(glob_match("**/*.py", "src/app.py"));
  EXPECT_TRUE(glob_match("**/*.py", "a/b/c/app.py"));
  EXPECT_TRUE(glob_match("**/*", "any/deep/path.txt"));
}

TEST(Glob, ExcludeDirectorySubtree) {
  EXPECT_TRUE(glob_match("node_modules/**", "node_modules/x/y.js"));
  EXPECT_TRUE(glob_match("node_modules/**", "node_modules/pkg.json"));
  EXPECT_FALSE(glob_match("node_modules/**", "src/node_modules.js"));
  EXPECT_TRUE(glob_match("**/.git/**", "a/b/.git/config"));
}

TEST(Glob, QuestionMark) {
  EXPECT_TRUE(glob_match("a?c.txt", "abc.txt"));
  EXPECT_FALSE(glob_match("a?c.txt", "ac.txt"));
}

TEST(Glob, ExactAndMismatch) {
  EXPECT_TRUE(glob_match("src/app.cpp", "src/app.cpp"));
  EXPECT_FALSE(glob_match("src/app.cpp", "src/app.hpp"));
  EXPECT_FALSE(glob_match("src/*.cpp", "src/a/b.cpp"));
}
