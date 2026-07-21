#include "adapters/common/HttpClient.hpp"

#include <curl/curl.h>

#include <cstddef>

namespace redteam {
namespace {

std::size_t write_cb(char* ptr, std::size_t size, std::size_t nmemb, void* userdata) {
  auto* s = static_cast<std::string*>(userdata);
  const std::size_t n = size * nmemb;
  s->append(ptr, n);
  return n;
}

// Process-wide libcurl init/cleanup, run once.
void ensure_curl_init() {
  struct CurlGlobal {
    CurlGlobal() { curl_global_init(CURL_GLOBAL_DEFAULT); }
    ~CurlGlobal() { curl_global_cleanup(); }
  };
  static CurlGlobal kGlobal;
}

}  // namespace

HttpResponse HttpClient::post_json(const std::string& url,
                                  const std::vector<std::string>& headers,
                                  const std::string& body,
                                  long timeout_seconds) const {
  ensure_curl_init();
  HttpResponse out;

  CURL* curl = curl_easy_init();
  if (!curl) {
    out.error = "curl_easy_init failed";
    return out;
  }

  struct curl_slist* hdrs = nullptr;
  for (const auto& h : headers) hdrs = curl_slist_append(hdrs, h.c_str());

  std::string resp;
  curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
  curl_easy_setopt(curl, CURLOPT_POST, 1L);
  curl_easy_setopt(curl, CURLOPT_POSTFIELDS, body.c_str());
  curl_easy_setopt(curl, CURLOPT_POSTFIELDSIZE, static_cast<long>(body.size()));
  curl_easy_setopt(curl, CURLOPT_HTTPHEADER, hdrs);
  curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, write_cb);
  curl_easy_setopt(curl, CURLOPT_WRITEDATA, &resp);
  curl_easy_setopt(curl, CURLOPT_TIMEOUT, timeout_seconds);
  curl_easy_setopt(curl, CURLOPT_SSL_VERIFYPEER, 1L);
  curl_easy_setopt(curl, CURLOPT_SSL_VERIFYHOST, 2L);
  curl_easy_setopt(curl, CURLOPT_USERAGENT, "sa-redteam/0.1");

  const CURLcode rc = curl_easy_perform(curl);
  if (rc != CURLE_OK) {
    out.error = curl_easy_strerror(rc);
  } else {
    long code = 0;
    curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &code);
    out.status = code;
    out.body = std::move(resp);
  }

  curl_slist_free_all(hdrs);
  curl_easy_cleanup(curl);
  return out;
}

}  // namespace redteam
