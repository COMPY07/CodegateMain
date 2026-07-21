#pragma once
#include <map>

#include "redteam/Enums.hpp"
#include "redteam/Signals.hpp"

// Signal 1: maps the user prompt and goals to a weighted profile of the
// vulnerability categories the change is likely to touch. Used by the scorer as
// a per-category multiplier so intent-relevant regions rank higher.
namespace redteam {

std::map<Category, double> build_intent_profile(const InputSignals& signals);

}  // namespace redteam
