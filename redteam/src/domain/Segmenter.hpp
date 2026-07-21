#pragma once
#include <string>
#include <vector>

#include "redteam/Enums.hpp"
#include "redteam/Types.hpp"

// Splits one file's text into function-level Regions. Region ids are left empty
// for the caller to assign globally. Uses indentation for Python-like languages
// and brace matching for C-family/JS; unknown content yields no regions (the
// caller adds a whole-file module region so nothing is skipped).
namespace redteam {

std::vector<Region> segment_file(const std::string& file, Language lang,
                                 const std::string& content);

}  // namespace redteam
