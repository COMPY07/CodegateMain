#include "adapters/common/JsonConvert.hpp"

#include "redteam/Enums.hpp"

namespace redteam::jsonconv {
namespace {

using js::json;

// ---- input parsing ----------------------------------------------------------

SourceSpan parse_span(const json& j, std::string file) {
  SourceSpan s;
  s.file = std::move(file);
  s.start_line = js::get_int(j, "start_line", 0);
  s.end_line = js::get_int(j, "end_line", 0);
  return s;
}

FlowNode parse_flow_node(const json& j) {
  FlowNode n;
  n.line = js::get_int(j, "line", 0);
  n.kind = js::get_str(j, "kind");
  return n;
}

FlowEdge parse_flow_edge(const json& j) {
  FlowEdge e;
  e.from_line = js::get_int(j, "from_line", 0);
  e.to_line = js::get_int(j, "to_line", 0);
  e.sanitized = js::get_bool(j, "sanitized", false);
  return e;
}

CodingFlowFunction parse_cf_function(const json& j) {
  CodingFlowFunction f;
  f.file = js::get_str(j, "file");
  f.name = js::get_str(j, "name");
  f.span = parse_span(js::get_obj(j, "span"), f.file);
  f.complex = js::get_bool(j, "complex", false);
  if (auto it = j.find("sources"); it != j.end() && it->is_array())
    for (const auto& e : *it) f.sources.push_back(parse_flow_node(e));
  if (auto it = j.find("sinks"); it != j.end() && it->is_array())
    for (const auto& e : *it) f.sinks.push_back(parse_flow_node(e));
  if (auto it = j.find("edges"); it != j.end() && it->is_array())
    for (const auto& e : *it) f.edges.push_back(parse_flow_edge(e));
  return f;
}

SecurityHint parse_hint(const json& j) {
  SecurityHint h;
  h.file = js::get_str(j, "file");
  h.function = js::get_str(j, "function");
  h.possibility = js::get_num(j, "possibility", 0.0);
  h.priority = js::get_int(j, "priority", 3);
  h.risk = js::get_str(j, "risk");
  h.note = js::get_str(j, "note");
  return h;
}

InputSignals parse_signals(const json& j) {
  InputSignals s;
  s.user_prompt = js::get_str(j, "user_prompt");
  s.goals = js::get_str_array(j, "goals");
  s.model_output = js::get_str(j, "model_output");
  if (auto it = j.find("coding_flow"); it != j.end() && it->is_object()) {
    CodingFlow cf;
    if (auto fit = it->find("functions"); fit != it->end() && fit->is_array())
      for (const auto& e : *fit) cf.functions.push_back(parse_cf_function(e));
    s.coding_flow = std::move(cf);
  }
  if (auto it = j.find("security_hints"); it != j.end() && it->is_array())
    for (const auto& e : *it) s.security_hints.push_back(parse_hint(e));
  return s;
}

ProjectSpec parse_project(const json& j) {
  ProjectSpec p;
  p.root = js::get_str(j, "root");
  p.include = js::get_str_array(j, "include");
  p.exclude = js::get_str_array(j, "exclude");
  p.changed_files = js::get_str_array(j, "changed_files");
  p.max_file_bytes = js::get_u64(j, "max_file_bytes", 1048576);
  return p;
}

BackendSpec parse_backend(const json& j) {
  BackendSpec b;
  b.kind = js::get_str(j, "kind", "fake");
  const json& d = js::get_obj(j, "direct");
  b.direct.provider = js::get_str(d, "provider", "anthropic");
  b.direct.base_url = js::get_str(d, "base_url");
  b.direct.model = js::get_str(d, "model");
  b.direct.api_key_env = js::get_str(d, "api_key_env", "SA_LLM_API_KEY");
  b.direct.temperature = js::get_num(d, "temperature", 0.0);
  b.fake.fixtures = js::get_str(js::get_obj(j, "fake"), "fixtures");
  return b;
}

Limits parse_limits(const json& j) {
  Limits l;
  l.max_regions = js::get_int(j, "max_regions", 40);
  l.max_probes = js::get_int(j, "max_probes", 80);
  l.per_probe_tokens = js::get_int(j, "per_probe_tokens", 2048);
  l.max_findings = js::get_int(j, "max_findings", 100);
  return l;
}

ConfigSpec parse_config(const json& j) {
  ConfigSpec c;
  const json& w = js::get_obj(j, "weights");
  for (auto it = w.begin(); it != w.end(); ++it)
    if (it.value().is_number()) c.weights[it.key()] = it.value().get<double>();
  c.min_severity = parse_severity(js::get_str(j, "min_severity", "low"))
                       .value_or(Severity::Low);
  return c;
}

// ---- output serialization ---------------------------------------------------

json categories_to_json(const std::vector<Category>& cats) {
  json arr = json::array();
  for (Category c : cats) arr.push_back(to_string(c));
  return arr;
}

json ranked_to_json(const RankedRegion& r) {
  return json{{"region_id", r.region_id},
              {"file", r.file},
              {"function", r.function},
              {"start_line", r.start_line},
              {"end_line", r.end_line},
              {"risk_score", r.risk_score},
              {"categories", categories_to_json(r.categories)},
              {"probed", r.probed}};
}

json evidence_to_json(const Evidence& e) {
  return json{{"code_slice", e.code_slice},
              {"matched_pattern", e.matched_pattern},
              {"signals", e.signals}};
}

json finding_to_json(const Finding& f) {
  return json{
      {"id", f.id},
      {"location",
       json{{"file", f.location.file},
            {"start_line", f.location.start_line},
            {"end_line", f.location.end_line},
            {"function", f.function}}},
      {"category", to_string(f.category)},
      {"cwe", f.cwe},
      {"severity", to_string(f.severity)},
      {"confidence", f.confidence},
      {"source", to_string(f.source)},
      {"status", to_string(f.status)},
      {"title", f.title},
      {"rationale", f.rationale},
      {"evidence", evidence_to_json(f.evidence)},
      {"suggested_fix", f.suggested_fix},
      {"fix_request",
       json{{"target", f.fix_request.target},
            {"action", f.fix_request.action},
            {"priority", f.fix_request.priority}}},
      {"region_id", f.region_id},
      {"probe_task_id", f.probe_task_id}};
}

}  // namespace

Request parse_request(const json& j) {
  Request r;
  r.schema_version = js::get_str(j, "schema_version", "1.0");
  r.signals = parse_signals(js::get_obj(j, "signals"));
  r.project = parse_project(js::get_obj(j, "project"));
  r.backend = parse_backend(js::get_obj(j, "backend"));
  r.limits = parse_limits(js::get_obj(j, "limits"));
  r.config = parse_config(js::get_obj(j, "config"));
  return r;
}

json to_json(const Report& r) {
  json intent = json::object();
  for (const auto& [cat, val] : r.intent_profile)
    intent[std::string(to_string(cat))] = val;

  json ranked = json::array();
  for (const auto& rr : r.ranked_regions) ranked.push_back(ranked_to_json(rr));

  json findings = json::array();
  for (const auto& f : r.findings) findings.push_back(finding_to_json(f));

  return json{
      {"schema_version", r.schema_version},
      {"run",
       json{{"id", r.run.id},
            {"backend", r.run.backend},
            {"config_hash", r.run.config_hash},
            {"stats",
             json{{"files", r.run.stats.files},
                  {"regions", r.run.stats.regions},
                  {"hot_regions", r.run.stats.hot_regions},
                  {"probes", r.run.stats.probes}}}}},
      {"signal_summary", json{{"intent_profile", intent}}},
      {"ranked_regions", ranked},
      {"findings", findings},
      {"errors", r.errors}};
}

}  // namespace redteam::jsonconv
