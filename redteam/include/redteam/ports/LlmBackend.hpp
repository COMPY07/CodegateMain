#pragma once
#include <string>
#include <vector>

// Outbound port: the single seam through which red-team reasoning reaches an
// LLM. The deterministic core depends only on this abstraction. Adapters:
// DirectApiBackend (libcurl, real calls), FakeBackend (deterministic, tests).
namespace redteam {

struct CompletionRequest {
  std::string task_id;
  std::string prompt;
  int max_tokens = 2048;
  double temperature = 0.0;
};

struct CompletionResult {
  std::string task_id;
  bool ok = false;
  std::string text;   // raw model output (expected: JSON per probe schema)
  std::string error;  // populated when ok == false
};

struct BackendCapabilities {
  bool network = false;  // true only for backends that make network calls
  std::string name;
};

class LlmBackend {
 public:
  virtual ~LlmBackend() = default;

  virtual CompletionResult complete(const CompletionRequest& req) = 0;

  // Default: sequential fan-out. Adapters may override with real batching.
  virtual std::vector<CompletionResult> completeBatch(
      const std::vector<CompletionRequest>& reqs) {
    std::vector<CompletionResult> out;
    out.reserve(reqs.size());
    for (const auto& r : reqs) out.push_back(complete(r));
    return out;
  }

  virtual BackendCapabilities capabilities() const = 0;
};

}  // namespace redteam
