#pragma once
#include <map>
#include <string>

#include "redteam/ports/LlmBackend.hpp"

namespace redteam {

// Deterministic backend for tests and offline end-to-end runs. Looks up a
// canned response by task_id: first an in-memory override, then a file
// "<fixtures>/<task_id>.json". Missing entries return a benign empty verdict
// so a run always completes.
class FakeBackend : public LlmBackend {
 public:
  FakeBackend() = default;
  explicit FakeBackend(std::string fixtures_dir);
  explicit FakeBackend(std::map<std::string, std::string> canned);

  CompletionResult complete(const CompletionRequest& req) override;
  BackendCapabilities capabilities() const override;

 private:
  std::string fixtures_dir_;
  std::map<std::string, std::string> canned_;
};

}  // namespace redteam
