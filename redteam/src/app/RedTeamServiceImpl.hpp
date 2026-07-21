#pragma once
#include "redteam/Factories.hpp"
#include "redteam/RedTeamService.hpp"

namespace redteam {

// Wires the pipeline together. Dependencies are injected as factories so tests
// can supply an in-memory FileSource and a FakeBackend.
class RedTeamServiceImpl : public RedTeamService {
 public:
  // `probe_parser` is optional: when empty, the service runs the deterministic
  // filter only (no LLM probing). Production wiring passes a real parser.
  RedTeamServiceImpl(FileSourceFactory fs_factory, BackendFactory backend_factory,
                     ProbeParser probe_parser = {});

  Report run(const Request& request) override;

 private:
  FileSourceFactory fs_factory_;
  BackendFactory backend_factory_;
  ProbeParser probe_parser_;
};

}  // namespace redteam
