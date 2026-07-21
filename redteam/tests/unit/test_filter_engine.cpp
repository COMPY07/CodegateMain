#include <gtest/gtest.h>

#include <algorithm>

#include "domain/FilterEngine.hpp"
#include "domain/IntentMapper.hpp"

using namespace redteam;

namespace {
Request base_request() {
  Request r;
  r.signals.user_prompt = "add an endpoint that runs a shell command";
  r.signals.goals = {"shell command execution"};
  r.project.root = "/virtual";
  r.limits.max_regions = 20;
  r.limits.max_findings = 20;
  return r;
}

bool has_finding(const std::vector<Finding>& fs, Category c, int line) {
  return std::any_of(fs.begin(), fs.end(), [&](const Finding& f) {
    return f.category == c && f.location.start_line == line;
  });
}
}  // namespace

TEST(IntentMapper, MapsPromptToCategories) {
  InputSignals s;
  s.user_prompt = "add file upload and run a shell command";
  auto p = build_intent_profile(s);
  EXPECT_GT(p[Category::CommandInjection], 0.0);
  EXPECT_GT(p[Category::PathTraversal], 0.0);
  EXPECT_EQ(p.count(Category::CryptoWeakness), 0u);
}

TEST(FilterEngine, DetectsCommandInjectionInPython) {
  std::vector<LoadedFile> files = {
      {"app.py",
       "import os\n"
       "from flask import request\n"
       "def ping():\n"
       "    host = request.args.get('h')\n"
       "    os.system('ping ' + host)\n"}};
  FilterEngine eng(base_request());
  FilterResult r = eng.run(files);
  EXPECT_TRUE(has_finding(r.heuristic_findings, Category::CommandInjection, 5));
  ASSERT_FALSE(r.ranked.empty());
  EXPECT_EQ(r.ranked.front().categories.front(), Category::CommandInjection);
}

TEST(FilterEngine, DetectsMemorySafetyAndSecret) {
  std::vector<LoadedFile> files = {
      {"buf.c",
       "#include <string.h>\n"
       "void f(char* s){ char b[8]; strcpy(b, s); }\n"},
      {"conf.py", "API_KEY = \"NOT_A_REAL_SECRET_FOR_TESTS\"\n"}};
  FilterEngine eng(base_request());
  FilterResult r = eng.run(files);
  EXPECT_TRUE(has_finding(r.heuristic_findings, Category::MemorySafety, 2));
  EXPECT_TRUE(has_finding(r.heuristic_findings, Category::SecretExposure, 1));
}

TEST(FilterEngine, CleanCodeProducesNoFindings) {
  std::vector<LoadedFile> files = {
      {"ok.py",
       "def add(a, b):\n"
       "    return a + b\n"
       "def mul(a, b):\n"
       "    return a * b\n"}};
  FilterEngine eng(base_request());
  FilterResult r = eng.run(files);
  EXPECT_TRUE(r.heuristic_findings.empty());
}

TEST(FilterEngine, ChangedFileRanksAsCandidate) {
  Request req = base_request();
  req.project.changed_files = {"touched.py"};
  std::vector<LoadedFile> files = {{"touched.py", "def h():\n    return 1\n"}};
  FilterEngine eng(req);
  FilterResult r = eng.run(files);
  // Even with no strong signal, a just-changed file clears the ranking floor.
  ASSERT_FALSE(r.ranked.empty());
  EXPECT_EQ(r.ranked.front().file, "touched.py");
}

TEST(FilterEngine, SecurityHintRaisesPriority) {
  Request req = base_request();
  SecurityHint h;
  h.file = "svc.py";
  h.possibility = 0.9;
  h.priority = 1;
  req.signals.security_hints = {h};
  std::vector<LoadedFile> files = {
      {"svc.py",
       "import os\n"
       "def run(cmd):\n"
       "    os.system(cmd)\n"}};
  FilterEngine eng(req);
  FilterResult r = eng.run(files);
  ASSERT_FALSE(r.heuristic_findings.empty());
  EXPECT_EQ(r.heuristic_findings.front().fix_request.priority, 1);
}

TEST(FilterEngine, FlowReachabilityBoostsScore) {
  Request req = base_request();
  CodingFlow flow;
  CodingFlowFunction fn;
  fn.file = "h.py";
  fn.name = "handle";
  fn.span = SourceSpan{"h.py", 1, 4};
  fn.complex = true;
  fn.sources = {FlowNode{2, "http_body"}};
  fn.sinks = {FlowNode{3, "os_system"}};
  fn.edges = {FlowEdge{2, 3, false}};
  flow.functions = {fn};
  req.signals.coding_flow = flow;

  std::vector<LoadedFile> files = {
      {"h.py",
       "def handle(req):\n"
       "    cmd = req.body\n"
       "    os.system(cmd)\n"
       "    return 1\n"}};
  FilterEngine eng(req);
  FilterResult r = eng.run(files);
  ASSERT_FALSE(r.ranked.empty());
  EXPECT_GE(r.ranked.front().risk_score, 0.9);
}
