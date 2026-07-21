#include "adapters/driven/llm/DirectApiBackend.hpp"

#include <cstdlib>
#include <exception>
#include <string>

#include "adapters/common/HttpClient.hpp"
#include "adapters/common/Json.hpp"

namespace redteam {
namespace {

constexpr const char* kDefaultUrl = "https://api.anthropic.com/v1/messages";
constexpr const char* kDefaultModel = "claude-opus-4-8";
constexpr const char* kAnthropicVersion = "2023-06-01";

}  // namespace

DirectApiBackend::DirectApiBackend(DirectBackendSpec spec)
    : spec_(std::move(spec)) {}

CompletionResult DirectApiBackend::complete(const CompletionRequest& req) {
  CompletionResult r;
  r.task_id = req.task_id;

  const std::string key_env =
      spec_.api_key_env.empty() ? "SA_LLM_API_KEY" : spec_.api_key_env;
  const char* key = std::getenv(key_env.c_str());
  if (key == nullptr || key[0] == '\0') {
    r.ok = false;
    r.error = "missing API key in environment variable " + key_env;
    return r;
  }

  const std::string url = spec_.base_url.empty() ? kDefaultUrl : spec_.base_url;
  const std::string model = spec_.model.empty() ? kDefaultModel : spec_.model;

  // NOTE: temperature/top_p/top_k are intentionally omitted — current models
  // (Opus 4.7/4.8, Sonnet 5, Fable 5) reject sampling parameters with a 400.
  js::json body = {
      {"model", model},
      {"max_tokens", req.max_tokens > 0 ? req.max_tokens : 2048},
      {"messages", js::json::array({js::json{{"role", "user"},
                                             {"content", req.prompt}}})},
  };

  const std::vector<std::string> headers = {
      "content-type: application/json",
      "x-api-key: " + std::string(key),
      std::string("anthropic-version: ") + kAnthropicVersion,
  };

  HttpClient http;
  const HttpResponse resp = http.post_json(url, headers, body.dump());
  if (!resp.error.empty()) {
    r.ok = false;
    r.error = "transport error: " + resp.error;
    return r;
  }
  if (resp.status < 200 || resp.status >= 300) {
    r.ok = false;
    r.error = "http " + std::to_string(resp.status) + ": " +
              resp.body.substr(0, 500);
    return r;
  }

  try {
    const js::json j = js::json::parse(resp.body);
    if (js::get_str(j, "stop_reason") == "refusal") {
      r.ok = false;
      r.error = "model declined (stop_reason=refusal)";
      return r;
    }
    std::string text;
    if (auto it = j.find("content"); it != j.end() && it->is_array()) {
      for (const auto& block : *it) {
        if (block.is_object() && js::get_str(block, "type") == "text")
          text += js::get_str(block, "text");
      }
    }
    r.text = std::move(text);
    r.ok = true;
  } catch (const std::exception& e) {
    r.ok = false;
    r.error = std::string("failed to parse API response: ") + e.what();
  }
  return r;
}

BackendCapabilities DirectApiBackend::capabilities() const {
  return BackendCapabilities{/*network=*/true, "direct"};
}

}  // namespace redteam
