#pragma once
#include <string_view>

// Minimal glob matcher for path filtering. Supports:
//   *   matches any run of characters within a single path segment (not '/')
//   ?   matches exactly one non-'/' character
//   **  as a whole segment, matches zero or more path segments
// Paths and patterns use '/' separators.
namespace redteam {

bool glob_match(std::string_view pattern, std::string_view path) noexcept;

}  // namespace redteam
