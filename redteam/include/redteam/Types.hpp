#pragma once
#include <map>
#include <string>
#include <vector>

#include "redteam/Enums.hpp"

// Result-side domain model: what the engine produces internally and reports.
// Pure data; no JSON, no I/O. Input-side types live in Signals.hpp.
namespace redteam {

struct SourceSpan {
  std::string file;    // project-root-relative
  int start_line = 0;  // 1-indexed, inclusive
  int end_line = 0;    // 1-indexed, inclusive
};

// A function-level slice of a source file, produced by the Segmenter.
struct Region {
  std::string id;  // stable within a run, e.g. "R1"
  std::string file;
  Language language = Language::Unknown;
  std::string function;
  SourceSpan span;
  std::string code;  // verbatim body (pre-redaction)
};

// A weighted vulnerability signal emitted by one FeatureExtractor.
struct Signal {
  Category category = Category::Other;
  double weight = 0.0;
  SourceSpan span;
  std::string tag;        // compact machine tag, e.g. "sink:os_system"
  std::string rationale;  // human-readable reason
};

// Fused per-region score with its contributing signals.
struct RiskScore {
  std::string region_id;
  double score = 0.0;
  std::vector<Category> categories;
  std::vector<Signal> signals;
};

// A region selected for the report's ranked list.
struct RankedRegion {
  std::string region_id;
  std::string file;
  std::string function;
  int start_line = 0;
  int end_line = 0;
  double risk_score = 0.0;
  std::vector<Category> categories;
  bool probed = false;
};

// A red-team task built for one hot region, sent through the LlmBackend.
struct Probe {
  std::string task_id;
  std::string region_id;
  Category category = Category::Other;
  std::string prompt;
  std::string code_slice;  // redacted
  std::string expected_schema;
};

// One vulnerability judgment returned by the LLM for a probe, already parsed
// out of the model's JSON at the adapter boundary (the domain stays JSON-free).
struct LlmVerdict {
  bool vulnerable = false;
  Category category = Category::Other;
  Severity severity = Severity::Medium;
  double confidence = 0.5;
  int line = 0;  // 0 => unspecified; synthesizer falls back to region start
  std::string title;
  std::string rationale;
  std::string suggested_fix;
};

struct ProbeResponse {
  std::string task_id;
  bool ok = false;  // backend succeeded and the response parsed
  std::vector<LlmVerdict> verdicts;
  std::string error;
};

struct Evidence {
  std::string code_slice;
  std::string matched_pattern;
  std::vector<std::string> signals;
};

// The literal handoff the security agent routes back to the main agent.
struct FixRequest {
  std::string target = "main_agent";
  std::string action = "apply_patch";
  int priority = 3;  // 1 = highest
};

struct Finding {
  std::string id;  // "RT-0001"
  SourceSpan location;
  std::string function;
  Category category = Category::Other;
  std::vector<std::string> cwe;
  Severity severity = Severity::Info;
  double confidence = 0.0;  // 0..1
  FindingSource source = FindingSource::Heuristic;
  FindingStatus status = FindingStatus::Suspected;
  std::string title;
  std::string rationale;
  Evidence evidence;
  std::string suggested_fix;
  FixRequest fix_request;
  std::string region_id;
  std::string probe_task_id;
};

struct RunStats {
  int files = 0;
  int regions = 0;
  int hot_regions = 0;
  int probes = 0;
};

struct RunInfo {
  std::string id;
  std::string backend;
  std::string config_hash;
  RunStats stats;
};

struct Report {
  std::string schema_version = "1.0";
  RunInfo run;
  std::map<Category, double> intent_profile;
  std::vector<RankedRegion> ranked_regions;
  std::vector<Finding> findings;
  std::vector<std::string> errors;
};

}  // namespace redteam
