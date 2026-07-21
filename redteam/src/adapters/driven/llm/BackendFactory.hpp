#pragma once
#include "redteam/Factories.hpp"

namespace redteam {

// Default production backend factory. Builds a FakeBackend for kind=="fake",
// and a DirectApiBackend for kind=="direct" when the direct backend is compiled
// in (otherwise falls back to FakeBackend so a build without networking still
// produces a report).
BackendFactory default_backend_factory();

}  // namespace redteam
