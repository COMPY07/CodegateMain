#pragma once
#include <string_view>

#include "redteam/Enums.hpp"

// Auto-detects a file's language from its extension, then its shebang, then a
// light content sniff. The main agent's generated code (often vibe-coded) can
// be anything, so the engine decides rather than being told.
namespace redteam {

Language detect_language(std::string_view path, std::string_view content = {});

}  // namespace redteam
