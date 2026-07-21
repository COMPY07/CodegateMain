#pragma once
#include <optional>
#include <string>
#include <string_view>

namespace redteam {

// Languages the Segmenter / PatternLibrary understand. Unknown falls back to a
// generic brace/indent segmenter and the language-agnostic pattern set.
enum class Language {
  Unknown,
  C,
  Cpp,
  Python,
  JavaScript,
  TypeScript,
  Go,
  Java,
  Ruby,
  Php,
  CSharp,
  Rust,
};

enum class Severity { Info, Low, Medium, High, Critical };

// Vulnerability surfaces the engine ranks and probes for.
enum class Category {
  CommandInjection,
  PathTraversal,
  SqlInjection,
  Deserialization,
  Ssrf,
  CodeInjection,
  MemorySafety,
  AuthWeakness,
  CryptoWeakness,
  SecretExposure,
  Redos,
  Csrf,
  Xss,
  Other,
};

// A finding's lifecycle verdict. `Suspected` is surfaced, never dropped.
enum class FindingStatus { Confirmed, Suspected, Dismissed };

// Where a finding's evidence originated.
enum class FindingSource { Heuristic, Llm, Both };

// ---- string conversions (kebab-case wire form) ------------------------------
std::string_view to_string(Language) noexcept;
std::string_view to_string(Severity) noexcept;
std::string_view to_string(Category) noexcept;
std::string_view to_string(FindingStatus) noexcept;
std::string_view to_string(FindingSource) noexcept;

std::optional<Language> parse_language(std::string_view) noexcept;
std::optional<Severity> parse_severity(std::string_view) noexcept;
std::optional<Category> parse_category(std::string_view) noexcept;
std::optional<FindingStatus> parse_finding_status(std::string_view) noexcept;
std::optional<FindingSource> parse_finding_source(std::string_view) noexcept;

// Total order Info < Low < Medium < High < Critical.
int severity_rank(Severity) noexcept;

}  // namespace redteam
