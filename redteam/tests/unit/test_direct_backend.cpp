#include <gtest/gtest.h>

// This whole suite only exists when the network backend is compiled in; the
// default (network-free) build compiles this file to an empty translation unit.
#ifdef RT_HAVE_DIRECT_BACKEND

#include <cstdlib>
#include <string>

#include "adapters/driven/llm/DirectApiBackend.hpp"

using namespace redteam;

TEST(DirectApiBackend, MissingKeyFailsGracefullyWithoutNetwork) {
  ::unsetenv("SA_LLM_TEST_KEY_ABSENT");
  DirectBackendSpec spec;
  spec.api_key_env = "SA_LLM_TEST_KEY_ABSENT";
  DirectApiBackend backend(spec);

  CompletionRequest req;
  req.task_id = "t-x";
  req.prompt = "audit this";
  const CompletionResult r = backend.complete(req);

  EXPECT_FALSE(r.ok);  // no key -> fails before any network call
  EXPECT_NE(r.error.find("missing API key"), std::string::npos);
}

TEST(DirectApiBackend, ReportsNetworkCapability) {
  DirectApiBackend backend{DirectBackendSpec{}};
  EXPECT_TRUE(backend.capabilities().network);
  EXPECT_EQ(backend.capabilities().name, "direct");
}

#endif  // RT_HAVE_DIRECT_BACKEND
