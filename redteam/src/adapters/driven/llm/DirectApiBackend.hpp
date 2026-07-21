#pragma once
#include "redteam/Signals.hpp"
#include "redteam/ports/LlmBackend.hpp"

namespace redteam {

// Real LLM calls over HTTPS (libcurl). Compiled only when
// RT_ENABLE_DIRECT_BACKEND is set. The network transport is filled in during
// Phase 3; this unit currently reports its capability and returns an explicit
// not-implemented result so both build configs stay green.
class DirectApiBackend : public LlmBackend {
 public:
  explicit DirectApiBackend(DirectBackendSpec spec);

  CompletionResult complete(const CompletionRequest& req) override;
  BackendCapabilities capabilities() const override;

 private:
  DirectBackendSpec spec_;
};

}  // namespace redteam
