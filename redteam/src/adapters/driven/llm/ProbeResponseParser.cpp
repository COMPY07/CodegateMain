#include "adapters/driven/llm/ProbeResponseParser.hpp"

#include <exception>

#include "adapters/common/Json.hpp"
#include "redteam/Enums.hpp"

namespace redteam {
namespace {

// Extract the first balanced {...} object, so responses wrapped in prose or
// ```json fences still parse.
std::string extract_json_object(const std::string& text) {
  const std::size_t start = text.find('{');
  if (start == std::string::npos) return text;
  int depth = 0;
  bool in_str = false;
  char delim = '"';
  for (std::size_t i = start; i < text.size(); ++i) {
    const char c = text[i];
    if (in_str) {
      if (c == '\\') {
        ++i;
      } else if (c == delim) {
        in_str = false;
      }
      continue;
    }
    if (c == '"' || c == '\'') {
      in_str = true;
      delim = c;
    } else if (c == '{') {
      ++depth;
    } else if (c == '}') {
      if (--depth == 0) return text.substr(start, i - start + 1);
    }
  }
  return text.substr(start);
}

}  // namespace

ProbeResponse parse_probe_response_json(const std::string& text) {
  ProbeResponse pr;
  try {
    const js::json j = js::json::parse(extract_json_object(text));
    pr.ok = true;
    const auto it = j.find("findings");
    if (it == j.end() || !it->is_array()) return pr;  // ok, no findings
    for (const auto& e : *it) {
      if (!e.is_object()) continue;
      LlmVerdict v;
      // Presence in the findings array implies vulnerable unless said otherwise.
      v.vulnerable = js::get_bool(e, "vulnerable", true);
      v.category =
          parse_category(js::get_str(e, "category")).value_or(Category::Other);
      v.severity =
          parse_severity(js::get_str(e, "severity", "medium")).value_or(Severity::Medium);
      v.confidence = js::get_num(e, "confidence", 0.5);
      v.line = js::get_int(e, "line", 0);
      v.title = js::get_str(e, "title");
      v.rationale = js::get_str(e, "rationale");
      v.suggested_fix = js::get_str(e, "suggested_fix");
      pr.verdicts.push_back(std::move(v));
    }
  } catch (const std::exception& ex) {
    pr.ok = false;
    pr.error = std::string("unparseable probe response: ") + ex.what();
  }
  return pr;
}

ProbeParser default_probe_parser() {
  return [](const std::string& text) { return parse_probe_response_json(text); };
}

}  // namespace redteam
