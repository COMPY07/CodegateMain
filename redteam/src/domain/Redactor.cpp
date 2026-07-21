#include "domain/Redactor.hpp"

#include <regex>

#include "domain/SecretsScanner.hpp"

namespace redteam {

std::string redact_secrets(const std::string& code) {
  std::string out = code;

  // Credential-like assignments: keep the key, mask the literal value.
  static const std::regex kAssign(
      R"((api[_-]?key|secret|password|passwd|access[_-]?key|token|private[_-]?key)(\s*[:=]\s*)(["'])[^"']{6,}(["']))",
      std::regex::icase | std::regex::optimize);
  out = std::regex_replace(out, kAssign, "$1$2$3<redacted>$4");

  // High-entropy long literals, masked only when they actually look random.
  static const std::regex kLiteral(R"((["'])([A-Za-z0-9_\-+/=]{20,})(["']))",
                                   std::regex::optimize);
  std::string result;
  result.reserve(out.size());
  auto begin = std::sregex_iterator(out.begin(), out.end(), kLiteral);
  auto end = std::sregex_iterator();
  std::size_t last = 0;
  for (auto it = begin; it != end; ++it) {
    const auto& m = *it;
    const std::size_t pos = static_cast<std::size_t>(m.position());
    result.append(out, last, pos - last);
    const std::string value = m[2].str();
    if (shannon_entropy(value) >= 4.0)
      result += m[1].str() + "<redacted>" + m[3].str();
    else
      result += m.str();
    last = pos + static_cast<std::size_t>(m.length());
  }
  result.append(out, last, out.size() - last);
  return result;
}

}  // namespace redteam
