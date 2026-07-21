#include "domain/Segmenter.hpp"

#include <cctype>
#include <regex>

#include "domain/TextUtil.hpp"

namespace redteam {
namespace {

constexpr std::size_t kMaxRegions = 2000;  // defensive cap

std::vector<std::size_t> line_starts(const std::string& s) {
  std::vector<std::size_t> starts{0};
  for (std::size_t i = 0; i < s.size(); ++i)
    if (s[i] == '\n') starts.push_back(i + 1);
  return starts;
}

// Extract [start_line, end_line] (1-indexed inclusive) as a substring.
std::string slice_lines(const std::string& s,
                        const std::vector<std::size_t>& starts, int start_line,
                        int end_line) {
  if (start_line < 1) start_line = 1;
  const std::size_t si = static_cast<std::size_t>(start_line - 1);
  if (si >= starts.size()) return {};
  const std::size_t begin = starts[si];
  std::size_t end = s.size();
  if (static_cast<std::size_t>(end_line) < starts.size())
    end = starts[static_cast<std::size_t>(end_line)];
  return s.substr(begin, end - begin);
}

bool is_keyword_name(std::string_view n) {
  static constexpr std::string_view kw[] = {
      "if", "for", "while", "switch", "catch", "return", "sizeof",
      "do", "else", "with", "synchronized", "function", "typeof"};
  for (auto k : kw)
    if (k == n) return true;
  return false;
}

// Decide whether `header` (the text preceding a '{') is a function signature.
bool header_is_function(std::string_view header, std::string& name) {
  std::string h(header);
  for (char& c : h)
    if (c == '\n' || c == '\r' || c == '\t') c = ' ';
  std::string_view t = trim(h);
  if (t.empty()) return false;

  // JS arrow function: "... = (args) =>" or "name(args) =>".
  if (t.size() >= 2 && t.substr(t.size() - 2) == "=>") {
    // best-effort name: identifier after const/let/var, else empty.
    static const std::regex kArrow(R"((?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=)");
    std::smatch m;
    std::string ts(t);
    if (std::regex_search(ts, m, kArrow)) name = m[1].str();
    return true;
  }

  const std::size_t open = t.find('(');
  if (open == std::string_view::npos) return false;
  if (t.find(')', open) == std::string_view::npos) return false;

  // name = last identifier immediately before '('.
  std::size_t e = open;
  while (e > 0 && t[e - 1] == ' ') --e;
  std::size_t b = e;
  while (b > 0) {
    const char c = t[b - 1];
    if (std::isalnum(static_cast<unsigned char>(c)) || c == '_' || c == '$')
      --b;
    else
      break;
  }
  std::string_view id = t.substr(b, e - b);
  if (id.empty() || is_keyword_name(id)) return false;
  // Must look like a definition: reject if the char before the name starts a
  // member/scope-op call chain like ".foo(" (a call, not a definition).
  if (b > 0 && t[b - 1] == '.') return false;
  name = std::string(id);
  return true;
}

std::vector<Region> segment_braces(const std::string& file, Language lang,
                                   const std::string& content) {
  const auto starts = line_starts(content);
  std::vector<Region> out;

  struct Open {
    std::size_t header_start;
    int start_line;
    bool is_func;
    std::string name;
  };
  std::vector<Open> stack;

  enum class St { Normal, Line, Block, Str };
  St st = St::Normal;
  char delim = '\0';
  std::size_t last_break = 0;
  const std::size_t n = content.size();

  for (std::size_t i = 0; i < n; ++i) {
    const char c = content[i];
    const char nx = i + 1 < n ? content[i + 1] : '\0';
    switch (st) {
      case St::Line:
        if (c == '\n') st = St::Normal;
        break;
      case St::Block:
        if (c == '*' && nx == '/') {
          st = St::Normal;
          ++i;
        }
        break;
      case St::Str:
        if (c == '\\') {
          ++i;  // skip escaped char
        } else if (c == delim) {
          st = St::Normal;
        }
        break;
      case St::Normal:
        if (c == '/' && nx == '/') {
          st = St::Line;
          ++i;
        } else if (c == '/' && nx == '*') {
          st = St::Block;
          ++i;
        } else if (c == '"' || c == '\'' || c == '`') {
          st = St::Str;
          delim = c;
        } else if (c == '{') {
          std::string_view header(content.data() + last_break, i - last_break);
          std::string name;
          const bool func = header_is_function(header, name);
          // start line: first non-space char of the header, else the brace.
          std::size_t hs = last_break;
          while (hs < i && std::isspace(static_cast<unsigned char>(content[hs])))
            ++hs;
          stack.push_back(Open{last_break, line_of_offset(content, hs < i ? hs : i),
                               func, std::move(name)});
          last_break = i + 1;
        } else if (c == '}') {
          if (!stack.empty()) {
            Open top = std::move(stack.back());
            stack.pop_back();
            if (top.is_func && out.size() < kMaxRegions) {
              Region r;
              r.file = file;
              r.language = lang;
              r.function = top.name;
              r.span = SourceSpan{file, top.start_line, line_of_offset(content, i)};
              r.code = slice_lines(content, starts, r.span.start_line,
                                   r.span.end_line);
              out.push_back(std::move(r));
            }
          }
          last_break = i + 1;
        } else if (c == ';') {
          last_break = i + 1;
        }
        break;
    }
  }
  return out;
}

int indent_of(std::string_view line) {
  int n = 0;
  for (char c : line) {
    if (c == ' ')
      ++n;
    else if (c == '\t')
      n += 4;
    else
      break;
  }
  return n;
}

std::vector<Region> segment_python(const std::string& file, Language lang,
                                   const std::string& content) {
  const auto starts = line_starts(content);
  const int total_lines = static_cast<int>(starts.size());
  std::vector<Region> out;

  struct Def {
    int indent;
    std::string name;
    int start_line;
  };
  std::vector<Def> stack;

  static const std::regex kDef(R"(^\s*(?:async\s+)?def\s+([A-Za-z_]\w*))");

  auto close_to = [&](int indent, int end_line) {
    while (!stack.empty() && stack.back().indent >= indent) {
      Def d = std::move(stack.back());
      stack.pop_back();
      if (out.size() >= kMaxRegions) continue;
      Region r;
      r.file = file;
      r.language = lang;
      r.function = d.name;
      r.span = SourceSpan{file, d.start_line, end_line};
      r.code = slice_lines(content, starts, d.start_line, end_line);
      out.push_back(std::move(r));
    }
  };

  for (int ln = 1; ln <= total_lines; ++ln) {
    const std::string body =
        slice_lines(content, starts, ln, ln);
    std::string_view line(body);
    std::string_view t = trim(line);
    if (t.empty() || t.front() == '#') continue;  // blanks/comments don't dedent

    const int ind = indent_of(line);
    close_to(ind, ln - 1);

    std::string s(line);
    std::smatch m;
    if (std::regex_search(s, m, kDef)) {
      stack.push_back(Def{ind, m[1].str(), ln});
    }
  }
  close_to(-1, total_lines);
  return out;
}

}  // namespace

std::vector<Region> segment_file(const std::string& file, Language lang,
                                 const std::string& content) {
  switch (lang) {
    case Language::Python:
      return segment_python(file, lang, content);
    case Language::C:
    case Language::Cpp:
    case Language::JavaScript:
    case Language::TypeScript:
    case Language::Go:
    case Language::Java:
    case Language::CSharp:
    case Language::Rust:
    case Language::Php:
      return segment_braces(file, lang, content);
    case Language::Ruby:
    case Language::Unknown:
    default:
      // Ruby (def/end) and unknown files fall back to a brace pass; if that
      // finds nothing, the caller's whole-file module region covers them.
      return segment_braces(file, lang, content);
  }
}

}  // namespace redteam
