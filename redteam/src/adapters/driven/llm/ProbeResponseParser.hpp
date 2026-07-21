#pragma once
#include <string>

#include "redteam/Factories.hpp"
#include "redteam/Types.hpp"

namespace redteam {

// Parse an LLM probe response (raw JSON text) into a neutral ProbeResponse.
// Tolerant of extra prose around the JSON object. Never throws.
ProbeResponse parse_probe_response_json(const std::string& text);

// Injected into the service so JSON parsing stays in the adapter layer.
ProbeParser default_probe_parser();

}  // namespace redteam
