#pragma once
#include <string>
#include <vector>

// Thin libcurl POST wrapper. Compiled only when RT_ENABLE_DIRECT_BACKEND is set
// (it is the sole unit besides DirectApiBackend that links a network library),
// so the default build links no curl.
namespace redteam {

struct HttpResponse {
  long status = 0;      // HTTP status code (0 if the request never completed)
  std::string body;
  std::string error;    // transport-level error; empty on a completed request
};

class HttpClient {
 public:
  HttpClient() = default;

  // POST `body` to `url` with the given headers. TLS verification is always on.
  HttpResponse post_json(const std::string& url,
                         const std::vector<std::string>& headers,
                         const std::string& body,
                         long timeout_seconds = 120) const;
};

}  // namespace redteam
