#include "domain/ProbePlanner.hpp"

#include <map>
#include <string>

#include "domain/Redactor.hpp"

namespace redteam {
namespace {

constexpr std::size_t kMaxSliceBytes = 4000;

std::string join_categories(const std::vector<Category>& cats) {
  std::string s;
  for (Category c : cats) {
    if (!s.empty()) s += ", ";
    s += to_string(c);
  }
  return s.empty() ? "any" : s;
}

const char* kExpectedSchema =
    R"({"findings":[{"vulnerable":true,"category":"<kebab-case>","severity":"info|low|medium|high|critical","confidence":0.0,"line":<int>,"title":"...","rationale":"...","suggested_fix":"..."}]})";

std::string build_prompt(const RankedRegion& rr, const std::string& slice) {
  std::string p;
  p += "You are a security red-teamer auditing code the main agent just wrote. ";
  p += "Examine ONLY the code region below and decide whether it contains a real, ";
  p += "exploitable vulnerability. Be adversarial but precise: do not invent issues.\n\n";
  p += "File: " + rr.file + "\n";
  p += "Function: " + (rr.function.empty() ? std::string("<module>") : rr.function) + "\n";
  p += "Lines: " + std::to_string(rr.start_line) + "-" + std::to_string(rr.end_line) + "\n";
  p += "Suspected categories (from static filtering): " + join_categories(rr.categories) + "\n\n";
  p += "Code:\n```\n" + slice + "\n```\n\n";
  p += "For each real vulnerability, report the exact line, category, severity, a ";
  p += "confidence in [0,1], a short rationale, and a concrete fix. If there is no ";
  p += "real issue, return an empty findings array. Respond with ONLY JSON matching:\n";
  p += kExpectedSchema;
  p += "\n";
  return p;
}

}  // namespace

std::vector<Probe> plan_probes(const std::vector<RankedRegion>& ranked,
                               const std::vector<Region>& regions,
                               int max_probes) {
  std::map<std::string, const Region*> by_id;
  for (const auto& r : regions) by_id[r.id] = &r;

  std::vector<Probe> probes;
  for (const auto& rr : ranked) {
    if (max_probes > 0 && static_cast<int>(probes.size()) >= max_probes) break;
    const auto it = by_id.find(rr.region_id);
    if (it == by_id.end()) continue;

    std::string slice = redact_secrets(it->second->code);
    if (slice.size() > kMaxSliceBytes) slice.resize(kMaxSliceBytes);

    Probe p;
    p.task_id = "t-" + rr.region_id;
    p.region_id = rr.region_id;
    p.category = rr.categories.empty() ? Category::Other : rr.categories.front();
    p.code_slice = slice;
    p.expected_schema = kExpectedSchema;
    p.prompt = build_prompt(rr, slice);
    probes.push_back(std::move(p));
  }
  return probes;
}

}  // namespace redteam
