#include "domain/FindingSynthesizer.hpp"

#include <algorithm>
#include <map>
#include <string>

#include "domain/FixHints.hpp"
#include "domain/Redactor.hpp"
#include "domain/TextUtil.hpp"

namespace redteam {
namespace {

double clamp(double x, double lo, double hi) {
  return x < lo ? lo : (x > hi ? hi : x);
}

int priority_from_severity(Severity s) {
  switch (s) {
    case Severity::Critical: return 1;
    case Severity::High: return 2;
    case Severity::Medium: return 3;
    case Severity::Low: return 4;
    case Severity::Info: return 5;
  }
  return 5;
}

Severity max_severity(Severity a, Severity b) {
  return severity_rank(a) >= severity_rank(b) ? a : b;
}

std::string finding_key(const std::string& file, int line, Category cat) {
  return file + ":" + std::to_string(line) + ":" + std::string(to_string(cat));
}

std::string format_id(int n) {
  std::string num = std::to_string(n);
  if (num.size() < 4) num = std::string(4 - num.size(), '0') + num;
  return "RT-" + num;
}

}  // namespace

std::vector<Finding> synthesize_findings(const std::vector<Probe>& probes,
                                         const std::vector<ProbeResponse>& responses,
                                         const std::vector<Region>& regions,
                                         std::vector<Finding> heuristic,
                                         int max_findings) {
  std::map<std::string, const Region*> region_by_id;
  for (const auto& r : regions) region_by_id[r.id] = &r;
  std::map<std::string, std::string> region_of_task;  // task_id -> region_id
  for (const auto& p : probes) region_of_task[p.task_id] = p.region_id;

  // Ordered merge map keyed by file:line:category for deterministic output.
  std::map<std::string, Finding> merged;

  // Heuristic findings seed the map, and give LLM findings a line to align to
  // (region_id + category -> heuristic line) so the two merge cleanly.
  std::map<std::string, int> heuristic_line;
  for (const auto& f : heuristic) {
    merged.emplace(finding_key(f.location.file, f.location.start_line, f.category), f);
    heuristic_line.emplace(f.region_id + ":" + std::string(to_string(f.category)),
                           f.location.start_line);
  }

  for (const auto& resp : responses) {
    if (!resp.ok) continue;
    const auto rit = region_of_task.find(resp.task_id);
    if (rit == region_of_task.end()) continue;
    const auto reg_it = region_by_id.find(rit->second);
    if (reg_it == region_by_id.end()) continue;
    const Region& region = *reg_it->second;

    // The probe's primary category (fallback when the LLM omits/garbles one).
    Category probe_cat = Category::Other;
    for (const auto& p : probes)
      if (p.task_id == resp.task_id) probe_cat = p.category;

    for (const LlmVerdict& v : resp.verdicts) {
      if (!v.vulnerable) continue;
      Category cat = v.category != Category::Other ? v.category : probe_cat;
      if (cat == Category::Other) continue;  // nothing actionable

      // Verify/clamp the line against the real region; align to a heuristic hit.
      int line = v.line;
      double confidence = clamp(v.confidence, 0.0, 0.99);
      const auto hl = heuristic_line.find(region.id + ":" + std::string(to_string(cat)));
      if (hl != heuristic_line.end()) {
        line = hl->second;  // snap to the deterministic location
      } else if (line < region.span.start_line || line > region.span.end_line) {
        // Out-of-range citation: keep the (real) region but distrust the line.
        line = region.span.start_line;
        confidence = std::min(confidence, 0.6);
      }

      const std::string key = finding_key(region.file, line, cat);
      auto existing = merged.find(key);
      if (existing != merged.end()) {
        // Merge with the heuristic finding: deterministic location stays, the
        // LLM upgrades severity/confidence/status and supplies rationale/fix.
        Finding& f = existing->second;
        f.source = FindingSource::Both;
        f.severity = max_severity(f.severity, v.severity);
        f.confidence = std::max(f.confidence, confidence);
        f.status = confidence >= 0.75 ? FindingStatus::Confirmed
                                      : FindingStatus::Suspected;
        if (!v.rationale.empty()) f.rationale = v.rationale;
        if (!v.suggested_fix.empty()) f.suggested_fix = v.suggested_fix;
        f.probe_task_id = resp.task_id;
        f.fix_request.priority = priority_from_severity(f.severity);
      } else {
        Finding f;
        f.location = SourceSpan{region.file, line, line};
        f.function = region.function;
        f.category = cat;
        f.cwe = cwe_for(cat);
        f.severity = v.severity;
        f.confidence = confidence;
        f.source = FindingSource::Llm;
        f.status = confidence >= 0.75 ? FindingStatus::Confirmed
                                      : FindingStatus::Suspected;
        f.title = v.title.empty() ? title_for(cat) : v.title;
        f.rationale = v.rationale;
        f.evidence.code_slice = redact_secrets(line_excerpt(
            region.code, offset_of_line(region.code, region.span.start_line, line)));
        f.evidence.matched_pattern = "llm";
        f.evidence.signals = {"llm-probe"};
        f.suggested_fix = v.suggested_fix.empty() ? fix_for(cat) : v.suggested_fix;
        f.fix_request.target = "main_agent";
        f.fix_request.action = "apply_patch";
        f.fix_request.priority = priority_from_severity(v.severity);
        f.region_id = region.id;
        f.probe_task_id = resp.task_id;
        merged.emplace(key, std::move(f));
      }
    }
  }

  std::vector<Finding> out;
  out.reserve(merged.size());
  for (auto& [k, f] : merged) out.push_back(std::move(f));

  std::sort(out.begin(), out.end(), [](const Finding& a, const Finding& b) {
    const double sa = severity_rank(a.severity) + a.confidence;
    const double sb = severity_rank(b.severity) + b.confidence;
    if (sa != sb) return sa > sb;
    return finding_key(a.location.file, a.location.start_line, a.category) <
           finding_key(b.location.file, b.location.start_line, b.category);
  });

  if (max_findings > 0 && out.size() > static_cast<std::size_t>(max_findings))
    out.resize(static_cast<std::size_t>(max_findings));

  // Stable sequential ids after ordering.
  for (std::size_t i = 0; i < out.size(); ++i)
    out[i].id = format_id(static_cast<int>(i + 1));
  return out;
}

}  // namespace redteam
