#pragma once
#include <regex>
#include <vector>

#include "domain/PatternLibrary.hpp"
#include "domain/TextUtil.hpp"
#include "redteam/Types.hpp"

namespace redteam {

// Run a set of compiled patterns over a region's code, emitting one Signal per
// match with a line number resolved back to the original file.
inline std::vector<Signal> scan_patterns(const Region& r,
                                         const std::vector<CompiledPattern>& pats) {
  std::vector<Signal> out;
  for (const auto& p : pats) {
    for (auto it = std::sregex_iterator(r.code.begin(), r.code.end(), p.re),
              end = std::sregex_iterator();
         it != end; ++it) {
      const std::size_t pos = static_cast<std::size_t>(it->position());
      const int line = r.span.start_line + line_of_offset(r.code, pos) - 1;
      Signal s;
      s.category = p.category;
      s.weight = p.weight;
      s.span = SourceSpan{r.file, line, line};
      s.tag = p.tag;
      s.rationale = p.rationale;
      out.push_back(std::move(s));
    }
  }
  return out;
}

}  // namespace redteam
