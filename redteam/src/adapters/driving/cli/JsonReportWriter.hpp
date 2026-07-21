#pragma once
#include <string>

#include "redteam/Types.hpp"

namespace redteam {

// Serialize a Report to canonical JSON. nlohmann's default object is key-sorted,
// so the same Report always yields the same bytes (golden-test friendly).
std::string write_report_json(const Report& report, bool pretty = true);

}  // namespace redteam
