#include "adapters/driven/llm/FakeBackend.hpp"

#include <filesystem>
#include <fstream>
#include <iterator>

namespace redteam {
namespace fs = std::filesystem;

FakeBackend::FakeBackend(std::string fixtures_dir)
    : fixtures_dir_(std::move(fixtures_dir)) {}

FakeBackend::FakeBackend(std::map<std::string, std::string> canned)
    : canned_(std::move(canned)) {}

CompletionResult FakeBackend::complete(const CompletionRequest& req) {
  CompletionResult r;
  r.task_id = req.task_id;

  if (auto it = canned_.find(req.task_id); it != canned_.end()) {
    r.ok = true;
    r.text = it->second;
    return r;
  }

  if (!fixtures_dir_.empty()) {
    std::error_code ec;
    const fs::path p = fs::path(fixtures_dir_) / (req.task_id + ".json");
    if (fs::is_regular_file(p, ec)) {
      std::ifstream in(p, std::ios::binary);
      if (in) {
        r.text.assign((std::istreambuf_iterator<char>(in)),
                      std::istreambuf_iterator<char>());
        r.ok = true;
        return r;
      }
    }
  }

  // No fixture: a benign, well-formed empty verdict so the run still completes.
  r.ok = true;
  r.text = R"({"findings":[]})";
  return r;
}

BackendCapabilities FakeBackend::capabilities() const {
  return BackendCapabilities{/*network=*/false, "fake"};
}

}  // namespace redteam
