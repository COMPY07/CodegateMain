#include "adapters/driven/llm/BackendFactory.hpp"

#include "adapters/driven/llm/FakeBackend.hpp"
#ifdef RT_HAVE_DIRECT_BACKEND
#include "adapters/driven/llm/DirectApiBackend.hpp"
#endif

namespace redteam {

BackendFactory default_backend_factory() {
  return [](const BackendSpec& spec) -> std::unique_ptr<LlmBackend> {
#ifdef RT_HAVE_DIRECT_BACKEND
    if (spec.kind == "direct")
      return std::make_unique<DirectApiBackend>(spec.direct);
#endif
    return std::make_unique<FakeBackend>(spec.fake.fixtures);
  };
}

}  // namespace redteam
