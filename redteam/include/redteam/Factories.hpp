#pragma once
#include <functional>
#include <memory>

#include "redteam/Signals.hpp"
#include "redteam/ports/FileSource.hpp"
#include "redteam/ports/LlmBackend.hpp"

// Dependency-injection seams: the core service receives these so tests can
// substitute an in-memory FileSource and a FakeBackend without disk or network.
namespace redteam {

using FileSourceFactory =
    std::function<std::unique_ptr<FileSource>(const ProjectSpec&)>;
using BackendFactory =
    std::function<std::unique_ptr<LlmBackend>(const BackendSpec&)>;

// Parses an LLM probe response (raw JSON text) into a neutral ProbeResponse.
// Injected so JSON parsing stays in the adapter layer, out of redteam_core.
using ProbeParser = std::function<ProbeResponse(const std::string&)>;

}  // namespace redteam
