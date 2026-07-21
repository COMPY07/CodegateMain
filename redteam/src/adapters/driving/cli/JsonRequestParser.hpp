#pragma once
#include <string>

#include "redteam/Signals.hpp"

namespace redteam {

struct ParsedRequest {
  bool ok = false;
  Request request;
  std::string error;
};

// Parse raw JSON (e.g. from stdin) into a Request. Never throws.
ParsedRequest parse_request_json(const std::string& raw);

}  // namespace redteam
