#include "domain/IntentMapper.hpp"

#include <algorithm>
#include <cctype>
#include <string>

namespace redteam {
namespace {

struct KeywordMap {
  const char* word;
  Category category;
};

// Keyword -> category associations. A word may map to several categories via
// repeated entries.
constexpr KeywordMap kKeywords[] = {
    {"login", Category::AuthWeakness},    {"password", Category::AuthWeakness},
    {"passwd", Category::AuthWeakness},   {"auth", Category::AuthWeakness},
    {"token", Category::AuthWeakness},    {"session", Category::AuthWeakness},
    {"jwt", Category::AuthWeakness},      {"credential", Category::AuthWeakness},
    {"oauth", Category::AuthWeakness},

    {"upload", Category::PathTraversal},  {"download", Category::PathTraversal},
    {"file", Category::PathTraversal},    {"path", Category::PathTraversal},
    {"filename", Category::PathTraversal},{"directory", Category::PathTraversal},

    {"exec", Category::CommandInjection}, {"shell", Category::CommandInjection},
    {"command", Category::CommandInjection},
    {"subprocess", Category::CommandInjection},
    {"spawn", Category::CommandInjection},

    {"sql", Category::SqlInjection},      {"query", Category::SqlInjection},
    {"database", Category::SqlInjection}, {"orm", Category::SqlInjection},

    {"serialize", Category::Deserialization},
    {"deserialize", Category::Deserialization},
    {"pickle", Category::Deserialization}, {"yaml", Category::Deserialization},

    {"url", Category::Ssrf},              {"fetch", Category::Ssrf},
    {"webhook", Category::Ssrf},          {"proxy", Category::Ssrf},
    {"request", Category::Ssrf},

    {"eval", Category::CodeInjection},    {"template", Category::CodeInjection},
    {"render", Category::Xss},            {"html", Category::Xss},
    {"dom", Category::Xss},

    {"crypto", Category::CryptoWeakness}, {"encrypt", Category::CryptoWeakness},
    {"hash", Category::CryptoWeakness},   {"cipher", Category::CryptoWeakness},
    {"random", Category::CryptoWeakness},

    {"buffer", Category::MemorySafety},   {"memcpy", Category::MemorySafety},
    {"pointer", Category::MemorySafety},  {"malloc", Category::MemorySafety},

    {"regex", Category::Redos},           {"secret", Category::SecretExposure},
    {"apikey", Category::SecretExposure}, {"key", Category::SecretExposure},
};

void accumulate(const std::string& text, std::map<Category, double>& profile) {
  std::string token;
  auto flush = [&]() {
    if (token.empty()) return;
    for (const auto& k : kKeywords)
      if (token == k.word) {
        double& v = profile[k.category];
        v = std::min(1.0, v + 0.4);
      }
    token.clear();
  };
  for (char c : text) {
    if (std::isalnum(static_cast<unsigned char>(c))) {
      token.push_back(static_cast<char>(std::tolower(static_cast<unsigned char>(c))));
    } else {
      flush();
    }
  }
  flush();
}

}  // namespace

std::map<Category, double> build_intent_profile(const InputSignals& signals) {
  std::map<Category, double> profile;
  accumulate(signals.user_prompt, profile);
  for (const auto& g : signals.goals) accumulate(g, profile);
  return profile;
}

}  // namespace redteam
