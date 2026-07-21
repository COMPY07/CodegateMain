#include "app/RedTeamServiceImpl.hpp"

#include <set>
#include <string>
#include <utility>

#include "domain/FilterEngine.hpp"
#include "domain/FindingSynthesizer.hpp"
#include "domain/ProbePlanner.hpp"
#include "redteam/Hash.hpp"

namespace redteam {
namespace {

// Deterministic, JSON-free signature of the resolved config, for config_hash.
std::string config_signature(const ConfigSpec& c) {
  std::string s;
  for (const auto& [k, v] : c.weights) {  // std::map => sorted keys
    s += k;
    s += '=';
    s += std::to_string(v);
    s += ';';
  }
  s += "min=";
  s += to_string(c.min_severity);
  return s;
}

}  // namespace

RedTeamServiceImpl::RedTeamServiceImpl(FileSourceFactory fs_factory,
                                      BackendFactory backend_factory,
                                      ProbeParser probe_parser)
    : fs_factory_(std::move(fs_factory)),
      backend_factory_(std::move(backend_factory)),
      probe_parser_(std::move(probe_parser)) {}

Report RedTeamServiceImpl::run(const Request& request) {
  Report report;
  report.schema_version = "1.0";
  report.run.backend = request.backend.kind;
  report.run.id =
      "rt-" + fnv1a_hex(request.signals.user_prompt + std::string(1, '\x1f') +
                        request.signals.model_output);
  report.run.config_hash = fnv1a_hex(config_signature(request.config));

  // Read the project, then run the deterministic rough-filtering pipeline.
  auto file_source = fs_factory_(request.project);
  const auto files = file_source->load();

  FilterEngine engine(request);
  FilterResult filtered = engine.run(files);

  report.run.stats.files = filtered.files;
  report.run.stats.regions = static_cast<int>(filtered.scored.size());
  report.run.stats.hot_regions = static_cast<int>(filtered.ranked.size());

  for (const auto& [cat, val] : filtered.intent_profile)
    if (val > 0.0) report.intent_profile[cat] = val;

  std::vector<Finding> findings = std::move(filtered.heuristic_findings);

  // Red-team the hottest regions through the LLM backend (when a parser is
  // wired in). Without a parser the deterministic findings stand on their own.
  if (probe_parser_) {
    const std::vector<Probe> probes = plan_probes(
        filtered.ranked, filtered.regions, request.limits.max_probes);

    auto backend = backend_factory_(request.backend);
    std::vector<ProbeResponse> responses;
    responses.reserve(probes.size());
    for (const auto& p : probes) {
      CompletionRequest creq;
      creq.task_id = p.task_id;
      creq.prompt = p.prompt;
      creq.max_tokens = request.limits.per_probe_tokens;
      creq.temperature = request.backend.direct.temperature;
      const CompletionResult cres = backend->complete(creq);
      ProbeResponse pr =
          cres.ok ? probe_parser_(cres.text) : ProbeResponse{};
      pr.task_id = p.task_id;
      if (!cres.ok) pr.error = cres.error;
      responses.push_back(std::move(pr));
    }

    std::set<std::string> probed;
    for (const auto& p : probes) probed.insert(p.region_id);
    for (auto& rr : filtered.ranked)
      if (probed.count(rr.region_id)) rr.probed = true;

    findings = synthesize_findings(probes, responses, filtered.regions,
                                   std::move(findings), request.limits.max_findings);
    report.run.stats.probes = static_cast<int>(probes.size());
  }

  report.ranked_regions = std::move(filtered.ranked);
  report.findings = std::move(findings);
  return report;
}

}  // namespace redteam
