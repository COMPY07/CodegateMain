#pragma once
#include <string>
#include <vector>

#include "redteam/Enums.hpp"

// Category -> human metadata used to fill out findings (CWE ids, a title, and a
// generic remediation the security agent can forward to the main agent).
namespace redteam {

std::vector<std::string> cwe_for(Category c);
std::string title_for(Category c);
std::string fix_for(Category c);

}  // namespace redteam
