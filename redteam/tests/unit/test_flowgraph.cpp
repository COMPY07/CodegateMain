#include <gtest/gtest.h>

#include "domain/FlowGraph.hpp"

using namespace redteam;

namespace {
CodingFlowFunction make_fn(bool sanitized_edge, bool with_edge = true) {
  CodingFlowFunction fn;
  fn.file = "app.py";
  fn.name = "handle";
  fn.span = SourceSpan{"app.py", 10, 40};
  fn.sources = {FlowNode{12, "http_body"}};
  fn.sinks = {FlowNode{30, "os_system"}};
  if (with_edge) fn.edges = {FlowEdge{12, 30, sanitized_edge}};
  return fn;
}
}  // namespace

TEST(FlowGraph, UnsanitizedPathIsReachableAndTainted) {
  CodingFlow flow;
  flow.functions = {make_fn(/*sanitized_edge=*/false)};
  FlowGraph g(flow);
  ASSERT_TRUE(g.has_function("app.py", "handle"));
  auto r = g.query("app.py", "handle");
  EXPECT_TRUE(r.reachable);
  EXPECT_TRUE(r.unsanitized);
  EXPECT_EQ(r.sink_line, 30);
  EXPECT_EQ(r.sink_kind, "os_system");
}

TEST(FlowGraph, SanitizedPathReachableButNotUnsanitized) {
  CodingFlow flow;
  flow.functions = {make_fn(/*sanitized_edge=*/true)};
  FlowGraph g(flow);
  auto r = g.query("app.py", "handle");
  EXPECT_TRUE(r.reachable);
  EXPECT_FALSE(r.unsanitized);
}

TEST(FlowGraph, NoEdgesButSourceAndSinkIsRecallBiased) {
  CodingFlow flow;
  flow.functions = {make_fn(false, /*with_edge=*/false)};
  FlowGraph g(flow);
  auto r = g.query("app.py", "handle");
  EXPECT_TRUE(r.reachable);
  EXPECT_TRUE(r.unsanitized);
}

TEST(FlowGraph, UnknownFunctionIsNotReachable) {
  FlowGraph g;  // empty
  EXPECT_FALSE(g.has_function("app.py", "handle"));
  EXPECT_FALSE(g.query("app.py", "handle").reachable);
}
