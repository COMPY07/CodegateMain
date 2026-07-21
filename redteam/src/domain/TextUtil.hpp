#pragma once
#include <cstddef>
#include <string>
#include <string_view>

// Small text helpers shared by the segmenter and pattern scanners.
namespace redteam {

// 1-indexed line number of byte offset `pos` within `text`.
inline int line_of_offset(std::string_view text, std::size_t pos) {
  int line = 1;
  const std::size_t n = pos < text.size() ? pos : text.size();
  for (std::size_t i = 0; i < n; ++i)
    if (text[i] == '\n') ++line;
  return line;
}

// Trims a single trailing '\r' (for CRLF files) and leading/trailing spaces.
inline std::string_view trim(std::string_view s) {
  while (!s.empty() && (s.front() == ' ' || s.front() == '\t')) s.remove_prefix(1);
  while (!s.empty() &&
         (s.back() == ' ' || s.back() == '\t' || s.back() == '\r'))
    s.remove_suffix(1);
  return s;
}

// Byte offset within `code` of the start of `target_line`, where the code
// begins at `region_start_line` in the original file.
inline std::size_t offset_of_line(std::string_view code, int region_start_line,
                                  int target_line) {
  int want = target_line - region_start_line;
  if (want <= 0) return 0;
  std::size_t off = 0;
  int seen = 0;
  while (off < code.size() && seen < want) {
    if (code[off] == '\n') ++seen;
    ++off;
  }
  return off;
}

// A short, single-line excerpt of `text` around byte offset `pos`, for evidence.
inline std::string line_excerpt(std::string_view text, std::size_t pos,
                                std::size_t max_len = 200) {
  if (pos > text.size()) pos = text.size();
  std::size_t begin = pos;
  while (begin > 0 && text[begin - 1] != '\n') --begin;
  std::size_t end = pos;
  while (end < text.size() && text[end] != '\n') ++end;
  std::string_view line = text.substr(begin, end - begin);
  line = trim(line);
  std::string out(line);
  if (out.size() > max_len) out.resize(max_len);
  return out;
}

}  // namespace redteam
