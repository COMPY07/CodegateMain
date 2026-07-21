#pragma once
#include <regex>
#include <string>
#include <vector>

#include "redteam/Enums.hpp"

// Data-driven vulnerability patterns. Each entry is a regex plus metadata; the
// library is the single place to tune detection without touching scanner code.
namespace redteam {

enum class PatternKind { Source, Sink, Sanitizer };

struct CompiledPattern {
  Category category = Category::Other;
  std::regex re;
  std::string tag;        // e.g. "sink:os_system"
  double weight = 0.0;
  std::string rationale;
};

// Immutable, compiled once. Queries return the language-specific patterns plus
// the language-agnostic ("Any") ones, precomputed per language.
class PatternLibrary {
 public:
  static const PatternLibrary& instance();

  const std::vector<CompiledPattern>& sources(Language lang) const;
  const std::vector<CompiledPattern>& sinks(Language lang) const;
  const std::vector<CompiledPattern>& sanitizers(Language lang) const;

 private:
  PatternLibrary();

  // Indexed by static_cast<size_t>(Language).
  std::vector<std::vector<CompiledPattern>> sources_;
  std::vector<std::vector<CompiledPattern>> sinks_;
  std::vector<std::vector<CompiledPattern>> sanitizers_;
};

}  // namespace redteam
