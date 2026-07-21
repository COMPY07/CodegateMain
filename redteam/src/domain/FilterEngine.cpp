#include "domain/FilterEngine.hpp"

#include <algorithm>
#include <cctype>
#include <optional>
#include <regex>
#include <set>
#include <string>
#include <unordered_set>
#include <vector>

#include "domain/FixHints.hpp"
#include "domain/FlowGraph.hpp"
#include "domain/IntentMapper.hpp"
#include "domain/LanguageDetector.hpp"
#include "domain/PatternLibrary.hpp"
#include "domain/Ranker.hpp"
#include "domain/RiskScorer.hpp"
#include "domain/Scan.hpp"
#include "domain/SecretsScanner.hpp"
#include "domain/Segmenter.hpp"
#include "domain/TextUtil.hpp"

namespace redteam {
namespace {

double clamp01(double x) { return x < 0.0 ? 0.0 : (x > 1.0 ? 1.0 : x); }

double weight_of(const ConfigSpec& cfg, const std::string& key, double def) {
  const auto it = cfg.weights.find(key);
  return it == cfg.weights.end() ? def : it->second;
}

Severity severity_from_score(double s) {
  if (s >= 0.85) return Severity::Critical;
  if (s >= 0.65) return Severity::High;
  if (s >= 0.40) return Severity::Medium;
  if (s >= 0.20) return Severity::Low;
  return Severity::Info;
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

// Rough cyclomatic proxy: count branching constructs in the region body.
double complexity_factor(const std::string& code) {
  static const std::regex kBranch(
      R"(\b(if|for|while|case|catch|elif|and|or)\b|&&|\|\||\?)");
  int n = 0;
  for (auto it = std::sregex_iterator(code.begin(), code.end(), kBranch),
            end = std::sregex_iterator();
       it != end; ++it)
    ++n;
  return clamp01(static_cast<double>(n) / 12.0);
}

Category category_of_sink_kind(const std::string& kind) {
  auto has = [&](const char* sub) { return kind.find(sub) != std::string::npos; };
  if (has("system") || has("exec") || has("popen") || has("subprocess") ||
      has("command") || has("shell"))
    return Category::CommandInjection;
  if (has("sql") || has("query")) return Category::SqlInjection;
  if (has("open") || has("file") || has("path")) return Category::PathTraversal;
  if (has("eval") || has("code")) return Category::CodeInjection;
  if (has("pickle") || has("yaml") || has("deserial") || has("unserialize"))
    return Category::Deserialization;
  if (has("http") || has("url") || has("request") || has("fetch"))
    return Category::Ssrf;
  return Category::Other;
}

std::string mask_secret_excerpt(const std::string& excerpt) {
  static const std::regex kQuoted(R"((["'])[^"']{6,}(["']))");
  return std::regex_replace(excerpt, kQuoted, "$1<redacted>$2");
}

std::string format_finding_id(int n) {
  std::string num = std::to_string(n);
  if (num.size() < 4) num = std::string(4 - num.size(), '0') + num;
  return "RT-" + num;
}

// Byte offset within region.code of the start of `absolute_line`.
std::size_t offset_of_line(const Region& region, int absolute_line) {
  int want = absolute_line - region.span.start_line;
  if (want <= 0) return 0;
  std::size_t off = 0;
  int seen = 0;
  while (off < region.code.size() && seen < want) {
    if (region.code[off] == '\n') ++seen;
    ++off;
  }
  return off;
}

// A "module" region covering only the lines NOT inside any function region, so
// top-level code (imports, hardcoded secrets, module-level calls) is analyzed
// without double-counting function bodies. Line numbers are preserved by
// blanking covered lines. Returns nullopt if nothing non-trivial remains.
std::optional<Region> module_residual(const std::string& file, Language lang,
                                      const std::string& content,
                                      const std::vector<Region>& fns) {
  std::vector<std::string> lines;
  {
    std::string cur;
    for (char c : content) {
      cur.push_back(c);
      if (c == '\n') {
        lines.push_back(cur);
        cur.clear();
      }
    }
    if (!cur.empty()) lines.push_back(cur);
  }
  const int total = static_cast<int>(lines.size());
  std::vector<char> covered(static_cast<std::size_t>(total) + 2, 0);
  for (const auto& r : fns)
    for (int l = r.span.start_line; l <= r.span.end_line && l <= total; ++l)
      if (l >= 1) covered[static_cast<std::size_t>(l)] = 1;

  std::string residual;
  residual.reserve(content.size());
  bool any = false;
  for (int l = 1; l <= total; ++l) {
    if (covered[static_cast<std::size_t>(l)]) {
      residual.push_back('\n');
    } else {
      const std::string& text = lines[static_cast<std::size_t>(l - 1)];
      residual += text;
      for (char c : text)
        if (!std::isspace(static_cast<unsigned char>(c))) {
          any = true;
          break;
        }
    }
  }
  if (!any) return std::nullopt;
  Region m;
  m.file = file;
  m.language = lang;
  m.function = "<module>";
  m.span = SourceSpan{file, 1, total};
  m.code = std::move(residual);
  return m;
}

const SecurityHint* find_hint(const std::vector<SecurityHint>& hints,
                              const Region& r) {
  const SecurityHint* best = nullptr;
  for (const auto& h : hints) {
    if (h.file != r.file) continue;
    if (!h.function.empty() && h.function != r.function) continue;
    if (!best || h.possibility > best->possibility) best = &h;
  }
  return best;
}

}  // namespace

FilterEngine::FilterEngine(const Request& request) : request_(request) {}

FilterResult FilterEngine::run(const std::vector<LoadedFile>& files) {
  FilterResult result;
  result.files = static_cast<int>(files.size());
  const ConfigSpec& cfg = request_.config;

  const double w_flow = weight_of(cfg, "flow_reachability", 0.9);
  const double w_prox = weight_of(cfg, "proximity", 0.5);
  const double w_complexity = weight_of(cfg, "complexity", 0.6);
  const double w_intent = weight_of(cfg, "intent", 0.5);
  const double churn_floor = weight_of(cfg, "churn_floor", 0.15);

  // ---- segment all files into regions, assign global ids ----
  const PatternLibrary& lib = PatternLibrary::instance();
  for (const auto& f : files) {
    const Language lang = detect_language(f.path, f.content);
    std::vector<Region> regions = segment_file(f.path, lang, f.content);
    // Add a residual module region for top-level code (whole file when no
    // functions were found) so nothing is skipped.
    if (auto m = module_residual(f.path, lang, f.content, regions))
      regions.push_back(std::move(*m));
    for (auto& r : regions) result.regions.push_back(std::move(r));
  }
  for (std::size_t i = 0; i < result.regions.size(); ++i)
    result.regions[i].id = "R" + std::to_string(i + 1);

  // ---- shared context ----
  result.intent_profile = build_intent_profile(request_.signals);
  std::set<std::string> changed(request_.project.changed_files.begin(),
                                request_.project.changed_files.end());
  FlowGraph flow = request_.signals.coding_flow
                       ? FlowGraph(*request_.signals.coding_flow)
                       : FlowGraph();

  // ---- per-region analysis ----
  for (const Region& r : result.regions) {
    const Language lang = r.language;
    std::vector<Signal> sinks = scan_patterns(r, lib.sinks(lang));
    std::vector<Signal> sources = scan_patterns(r, lib.sources(lang));
    std::vector<Signal> sanitizers = scan_patterns(r, lib.sanitizers(lang));
    std::vector<Signal> secrets = scan_secrets(r);

    // Categories that a sanitizer covers get their sink weight dampened.
    std::set<Category> sanitized;
    bool generic_sanitizer = false;
    for (const auto& s : sanitizers) {
      if (s.category == Category::Other)
        generic_sanitizer = true;
      else
        sanitized.insert(s.category);
    }

    const double cf = complexity_factor(r.code);
    const bool flagged_complex =
        request_.signals.coding_flow && flow.has_function(r.file, r.function) &&
        [&] {
          for (const auto& fn : request_.signals.coding_flow->functions)
            if (fn.file == r.file && fn.name == r.function) return fn.complex;
          return false;
        }();
    const double complexity_boost =
        1.0 + w_complexity * (cf + (flagged_complex ? 0.5 : 0.0));

    auto dampen = [&](Category c, double w) {
      if (sanitized.count(c)) w *= 0.4;
      if (generic_sanitizer) w *= 0.7;
      return w * complexity_boost;
    };

    std::vector<Signal> signals;
    signals.insert(signals.end(), sources.begin(), sources.end());
    signals.insert(signals.end(), secrets.begin(), secrets.end());

    std::set<Category> sink_cats;
    Category dominant = Category::Other;
    double dominant_w = 0.0;
    for (Signal s : sinks) {
      sink_cats.insert(s.category);
      const double dw = dampen(s.category, s.weight);
      if (dw > dominant_w) {
        dominant_w = dw;
        dominant = s.category;
      }
      s.weight = clamp01(dw);
      signals.push_back(std::move(s));
    }

    // Proximity: a taint source co-located with a sink boosts that category.
    if (!sources.empty()) {
      for (Category c : sink_cats) {
        Signal p;
        p.category = c;
        p.weight = clamp01(dampen(c, w_prox));
        p.span = r.span;
        p.tag = "proximity:source+sink";
        p.rationale = "untrusted source co-located with a dangerous sink";
        signals.push_back(std::move(p));
      }
    }

    // Flow reachability from the summarizer's coding_flow.
    if (flow.has_function(r.file, r.function)) {
      FlowGraph::Reach reach = flow.query(r.file, r.function);
      if (reach.reachable) {
        Category fc = category_of_sink_kind(reach.sink_kind);
        if (fc == Category::Other) fc = dominant;
        if (fc != Category::Other) {
          Signal fsig;
          fsig.category = fc;
          fsig.weight = clamp01(dampen(fc, reach.unsanitized ? w_flow : w_flow * 0.4));
          fsig.span = SourceSpan{r.file, reach.sink_line, reach.sink_line};
          fsig.tag = reach.unsanitized ? "flow:unsanitized-source-to-sink"
                                       : "flow:sanitized-path";
          fsig.rationale = "coding_flow shows a source reaching this sink";
          signals.push_back(std::move(fsig));
        }
      }
    }

    RiskInputs in;
    in.intent_profile = result.intent_profile;
    in.intent_weight = w_intent;
    in.churn_floor = changed.count(r.file) ? churn_floor : 0.0;
    if (const SecurityHint* h = find_hint(request_.signals.security_hints, r))
      in.hint_possibility = clamp01(h->possibility);

    result.scored.push_back(fuse_risk(r, signals, in));
  }

  // ---- rank ----
  result.ranked = rank_regions(result.regions, result.scored,
                               request_.limits.max_regions, 0.15);

  // ---- heuristic findings from the strongest deterministic signals ----
  std::map<std::string, const Region*> region_by_id;
  for (const auto& r : result.regions) region_by_id[r.id] = &r;
  std::map<std::string, const RiskScore*> score_by_id;
  for (const auto& s : result.scored) score_by_id[s.region_id] = &s;

  std::unordered_set<std::string> emitted;  // dedupe key: file:line:tag
  int next_id = 1;
  for (const RankedRegion& rr : result.ranked) {
    if (static_cast<int>(result.heuristic_findings.size()) >=
        request_.limits.max_findings)
      break;
    const RiskScore* rs = score_by_id[rr.region_id];
    const Region* region = region_by_id[rr.region_id];
    if (!rs || !region) continue;

    // All tags in this region, for evidence context.
    std::vector<std::string> region_tags;
    for (const auto& s : rs->signals)
      if (!s.tag.empty()) region_tags.push_back(s.tag);
    std::sort(region_tags.begin(), region_tags.end());
    region_tags.erase(std::unique(region_tags.begin(), region_tags.end()),
                      region_tags.end());

    // Strongest signal first, so the representative kept per (line,category) is
    // the highest-weight one and its tag becomes the finding's matched_pattern.
    std::vector<Signal> ordered(rs->signals.begin(), rs->signals.end());
    std::sort(ordered.begin(), ordered.end(),
              [](const Signal& a, const Signal& b) { return a.weight > b.weight; });

    for (const Signal& s : ordered) {
      if (s.category == Category::Other) continue;
      if (s.weight < 0.55) continue;
      // Dedupe by category+line: multiple pattern matches on the same line for
      // the same category (e.g. os.system matching both `system` and
      // `os_system`) are one finding.
      const std::string key = s.span.file + ":" + std::to_string(s.span.start_line) +
                              ":" + std::string(to_string(s.category));
      if (!emitted.insert(key).second) continue;
      if (static_cast<int>(result.heuristic_findings.size()) >=
          request_.limits.max_findings)
        break;

      const double finding_score = clamp01(s.weight * (0.6 + 0.4 * rr.risk_score));
      const Severity sev = severity_from_score(finding_score);

      Finding f;
      f.id = format_finding_id(next_id++);
      f.location = s.span;
      f.function = region->function;
      f.category = s.category;
      f.cwe = cwe_for(s.category);
      f.severity = sev;
      f.confidence = clamp01(std::min(finding_score, 0.9));
      f.source = FindingSource::Heuristic;
      const bool is_secret = s.tag.rfind("secret:", 0) == 0;
      f.status = is_secret && s.tag == "secret:hardcoded" ? FindingStatus::Confirmed
                                                          : FindingStatus::Suspected;
      f.title = title_for(s.category);
      f.rationale = s.rationale.empty() ? title_for(s.category) : s.rationale;

      std::string excerpt =
          line_excerpt(region->code, offset_of_line(*region, s.span.start_line));
      if (is_secret) excerpt = mask_secret_excerpt(excerpt);
      f.evidence.code_slice = excerpt;
      f.evidence.matched_pattern = s.tag;
      f.evidence.signals = region_tags;

      f.suggested_fix = fix_for(s.category);
      f.fix_request.target = "main_agent";
      f.fix_request.action = "apply_patch";
      f.fix_request.priority = priority_from_severity(sev);
      if (const SecurityHint* h = find_hint(request_.signals.security_hints, *region))
        f.fix_request.priority = std::min(f.fix_request.priority, h->priority);
      f.region_id = region->id;

      result.heuristic_findings.push_back(std::move(f));
    }
  }

  // Findings sorted by severity x confidence, strongest first.
  std::sort(result.heuristic_findings.begin(), result.heuristic_findings.end(),
            [](const Finding& a, const Finding& b) {
              const double sa = severity_rank(a.severity) + a.confidence;
              const double sb = severity_rank(b.severity) + b.confidence;
              if (sa != sb) return sa > sb;
              return a.id < b.id;
            });

  return result;
}

}  // namespace redteam
