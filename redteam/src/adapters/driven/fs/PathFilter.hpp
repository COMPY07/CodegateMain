#pragma once
#include <string>
#include <vector>

#include "redteam/Glob.hpp"

// Shared include/exclude decision used by both file sources so filesystem and
// in-memory reads select the same files.
namespace redteam {

inline bool path_selected(const std::string& rel,
                          const std::vector<std::string>& include,
                          const std::vector<std::string>& exclude) {
  // Always skip VCS metadata regardless of caller config.
  if (glob_match(".git/**", rel) || glob_match("**/.git/**", rel)) return false;
  for (const auto& pat : exclude)
    if (glob_match(pat, rel)) return false;
  if (include.empty()) return true;  // no include filter => match everything
  for (const auto& pat : include)
    if (glob_match(pat, rel)) return true;
  return false;
}

// A byte with a NUL in the first window is treated as binary and skipped.
inline bool looks_binary(const std::string& content) {
  const std::size_t n = content.size() < 8192 ? content.size() : 8192;
  for (std::size_t i = 0; i < n; ++i)
    if (content[i] == '\0') return true;
  return false;
}

}  // namespace redteam
