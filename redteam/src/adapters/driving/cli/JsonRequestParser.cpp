#include "adapters/driving/cli/JsonRequestParser.hpp"

#include <exception>

#include "adapters/common/Json.hpp"
#include "adapters/common/JsonConvert.hpp"

namespace redteam {

ParsedRequest parse_request_json(const std::string& raw) {
  ParsedRequest out;
  try {
    const js::json j = js::json::parse(raw);
    out.request = jsonconv::parse_request(j);
    out.ok = true;
  } catch (const std::exception& e) {
    out.ok = false;
    out.error = e.what();
  }
  return out;
}

}  // namespace redteam
