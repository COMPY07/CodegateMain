#include "domain/SecretsScanner.hpp"

#include <array>
#include <cmath>
#include <regex>

#include "domain/TextUtil.hpp"

namespace redteam {

double shannon_entropy(const std::string& s) {
  if (s.empty()) return 0.0;
  std::array<int, 256> freq{};
  for (char ch : s) ++freq[static_cast<unsigned char>(ch)];
  double h = 0.0;
  const double n = static_cast<double>(s.size());
  for (int f : freq) {
    if (f == 0) continue;
    const double p = static_cast<double>(f) / n;
    h -= p * std::log2(p);
  }
  return h;
}

namespace {

Signal make(const Region& r, int line, double weight, std::string tag,
            std::string rationale) {
  Signal s;
  s.category = Category::SecretExposure;
  s.weight = weight;
  s.span = SourceSpan{r.file, line, line};
  s.tag = std::move(tag);
  s.rationale = std::move(rationale);
  return s;
}

}  // namespace

std::vector<Signal> scan_secrets(const Region& region) {
  std::vector<Signal> out;
  const std::string& code = region.code;

  // Keyword-assigned secrets: name = "literal".
  static const std::regex kAssign(
      R"((?:api[_-]?key|secret|password|passwd|access[_-]?key|token|private[_-]?key)\s*[:=]\s*["']([^"']{6,})["'])",
      std::regex::icase | std::regex::optimize);
  for (auto it = std::sregex_iterator(code.begin(), code.end(), kAssign),
            end = std::sregex_iterator();
       it != end; ++it) {
    const std::size_t pos = static_cast<std::size_t>(it->position());
    const int line = region.span.start_line + line_of_offset(code, pos) - 1;
    out.push_back(make(region, line, 0.85, "secret:hardcoded",
                       "credential-like assignment to a string literal"));
  }

  // High-entropy string literals (independent of a keyword).
  static const std::regex kLiteral(R"(["']([A-Za-z0-9_\-+/=]{20,})["'])",
                                   std::regex::optimize);
  for (auto it = std::sregex_iterator(code.begin(), code.end(), kLiteral),
            end = std::sregex_iterator();
       it != end; ++it) {
    const std::string value = (*it)[1].str();
    if (shannon_entropy(value) < 4.0) continue;  // low entropy => not a secret
    const std::size_t pos = static_cast<std::size_t>(it->position());
    const int line = region.span.start_line + line_of_offset(code, pos) - 1;
    out.push_back(make(region, line, 0.6, "secret:entropy",
                       "high-entropy literal may be an embedded secret"));
  }

  return out;
}

}  // namespace redteam
