#include "redteam/Enums.hpp"

#include <array>
#include <utility>

namespace redteam {
namespace {

template <typename E>
using Row = std::pair<E, std::string_view>;

constexpr std::array<Row<Language>, 12> kLanguages{{
    {Language::Unknown, "unknown"},
    {Language::C, "c"},
    {Language::Cpp, "cpp"},
    {Language::Python, "python"},
    {Language::JavaScript, "javascript"},
    {Language::TypeScript, "typescript"},
    {Language::Go, "go"},
    {Language::Java, "java"},
    {Language::Ruby, "ruby"},
    {Language::Php, "php"},
    {Language::CSharp, "csharp"},
    {Language::Rust, "rust"},
}};

constexpr std::array<Row<Severity>, 5> kSeverities{{
    {Severity::Info, "info"},
    {Severity::Low, "low"},
    {Severity::Medium, "medium"},
    {Severity::High, "high"},
    {Severity::Critical, "critical"},
}};

constexpr std::array<Row<Category>, 14> kCategories{{
    {Category::CommandInjection, "command-injection"},
    {Category::PathTraversal, "path-traversal"},
    {Category::SqlInjection, "sql-injection"},
    {Category::Deserialization, "deserialization"},
    {Category::Ssrf, "ssrf"},
    {Category::CodeInjection, "code-injection"},
    {Category::MemorySafety, "memory-safety"},
    {Category::AuthWeakness, "auth-weakness"},
    {Category::CryptoWeakness, "crypto-weakness"},
    {Category::SecretExposure, "secret-exposure"},
    {Category::Redos, "redos"},
    {Category::Csrf, "csrf"},
    {Category::Xss, "xss"},
    {Category::Other, "other"},
}};

constexpr std::array<Row<FindingStatus>, 3> kStatuses{{
    {FindingStatus::Confirmed, "confirmed"},
    {FindingStatus::Suspected, "suspected"},
    {FindingStatus::Dismissed, "dismissed"},
}};

constexpr std::array<Row<FindingSource>, 3> kSources{{
    {FindingSource::Heuristic, "heuristic"},
    {FindingSource::Llm, "llm"},
    {FindingSource::Both, "both"},
}};

template <typename E, std::size_t N>
std::string_view stringify(const std::array<Row<E>, N>& table, E value) noexcept {
  for (const auto& [k, v] : table) {
    if (k == value) return v;
  }
  return table.back().second;  // Unknown/Other sentinel
}

template <typename E, std::size_t N>
std::optional<E> lookup(const std::array<Row<E>, N>& table,
                        std::string_view s) noexcept {
  for (const auto& [k, v] : table) {
    if (v == s) return k;
  }
  return std::nullopt;
}

}  // namespace

std::string_view to_string(Language v) noexcept { return stringify(kLanguages, v); }
std::string_view to_string(Severity v) noexcept { return stringify(kSeverities, v); }
std::string_view to_string(Category v) noexcept { return stringify(kCategories, v); }
std::string_view to_string(FindingStatus v) noexcept { return stringify(kStatuses, v); }
std::string_view to_string(FindingSource v) noexcept { return stringify(kSources, v); }

std::optional<Language> parse_language(std::string_view s) noexcept {
  return lookup(kLanguages, s);
}
std::optional<Severity> parse_severity(std::string_view s) noexcept {
  return lookup(kSeverities, s);
}
std::optional<Category> parse_category(std::string_view s) noexcept {
  return lookup(kCategories, s);
}
std::optional<FindingStatus> parse_finding_status(std::string_view s) noexcept {
  return lookup(kStatuses, s);
}
std::optional<FindingSource> parse_finding_source(std::string_view s) noexcept {
  return lookup(kSources, s);
}

int severity_rank(Severity s) noexcept {
  switch (s) {
    case Severity::Info:
      return 0;
    case Severity::Low:
      return 1;
    case Severity::Medium:
      return 2;
    case Severity::High:
      return 3;
    case Severity::Critical:
      return 4;
  }
  return 0;
}

}  // namespace redteam
