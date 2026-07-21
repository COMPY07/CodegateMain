#pragma once
#include <vector>

#include "redteam/Types.hpp"

// Signal 2 (secrets): flags hardcoded credentials by keyword-assignment and by
// high-entropy string literals. Emits SecretExposure signals; the caller also
// uses these to redact code slices before they leave the process.
namespace redteam {

std::vector<Signal> scan_secrets(const Region& region);

// Shannon entropy (bits/char) of a string; exposed for testing.
double shannon_entropy(const std::string& s);

}  // namespace redteam
