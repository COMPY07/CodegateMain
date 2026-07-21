#pragma once
#include <cstdint>
#include <map>
#include <optional>
#include <string>
#include <vector>

#include "redteam/Enums.hpp"
#include "redteam/Types.hpp"

// Input-side model: the request the main agent passes in. Structured upstream
// data (coding_flow, security_hints) is optional; the engine degrades to its
// own lightweight inference when absent. Never executed — validated and clamped.
namespace redteam {

struct FlowNode {
  int line = 0;
  std::string kind;  // e.g. "http_body", "os_system"
};

struct FlowEdge {
  int from_line = 0;
  int to_line = 0;
  bool sanitized = false;
};

// One function's control/data-flow facts from the summarization LLM stage.
struct CodingFlowFunction {
  std::string file;
  std::string name;
  SourceSpan span;
  bool complex = false;  // summarization-LLM complexity flag -> score boost
  std::vector<FlowNode> sources;
  std::vector<FlowNode> sinks;
  std::vector<FlowEdge> edges;
};

struct CodingFlow {
  std::vector<CodingFlowFunction> functions;
};

// Per-region security metadata from the merging LLM stage -> strong prior.
struct SecurityHint {
  std::string file;
  std::string function;
  double possibility = 0.0;  // 0..1
  int priority = 3;          // 1 = highest
  std::string risk;          // "low" | "medium" | "high"
  std::string note;
};

struct InputSignals {
  std::string user_prompt;                 // signal 1
  std::vector<std::string> goals;          // signal 1
  std::string model_output;                // signal 2
  std::optional<CodingFlow> coding_flow;   // signal 3 (optional)
  std::vector<SecurityHint> security_hints;
};

struct ProjectSpec {
  std::string root;
  std::vector<std::string> include;  // glob patterns; empty => sensible defaults
  std::vector<std::string> exclude;
  std::vector<std::string> changed_files;  // focus set (recall floor)
  std::uint64_t max_file_bytes = 1048576;
};

struct DirectBackendSpec {
  std::string provider = "anthropic";
  std::string base_url;
  std::string model;
  std::string api_key_env = "SA_LLM_API_KEY";
  double temperature = 0.0;
};

struct FakeBackendSpec {
  std::string fixtures;  // directory of task_id-keyed canned responses
};

struct BackendSpec {
  std::string kind = "fake";  // "direct" | "fake"
  DirectBackendSpec direct;
  FakeBackendSpec fake;
};

struct Limits {
  int max_regions = 40;
  int max_probes = 80;
  int per_probe_tokens = 2048;
  int max_findings = 100;
};

struct ConfigSpec {
  std::map<std::string, double> weights;
  Severity min_severity = Severity::Low;
};

struct Request {
  std::string schema_version = "1.0";
  InputSignals signals;
  ProjectSpec project;
  BackendSpec backend;
  Limits limits;
  ConfigSpec config;
};

}  // namespace redteam
