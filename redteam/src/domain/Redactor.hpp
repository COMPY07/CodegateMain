#pragma once
#include <string>

// Masks likely secrets in a code slice before it is sent to an LLM backend.
// Pure and deterministic so redaction is testable and applied uniformly.
namespace redteam {

std::string redact_secrets(const std::string& code);

}  // namespace redteam
