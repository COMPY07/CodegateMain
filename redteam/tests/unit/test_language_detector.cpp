#include <gtest/gtest.h>

#include "domain/LanguageDetector.hpp"

using namespace redteam;

TEST(LanguageDetector, ByExtension) {
  EXPECT_EQ(detect_language("src/app.py"), Language::Python);
  EXPECT_EQ(detect_language("a/b/server.js"), Language::JavaScript);
  EXPECT_EQ(detect_language("x.ts"), Language::TypeScript);
  EXPECT_EQ(detect_language("buf.c"), Language::C);
  EXPECT_EQ(detect_language("Widget.cpp"), Language::Cpp);
  EXPECT_EQ(detect_language("main.go"), Language::Go);
  EXPECT_EQ(detect_language("Foo.java"), Language::Java);
}

TEST(LanguageDetector, ByShebangWhenNoExtension) {
  EXPECT_EQ(detect_language("scripts/deploy", "#!/usr/bin/env python3\n"),
            Language::Python);
  EXPECT_EQ(detect_language("run", "#!/usr/bin/node\n"), Language::JavaScript);
}

TEST(LanguageDetector, UnknownFallback) {
  EXPECT_EQ(detect_language("data.bin"), Language::Unknown);
  EXPECT_EQ(detect_language("noext"), Language::Unknown);
}

TEST(LanguageDetector, ExtensionIsCaseInsensitive) {
  EXPECT_EQ(detect_language("APP.PY"), Language::Python);
  EXPECT_EQ(detect_language("Main.CPP"), Language::Cpp);
}
