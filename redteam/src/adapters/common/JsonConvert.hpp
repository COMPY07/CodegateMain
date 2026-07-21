#pragma once
#include "adapters/common/Json.hpp"
#include "redteam/Signals.hpp"
#include "redteam/Types.hpp"

// Boundary conversions between the JSON wire format and the domain model.
// Confined to the adapter layer so the domain stays JSON-free.
namespace redteam::jsonconv {

// Lenient: unknown fields ignored, missing fields defaulted (forward-compatible).
Request parse_request(const js::json& j);

// Canonical: nlohmann's default object is key-sorted, giving byte-stable output.
js::json to_json(const Report& r);

}  // namespace redteam::jsonconv
