#include "redteam/Glob.hpp"

#include <vector>

namespace redteam {
namespace {

std::vector<std::string_view> split_segments(std::string_view s) {
  std::vector<std::string_view> out;
  std::size_t start = 0;
  for (std::size_t i = 0; i <= s.size(); ++i) {
    if (i == s.size() || s[i] == '/') {
      if (i > start) out.push_back(s.substr(start, i - start));
      // collapse repeated '/' and ignore leading/trailing empties
      start = i + 1;
    }
  }
  return out;
}

// Wildcard match within a single segment: '*' -> any run, '?' -> one char.
bool segment_match(std::string_view pat, std::string_view seg) noexcept {
  std::size_t p = 0, s = 0;
  std::size_t star = std::string_view::npos, star_s = 0;
  while (s < seg.size()) {
    if (p < pat.size() && (pat[p] == '?' || pat[p] == seg[s])) {
      ++p;
      ++s;
    } else if (p < pat.size() && pat[p] == '*') {
      star = p++;
      star_s = s;
    } else if (star != std::string_view::npos) {
      p = star + 1;
      s = ++star_s;
    } else {
      return false;
    }
  }
  while (p < pat.size() && pat[p] == '*') ++p;
  return p == pat.size();
}

bool match_segments(const std::vector<std::string_view>& pat, std::size_t pi,
                    const std::vector<std::string_view>& path, std::size_t si) {
  while (pi < pat.size()) {
    if (pat[pi] == "**") {
      // '**' consumes zero or more whole segments.
      if (pi + 1 == pat.size()) return true;  // trailing '**' matches the rest
      for (std::size_t k = si; k <= path.size(); ++k) {
        if (match_segments(pat, pi + 1, path, k)) return true;
      }
      return false;
    }
    if (si >= path.size()) return false;
    if (!segment_match(pat[pi], path[si])) return false;
    ++pi;
    ++si;
  }
  return si == path.size();
}

}  // namespace

bool glob_match(std::string_view pattern, std::string_view path) noexcept {
  const auto pat = split_segments(pattern);
  const auto pth = split_segments(path);
  return match_segments(pat, 0, pth, 0);
}

}  // namespace redteam
